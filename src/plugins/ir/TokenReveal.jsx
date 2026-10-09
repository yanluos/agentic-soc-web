// TokenReveal — the one-time display of a freshly minted 采集令牌 with the
// ready-to-paste socir command line. Shown by 新建案例 and 重置令牌.
import { Copy, KeyRound } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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

export function TokenReveal({ token, command, expires }) {
  async function copy(text, label) {
    if (await copyToClipboard(text)) toast.success(`已复制${label}`)
    else toast.error("复制失败，请手动选择复制")
  }
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
      {command ? (
        <Field>
          <FieldLabel>在受害主机上执行（管理员 PowerShell / CMD）</FieldLabel>
          <InputGroup>
            <InputGroupTextarea
              readOnly
              rows={3}
              value={command}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <InputGroupAddon align="block-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy(command, "命令")}
              >
                <Copy data-icon="inline-start" />
                复制命令
              </Button>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>
            采集端只读取证，产出 JSON 后直传平台；也可先 -o
            落盘再在案例页手动上传。
          </FieldDescription>
        </Field>
      ) : null}
    </FieldGroup>
  )
}
