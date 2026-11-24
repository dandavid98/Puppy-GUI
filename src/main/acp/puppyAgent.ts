import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createWriteStream } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import {
  client,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ClientConnection,
  type ClientContext,
  type SessionNotification,
} from '@agentclientprotocol/sdk'
import type { AgentStatus, PermissionPrompt } from '@shared/api'
import type { Agent } from './agentPool'
import { jsonLinesOnly } from './jsonLinesOnly'
import { PermissionBroker } from './permissionBroker'

type Events = {
  status: [AgentStatus]
  sessionUpdate: [SessionNotification]
  permissionRequest: [PermissionPrompt]
}

/**
 * One long-lived `code-puppy --acp` process and its ACP connection, started IN
 * the folder it serves (see AgentPool for why that matters). Every
 * conversation for that folder is a session on this one connection, so we pay
 * Code Puppy's start-up cost once per folder, not per chat.
 */
export class PuppyAgent extends EventEmitter<Events> implements Agent {
  private child: ChildProcess | null = null
  private connection: ClientConnection | null = null
  private connecting: Promise<ClientContext> | null = null
  private current: AgentStatus = { state: 'starting' }
  private readonly permissions = new PermissionBroker((prompt) => this.emit('permissionRequest', prompt))

  constructor(
    private readonly locateBinary: () => string,
    /** The folder this process works in: its working directory, and what its shell tool and prompt see. */
    readonly folder: string,
    private readonly logPath: string,
    private readonly version: string,
  ) {
    super()
  }

  get status(): AgentStatus {
    return this.current
  }

  /** A ready ACP context, booting code-puppy on first use (or after a crash). */
  context(): Promise<ClientContext> {
    this.connecting ??= this.boot().catch((error: unknown) => {
      this.stop()
      this.setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) })
      throw error
    })
    return this.connecting
  }

  async restart(): Promise<void> {
    this.stop()
    await this.context()
  }

  stop(): void {
    const child = this.child
    this.child = null
    this.connecting = null
    this.permissions.cancelAll()
    this.connection?.close()
    this.connection = null
    child?.kill()
  }

  answerPermission(requestId: string, optionId: string | null): void {
    this.permissions.answer(requestId, optionId)
  }

  cancelPermissions(sessionId: string): void {
    this.permissions.cancelSession(sessionId)
  }

  private async boot(): Promise<ClientContext> {
    this.setStatus({ state: 'starting' })
    const child = spawn(this.locateBinary(), ['--acp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.folder,
      env: { ...process.env, PWD: this.folder }, // shells trust $PWD over the real directory when it disagrees
    })
    this.child = child
    const log = createWriteStream(this.logPath, { flags: 'a' })
    log.write(`\n--- code-puppy started in ${this.folder} ---\n`)
    child.stderr.pipe(log)
    child.once('error', (error) => this.onChildGone(child, `Could not start Code Puppy: ${error.message}`))
    child.once('exit', (code, signal) =>
      this.onChildGone(child, `Code Puppy stopped unexpectedly (${signal ?? `exit code ${code}`}).`),
    )

    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      (Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>).pipeThrough(jsonLinesOnly()),
    )
    const app = client()
      .onNotification('session/update', ({ params }) => {
        this.emit('sessionUpdate', params)
      })
      .onRequest('session/request_permission', ({ params }) => this.permissions.ask(params))

    this.connection = app.connect(stream)
    const context = this.connection.agent
    // Code Puppy does its own file I/O and shell; we only host approvals.
    await context.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'puppy-desktop', version: this.version },
    })
    this.setStatus({ state: 'ready' })
    return context
  }

  private onChildGone(child: ChildProcess, message: string): void {
    if (child !== this.child) return // an intentional stop() or an old process
    this.connection?.close(new Error(message)) // rejects in-flight requests
    this.stop()
    this.setStatus({ state: 'error', message })
  }

  private setStatus(status: AgentStatus): void {
    this.current = status
    this.emit('status', status)
  }
}
