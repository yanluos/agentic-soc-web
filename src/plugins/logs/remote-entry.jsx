// Remote-entry descriptor for the logs plugin (日志服务). Built by
// vite.remote.config.js (REMOTE_PLUGIN=logs) into log-service/assets/index.js
// and loaded at runtime by the console through the import-map SDK. The backend
// is the log-service remote plugin process (syslog receiver + ClickHouse).
import { Activity, ScrollText } from "lucide-react"
import { LogsModule } from "./LogsModule.jsx"
import { StatusPanel } from "./StatusPanel.jsx"

export default {
  id: "logs",
  sdk: "1",
  icon: "ScrollText",
  modules: [
    { id: "logs", group: "events", label: "日志检索", icon: ScrollText, permission: "logs", component: LogsModule },
  ],
  hiddenTables: ["log_sources"],
  // operational panel on the 插件管理 page (next to the plugin's 健康 tab)
  panels: [{ key: "status", label: "运行状态", icon: Activity, permission: "logs", component: StatusPanel }],
  settingsSections: [
    {
      key: "logs",
      title: "日志服务",
      desc: "全局保留天数 retention_days（来源可在日志检索→来源里单独设置）、磁盘上限 max_disk_gb(0=不限)、未登记来源策略 unknown_sources(accept|drop)、静默告警 silence_warn_minutes、写入令牌 ingest_tokens({名称: 令牌})。热生效。",
      hot: true,
    },
  ],
  sources: [{ label: "日志服务", icon: ScrollText, order: 68 }],
  icons: { ScrollText, Activity },
}
