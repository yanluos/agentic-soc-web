// TokenReveal — the one-time display of a freshly minted 采集令牌 with the
// paste-and-run install one-liners (primary) and the manual fallbacks
// (existing binary / offline download). Shown by 新建案例 and 重置令牌.
import { useEffect, useState } from "react"
import { ChevronDown, Copy, Download, KeyRound } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { copyToClipboard } from "@/components/CopyText.jsx"
import { cn } from "@/lib/utils"

async function copy(text, label) {
  if (await copyToClipboard(text)) toast.success(`已复制${label}`)
  else toast.error("复制失败，请手动选择复制")
}

function CommandField({ label, value, rows = 2, hint, copyLabel = "命令" }) {
  if (!value) return null
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup>
        <InputGroupTextarea
          readOnly
          rows={rows}
          value={value}
          className="font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <InputGroupAddon align="block-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copy(value, copyLabel)}
          >
            <Copy data-icon="inline-start" />
            复制命令
          </Button>
        </InputGroupAddon>
      </InputGroup>
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  )
}

export function TokenReveal({
  token,
  command,
  linuxCommand,
  installLinux,
  installWindows,
  watchLinux,
  watchWindows,
  serviceLinux,
  serviceWindows,
  agentMaxHours,
  watchEnabled,
  watchMaxHours,
  distAvailable,
  expires,
  api,
}) {
  const canWatch = !!watchEnabled && !!(watchLinux || watchWindows)
  // 持续监控 is the default way to run the collector; 单次采集 stays for
  // hosts where nothing may be left running.
  const canService = canWatch && !!(serviceLinux || serviceWindows)
  const [mode, setMode] = useState(
    canService ? "service" : canWatch ? "watch" : "once"
  )
  const watching = canWatch && mode !== "once"
  const asService = canService && mode === "service"
  const [manualOpen, setManualOpen] = useState(false)
  const [dist, setDist] = useState(null)
  const hasInstall = !!(installLinux || installWindows)
  const noBinaries = distAvailable === 0

  useEffect(() => {
    if (!api || !manualOpen || dist) return
    let alive = true
    api
      .get("/dist")
      .then((r) => alive && setDist(r))
      .catch(() => alive && setDist({ files: [] }))
    return () => {
      alive = false
    }
  }, [api, manualOpen, dist])

  const downloads = (dist?.files || []).filter((f) => f.present)

  return (
    <FieldGroup>
      <Alert>
        <KeyRound />
        <AlertTitle>令牌只显示这一次</AlertTitle>
        <AlertDescription>
          该采集令牌仅能成功上传一次
          {expires ? `，${expires} 前有效` : "，有到期时间"}
          ；关闭后无法再查看，如遗失请在案例上「重置令牌」。
        </AlertDescription>
      </Alert>
      {noBinaries ? (
        <Alert variant="destructive">
          <Download />
          <AlertTitle>平台未部署采集端二进制</AlertTitle>
          <AlertDescription>
            一行安装会下载失败：请运行 soc-ir/build.sh 并把 dist/ 放到插件设置
            dist_dir（生产镜像自带），或使用下方手动方式。
          </AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel>采集令牌</FieldLabel>
        <InputGroup>
          <InputGroupInput
            readOnly
            value={token || ""}
            className="font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
          <InputGroupAddon align="inline-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="复制令牌"
              onClick={() => copy(token, "令牌")}
            >
              <Copy />
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      {hasInstall && canWatch ? (
        <Field>
          <FieldLabel>采集方式</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(v) => v && setMode(v)}
          >
            {canService ? (
              <ToggleGroupItem value="service">实时监控 · 服务</ToggleGroupItem>
            ) : null}
            <ToggleGroupItem value="watch">实时监控 · 前台</ToggleGroupItem>
            <ToggleGroupItem value="once">单次采集</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>
            {asService
              ? `agent 安装为系统服务后台运行：先做一次完整采集并上传，然后实时上报进程、网络连接和启动项的变化。关闭窗口、注销、重启都不中断，最长 ${agentMaxHours || 72} 小时。在案例页点「停止监控」、到期或在主机上停止该服务即结束，结束后 agent 注销服务并从主机删除自身。会在主机上临时新增一个服务，终端防护软件可能提示。`
              : watching
                ? `agent 在当前窗口前台运行：先做一次完整采集并上传，然后实时上报进程、网络连接和启动项的变化，最长 ${watchMaxHours || 24} 小时。按 Ctrl+C、关闭窗口或在案例页点「停止监控」即结束，结束后自动从主机删除自身。不注册服务，窗口关闭或主机重启后监控即停止。`
                : "采集一次、上传一次即退出，没有实时监控。采集端和一份本地采集包会留在主机的安装目录，需要人工清理。"}
          </FieldDescription>
        </Field>
      ) : null}
      {hasInstall ? (
        <>
          <CommandField
            label={`${watching ? "实时监控" : "一行安装并采集"} · Linux（root / sudo）`}
            value={
              asService ? serviceLinux : watching ? watchLinux : installLinux
            }
            copyLabel="Linux 命令"
            hint={
              asService
                ? "在受害主机粘贴执行，命令返回后即可关闭终端：自动下载对应架构的 agent、校验 SHA256、注册 systemd 单元并启动（没有 systemd 的主机退化为后台进程，重启后不恢复）。"
                : watching
                  ? "在受害主机粘贴执行并保持该终端打开：自动下载对应架构的 agent、校验 SHA256、只读采集。"
                  : "在受害主机粘贴执行：自动下载对应架构的采集端、校验 SHA256、只读采集后直传平台；平台不可达时自动落离线包。可在末尾追加 -deep 等参数。"
            }
          />
          <CommandField
            label={`${watching ? "实时监控" : "一行安装并采集"} · Windows（管理员 PowerShell）`}
            value={
              asService
                ? serviceWindows
                : watching
                  ? watchWindows
                  : installWindows
            }
            copyLabel="Windows 命令"
            hint={
              asService
                ? "必须用管理员 PowerShell 执行（注册服务需要管理员权限），命令返回后即可关闭窗口。"
                : watching
                  ? "同上，保持 PowerShell 窗口打开；非管理员也能跑但命令行/句柄/Security 日志会缺失。"
                  : "同上；非管理员也能跑但命令行/句柄/Security 日志会缺失。"
            }
          />
        </>
      ) : null}
      <Collapsible open={manualOpen} onOpenChange={setManualOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            <ChevronDown
              data-icon="inline-start"
              className={cn("transition-transform", manualOpen && "rotate-180")}
            />
            手动方式：已有采集端 / 离线下载
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <FieldGroup className="pt-3">
            <CommandField
              label="Windows（已下载 socir.exe，管理员 PowerShell / CMD）"
              value={command}
              rows={2}
            />
            <CommandField
              label="Linux（已下载 socir，root）"
              value={linuxCommand}
              rows={2}
            />
            {api ? (
              <Field>
                <FieldLabel>离线下载采集端</FieldLabel>
                {dist == null ? (
                  <FieldDescription>读取中…</FieldDescription>
                ) : downloads.length === 0 ? (
                  <FieldDescription>平台未部署采集端二进制。</FieldDescription>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {downloads.map((f) => (
                      <Button key={f.name} asChild variant="outline" size="sm">
                        <a href={f.url} download={f.name}>
                          <Download data-icon="inline-start" />
                          {f.label}
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
                <FieldDescription>
                  拷到主机后用上面的命令执行；也可先 -o
                  落盘，再在案例页「上传采集包」。
                </FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>
    </FieldGroup>
  )
}
