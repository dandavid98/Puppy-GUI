import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import type { ClientContext, SessionNotification } from '@agentclientprotocol/sdk'
import type { AgentStatus, PermissionPrompt } from '@shared/api'

export type AgentEvents = {
  status: [AgentStatus]
  sessionUpdate: [SessionNotification]
  permissionRequest: [PermissionPrompt]
}

/** What the pool needs from one Code Puppy process: PuppyAgent in the app, a fake in tests. */
export interface Agent extends EventEmitter<AgentEvents> {
  readonly status: AgentStatus
  context(): Promise<ClientContext>
  stop(): void
  answerPermission(requestId: string, optionId: string | null): void
  cancelPermissions(sessionId: string): void
}

/**
 * One Code Puppy process per project folder.
 *
 * Code Puppy's file tools resolve relative paths against the session's folder,
 * but its shell tool (and the "current directory" it tells the model about)
 * come from the folder the PROCESS was started in. One shared process therefore
 * ran every command in the wrong place. A process per folder, started in that
 * folder, makes every tool agree.
 *
 * Processes start lazily, on first use of a folder. The `home` folder (where
 * chats and scratch sessions live) is the app's primary agent: its status is
 * the app's status.
 *
 * Re-emits every agent's events, so the rest of the app can treat the pool as
 * if it were a single agent.
 */
export class AgentPool extends EventEmitter<AgentEvents> {
  private readonly agents = new Map<string, Agent>()
  /** Which agent asked a permission question, so the answer goes back to it. */
  private readonly askers = new Map<string, Agent>()
  private lastStatus = ''

  constructor(
    private readonly create: (folder: string) => Agent,
    private readonly homeFolder: string,
  ) {
    super()
  }

  get home(): Agent {
    return this.forFolder(this.homeFolder)
  }

  forFolder(folder: string): Agent {
    const key = resolve(folder) // "/a/b/" and "/a/b" are the same project
    let agent = this.agents.get(key)
    if (!agent) {
      agent = this.create(key)
      this.wire(agent)
      this.agents.set(key, agent)
    }
    return agent
  }

  /** The home agent's status, unless some project agent has failed: that is worth telling the user about. */
  get status(): AgentStatus {
    const failed = [...this.agents.values()].find((agent) => agent.status.state === 'error')
    return failed?.status ?? this.home.status
  }

  /** Stop everything and bring the home agent back; project agents restart when next used. */
  async restart(): Promise<void> {
    this.stop()
    await this.home.context()
  }

  stop(): void {
    this.askers.clear()
    for (const agent of this.agents.values()) agent.stop()
  }

  answerPermission(requestId: string, optionId: string | null): void {
    this.askers.get(requestId)?.answerPermission(requestId, optionId)
    this.askers.delete(requestId)
  }

  cancelPermissions(sessionId: string): void {
    for (const agent of this.agents.values()) agent.cancelPermissions(sessionId)
  }

  private wire(agent: Agent): void {
    agent.on('sessionUpdate', (notification) => this.emit('sessionUpdate', notification))
    agent.on('permissionRequest', (prompt) => {
      this.askers.set(prompt.requestId, agent)
      this.emit('permissionRequest', prompt)
    })
    agent.on('status', () => {
      const status = this.status
      const signature = JSON.stringify(status)
      if (signature === this.lastStatus) return // a project agent starting up is not news
      this.lastStatus = signature
      this.emit('status', status)
    })
  }
}
