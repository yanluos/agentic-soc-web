// 安全事件 (secincident) plugin — the alert ledger stays a dynamic table module
// (grant table:secincident, sidebar entry from /api/v1/tables); the plugin
// supplies the event-card renderers and the create dialog.
import { lazy } from "react"
import { ShieldAlert } from "lucide-react"

const SecIncidentItem = lazy(() => import("./SecIncidentItem.jsx").then((m) => ({ default: m.SecIncidentItem })))
const TodoRail = lazy(() => import("./TodoRail.jsx").then((m) => ({ default: m.TodoRail })))
const CaseChatNotices = lazy(() => import("./CaseChatNotices.jsx").then((m) => ({ default: m.CaseChatNotices })))
const SecIncidentCreateDialog = lazy(() => import("./SecIncidentCreate.jsx").then((m) => ({ default: m.SecIncidentCreateDialog })))

export default {
  id: "secincident",
  sdk: "1",
  modules: [],
  hiddenTables: [],
  tableRenderers: {
    secincident: {
      renderItem: (ctx) => (item) => <SecIncidentItem key={item.id} apiClient={ctx.apiClient} setError={ctx.setError} {...item} />,
      // 右上角：案件会话「AI 回复中 / AI 已回复」提醒 + 新建事件
      renderCreate: (ctx) => ({ columns, onCreated, patchRecord, refreshRecord, deleteRecord }) => (
        <>
          <CaseChatNotices
            apiClient={ctx.apiClient}
            setError={ctx.setError}
            columns={columns}
            patchRecord={patchRecord}
            refreshRecord={refreshRecord}
            deleteRecord={deleteRecord}
          />
          <SecIncidentCreateDialog apiClient={ctx.apiClient} setError={ctx.setError} columns={columns} onCreated={onCreated} />
        </>
      ),
      // 左侧可折叠「待办告警」栏:按风险等级(高/中/低/误报)分组的 待跟进/跟进中 事件方卡,高危默认展开
      renderAside: (ctx) => (props) => <TodoRail apiClient={ctx.apiClient} setError={ctx.setError} {...props} />,
    },
  },
  icon: ShieldAlert,
  settingsSections: [
    { key: "secincident_source", title: "NocoDB 告警源", desc: "legacy 安全事件源表（天眼/EDR 管道写入）的 NocoDB 地址、令牌与表位置。热生效", hot: true },
  ],
  sources: [{ label: "安全事件", icon: ShieldAlert, order: 30 }],
  icons: { ShieldAlert },
}
