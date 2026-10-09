# CLAUDE.md — `soc-web-shadcn`

The SOC admin SPA, built exclusively with **shadcn/ui** components. (Originally a
clean-room rewrite of the legacy `soc-web/` frontend, which has since been
removed — this is now the only frontend.) All modules (Overview / Tickets 工单 /
Bypass Block / Workflow Viz / AI Models / MCP 能力 / 技能与知识库 / Health / Settings /
User Management + AI 助手 workbench + Floating AI) are implemented. (The DLP
and 周报服务 modules were removed when the Feilian DLP API was shut down.)

## Tech Stack

- **Vite** + **React 19** (JSX, not TSX)
- **Tailwind v4** (config-less, all theming via CSS variables in `src/index.css`)
- **shadcn/ui** with `radix` base, `nova` style, `neutral` palette, `lucide` icons, `geist` font
- **radix-ui** (the unified v1.x package)
- Path alias: `@/` → `src/`

## Commands

```bash
cd /Users/yanluo/dev/agentic-soc/soc-web-shadcn
npm run dev        # dev server on 127.0.0.1:9200 (proxies to backends)
npm run build      # production build to dist/ — only correctness gate
npm run preview    # serve built dist/
npm run format     # prettier --write
```

## Backend / Proxy

The dev server proxies to the existing backends. **No backend code lives in this
project.** Run the backends separately on the standard ports:

| Prefix | Target | Service |
|--------|--------|---------|
| `/api/v1/workflows`, `/api/v1/ai/models`, `/api/v1/ai/health`, `/api/v1/mcp`, `/agent`, `/mcp` | `http://localhost:8081` | soc-ai |
| `/api/v1` (rest), `/health` | `http://localhost:8080` | soc-server |
| `/auth`, `/users`, `/invites` | `http://localhost:8090` | soc-auth |

The AI-specific prefixes must precede the catch-all `/api/v1` in `vite.config.js`
(more specific routes first).

## Project Structure

