import { createContext, useContext } from 'react'

export interface PreviewActions {
  /** Folder of the open conversation, to resolve relative file paths. */
  cwd: string | null
  showFile: (absolutePath: string) => void
  /** A localhost address: opens in the panel instead of leaving the app. */
  showUrl: (url: string) => void
  showHtml: (html: string) => void
}

const none: PreviewActions = { cwd: null, showFile: () => undefined, showUrl: () => undefined, showHtml: () => undefined }

export const PreviewContext = createContext<PreviewActions>(none)
export const usePreviewActions = () => useContext(PreviewContext)
