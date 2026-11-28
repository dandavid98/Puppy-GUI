import type { SessionConfigOption } from '@agentclientprotocol/sdk'
import type { SessionIndex } from './sessionIndex'

/** Code Puppy's own model option. It is per process, so it is the default: what chats that have not chosen run on. */
export const DEFAULT_MODEL_OPTION = 'model'
/** The bootstrap's option for one chat's own model (see acp/launch.ts). */
export const CHAT_MODEL_OPTION = 'puppy_session_model'

export interface OptionAnswer {
  configOptions?: SessionConfigOption[] | null
  _meta?: { [key: string]: unknown } | null
}

/** Sets a config option on one session, in the Code Puppy process that serves it. */
export type SetOption = (sessionId: string, configId: string, value: string) => Promise<OptionAnswer>

/** Runs `use` once in every running Code Puppy, with a throwaway session in each. */
export type InEveryProcess = <T>(use: (scratchId: string) => Promise<T>) => Promise<T[]>

export function modelIn(options: SessionConfigOption[] | null | undefined): string | null {
  const model = options?.find((option) => option.id === DEFAULT_MODEL_OPTION)
  return model && typeof model.currentValue === 'string' ? model.currentValue : null
}

/**
 * The model a chat's answer says it now runs on. Undefined when the answer does not say: a Code Puppy
 * without Puppy's bootstrap ignores the option, and must not be taken to have applied it.
 */
export function confirmedModel(answer: OptionAnswer): string | null | undefined {
  const puppy = answer._meta?.puppy
  if (typeof puppy !== 'object' || puppy === null || !('model' in puppy)) return undefined
  const { model } = puppy as { model: unknown }
  return typeof model === 'string' ? model : null
}

/**
 * Which model each chat runs on.
 *
 * Code Puppy has one model per process, and a chat without one of its own follows it, so that is
 * the default: new chats start on it. A chat can choose its own (through the bootstrap), which
 * leaves the default and every other chat where they were. The choice is saved with the chat, so
 * reopening it restores it.
 */
export class ChatModels {
  private defaultModel: string | null = null
  /** Chats that chose their own model; the rest follow the default. */
  private readonly chosen = new Map<string, string>()

  constructor(
    private readonly setOption: SetOption,
    private readonly inEveryProcess: InEveryProcess,
    private readonly index: SessionIndex,
  ) {}

  get default(): string | null {
    return this.defaultModel
  }

  /** The model a chat runs on. */
  of(sessionId: string): string | null {
    return this.chosen.get(sessionId) ?? this.defaultModel
  }

  /** What Code Puppy reports as its model, which (for a chat that has not chosen) is the default. */
  remember(options: SessionConfigOption[] | null | undefined): void {
    this.defaultModel = modelIn(options) ?? this.defaultModel
  }

  /** Every running Code Puppy (the model is per process); the ones that start later read it from the user's config. */
  async setDefault(model: string): Promise<SessionConfigOption[]> {
    const answers = await this.inEveryProcess((scratchId) => this.setOption(scratchId, DEFAULT_MODEL_OPTION, model))
    this.defaultModel = model
    return answers[0]?.configOptions ?? []
  }

  /**
   * One chat's own model. `keep`: saved with the chat, so reopening it restores the model (an automatic
   * switch on a usage limit is not kept: once the quota is back, the chat should be on the main model).
   */
  async choose(sessionId: string, model: string, { keep = true } = {}): Promise<SessionConfigOption[]> {
    const answer = await this.setOption(sessionId, CHAT_MODEL_OPTION, model)
    if (confirmedModel(answer) === model) {
      this.chosen.set(sessionId, model)
      if (keep) this.index.update(sessionId, { model })
      return answer.configOptions ?? []
    }
    // A Code Puppy without the bootstrap has only its one model: change that, as Puppy always used to.
    const legacy = await this.setOption(sessionId, DEFAULT_MODEL_OPTION, model)
    this.chosen.delete(sessionId)
    this.defaultModel = model
    return legacy.configOptions ?? []
  }

  /** A reopened chat gets the model it chose back. Null when it follows the default, or Code Puppy cannot. */
  async restore(sessionId: string): Promise<string | null> {
    const saved = this.index.get(sessionId)?.model
    if (!saved) return null
    try {
      if (confirmedModel(await this.setOption(sessionId, CHAT_MODEL_OPTION, saved)) === saved) {
        this.chosen.set(sessionId, saved)
        return saved
      }
    } catch {
      /* a model that is gone, say: the chat follows the default, and its choice is kept for when it is back */
    }
    return null
  }

  forget(sessionId: string): void {
    this.chosen.delete(sessionId)
  }
}
