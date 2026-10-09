import * as React from "react"
import { CircleAlert, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

/**
 * 统一确认弹窗：图标 + 标题 + 描述 + 取消/确认。
 * onConfirm 可以是 async —— 等待期间确认键显示加载并锁住两个按钮，
 * resolve 后自动关闭；reject 则保持打开（错误提示由调用方 toast 负责）。
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  destructive = false,
  icon,
  onConfirm,
}) {
  const [pending, setPending] = React.useState(false)

  async function handleConfirm(e) {
    // Radix 的 Action 默认点击即关闭；拦下来等 onConfirm 落定再关
    e.preventDefault()
    if (pending) return
    setPending(true)
    try {
      await onConfirm?.()
      onOpenChange?.(false)
    } catch {
      // 调用方已负责错误提示，保持弹窗打开供重试
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange?.(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia
            className={cn(
              destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
            )}
          >
            {icon ?? (destructive ? <Trash2 /> : <CircleAlert />)}
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export { ConfirmDialog }
