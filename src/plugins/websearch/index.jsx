// 网页搜索 (websearch) plugin — no sidebar module; contributes the Serper key
// settings section (插件管理 page) and the 网页搜索 tool-source grouping.
// Split out of the intel plugin 2026-10-10.
import { Globe } from "lucide-react"

export default {
  id: "websearch",
  sdk: "1",
  modules: [],
  hiddenTables: [],
  icon: Globe,
  settingsSections: [
    { key: "websearch", title: "网页搜索密钥", desc: "Serper API Key：serper_api_key 为主 key，serper_api_keys 为备用 key 列表，额度用尽时按顺序轮换。热生效。各 key 余额见健康页签「Serper 搜索额度」。", hot: true },
  ],
  sources: [{ label: "网页搜索", icon: Globe, order: 45 }],
  icons: {},
}
