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
  distAvailable,
  expires,
  api,
}) {
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
            一行安装会下载失败：请运行 soc-ir/build.sh 并把 dist/
            放到插件设置 dist_dir（生产镜像自带），或使用下方手动方式。
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
      {hasInstall ? (
        <>
          <CommandField
            label="一行安装并采集 · Linux（root / sudo）"
            value={installLinux}
            copyLabel="Linux 命令"
            hint="在受害主机粘贴执行：自动下载对应架构的采集端、校验 SHA256、只读采集后直传平台；平台不可达时自动落离线包。可在末尾追加 -deep 等参数。"
          />
          <CommandField
            label="一行安装并采集 · Windows（管理员 PowerShell）"
            value={installWindows}
            copyLabel="Windows 命令"
            hint="同上；非管理员也能跑但命令行/句柄/Security 日志会缺失。"
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
                  拷到主机后用上面的命令执行；也可先 -o 落盘，再在案例页「上传采集包」。
                </FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>
    </FieldGroup>
  )
}
