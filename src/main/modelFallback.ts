import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { ModelFallbackSettings } from '@shared/api'
import { fallbackPair } from '@shared/modelFallback'
import { switchingHelps, usageLimitIn } from '@shared/usageLimit'

/**
 * Added to the retried request when the first attempt had already used tools: its edits are on disk
 * but the model never saw them (a failed turn is not kept in its history).
 */
export const RETRY_NOTE =
  'Note from Puppy: the previous model ran out of usage partway through this request, so you are carrying on in its place. ' +
  'Some of the work may already be done. Check the current state of the files before repeating anything.'

export interface FallbackPlan {
  from: string
  to: string
}

interface Held {
  notification: SessionNotification
  plan: FallbackPlan
}

/**
 * What to do when a turn stops because the main model's quota is spent.
 *
 * Every update on its way to the window passes through `route`. All but one kind go straight on:
 * the "agent run failed ... quota exceeded" notice, when the user turned fallback on, was using
 * their main model, and another model can help. That one is held, so the window does not show an
 * error for a turn that is about to carry on. The workspace then either takes the plan (and
 * switches model) or gives the notice back, so the user always hears about a failure that was
 * not handled.
 */
export class ModelFallback {
  private readonly held = new Map<string, Held>()

  constructor(
    private readonly settings: () => ModelFallbackSettings,
    /** The model Code Puppy is using now: a switch only makes sense from the main one, and never twice in a row. */
    private readonly currentModel: () => string | null,
    private readonly forward: (notification: SessionNotification) => void,
  ) {}

  route(notification: SessionNotification): void {
    const plan = this.planFor(notification)
    if (plan) this.held.set(notification.sessionId, { notification, plan })
    else this.forward(notification)
  }

  /**
   * Takes over a held notice: the plan to carry out, and a way to give the notice back if it cannot be.
   * Null when the turn was not stopped by a limit this can handle.
   */
  take(sessionId: string): { plan: FallbackPlan; giveBack: () => void } | null {
    const held = this.held.get(sessionId)
    if (!held) return null
    this.held.delete(sessionId)
    return { plan: held.plan, giveBack: () => this.forward(held.notification) }
  }

  forget(sessionId: string): void {
    this.held.delete(sessionId)
  }

  private planFor({ update }: SessionNotification): FallbackPlan | null {
    if (update.sessionUpdate !== 'agent_message_chunk' || update.content.type !== 'text') return null
    const limit = usageLimitIn(update.content.text)
    if (!limit || !switchingHelps(limit)) return null
    const pair = fallbackPair(this.settings())
    return pair && this.currentModel() === pair.main ? { from: pair.main, to: pair.secondary } : null
  }
}
