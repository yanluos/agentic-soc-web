// 插件开发规范 —— shown on the 插件管理 page behind a button (a centered modal Dialog).
// The canonical spec lives in docs/design/plugin-architecture.md; this is the
// operator/developer-facing quick reference, kept in sync with it.
import { useState } from "react"
import { BookOpen } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// GuideMarkdown renders the spec at document scale (larger headings than the
// compact card MarkdownText).
function GuideMarkdown({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mt-6 mb-3 border-b pb-2 text-xl font-bold first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-6 mb-2 text-lg font-semibold">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-4 mb-1.5 text-base font-semibold">{children}</h3>
        ),
        p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => (
          <ul className="my-2 ml-5 list-disc [&>li]:mt-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 ml-5 list-decimal [&>li]:mt-1">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {children}
          </a>
        ),
        code: ({ inline, children, ...rest }) =>
          inline ? (
            <code
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
              {...rest}
            >
              {children}
            </code>
          ) : (
            <code className="font-mono text-xs" {...rest}>
              {children}
            </code>
          ),
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-md border bg-muted/60 p-3 text-xs leading-relaxed">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-primary/40 bg-muted/30 py-1 pl-3 text-muted-foreground">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-md border">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="border-b px-3 py-1.5 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-border/50 px-3 py-1.5 align-top">
            {children}
          </td>
        ),
        hr: () => <hr className="my-5 border-border" />,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

// PluginDevGuideButton — the self-contained trigger (outline Button + dialog).
export function PluginDevGuideButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <BookOpen data-icon="inline-start" />
        开发规范
      </Button>
      <PluginDevGuideDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

