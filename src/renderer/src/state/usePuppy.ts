import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { Attachment, ChatFolder, FolderPatch, SessionSummary, Settings, WorkspaceKind } from '@shared/api'
import type { PermissionLevel } from '@shared/permissions'
import { isLocalUrl, previewTarget, webTarget, type PreviewTarget } from '@shared/preview'
import { forgetDraft } from './drafts'
import { loadLists } from './loadLists'
import { initialState, reducer, type Action } from './store'

const api = window.puppy

/** Electron prefixes IPC errors with plumbing nobody needs to read. */
export function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}

/**
 * A local server worth framing. Not the app's own origin: in development the UI
 * itself is served from localhost, and a page there could reach into it.
 */
function webPreview(url: string): PreviewTarget | null {
  return isLocalUrl(url) && new URL(url).origin !== window.location.origin ? webTarget(url) : null
}

/** All app state plus the actions the UI can take. The only place that talks to window.puppy. */
export function usePuppy() {
  const [state, dispatch] = useReducer(reducer, initialState)

  /** Run an action; failures become a dismissible notice instead of vanishing. Says whether it worked. */
  const guard = useCallback(async (work: () => Promise<unknown>): Promise<boolean> => {
    try {
      await work()
      return true
    } catch (error) {
      dispatch({ type: 'notice', message: readableError(error) })
      return false
    }
  }, [])

  const ready = useRef(false)
  ready.current = state.status.state === 'ready'

  const refreshSessions = useCallback(async () => {
    const lists = await loadLists(api, readableError)
    // A failed list keeps what the sidebar already shows.
    if (lists.sessions) dispatch({ type: 'sessions', sessions: lists.sessions })
    if (lists.folders) dispatch({ type: 'folders', folders: lists.folders })
    // While Code Puppy is down the status already says so; failing while it claims to be ready is news.
    if (lists.problems.length && ready.current) dispatch({ type: 'notice', message: lists.problems.join(' ') })
  }, [])

  useEffect(() => {
    const unsubscribers = [
      api.onStatus((status) => dispatch({ type: 'status', status })),
      api.onSessionUpdate((notification) => dispatch({ type: 'update', notification })),
      api.onPermissionRequest((prompt) => dispatch({ type: 'permission', prompt })),
      api.onSessionsChanged(() => void refreshSessions()),
      api.onQuota((quota) => dispatch({ type: 'quota', quota })),
      api.onVpnStatus((status) => dispatch({ type: 'vpn', status })),
      api.onModelSwitched((change) => dispatch({ type: 'modelSwitched', change })),
      api.onUpdateAvailable((available) => dispatch({ type: 'updateAvailable', available })),
      api.onMcpState((mcp) => dispatch({ type: 'mcp', state: mcp })),
    ]
    void api.getStatus().then((status) => dispatch({ type: 'status', status }))
    void api.getSettings().then((settings) => dispatch({ type: 'settings', settings }))
    void api.getQuota().then((quota) => dispatch({ type: 'quota', quota }))
    void api.getVpnStatus().then((status) => dispatch({ type: 'vpn', status }))
    void api.getUpdateAvailable().then((available) => dispatch({ type: 'updateAvailable', available }))
    void api.getModelContexts().then((contexts) => dispatch({ type: 'modelContexts', contexts }))
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [refreshSessions])

  const loadModels = useCallback(() => {
    dispatch({ type: 'modelError', failed: false })
    api.getConfigOptions().then(
      (configOptions) => dispatch({ type: 'config', configOptions }),
      () => dispatch({ type: 'modelError', failed: true }),
    )
  }, [])

  useEffect(() => {
    if (state.status.state !== 'ready') return
    void refreshSessions()
    loadModels()
  }, [state.status.state, refreshSessions, loadModels])

  const { activeId, mode, folder, threads, pendingUrl, newChatPermission, newChatModel } = state
  const defaultModel = (state.model?.currentValue as string | undefined) ?? null
  const activeRef = useRef(activeId)
  activeRef.current = activeId

  // A server the agent mentioned: show it once it really answers, and only if the user is still in that conversation.
  useEffect(() => {
    if (!pendingUrl) return
    const queuedFrom = activeRef.current
    dispatch({ type: 'pendingUrlHandled' })
    void api.waitForServer(pendingUrl).then((up) => {
      const target = webPreview(pendingUrl)
      if (up && target && activeRef.current === queuedFrom) dispatch({ type: 'preview', target })
    })
  }, [pendingUrl])

  /** What the user chose on the home screen, for the chat that has just started. */
  const applyHomeChoices = async (sessionId: string) => {
    if (newChatPermission !== 'standard') dispatch({ type: 'permissionLevel', sessionId, level: await api.setPermissionLevel(sessionId, newChatPermission) })
    if (newChatModel) {
      await api.setModel(newChatModel, sessionId)
      dispatch({ type: 'chatModel', sessionId, model: newChatModel, byUser: false }) // chosen before the chat existed: nothing to tell it
    }
  }

  const send = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      dispatch({ type: 'notice', message: null })
      let sessionId = activeId
      try {
        if (!sessionId) {
          const session = await api.newSession(mode, folder ?? undefined)
          dispatch({ type: 'opened', session })
          sessionId = session.sessionId
          try {
            await applyHomeChoices(sessionId)
          } catch (error) {
            // Never run a chat other than the user set it up (looser, stricter, another model): show their message, and why it was not sent.
            dispatch({ type: 'sent', sessionId, text, attachments, at: new Date().toISOString() })
            dispatch({ type: 'finished', sessionId, error: `${readableError(error)} Your message was not sent.` })
            void refreshSessions()
            return
          }
        }
        dispatch({ type: 'sent', sessionId, text, attachments, at: new Date().toISOString() })
        const turn = await api.prompt(sessionId, text, attachments)
        dispatch({ type: 'finished', sessionId, contextTokens: turn.contextTokens })
      } catch (error) {
        if (sessionId) dispatch({ type: 'finished', sessionId, error: readableError(error) })
        else dispatch({ type: 'notice', message: readableError(error) })
      }
      void refreshSessions()
    },
    [activeId, mode, folder, newChatPermission, newChatModel, refreshSessions],
  )

  const open = useCallback(
    async (summary: SessionSummary) => {
      if (threads[summary.sessionId]) return dispatch({ type: 'activate', sessionId: summary.sessionId })
      // Create the thread first: Code Puppy replays history while session/load is in flight.
      dispatch({ type: 'opened', session: { ...summary, permission: 'standard', model: null, configOptions: [] }, contextTokens: summary.contextTokens, replaying: true })
      try {
        const session = await api.loadSession(summary.sessionId, summary.cwd)
        dispatch({ type: 'chatModel', sessionId: summary.sessionId, model: session.model, byUser: false })
        dispatch({ type: 'permissionLevel', sessionId: summary.sessionId, level: session.permission })
        dispatch({ type: 'replayed', sessionId: summary.sessionId })
      } catch (error) {
        dispatch({ type: 'finished', sessionId: summary.sessionId, error: readableError(error) })
      }
    },
    [threads],
  )

  const actions = useMemo(() => {
    const go = (action: Action) => () => dispatch(action)
    /** Something about pins or folders changed: do it, then show the new arrangement. */
    const filing = (work: () => Promise<unknown>) =>
      guard(async () => {
        await work()
        await refreshSessions()
      })
    return {
      send,
      open,
      newConversation: (kind: WorkspaceKind) => dispatch({ type: 'mode', mode: kind }),
      cancel: (sessionId: string) => void api.cancel(sessionId),
      restartAgent: () => void api.restartAgent().catch(() => undefined),
      updateApp: api.updateApp,
      /** From the sidebar badge: the confirmation dialog is the main process's; only a refusal to even try needs saying. */
      updateNow: () =>
        guard(async () => {
          const outcome = await api.updateApp()
          if (outcome.state === 'unavailable') dispatch({ type: 'notice', message: outcome.reason })
        }),
      dismissNotice: go({ type: 'notice', message: null }),
      openSettings: go({ type: 'view', view: 'settings' }),
      closeSettings: go({ type: 'view', view: 'conversation' }),
      selectFolder: (path: string) => {
        dispatch({ type: 'folder', folder: path })
        void api.prepareFolder(path)
      },
      refreshQuota: () => api.refreshQuota().then((quota) => dispatch({ type: 'quota', quota })),
      checkVpn: () => api.checkVpn().then((status) => dispatch({ type: 'vpn', status })),
      chooseFolder: () =>
        guard(async () => {
          const chosen = await api.chooseFolder()
          if (!chosen) return
          dispatch({ type: 'folder', folder: chosen })
          void api.prepareFolder(chosen) // start Code Puppy there now, so the first message is not slow
        }),
      answerPermission: (requestId: string, optionId: string | null) => {
        dispatch({ type: 'permissionAnswered', requestId })
        void api.answerPermission(requestId, optionId)
      },
      /** On a chat: Code Puppy applies it (and may refuse, which is said). On the home screen: for the chat that is about to start. */
      setPermission: (level: PermissionLevel) =>
        activeId
          ? guard(async () => dispatch({ type: 'permissionLevel', sessionId: activeId, level: await api.setPermissionLevel(activeId, level) }))
          : dispatch({ type: 'newChatPermission', level }),
      /** The model menu by the message box: that chat's own model, or the next new chat's. Never the default. */
      setChatModel: (value: string) =>
        activeId
          ? guard(async () => {
              await api.setModel(value, activeId)
              dispatch({ type: 'chatModel', sessionId: activeId, model: value, byUser: true })
            })
          : dispatch({ type: 'newChatModel', model: value === defaultModel ? null : value }),
      /** Settings: the model new chats start on, and chats that never chose run on. */
      setDefaultModel: (value: string) => guard(async () => dispatch({ type: 'config', configOptions: await api.setModel(value) })),
      renameSession: (sessionId: string, title: string) =>
        guard(async () => {
          await api.renameSession(sessionId, title)
          await refreshSessions()
        }),
      pinSession: (sessionId: string, pinned: boolean) => filing(() => api.pinSession(sessionId, pinned)),
      moveSession: (sessionId: string, folderId: string | null) => filing(() => api.moveSession(sessionId, folderId)),
      updateFolder: (id: string, patch: FolderPatch) => filing(() => api.updateFolder(id, patch)),
      deleteFolder: (id: string) => filing(() => api.deleteFolder(id)),
      /** Makes the folder, and files `sessionId` in it when given. Resolves to whether the folder was made. */
      createFolder: async (name: string, kind: WorkspaceKind, sessionId?: string) => {
        const made: ChatFolder[] = []
        const created = await guard(async () => void made.push(await api.createFolder(name, kind)))
        if (made[0] && sessionId) await guard(() => api.moveSession(sessionId, made[0].id))
        await refreshSessions()
        return created
      },
      deleteSession: (sessionId: string) =>
        guard(async () => {
          await api.deleteSession(sessionId)
          forgetDraft(sessionId)
          dispatch({ type: 'removed', sessionId })
        }),
      updateSettings: (patch: Partial<Settings>) =>
        guard(async () => dispatch({ type: 'settings', settings: await api.updateSettings(patch) })),
      retryModels: loadModels,
      closePreview: go({ type: 'preview', target: null }),
      showFile: (path: string) => dispatch({ type: 'preview', target: previewTarget(path) }),
      showUrl: (url: string) => {
        const target = webPreview(url)
        if (target) dispatch({ type: 'preview', target })
      },
      showHtml: (html: string) =>
        guard(async () => dispatch({ type: 'preview', target: await api.previewHtml(html) })),
      openInBrowser: (target: string) => guard(() => api.openInBrowser(target)),
      loadAppInfo: api.getAppInfo,
      revealLog: () => void api.revealLog(),
      openAgents: go({ type: 'view', view: 'agents' }),
      openMcp: () => {
        dispatch({ type: 'view', view: 'mcp' })
        void api.getMcpState().then((mcp) => dispatch({ type: 'mcp', state: mcp }), () => undefined)
      },
      /** A new chat with `text` already in the box, ready to finish and send. */
      ask: (text: string) => dispatch({ type: 'ask', text }),
      // The pages below show their own errors, next to what failed, so these hand back plain promises.
      listAgents: api.listAgents,
      setDefaultAgent: async (name: string) => {
        const list = await api.setDefaultAgent(name)
        dispatch({ type: 'settings', settings: await api.getSettings() })
        return list
      },
      listMcpMarketplace: api.listMcpMarketplace,
      listMcpCatalog: api.listMcpCatalog,
      // Changes to the server list arrive as an onMcpState push, so nothing here needs dispatching.
      addMcpServer: api.addMcpServer,
      addMcpCatalogServer: api.addMcpCatalogServer,
      removeMcpServer: api.removeMcpServer,
      setMcpServerEnabled: api.setMcpServerEnabled,
      signInToMcp: api.signInToMcp,
      listConnections: api.listConnections,
      addConnection: api.addConnection,
      removeConnection: api.removeConnection,
      chooseConnectionFile: api.chooseConnectionFile,
      findConnectionFiles: api.findConnectionFiles,
      inspectConnectionFile: api.inspectConnectionFile,
      previewConnection: api.previewConnection,
      openConnectionRenewal: api.openConnectionRenewal,
    }
  }, [send, open, guard, activeId, defaultModel, refreshSessions, loadModels])

  return { state, actions }
}

export type PuppyActions = ReturnType<typeof usePuppy>['actions']
