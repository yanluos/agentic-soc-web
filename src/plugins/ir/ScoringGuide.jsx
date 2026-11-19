// ScoringGuide — the 评分标准 document for 应急响应: what a score and a risk
// tier mean, how one object's score is assembled, the point tables, and what
// deliberately does NOT add points. Numbers mirror soc-ir/internal/analyze
// (rules/table.go, trigscore, modscore, fusion Points) — when a rule changes
// there, change it here. Rendered as a wide dialog so it can open on top of
// the row drawer; `children` is the trigger element.
import { BookOpenText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LEVELS } from "./lib.js"

const TIERS = [
  [
    "critical",
    "≥ 80",
    "组合证据已足以单独定性，优先处置：隔离主机、保全证据。",
  ],
  [
    "high",
    "60 – 79",
    "有明确异常，需要人工核实；多数是未签名自启动、可疑持久化。",
  ],
  ["medium", "40 – 59", "值得看一眼的线索，通常是单一维度偏离常态。"],
  ["suspicious", "20 – 39", "弱信号，排查其他对象时作为旁证。"],
  ["low", "< 20", "未见异常。"],
]

const PLANES = [
  ["执行", "运行中的进程：签名、所在目录、父进程、命令行、外联"],
  ["触发", "持久化项：Run 键、启动目录、计划任务、服务、WMI、IFEO、Winlogon"],
  ["取证", "Prefetch / Amcache 执行痕迹、近期落盘的可执行文件"],
  ["事件", "事件日志里指向该文件的记录"],
  ["模块", "进程加载的可疑 DLL（劫持 / 白加黑）"],
  ["内存", "内存区域异常（指定 PID 或深度模式才采）"],
  ["YARA", "规则命中（提供规则时）"],
  ["行为链", "多条证据连成的攻击链，如下载执行、凭据窃取"],
  ["文件簇", "同一投放目录里聚集的多个可疑文件"],
  ["协同", "互相独立的维度同时命中时的加分"],
]

const EXEC = [
  ["签名", "未签名 +12 · 签名无效 +20 · 微软有效 −8 · 第三方有效 −5"],
  [
    "位置",
    "用户目录 +20 · 临时目录 +20 · ProgramData +15 · System32 −5 · Program Files 且签名有效 −8",
  ],
  ["仿冒", "系统进程名出现在非系统目录 +30 · 文件名与签名内原始文件名不符 +10"],
  [
    "父进程",
    "Office 拉起脚本宿主 +25 · 浏览器拉起系统工具 +20 · 系统进程的父进程异常 +10",
  ],
  ["外联", "存在外部连接 +10 · 连接公网 IP +10"],
  ["系统自带工具", "LOLBin 按危险程度 +8 / +12 / +18"],
  [
    "命令行",
    "编码 PowerShell +30 · 隐藏窗口 +20 · 下载 +25 · IEX +25 · AMSI 绕过 +30 · 凭据转储 +35 · 删除卷影 +35 · 挖矿 +35 · certutil / bitsadmin 滥用 +25 · cmd /c 一次性命令 +20 · 含 URL +10 等",
  ],
  [
    "协同",
    "LOLBin + 可疑命令行 +15 · 可疑命令行 + 外联 +15 · 异常父链 + 可疑命令行 +15 · 可疑命令行 + 用户目录 +10",
  ],
  ["放大", "命中可疑命令行时整体 ×1.5（最多 +25）"],
]

const TRIGGER = [
  [
    "类型基础分",
    "Run 键 15 · 启动目录 15 · 计划任务 20 · 服务 20 · IFEO 25 · Winlogon 25 · WMI 30",
  ],
  ["目标位置", "用户目录 / 临时目录 +20 · ProgramData +10"],
  ["目标文件", "未签名 +20 · 文件不存在 +10 · 名称仿冒厂商/系统 +10"],
  [
    "执行方式",
    "经脚本宿主 / LOLBin 运行 +20 · 编码命令 +30 · IEX +30 · 含 URL +25 · 下载 +20",
  ],
  ["计划任务", "隐藏 +10 · 以 SYSTEM 运行 +10 · 高频触发 +10 · 7 天内创建 +10"],
  [
    "服务",
    "自启动且位于用户目录 +25 · 自启动但已停止 +10 · ServiceDLL 在用户目录 +25",
  ],
  ["Winlogon", "Shell / Userinit 被追加 +30（系统默认值不计分）"],
  ["减分", "目标为可信厂商有效签名：抵掉类型基础分"],
]

const MODULE = [
  ["未签名", "+20"],
  ["位于用户目录 / 临时目录", "+25"],
  ["系统 DLL 名出现在非系统路径", "+30"],
  ["与主程序同目录且未签名（安装目录除外）", "+35"],
  ["白加黑：签名主程序加载用户目录未签名 DLL", "+40，对象不低于 80"],
  ["系统进程加载用户 / 临时目录 DLL", "+50，对象不低于 80"],
  ["同一进程 2 个以上可疑模块", "+20，对象不低于 60"],
]

const FUSION = [
  ["未签名程序位于用户目录且自启动", "+20"],
  ["运行中 + 外联 + 自启动", "+20"],
  ["执行痕迹 + 自启动", "+20"],
  ["事件日志 + 自启动", "+20"],
  ["同时注册两种持久化类型", "+20（三种及以上：不低于 80）"],
  ["有执行痕迹但当前未运行", "+15"],
  ["命中行为链", "+15 ～ +35"],
  ["位于可疑文件簇", "+15 ～ +40"],
  ["持久化项执行编码 PowerShell", "不低于 80"],
  ["可信厂商签名", "−15"],
  ["系统目录且签名有效", "−10"],
]