```
src/
├── App.jsx                          — root: state, routing, auth, AI dispatcher
├── main.jsx                         — ThemeProvider + TooltipProvider + Toaster (imports sdk.js first)
├── sdk.js                           — 远程插件 SDK 桥:把宿主的 React/ReactDOM/jsx-runtime、
│                                      @/platform 与 shadcn ui 组件挂到 window.__SOC_SDK__;
│                                      public/sdk/{react,jsx-runtime,react-dom,platform,ui}.js
│                                      是 import map 垫片(index.html <script type=importmap>),
│                                      远程 ESM 里的 `react`/`@soc/platform`/`@soc/ui` 解析到
│                                      宿主同一实例(hooks 可用)。App 对 enabled 且带
│                                      frontend.remote_entry、无编译描述符的插件做
│                                      import(/plugins/<id>/assets/index.js)(vite 代理 /plugins
│                                      → soc-server → 插件进程),描述符并入 registry
│                                      (buildRegistry(plugins, remoteDescs))
├── index.css                        — tailwind v4 + shadcn tokens (do not hand-edit theme)
├── constants.js                     — module groups/registry, SUBJECTS, icon resolver
├── api.js                           — createApiClient + path builders
├── utils.js                         — NocoDB helpers, date/format helpers
├── lib/utils.js                     — cn() (do not edit)
├── hooks/
│   ├── use-mobile.js                — useIsMobile (do not edit)
│   └── use-autofill-sync.js         — 让受控 input 接住密码管理器的自动填充:
│                                      受控 input 上 React 装了自己的 value
│                                      setter + value tracker,填充器直接
│                                      `el.value=...` 再派发 input 事件时会被
│                                      合成 onChange 判定「没变化」而吞掉 ——
│                                      DOM 里有密码、state 还是空,提交报「请输入
│                                      用户名和密码」。hook 用原生 addEventListener
│                                      绕开合成事件层,并给出 fieldValue(ref, state)
│                                      让提交以 DOM 为真值(兜住只写 value、
│                                      不发事件的填充器)。所有凭据输入框
│                                      (登录/两步验证/修改密码)都必须用它
├── components/
│   ├── ui/                          — shadcn primitives (do not hand-edit, re-add via CLI)
│   ├── theme-provider.jsx           — dark/light/system toggle (custom, not next-themes)
│   ├── Layout.jsx                   — AppSidebar + TopBar + ModuleHeader + UserMenu + ChangePasswordDialog
│   ├── LoginOverlay.jsx             — login Card (Field/Input/ToggleGroup)
│   ├── ConfirmDialog.jsx            — 统一确认弹窗(AlertDialog, async onConfirm 带加载态);
│   │                                  只留给需要附加选项的确认(如插件卸载的「同时删表」)
│   ├── ConfirmDeleteButton.jsx      — 行内确认删除:点垃圾桶原位展开 ✅/❌ 两键(不弹窗),
│   │                                  ✅ 执行 async onConfirm(带加载态),❌/Esc/点外面/
│   │                                  焦点离开/6s 收回;默认 IconButton 形态(variant/size 透传),
│   │                                  传 children 变 destructive 文字按钮;根元素 data-state
│   │                                  =idle|confirm|pending(group-hover 隐藏的按钮加
│   │                                  data-[state=confirm]:opacity-100)。所有「删除」入口
│   │                                  统一用它(通用表/工单/事件/探针/MCP/模型/用户/
│   │                                  知识库/会话/工作流/扫描字典);经 @/platform 导出
│   ├── ListRail.jsx                 — 平台标准左栏列表(RailCard/RailBody/RailList/
│   │                                  RailGroup/RailRow/RailMessage/RailLoading):从工作流
│   │                                  模块「定义」卡抽出的样式——cardHover 卡片 + text-sm
│   │                                  标题/计数/蓝色 IconButton 主动作 + p-0 滚动列表,行用
│   │                                  lib/styles 的 rowActive/rowHover 浮起芯片(text-xs、
│   │                                  Badge text-[10px]),可折叠 Folder 分组。插件管理、
│   │                                  技能与知识库、AI 助手会话栏的左栏用它;工作流列表
│   │                                  因拖放保留内联副本,调样式时两处同步
│   ├── CopyText.jsx                 — 点击即复制的行内文字按钮(自带 toast;非 https 局域网
│   │                                  origin 下 navigator.clipboard 不存在,回退 execCommand)。
│   │                                  安全事件/工单卡片折叠态可见的标题、ID、人名、公司、
│   │                                  资产、IOC、时间都用它;展开区暂不用
│   ├── InlineRename.jsx             — 行内改名小输入框(替代 window.prompt):挂载即聚焦全选,
│   │                                  Enter/失焦提交、Esc 取消,只回调一次;h-6 text-xs 嵌在
│   │                                  RailRow 里原位替换名字,事件不冒泡给宿主行。AI 助手会话
│   │                                  栏用它(铅笔或双击进入)
│   ├── FloatingAi.jsx               — floating AI quick panel (renders messages via
│   │                                  modules/assistant/ChatMessage.jsx; hidden while
│   │                                  the assistant workbench module is open)
│   ├── DateRangePicker.jsx          — Calendar + TimeRow
│   └── SubjectToggle.jsx            — ToggleGroup multi-select
└── modules/
    ├── assistant/                   — AI 助手全页工作台 (module id "assistant"):
    │   ├── AssistantModule.jsx      — 三栏:会话列表 | 聊天流 | 本轮活动
    │   ├── chatStore.js             — 单例聊天 store(React 之外):sessions CRUD +
    │   │                              /agent/chat SSE 流 + 附件 + in-flight 轮次记账。
    │   │                              轮次按会话记账(turns Map),多个会话可并行对话;
    │   │                              streaming 是派生值=当前会话在流,streamingIds
    │   │                              列出所有在流会话(会话栏转圈)。工作台与
    │   │                              FloatingAi 共用,切模块不中断对话;完成时若
    │   │                              没人在看该会话弹 toast 可点回;登出 reset 全中断
    │   ├── useAgentChat.js          — 上述 store 的 useSyncExternalStore 薄绑定
    │   │                              ({onAction,surface,visible})
    │   ├── ChatMessage.jsx          — 共享消息渲染(FloatingAi 也用它)
    │   ├── ToolCallCard.jsx         — 工具卡片(start/result 配对、折叠、JSON 美化)
    │   ├── ThinkingBlock.jsx        — 思考块(默认折叠,流式 tail 预览)
    │   └── toolMeta.js              — 工具名 → 中文名/图标/语义色
    ├── KnowledgeModule.jsx          — 技能与知识库 (module id "knowledge"):双 tab
    │                                  共用一个两栏管理器(左:ListRail 卡片=搜索+按分类
    │                                  折叠的列表+启用开关,右:编辑器 + 编辑/预览 Markdown
    │                                  切换;整页 h-[calc(100svh-6rem)] 两栏各自滚动,同工作流),
    │                                  直连 soc-ai /agent/skills 与 /agent/knowledge
    │                                  (带 JWT 的裸 fetch,不走 apiClient)。
    │                                  AI 助手 header 的 BookOpen 按钮跳转到本模块
    ├── GenericTableModule.jsx       — meta-driven table primitive; list mode via
    │                                  renderItem/renderCreate; patchPath /
    │                                  deletePath props 把 PATCH/DELETE 改道到业务
    │                                  端点(工单用)。这不是可选优化:后端给
    │                                  tickets/bypass_blocks/probe_devices 等表加了
    │                                  write_guard,通用 records 路由对它们只读,
    │                                  不传 override 就会拿到 405(见根 CLAUDE.md
    │                                  「Generic Table API」)
    ├── TicketItem.jsx               — 工单卡片(照 SecIncidentItem 布局): 优先级/
    │                                  类型/来源 badges + 状态 pill 流转 + 描述模态
    │                                  编辑;展开区=基本信息行内编辑(左) + 处理记录
    │                                  时间线/追加备注(右)。编辑经 patchPath →
    │                                  /api/v1/tickets/{id},时间线服务端留痕
    ├── TicketCreate.jsx             — 新建工单 Dialog(POST /api/v1/tickets)
    ├── HealthModule.jsx             — 健康面板:并列渲染 soc-server /api/v1/health/
    │                                  checks 与 soc-ai /api/v1/ai/health/checks
    │                                  (凭据/服务探测,分组卡片+可展开明细) +
    │                                  工作流失败历史表;挂载即自动检查,按钮手动刷新
    ├── PluginsModule.jsx            — 插件管理 (module id "plugins", settings 权限):
    │                                  左栏 ListRail 插件列表(sticky,有远程插件时按内置/
    │                                  远程折叠分组;行=图标+名称+版本+状态 Badge+启停开关,
    │                                  POST /api/v1/plugins/{id}/enable|disable,成功后经
    │                                  PluginContext.reloadPlugins 刷新侧栏;「+」下拉=安装
    │                                  远程插件/开发规范),右栏标签页 概览/设置/插件面板/工具/健康。
    │                                  「设置」按 manifest settings_sections 渲染,插件描述符
    │                                  的 settingsEditors[section] 提供结构化编辑器,否则用
    │                                  platform/settingsUi 的 SectionJsonEditor;「健康」调
    │                                  /api/v1/health/checks?ids=<health_checks>
    ├── NotificationSettings.jsx     — 核心通知通道卡片(SMTP + 钉钉,共享一份表单、
    │                                  全量 PUT /api/v1/settings/notification),渲染在其他设置
    ├── SettingsModule.jsx           — 系统代理 / 其他设置(核心分区 + 通知通道 + 前端连接)
    ├── UserManagementModule.jsx
    ├── AiModelsModule.jsx
    ├── McpModule.jsx                — MCP 能力,三个 Tab:「对外服务」= 自行组装的
    │                                  对外 MCP 组(/api/v1/mcp/groups,按来源分组的
    │                                  工具勾选器;接入配置弹窗上=mcpServers 配置、
    │                                  下=密钥区,密钥仅生成/重置时展示一次,之后只有
    │                                  尾号+重置按钮);「工具目录」= catalog 按来源
    │                                  (飞连/天眼/天擎/…)分组浏览;「接入管理」=
    │                                  系统内置 + 第三方外部 MCP 原有 CRUD
    ├── WorkflowVizModule.jsx
    ├── BypassBlockModule.jsx
    ├── OverviewModule.jsx
    ├── table/                       — table sub-modules
    └── workflow/                    — WorkflowEditor (React Flow) + parseWorkflow autoLayout
src/platform/                        — 插件唯一可 import 的 SDK 面(barrel index.js):
                                       actionBus/permissions/pluginApi/PluginBoundary +
                                       settingsUi.jsx(GroupCard/SubSection/SaveButton/
                                       ConfiguredBadge/useSection/SectionJsonEditor)
vite.remote.config.js                — 远程插件前端 lib 构建(npm run build:remote):把
                                       src/plugins/scan/remote-entry.jsx 打成自包含 ESM
                                       输出到 ../fscan-runner/assets/index.js,只把
                                       react/react-dom/react-jsx-runtime/sonner 设为
                                       external(经宿主 index.html import map 共享同一实例),
                                       其余(shadcn ui/@/platform/lucide/GenericTableModule…)
                                       全部打入;不产 CSS(scan 的 tailwind 类已在宿主样式表)。
                                       scan 前端不再进主包,运行时由 soc-server 代理
                                       /plugins/scan/assets/* 加载(见根 CLAUDE.md 远程插件)
src/plugins/<id>/index.jsx           — 插件前端描述符(极小,eager glob 进主包):
                                       { id, sdk, icon?, modules[], hiddenTables, tableRenderers,
                                         settingsSections[{key,title,desc,hot}], settingsEditors{section: lazy},
                                         panels[{key,label,icon,permission?,component}], sources, icons }
                                       启用与权限以后端 GET /api/v1/plugins 为准(registry.js);
                                       appia/ 提供 AppiaAccountsEditor(appia 分区)与
                                       AppiaSubscriptionsPanel(监听订阅)
```

