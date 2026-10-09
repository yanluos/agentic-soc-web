// 工单 (tickets) plugin — frontend descriptor. The module is table-backed:
// GenericTableModule renders the tickets table in card-list mode with the
// renderers below; PATCH/DELETE go to /api/v1/tickets (the raw table is
// write-guarded, so the server-side 处理记录 timeline cannot be bypassed).
import { lazy } from "react"
import { ClipboardList } from "lucide-react"

const TicketItem = lazy(() => import("./TicketItem.jsx").then((m) => ({ default: m.TicketItem })))
const TicketCreateDialog = lazy(() => import("./TicketCreate.jsx").then((m) => ({ default: m.TicketCreateDialog })))

export default {
  id: "tickets",
  sdk: "1",
  modules: [
    { id: "tickets", group: "events", label: "工单", icon: ClipboardList, permission: "tickets", table: "tickets" },
  ],
  hiddenTables: ["tickets"],
  tableRenderers: {
    tickets: {
      renderItem: () => (item) => <TicketItem key={item.id} {...item} />,
      renderCreate: (ctx) => ({ columns, onCreated }) => (
        <TicketCreateDialog apiClient={ctx.apiClient} setError={ctx.setError} columns={columns} onCreated={onCreated} />
      ),
      patchPath: (id) => `/api/v1/tickets/${id}`,
      deletePath: (id) => `/api/v1/tickets/${id}`,
    },
  },
  settingsSections: [],
  sources: [{ label: "工单", icon: ClipboardList, order: 70 }],
  icons: { ClipboardList },
}
