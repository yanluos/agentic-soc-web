// Import-map shim: `@soc/platform` → the host's plugin SDK surface (src/platform).
const P = window.__SOC_SDK__.platform
export default P
export const {
  usePlugin, usePluginApi, prefixedApi, PluginContext, PluginBoundary, hasModule,
  emitSetFilter, onSetFilter, emitTableView, normalizeActionEvent,
  createApiClient, buildTablePath, buildTableRecordPath, buildTableMetaPath, toNocoV3Sort,
  GenericTableModule, FilterPanel, SortPanel, FieldsPanel, TableToolbar, useTableViewState,
  IconButton, ConfirmDialog, MarkdownText,
  GroupCard, SubSection, SaveButton, ConfiguredBadge, useSection, SectionJsonEditor,
  cardHover, cn, getStoredToken, resolveIcon, registerIcons, moduleGroups, toast,
} = P