const NOT_COUNTED = [
  [
    "已安装软件的常态",
    "签名有效且位于系统目录或安装目录（任意盘符的 Program Files、WindowsApps）的程序，自启动、运行过、联网都是常态，这几件事同时出现不加协同分。它的持久化项、事件、模块仍各自计分。",
  ],
  [
    "共享宿主",
    "svchost、cmd、rundll32 这类宿主会挂着几十个经它运行的服务和任务，这些条目只在持久化项上计分，不累加到宿主进程。反过来，经宿主运行的条目也不因宿主有微软签名而减分。",
  ],
  [
    "程序自带的库",
    "微软签名的运行库、与主程序同一签名者的库、安装目录里的 Qt / OpenSSL 等未签名库、应用商店包内文件不算侧加载。安装目录里出现 version.dll 这类系统 DLL 名仍然命中。",
  ],
  [
    "系统自带的任务和服务",
    "rundll32 / msiexec 指向 Windows 目录内文件属于系统出厂配置，不计「经脚本宿主运行」。",
  ],
  [
    "悬空的启动项",
    "目标文件已不存在且没有进程在跑的启动项保留自身分数（通常为中），不再叠加用户目录协同。",
  ],
  ["采集工具自身", "socir 进程和它落盘的文件不进入发现。"],
]

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

function PointTable({ rows, head }) {
  return (
    <div className="rounded-md border">
      <Table>
        {head ? (
          <TableHeader>
            <TableRow>
              {head.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
        ) : null}
        <TableBody>
          {rows.map(([k, v]) => (
            <TableRow key={k}>
              <TableCell className="w-44 align-top font-medium whitespace-normal">
                {k}
              </TableCell>
              <TableCell className="align-top whitespace-normal text-muted-foreground">
                {v}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ScoringGuide({ children }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex max-h-[85svh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <BookOpenText className="size-4 text-muted-foreground" />
            评分标准
          </DialogTitle>
          <DialogDescription>
            应急采集的风险分是怎么算出来的，各等级意味着什么，哪些情况不计分。
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-6 overflow-y-auto p-4 text-sm leading-relaxed">
          <Section title="分数是什么">
            <p className="text-muted-foreground">
              采集端把主机上的每个可执行文件归并成一个「执行对象」，按下面的规则给出
              0–100
              的风险分。分数用来排序线索，不是定性结论：高分表示「先看这里」，
              是否恶意以人工核实和 AI 研判为准。主机的风险等级取分数最高的对象。
            </p>
          </Section>

          <Section title="风险等级">
            <div className="rounded-md border">
              <Table>
                <TableBody>
                  {TIERS.map(([value, range, text]) => {
                    const l = LEVELS.find((x) => x.value === value)
                    return (
                      <TableRow key={value}>
                        <TableCell className="w-20 align-top">
                          <Badge variant={l.variant}>{l.label}</Badge>
                        </TableCell>
                        <TableCell className="w-24 align-top tabular-nums">
                          {range}
                        </TableCell>
                        <TableCell className="align-top whitespace-normal text-muted-foreground">
                          {text}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section title="一个对象的分数怎么合成">
            <p className="text-muted-foreground">
              最终分 = 各采集面得分之和 + 协同加分 −
              白证据减分，再套用底线和上限， 限制在
              0–100。对象详情里的「评分拆解」和「判定原因」逐项列出，
              各项相加即最终分。
            </p>
            <PointTable rows={PLANES} head={["采集面", "看什么"]} />
            <p className="text-muted-foreground">
              底线：某些组合本身就足以定性（如 Office 拉起编码
              PowerShell、下载后立即执行、转储 lsass），命中后分数不低于 60 或
              80。上限：可信厂商签名、位于安装目录、
              且没有任何其他证据的对象，最高 20。
            </p>
          </Section>

          <Section title="执行面（进程）">
            <PointTable rows={EXEC} />
          </Section>

          <Section title="触发面（持久化项）">
            <PointTable rows={TRIGGER} />
          </Section>

          <Section title="模块面（加载的 DLL）">
            <PointTable rows={MODULE} />
          </Section>

          <Section title="协同与白证据">
            <PointTable rows={FUSION} />
          </Section>

          <Section title="哪些情况不计分">
            <p className="text-muted-foreground">
              下面这些在正常办公机上普遍存在，规则有意不把它们当作证据。
            </p>
            <PointTable rows={NOT_COUNTED} />
          </Section>

          <Section title="使用时注意">
            <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
              <li>
                分数由采集端在主机上计算并随采集包上传，平台不重新打分。规则更新后，
                已有案例的分数不变，需要重新采集才按新规则计算。
              </li>
              <li>
                有效签名是强减分项。带合法签名的远程控制、代理、隧道类软件
                （ToDesk、ZeroTier
                等）因此分数不高，是否违规使用需结合资产和制度判断。
              </li>
              <li>
                未签名但正常的小工具带自启动时通常落在「中」或「高」，核实来源后可忽略。
              </li>
              <li>
                Linux 主机使用另一套规则：以软件包校验（dpkg / rpm）代替签名，
                持久化覆盖 cron、systemd、SSH 公钥、LD_PRELOAD、SUID 等。
              </li>
            </ul>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
