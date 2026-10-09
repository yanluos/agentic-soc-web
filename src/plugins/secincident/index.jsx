// 安全事件 (secincident) plugin — the alert ledger stays a dynamic table module
// (grant table:secincident, sidebar entry from /api/v1/tables); the plugin
// supplies the event-card renderers and the create dialog.
import { lazy } from "react"
import { ShieldAlert } from "lucide-react"

const SecIncidentItem = lazy(() => import("./SecIncidentItem.jsx").then((m) => ({ default: m.SecIncidentItem })))
const SecIncidentCreateDialog = lazy(() => import("./SecIncidentCreate.jsx").then((m) => ({ default: m.SecIncidentCreateDialog })))

export default {
  id: "secincident",
  sdk: "1",
  modules: [],
  hiddenTables: [],
  tableRenderers: {
    secincident: {
      renderItem: (ctx) => (item) => <SecIncidentItem key={item.id} apiClient={ctx.apiClient} setError={ctx.setError} {...item} />,
      renderCreate: (ctx) => ({ columns, onCreated }) => (
        <SecIncidentCreateDialog apiClient={ctx.apiClient} setError={ctx.setError} columns={columns} onCreated={onCreated} />
      ),
    },
  },
  icon: ShieldAlert,
  settingsSections: [
    { key: "secincident_source", title: "NocoDB 告警源", desc: "legacy 安全事件源表（天眼/EDR 管道写入）的 NocoDB 地址、令牌与表位置。热生效", hot: true },
  ],
  sources: [{ label: "安全事件", icon: ShieldAlert, order: 30 }],
  icons: { ShieldAlert },
}