// PluginDevGuideDialog — the controlled dialog alone, for callers that open it
// from their own menu (the 插件管理 rail's「+」dropdown).
export function PluginDevGuideDialog({ open, onOpenChange }) {
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 py-4 pr-12 text-left">
            <DialogTitle>插件开发规范</DialogTitle>
            <DialogDescription>
              新增平台能力的标准做法。完整设计见仓库{" "}
              <code className="text-xs">
                docs/design/plugin-architecture.md
              </code>
              。
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm">
            <GuideMarkdown>{GUIDE}</GuideMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// GUIDE is the developer-facing spec (kept in sync with the design doc).
const GUIDE = `
# 概览

平台的领域能力都以**插件**交付：一个插件 = 一份 \`plugin.json\` 清单 + 一段实现。新增能力时**核心零改动**——你写一个插件，平台负责鉴权、工具目录、审计、健康、配置、前端装配。

插件有两种运行形态，**契约完全相同**：

| | 进程内插件 | 远程插件 |
|---|---|---|
| 形态 | Go 包，编进 soc-server | 独立进程（任何语言） |
| 上线 | 改代码、重新构建、重启 | 插件管理页粘贴清单，即装即用 |
| 故障域 | panic 可拖垮平台 | 只影响自己，宿主健康检查标红 |
| 权限 | 进程内全信任 | 仅自己的令牌，只能写自己的表 |
| 适用 | 平台自维护的核心能力 | 第三方、异构、需隔离、独立演进 |

参考实现：进程内看 \`soc-server/plugins/skyeye\`；远程看 \`fscan-runner\`（主动探测）与 \`examples/remote-plugin-hello\`。

---

# 目录布局

进程内插件：

\`\`\`
soc-server/plugins/<id>/
  plugin.json      清单（//go:embed 进 plugin.go）
  plugin.go        init(){ plugin.Register(manifest, factory) }；Init/Start/Stop
  api/             对外 Go 接口（其他插件唯一可 import 的包）
  internal/        私有实现（store/handler/client/…）
  tools.go         MCPTools().Add 注册
  content/         出厂 workflows/skills/knowledge + assistant.md
soc-web-shadcn/src/plugins/<id>/index.jsx   前端描述符（极小）
\`\`\`

远程插件：一个独立进程，暴露 \`/api/v1/<prefix>/*\`、\`/mcp\`、\`/healthz\` + \`/soc/health\`、\`/assets/*\`，清单里 \`runtime: "remote"\`。

---

# 清单（plugin.json）

\`\`\`jsonc
{
  "id": "scan",                 // ^[a-z][a-z0-9-]{1,31}$，全局唯一，= MCP _meta soc.plugin
  "name": "主动探测",
  "version": "1.0.0",           // semver
  "api_version": "1",           // 不符则拒载
  "trust": "first-party",       // first-party | third-party
  "runtime": "builtin",         // builtin（默认）| remote
  "endpoint": "http://…:8083",  // 远程必填
  "token_env": "SCAN_TOKEN",    // 远程：宿主从该环境变量读令牌
  "modules": [{ "id": "scan", "label": "主动探测", "dangerous": true }],
  "primary_module": "scan",     // Routes() 默认门；省略=modules[0]
  "route_prefix": "scan",       // → /api/v1/scan；"" 无 REST
  "tables": [{ "slug": "fscan_jobs", "label": "任务", "module": "scan",
    "write_guard": "module", "owner_api": "/api/v1/scan", "hidden": true,
    "indexed": ["状态"],
    "columns": [{ "title": "目标", "uidt": "LongText" }] }],  // 远程必填 columns
  "settings_sections": [{ "name": "scan", "class": "hot", "secret_keys": ["api_key"] }],
  "tools": [{ "name": "scan_start", "aliases": ["active_scan_start"],
    "side_effect": true, "requires_approval": { "param": "mode", "values": ["bruteforce","exploit"] } }],
  "depends": [{ "id": "skyeye", "version": "^1", "optional": false }],
  "provides": ["scan.Service@v1"],
  "health_checks": ["fscan_runner"],
  "assistant_prompt": "assistant.md",
  "frontend": { "sdk": "1", "modules": [{ "id": "scan", "group": "security",
    "label": "主动探测", "icon": "Radar", "permission": "scan" }],
    "hidden_tables": ["fscan_jobs"], "remote_entry": "/plugins/scan/assets/index.js" }
}
\`\`\`

---

# 后端 SPI（进程内 \`soc-server/plugin\`）

\`plugin.Plugin\` 三个方法，全部通过 \`Host\` 拿到核心接缝：

- **Init(ctx, host)** — 声明表/配置/路由/工具/检查/worker/服务；此时可 \`Lookup\` 硬依赖（拓扑序保证已 Init）。
- **Start(ctx)** — 所有 Init 完成后；worker 由宿主拉起。
- **Stop(ctx)** — 宿主已取消 worker ctx。

\`Host\` 提供的注册点：

| 接缝 | 用途 |
|---|---|
| \`Tables().Declare(decl)\` | 建表 + write_guard + 侧栏归属；\`Ref(slug)\` 读任意表 |
| \`Settings().Declare(decl)\` | 配置分区（hot/restart、secret_keys、editable） |
| \`Routes()\` | 已挂在 \`/api/v1/<prefix>\`，已套鉴权 + primary_module 门 + 软禁用 |
| \`RequireModule(m)\` | 子路由叠加其他模块门 |
| \`MCPTools().Add(tool, meta, handler)\` | 注册数据 MCP 工具（见下） |
| \`Health().Add(check)\` | 健康检查（超时受限） |
| \`Workers().Add(name, run)\` | **受监督后台任务：run 必须阻塞到 ctx.Done()，非阻塞会被判早退反复重启** |
| \`Services().Provide/Lookup\` | 插件间进程内接口（只 Provide 清单 provides[] 里的名字） |
| \`Notify().RegisterChannel(p)\` | 通知通道提供者（如 appia） |
| \`Audit().Log(event)\` | 写平台 audit_log |
| \`Triggers().StartRun/RunStatus\` | 启动工作流（→ soc-ai /trigger） |
| \`HTTP()\` | soc-kit/httpclient（读 live 代理/TLS）；\`Direct()\` 不走 SOCKS5 |

> ⚠️ **Worker 必须阻塞**：\`Workers().Add\` 的函数若立即返回，宿主会当作早退按退避反复重启。监听器这类先 spawn 再返回的，函数末尾要 \`<-ctx.Done()\`。

---

# 工具与 _meta 契约

\`MCPTools().Add\` 的 \`ToolMeta\` 决定工具行为，宿主据此盖 \`_meta\`，soc-ai 的 pluginbridge 据此自动桥接进工作流注册表——**无需手写透传**：

- \`Module\` — 工作流运行需持有的 grant（"" = 不限）。
- \`SideEffect\` — 状态变更工具；dry-run 跳过、不自动暴露到对外 MCP、被审计。
- \`Op\` — read/create/update/delete/send/exec（省略则按 SideEffect 推断）。
- \`Aliases\` — 旧工具名，保证存量工作流定义不改（如 \`active_scan_start\`）。
- \`RequiresApproval\` — \`&{}\`（总是）或 \`{Param,Values}\`（按参数）。命中时引擎强制该步之前存在成功的审批步，否则失败。
- \`RunOnly\` / \`Internal\` — 需活的 Run / 永不对外。

工具名规范：\`<id>_<verb>_<noun>\`（\`scan_start\`、\`ticket_create\`）。旧名只能作 alias。

---

# 数据表与 write_guard

有类型化 owner 的表**必须**声明 write_guard，否则通用记录 API 会绕过你的业务校验（时间线、枚举、审计）：

| write_guard | 通用 REST | 数据 MCP db_* | 适用 |
|---|---|---|---|
| \`""\` | 可写 | 可写 | 无 owner 的通用表 |
| \`"service"\` | 405 | 可写 | 对等服务经 MCP 持久化（workflow_*） |
| \`"module"\` | 405 | 拒绝 | 类型化模块自管（tickets/bypass_blocks） |
| \`"plugin"\` | 405 | 仅本插件令牌 | **远程插件**自有表 |

远程插件的表用 \`"plugin"\`，只有该插件的 \`X-SOC-Plugin-Token\` 能经数据 MCP 写。列在清单 \`columns\` 里声明（宿主据此建表，只追加）。

---

# 配置与密钥

\`Settings().Declare\` 声明分区：\`class\`（hot=热生效 / restart=启动时读）、\`secret_keys\`（GET 脱敏为 \`__SET__\`，PUT 留空或掩码即保留）。密钥字段命名带 \`*_secret|*_password|*_token|*_key(s)\` 也自动脱敏。config.json 的 \`plugins.<id>\` 只是 seed，运行值在 app_settings 表。

前端可在描述符里给某分区提供**结构化编辑器**（\`settingsEditors[section]\`），否则插件管理页用通用 JSON 编辑器。

---

# 依赖声明

- **硬依赖** \`depends[]{optional:false}\`：缺失/禁用/版本不符时宿主拒绝启动本插件（快速失败并输出链路）；Init 中可直接 \`Lookup\`。
- **可选依赖** \`optional:true\`：\`Lookup\` 返回 \`ok=false\` 时必须优雅降级（关功能，别报错）。
- 进程内跨插件调用**只经** \`plugins/<other>/api\`，禁止 import 对方 \`internal/\`。
- 跨进程/工作流层只经 MCP 工具名；出厂 workflow 用到他插件工具要写进 \`content_depends_tools\` 并在 \`depends\` 声明。
- 版本范围用 \`^major\`。宿主 Kahn 拓扑排序，有环即拒绝（可选边成环会被丢弃）。

---

# 前端描述符（\`src/plugins/<id>/index.jsx\`）

极小文件，被 eager glob 进主包；存在性与权限以后端 \`GET /api/v1/plugins\` 为准：

\`\`\`jsx
import { lazy } from "react"
import { Radar } from "lucide-react"
export default {
  id: "scan", sdk: "1", icon: Radar,
  modules: [{ id: "scan", group: "security", label: "主动探测", icon: Radar,
              permission: "scan", component: lazy(() => import("./ScanModule.jsx")) }],
  hiddenTables: ["fscan_jobs"],
  tableRenderers: { secincident: { renderItem, renderCreate } },  // 表驱动模块
  settingsSections: [{ key: "scan", title: "…", hot: true }],     // 插件管理页设置卡
  settingsEditors: { scan: lazy(() => import("./ScanSettings.jsx")) },  // 结构化编辑器
  panels: [{ key: "subs", label: "监听订阅", component: … }],     // 插件管理页自定义面板
  sources: [{ label: "主动探测", icon: Radar, order: 60 }],       // MCP/工作流按来源分组
  icons: { Radar },
}
\`\`\`

组件 props：\`{ apiClient, setError, currentUser, onNavigate, onAgentAction }\`。插件**只能** import \`@/platform\`（SDK 面：apiClient/GenericTableModule/表组件/IconButton/usePlugin(Api)/GroupCard/SectionJsonEditor/hasModule/toast…）与 \`@/components/ui/*\`，不得跨插件 import（共享 UI 提升到 \`@/platform\`）。

---

# 远程插件

同一份清单加 \`runtime: "remote"\` + \`endpoint\` + \`token_env\`。宿主替它实现整套契约：

- **安装** \`POST /api/v1/plugins\`（粘贴清单，见页面顶部按钮）；**卸载** \`DELETE /api/v1/plugins/{id}?purge=true\`。清单存在 plugin_state，重启自动重建。
- **表**：按清单 \`columns\` 建（write_guard \`plugin\`）。进程用自己的令牌经数据 MCP \`db_*\` 读写自有表。
- **REST**：\`/api/v1/<prefix>/*\` 反代到 endpoint，附 \`X-SOC-User/-Admin/-Modules\` 身份头 + \`X-SOC-Plugin-Token\`。
- **工具**：宿主作 MCP 客户端连 \`<endpoint>/mcp\`，把工具带 \`_meta\` 重新暴露（每分钟重同步）；进程可自带 \`soc.*\` meta，宿主与清单 tools[] 合并。
- **健康**：\`/healthz\` 存活 + \`/soc/health\`（返回 \`{checks:[{name,status,detail}]}\`）。
- **前端**：\`frontend.remote_entry\` 指向 \`/plugins/<id>/assets/index.js\`，宿主代理到进程的 \`/assets/\`。前端用 \`vite.remote.config.js\` 打成自包含 ESM，只把 \`react/react-dom/react-jsx-runtime/sonner\` external（经宿主 import map 共享同一实例）。

---

# 安全规范

- 每个工具声明 \`SideEffect\`；攻击性/危险模块 \`dangerous:true\`，危险动作用 \`requires_approval\`。
- 有 owner 的表必须 write_guard；密钥只走声明了 secret_keys 的分区，不落日志、不进知识库。
- 出站 TLS 一律走 \`HTTP()\`（四步校验 + ca_cert），\`Direct()\` 仅给不能走 MITM 代理的情报 API。
- 插件 REST 由宿主套鉴权 + RequireModule，插件不自解析 JWT；操作者取 \`authz.FromContext\`（远程取 \`X-SOC-User\`）。
- 第三方（\`trust:"third-party"\`）默认禁用、只能 Provide 清单声明的名字、工具默认需白名单。

---

# 生命周期 & 提交前检查清单

启停：**禁用**立即停 worker、路由 503、工具从目录摘除、健康跳过；**启用**恢复。**卸载**仅远程插件（可 purge 删表）。表结构只追加，结构性变更实现 \`Migrator\`。

- [ ] id/命名/保留字（\`workflows ai mcp integrations agent health tables settings plugins auth users invites core\` 不可用）
- [ ] 有 owner 的表都声明了 write_guard
- [ ] 密钥只在声明了 secret_keys 的分区
- [ ] 副作用工具都标了 SideEffect，危险动作有 requires_approval
- [ ] 改名保留了 alias
- [ ] 健康检查在超时内返回
- [ ] worker 阻塞到 ctx.Done()
- [ ] 出厂内容默认禁用、不覆盖运维改动
- [ ] 前后端 id 一致；前端只 import @/platform 与 @/components/ui
- [ ] 启用与禁用两态都 \`./dev.sh start\` 绿
`
