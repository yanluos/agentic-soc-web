// Frontend plugin registry.
//
// Discovery is build-time: every src/plugins/<id>/index.jsx default export is a
// descriptor (same shape as src/core/modules.js). Existence + permission are
// decided by the BACKEND (GET /api/v1/plugins): a compiled plugin whose backend
// is disabled or absent never renders; a backend module with no compiled
// component renders NotImplemented (Phase 2: loads frontend.remote_entry).
import { core } from "@/core/modules.jsx"

const compiledPlugins = Object.values(import.meta.glob("./*/index.{js,jsx}", { eager: true }))
  .map((m) => m?.default)
  .filter((d) => d && d.id)

export const KNOWN_GROUPS = ["security", "events", "ai", "system", "plugins"]

function normalizeModule(pluginId, m, backend) {
  return {
    ...m,
    pluginId,
    group: KNOWN_GROUPS.includes(m.group) ? m.group : "plugins",
    permission: m.permission ?? backend?.permission ?? m.id,
    label: m.label ?? backend?.label ?? m.id,
    icon: m.icon ?? backend?.icon ?? "Table",
  }
}

/**
 * buildRegistry merges core + compiled (and remotely loaded) plugins against
 * the backend's enabled plugin list. `enabled` is the /api/v1/plugins response (array of plugin
 * views); null → plugins unavailable (fail closed unless VITE_PLUGINS_ASSUME_ALL).
 */
export function buildRegistry(enabled, remote = {}) {
  const assumeAll = import.meta.env.VITE_PLUGINS_ASSUME_ALL === "1"
  const backendById = new Map((enabled || []).filter((p) => p.enabled).map((p) => [p.id, p]))
  const reg = {
    modules: [],
    byId: new Map(),
    tableRenderers: { ...core.tableRenderers },
    settingsSections: [...(core.settingsSections || [])],
    // Per-plugin UI contributions consumed by the 插件管理 page:
    // { [id]: { compiled, icon, settingsSections, settingsEditors, panels } }
    pluginUI: {},
    sources: [...(core.sources || [])],
    hiddenTables: new Set(core.hiddenTables || []),
    icons: { ...(core.icons || {}) },
    plugins: [],
    missing: [],
  }
  const add = (pluginId, m, backend) => {
    const mod = normalizeModule(pluginId, m, backend)
    if (reg.byId.has(mod.id)) {
      if (import.meta.env.DEV) console.error(`[plugins] duplicate module id "${mod.id}" (${pluginId} vs ${reg.byId.get(mod.id).pluginId})`)
      return
    }
    reg.byId.set(mod.id, mod)
    reg.modules.push(mod)
  }
  for (const m of core.modules) add("core", m)

  // Compiled descriptors win; a remotely loaded descriptor (frontend.remote_entry,
  // fetched by App through the import-map SDK) fills in for plugins with no
  // compiled UI.
  const compiledById = new Map(compiledPlugins.map((p) => [p.id, p]))
  for (const [id, d] of Object.entries(remote || {})) {
    if (d && d.id === id && !compiledById.has(id)) compiledById.set(id, { ...d, remote: true })
  }
  const activeIds = enabled ? [...backendById.keys()] : assumeAll ? [...compiledById.keys()] : []

  for (const id of activeIds) {
    const backend = backendById.get(id)
    const compiled = compiledById.get(id)
    reg.plugins.push({ id, route_prefix: backend?.route_prefix || id, version: backend?.version, compiled: !!compiled })
    if (compiled) {
      if (backend?.frontend?.sdk && compiled.sdk && String(backend.frontend.sdk).split(".")[0] !== String(compiled.sdk).split(".")[0]) {
        reg.missing.push({ id, reason: "sdk" })
      }
      const declared = new Map((backend?.frontend?.modules || []).map((m) => [m.id, m]))
      for (const m of compiled.modules || []) {
        // A backend that declares frontend.modules is authoritative about which exist.
        if (declared.size && !declared.has(m.id)) continue
        add(id, m, declared.get(m.id))
      }
      for (const m of declared.values()) {
        if (!(compiled.modules || []).some((cm) => cm.id === m.id)) add(id, { ...m, missing: true }, m)
      }
      Object.assign(reg.tableRenderers, compiled.tableRenderers || {})
      reg.settingsSections.push(...(compiled.settingsSections || []).map((s) => ({ ...s, pluginId: id })))
      reg.pluginUI[id] = {
        compiled: true,
        remote: !!compiled.remote,
        icon: compiled.icon || compiled.modules?.[0]?.icon || Object.values(compiled.icons || {})[0] || null,
        settingsSections: compiled.settingsSections || [],
        settingsEditors: compiled.settingsEditors || {},
        panels: compiled.panels || [],
      }
      reg.sources.push(...(compiled.sources || []))
      for (const t of compiled.hiddenTables || []) reg.hiddenTables.add(t)
      Object.assign(reg.icons, compiled.icons || {})
    } else {
      reg.pluginUI[id] = { compiled: false, icon: null, settingsSections: [], settingsEditors: {}, panels: [] }
      // Backend-only plugin (no compiled UI): surface its modules as placeholders.
      for (const m of backend?.frontend?.modules || []) add(id, { ...m, missing: true }, m)
    }
    for (const t of backend?.frontend?.hidden_tables || []) reg.hiddenTables.add(t)
  }
  reg.sources.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  return reg
}

export { compiledPlugins }