## shadcn Rules (do not violate)

1. Components come from `npx shadcn@latest add <name>` — **never hand-write** files in `src/components/ui/`.
2. `className` is for layout only — never override component colors/typography.
3. Use semantic tokens: `bg-background`, `text-muted-foreground`, etc. — never `bg-blue-500` or `text-white`.
4. Forms use `FieldGroup` + `Field` + `FieldLabel` + `FieldDescription`. Never raw `div + space-y-*`.
5. `InputGroup` requires `InputGroupInput` / `InputGroupAddon` — never raw `Input` inside.
6. Use `ToggleGroup` for 2–7 option sets, not loops of `Button`.
7. Dialog / Sheet / Drawer **must** have a Title (a11y).
8. Button loading: `Spinner` + `data-icon` + `disabled` — **no** `isLoading` prop.
9. `TabsTrigger` must be inside `TabsList`.
10. `Avatar` must have `AvatarFallback`.
11. Use `Alert` for callouts, `Empty` for empty states, `sonner` for toast, `Separator` for `<hr>`, `Skeleton` for loading, `Badge` for status pills.
12. Icons in `Button` / `DropdownMenuItem` use `data-icon="inline-start"` — never add `size-4` or `mr-2`.
13. Use `cn()` for conditional classes — never template-literal ternaries.
14. Triggers use `asChild` (radix) — never `render={<Button />}`.
15. Never `space-x-*` / `space-y-*` — use `flex` + `gap-*`.
16. Never manual `z-index` on overlay components.
17. Validation: `data-invalid` on `Field`, `aria-invalid` on the control.

