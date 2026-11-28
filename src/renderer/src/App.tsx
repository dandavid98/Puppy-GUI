import { useEffect, useMemo, useState } from 'react'
import { Banners, TopBar } from './components/TopBar'
import { Home } from './components/Home'
import { DEFAULT_CONTEXT_LENGTH } from '@shared/limits'
import { PreviewContext } from './components/previewContext'
import { PreviewPanel } from './components/PreviewPanel'
import { AgentsView } from './components/AgentsView'
import { ContextMeter } from './components/ContextMeter'
import { McpView } from './components/McpView'
import { ModelPicker } from './components/ModelPicker'
import { PermissionPicker } from './components/PermissionPicker'
import { SettingsView } from './components/SettingsView'
import { Sidebar } from './components/Sidebar'
import { ThreadView } from './components/ThreadView'
import { recentFolders } from './lib/format'
import { usePuppy } from './state/usePuppy'
import { shownModel } from './state/store'

export function App() {
  const { state, actions } = usePuppy()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const inSettings = state.view === 'settings'
  const thread = state.view === 'conversation' && state.activeId ? state.threads[state.activeId] : null
  const summary = state.sessions.find((session) => session.sessionId === state.activeId)
  const firstMessage = thread?.items.find((item) => item.type === 'user')
  const title = summary?.title ?? (firstMessage && 'text' in firstMessage ? firstMessage.text : null)

  // Cmd+N: new conversation. Cmd+,: settings. Esc: close Settings, or stop the running turn.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        actions.newConversation(state.mode)
      } else if (event.metaKey && event.key === ',') {
        event.preventDefault()
        actions.openSettings()
      } else if (event.key === 'Escape' && inSettings && !document.querySelector('dialog[open]')) {
        // (an open menu takes its own Escape first.) Blur first: a field being edited saves when it loses focus.
        ;(document.activeElement as HTMLElement | null)?.blur()
        actions.closeSettings()
      } else if (event.key === 'Escape' && thread?.running) {
        actions.cancel(thread.sessionId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, state.mode, thread, inSettings])

  const previewActions = useMemo(
    () => ({ cwd: thread?.cwd ?? null, showFile: actions.showFile, showUrl: actions.showUrl, showHtml: (html: string) => void actions.showHtml(html) }),
    [thread?.cwd, actions.showFile, actions.showUrl, actions.showHtml],
  )

  const modelPicker = (
    <ModelPicker
      model={state.model}
      value={shownModel(state) ?? undefined}
      onChange={(value) => void actions.setChatModel(value)}
      quota={state.quota}
      onOpen={() => void actions.refreshQuota()}
    />
  )
  const permissionPicker = <PermissionPicker value={thread ? thread.permission : state.newChatPermission} onChange={actions.setPermission} />
  const chatModel = shownModel(state)
  const contextLength = state.modelContexts[chatModel ?? ''] ?? DEFAULT_CONTEXT_LENGTH
  const contextMeter = <ContextMeter used={thread?.contextTokens ?? null} total={contextLength} model={chatModel ?? undefined} />

  const main = () => {
    if (state.view === 'agents') {
      return (
        <AgentsView
          listAgents={actions.listAgents}
          setDefaultAgent={actions.setDefaultAgent}
          onAsk={actions.ask}
          busy={Object.values(state.threads).some((open) => open.running)}
        />
      )
    }
    if (state.view === 'mcp') {
      return (
        <McpView
          mcp={state.mcp}
          listMarketplace={actions.listMcpMarketplace}
          listCatalog={actions.listMcpCatalog}
          addServer={actions.addMcpServer}
          addCatalogServer={actions.addMcpCatalogServer}
          removeServer={actions.removeMcpServer}
          setServerEnabled={actions.setMcpServerEnabled}
          signIn={actions.signInToMcp}
          connections={actions}
        />
      )
    }
    if (inSettings && state.settings) {
      return (
        <SettingsView
          settings={state.settings}
          model={state.model}
          quota={state.quota}
          onRefreshQuota={actions.refreshQuota}
          modelError={state.modelError}
          onRetryModels={actions.retryModels}
          loadAppInfo={actions.loadAppInfo}
          onUpdate={(patch) => void actions.updateSettings(patch)}
          onModel={(value) => void actions.setDefaultModel(value)}
          onRevealLog={actions.revealLog}
          onRestartAgent={actions.restartAgent}
          onUpdateApp={actions.updateApp}
          onClose={actions.closeSettings}
        />
      )
    }
    if (thread) {
      return (
        <ThreadView
          key={thread.sessionId} // a fresh view per conversation: no scroll position, draft or attachments carried over
          thread={thread}
          showWork={state.settings?.thinkingMode === true}
          permissions={state.permissions.filter((prompt) => prompt.sessionId === thread.sessionId)}
          permissionPicker={permissionPicker}
          modelPicker={modelPicker}
          contextMeter={contextMeter}
          commands={state.commands}
          onSend={(text, attachments) => void actions.send(text, attachments)}
          onStop={() => actions.cancel(thread.sessionId)}
          onChooseFolder={() => void actions.chooseFolder()}
          onAnswer={actions.answerPermission}
        />
      )
    }
    return (
      <Home
        key={`${state.mode}-${state.draft?.id ?? 0}`} // each mode has its own box (and kept text); a new "Ask for this agent" fills it afresh
        initialDraft={state.draft?.text}
        mode={state.mode}
        name={state.settings?.displayName ?? ''}
        folder={state.folder}
        recentFolders={recentFolders(state.sessions)}
        permissionPicker={permissionPicker}
        modelPicker={modelPicker}
        contextMeter={contextMeter}
        commands={state.commands}
        onSend={actions.send}
        onChooseFolder={() => void actions.chooseFolder()}
        onSelectFolder={actions.selectFolder}
      />
    )
  }

  return (
    <PreviewContext.Provider value={previewActions}>
    <div className="flex h-full">
      {sidebarOpen && (
        <div className="relative flex shrink-0">
          {/* Behind frosted glass while Settings is open: out of reach (inert), and a click on it closes Settings. */}
          <div inert={inSettings} className="flex">
            <Sidebar
              sessions={state.sessions}
              folders={state.folders}
              activeId={state.activeId}
              mode={state.mode}
              status={state.status}
              view={state.view}
              updateAvailable={state.updateAvailable}
              onUpdate={() => void actions.updateNow()}
              onNew={actions.newConversation}
              actions={actions}
              onTheme={(theme) => void actions.updateSettings({ theme })}
              onSettings={actions.openSettings}
              onAgents={actions.openAgents}
              onMcp={actions.openMcp}
              onCollapse={() => setSidebarOpen(false)}
            />
          </div>
          {inSettings && (
            <div
              aria-hidden
              data-testid="settings-backdrop"
              title="Close settings"
              onClick={actions.closeSettings}
              className="absolute inset-0 z-30 cursor-pointer bg-canvas/45 backdrop-blur-[6px] motion-safe:animate-frost-in"
            />
          )}
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          sidebarOpen={sidebarOpen}
          onShowSidebar={() => setSidebarOpen(true)}
          onNew={() => actions.newConversation(state.mode)}
          title={thread ? title : null}
          folder={thread?.kind === 'code' ? thread.cwd : null}
        />
        <Banners status={state.status} notice={state.notice} vpn={state.vpn} onRetry={actions.restartAgent} onCheckVpn={() => void actions.checkVpn()} onDismiss={actions.dismissNotice} />
        {main()}
      </main>
      {state.preview && thread && (
        <PreviewPanel
          target={state.preview}
          revision={state.previewRevision}
          onClose={actions.closePreview}
          onOpenExternal={() => void actions.openInBrowser(state.preview!.location)}
        />
      )}
    </div>
    </PreviewContext.Provider>
  )
}
