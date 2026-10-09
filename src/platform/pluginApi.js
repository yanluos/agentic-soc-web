// usePluginApi(pluginId) — the apiClient with paths prefixed by the plugin's
// REST prefix (/api/v1/<route_prefix>), so plugin UI never hardcodes it.
import { createContext, useContext, useMemo } from "react"

export const PluginContext = createContext(null)

export function usePlugin() {
  return useContext(PluginContext)
}

const METHODS = ["get", "post", "put", "patch", "delete", "upload", "getBlob"]

export function prefixedApi(apiClient, prefix) {
  if (!apiClient) return null
  const base = `/api/v1/${String(prefix || "").replace(/^\/+|\/+$/g, "")}`
  const join = (path) => (path.startsWith("/api/") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`)
  const out = {}
  for (const m of METHODS) {
    if (typeof apiClient[m] === "function") out[m] = (path, ...rest) => apiClient[m](join(path), ...rest)
  }
  out.base = base
  return out
}

export function usePluginApi(pluginId) {
  const ctx = useContext(PluginContext)
  return useMemo(() => {
    if (!ctx) return null
    const plugin = ctx.plugins?.find((p) => p.id === pluginId)
    return prefixedApi(ctx.apiClient, plugin?.route_prefix || pluginId)
  }, [ctx, pluginId])
}