## Theming

Do not edit colors directly in component `className`. Edit `src/index.css` `:root`
and `.dark` blocks. To swap palettes, run `npx shadcn@latest apply <preset-code>`.

**按钮立体感（纯色面 + 卡片投影）**：设计规范在仓库根
`design/agentic-soc-icon-buttons.html`。有背景面的 Button variant（default/outline/
secondary/destructive）的立体感在 `src/index.css` 末段「按钮立体感」——非 layer
CSS 按 `data-slot`/`data-variant` 命中（`ui/` 保持 CLI 原样）。面色是 variant
自身底色的纯色（无渐变/内高光）；投影与模块卡片同一套（`lib/styles.js`
cardHover：亮色 shadow-sm → hover shadow-lg，暗色黑影 + 顶缘 inset 微光晕）；
字面立体感在文字/图标浮雕（text-shadow / svg drop-shadow：深面浅字描暗影、
浅面深字垫白凹版）。box-shadow 列表并入 `--tw-ring-offset-shadow`/
`--tw-ring-shadow` 变量，focus 环与 aria-invalid 环叠加显示不被覆盖。
**ghost 是 chrome 层**：全局规则与 `.ibtn-ghost` 灰完全等价——静止透明中性
灰字，悬停以灰浅底 + 同一套卡片投影「显形」，按下加深收拢，字面浮雕常驻。
`ui/` 内部按钮（对话框/抽屉关闭 X、日历导航、侧栏）和 `InputGroupButton`
（密码眼睛、复制）都是 `data-variant="ghost"`，被统一命中，无需改 JSX；
link 纯文字不参与。`--btn-drop-*`/
`--btn-text-shadow-*`/`--btn-glyph-*` token 分明暗两套。

