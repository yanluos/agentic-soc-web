// React binding for the shared assistant chat store (chatStore.js). The hook
// is a thin subscription: all state and the /agent/chat SSE stream live in
// the module-level store, so mounting/unmounting a surface (workbench page,
// floating panel) never interrupts a running turn. Both surfaces get the
// same sessions/messages/streaming view. `streaming` = the ACTIVE session has
// a live turn; `streamingIds` = every session that does (turns run per
// session, several sessions may stream at once).
//
// `surface` + `visible` let the store know when somebody is looking at the
// conversation (a turn finishing unobserved pops a toast instead).

import { useEffect, useSyncExternalStore } from "react"
import * as store from "./chatStore.js"

export function useAgentChat({ onAction, surface, visible = true } = {}) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)

  useEffect(() => {
    store.ensureInit()
  }, [])

  // Re-fetch the model registry whenever this surface becomes visible.
  useEffect(() => {
    if (visible) store.refreshModels()
  }, [visible])

  useEffect(() => {
    if (onAction) store.setActionHandler(onAction)
  }, [onAction])

  useEffect(() => {
    if (!surface) return undefined
    store.setSurfaceVisible(surface, visible)
    return () => store.setSurfaceVisible(surface, false)
  }, [surface, visible])

  return {
    ...state,
    setActiveId: store.setActiveId,
    createSession: store.createSession,
    deleteSession: store.deleteSession,
    renameSession: store.renameSession,
    setSessionModel: store.setSessionModel,
    setSessionEngine: store.setSessionEngine,
    addFiles: store.addFiles,
    removeAttachment: store.removeAttachment,
    clearMessages: store.clearMessages,
    pushNote: store.pushNote,
    sendMessage: store.sendMessage,
    stop: store.stop,
  }
}

export { reset as resetAgentChat } from "./chatStore.js"
