import { randomUUID } from 'node:crypto'
import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk'
import type { PermissionPrompt } from '@shared/api'

interface Pending {
  sessionId: string
  resolve: (response: RequestPermissionResponse) => void
}

const CANCELLED: RequestPermissionResponse = { outcome: { outcome: 'cancelled' } }

/**
 * Parks the agent's `session/request_permission` calls until the user clicks
 * an option in the UI. Everything fails closed: cancelling a turn or losing
 * the agent resolves every open prompt as "cancelled", never as "allowed".
 */
export class PermissionBroker {
  private readonly pending = new Map<string, Pending>()

  constructor(private readonly show: (prompt: PermissionPrompt) => void) {}

  ask(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const requestId = randomUUID()
    return new Promise((resolve) => {
      this.pending.set(requestId, { sessionId: request.sessionId, resolve })
      this.show({
        requestId,
        sessionId: request.sessionId,
        title: request.toolCall.title ?? 'Code Puppy wants to run a tool',
        options: request.options,
      })
    })
  }

  /** `optionId === null` means the user dismissed the prompt. */
  answer(requestId: string, optionId: string | null): void {
    const entry = this.pending.get(requestId)
    if (!entry) return
    this.pending.delete(requestId)
    entry.resolve(optionId === null ? CANCELLED : { outcome: { outcome: 'selected', optionId } })
  }

  cancelSession(sessionId: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.sessionId === sessionId) this.answer(requestId, null)
    }
  }

  cancelAll(): void {
    for (const requestId of [...this.pending.keys()]) this.answer(requestId, null)
  }
}
