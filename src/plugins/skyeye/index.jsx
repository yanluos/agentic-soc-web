// 奇安信天眼 (skyeye, was probe) plugin — frontend descriptor (旁路阻断 + 天眼检索, merged
// 2026-10-10; the skyeye tools have no UI of their own). Module id stays the historic
// grant "bypass_block"; the 天眼探针 credentials are edited on the 插件管理 page.
import { lazy } from "react"
import { Shield, Network } from "lucide-react"

const BypassBlockModule = lazy(() => import("./BypassBlockModule.jsx").then((m) => ({ default: m.BypassBlockModule })))

export default {
  id: "skyeye",
  sdk: "1",
  modules: [
    { id: "bypass_block", group: "security", label: "旁路阻断", icon: Shield, permission: "bypass_block", component: BypassBlockModule },
  ],
  hiddenTables: ["probe_devices", "bypass_blocks"],
  icon: Network,
  settingsSections: [
    { key: "probe", title: "天眼探针接入", desc: "天眼分析平台登录凭据与路径、探针同步/过期间隔。proxy_url：留空沿用全局 SOCKS5 代理，direct 为直连，或填独立 socks5:// 地址；device_proxy 按探针名称或 IP 单独覆盖（例如只让深圳2/青岛走代理）。凭据/证书/代理热生效；采集间隔改后需重启", hot: true },
  ],
  sources: [{ label: "探针", icon: Shield, order: 50 }],
  icons: { Shield, Network },
}
