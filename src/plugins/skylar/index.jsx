// 奇安信天擎 (skylar, was tianqing) plugin — no sidebar module; contributes the 天擎 ODP
// credentials section (插件管理 page) and the 天擎 tool-source grouping.
import { ShieldCheck, Shield } from "lucide-react"

export default {
  id: "skylar",
  sdk: "1",
  modules: [],
  hiddenTables: [],
  icon: ShieldCheck,
  settingsSections: [
    { key: "tianqing", title: "天擎 ODP 接入", desc: "天擎开放平台端点、App Key/Secret（ZEUS-HMAC）与 CA 证书。凭据热生效，端点改后需重启", hot: false },
  ],
  sources: [{ label: "天擎", icon: Shield, order: 35 }],
  icons: { ShieldCheck },
}