**小号输入框（无边框浮起）**：h-6/h-7 的小号输入控件不描边，用 bg-background
面 + rowActive 同款两层投影撑边缘，且**不留聚焦环**（这类字段存在期间几乎一直
聚焦，ring 会读成边框）。实现是 `src/index.css`「小号输入框立体感」一段非 layer
CSS：`[data-slot=select-trigger][data-size=sm]` 全局命中（shadcn 小号下拉，
`ui/` 不动），Input/InputGroup 在调用点加 `soc-field-sm`（`lib/styles.js`
`fieldRaised` 就是这个类名；现有位置：筛选面板、记录/工单行内编辑、单元格编辑、
日期时间小时分钟框、会话行内改名 InlineRename）。默认尺寸 h-8 的表单输入框和
Button 形态的触发器（日期 Popover）不参与。aria-invalid 仍红边，disabled 去投影。

**语义色图标按钮**：`components/IconButton.jsx`（非 shadcn 组件，样式在
index.css「语义色图标按钮」段）。7 色 × solid/soft/ghost × xs/sm/md/lg，
颜色即语义：red=破坏性(删除/封禁) green=确认执行 blue=同步/新增 orange=通知
告警 purple=AI cyan=查询/导出 gray=中性。三档强调：工具栏主动作用实心，
表格行内动作用 `variant="soft"`，`variant="ghost"` 静止透明、悬停以语义色
浅底显形（自定义组件里的安静语义动作用它）；既有纯 chrome（折叠箭头/翻页/
关闭 X）继续用 ghost Button，由全局 CSS 统一显形。必须带 `aria-label`。

## Adding a shadcn Component

```bash
npx shadcn@latest add <component-name>
```

After install, **read the generated file** to verify:
- `base: "radix"` (this project uses radix)
- `iconLibrary: "lucide"` (this project uses lucide-react)
- `asChild` on triggers (radix pattern, not `render`)
- The component is in JSX (not TSX)

## Verification

The only correctness gate is `npm run build`. There is no lint or test setup.
Run it after every change.

```bash
npm run build
```

To exercise the app end-to-end, start the three Go backends first (see root
`/Users/yanluo/dev/agentic-soc/CLAUDE.md` for the soc-server / soc-ai / soc-auth start
commands), then `npm run dev` and open `http://127.0.0.1:9200`.
