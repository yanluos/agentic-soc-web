// 威胁情报 (intel) plugin — no sidebar module; contributes the API-key
// settings section (插件管理 page) and the 威胁情报 tool-source grouping.
import { Radar } from "lucide-react"

export default {
  id: "intel",
  sdk: "1",
  modules: [],
  hiddenTables: [],
  icon: Radar,
  settingsSections: [
    { key: "intel", title: "威胁情报密钥", desc: "VirusTotal / 微步 / Serper API Key。热生效。", hot: true },
  ],
  sources: [{ label: "威胁情报", icon: Radar, order: 40 }],
  icons: {},
}
