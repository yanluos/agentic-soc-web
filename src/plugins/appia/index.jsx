// Appia 集成 (appia) plugin — no sidebar module. Contributes to the 插件管理
// page: a structured editor for its "appia" settings section (accounts) and
// the 监听订阅 operational panel; plus the Appia tool-source grouping.
import { lazy } from "react"
import { MessagesSquare } from "lucide-react"

const AppiaAccountsEditor = lazy(() => import("./AppiaAccountsEditor.jsx"))
const AppiaSubscriptionsPanel = lazy(() => import("./AppiaSubscriptionsPanel.jsx"))

export default {
  id: "appia",
  sdk: "1",
  modules: [],
  hiddenTables: ["appia_subscriptions"],
  settingsSections: [
    { key: "appia", title: "消息外发账号", desc: "按公司配置的 Appia 账号（Bitmain/SSC/Antpool/Sophgo）。热生效，轮换 token 后下次重连即用新值。", hot: true },
  ],
  settingsEditors: { appia: AppiaAccountsEditor },
  panels: [
    { key: "subscriptions", label: "监听订阅", icon: MessagesSquare, permission: "integrations", component: AppiaSubscriptionsPanel },
  ],
  sources: [{ label: "Appia", icon: MessagesSquare, order: 20 }],
  icons: { MessagesSquare },
}
