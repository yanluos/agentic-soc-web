// 应急响应 (ir) plugin — frontend descriptor. Full-custom module: case list +
// per-case analysis views over /api/v1/ir (soc-server plugins/ir). Both
// backing tables are write-guarded and hidden from the sidebar.
import { lazy } from "react"
import { Siren, Bug } from "lucide-react"

const IRModule = lazy(() =>
  import("./IRModule.jsx").then((m) => ({ default: m.IRModule }))
)

export default {
  id: "ir",
  sdk: "1",
  modules: [
    {
      id: "ir",
      group: "security",
      label: "应急响应",
      icon: Siren,
      permission: "ir",
      component: IRModule,
    },
  ],
  hiddenTables: ["ir_cases", "ir_findings"],
  icon: Siren,
  settingsSections: [
    {
      key: "ir",
      title: "应急响应",
      desc: "采集包存储目录、上传大小上限、采集令牌有效期、自动研判工作流名、发现物化最低分；改后需重启",
      hot: false,
    },
  ],
  sources: [{ label: "应急响应", icon: Siren, order: 65 }],
  icons: { Siren, Bug },
}
