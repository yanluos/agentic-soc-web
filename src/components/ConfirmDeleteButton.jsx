import * as React from "react"
import { Check, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { IconButton } from "@/components/IconButton.jsx"
import { cn } from "@/lib/utils"

/**
 * 行内确认删除按钮：点一下垃圾桶，原位展开 ✅（确认）和 ❌（取消）两个按钮，
 * 不弹对话框。再点 ✅ 才真正执行 onConfirm（可 async——等待期间 ✅ 显示加载、
 * 两键锁住；resolve 回到静止态，reject 留在确认态供重试，错误提示由调用方 toast）。
 * 点 ❌ / 按 Esc / 点到别处 / 焦点离开 / 6s 无操作 都收回。
 *
 * 两种外形：
 *   · 默认 = 图标按钮（IconButton red，variant/size 透传，表格行内用 soft，列表用 ghost）
 *   · 传 children = 文字按钮（Button destructive + 垃圾桶图标），确认态展开为同高的两个图标键
 * 根元素带 data-state="idle|confirm|pending"，配合 group-hover 隐藏的按钮可写
 * `data-[state=confirm]:opacity-100` 让它展开时保持可见。
 * 点击不向上冒泡（删除键常嵌在可点击的行/卡片里）。
 */
function ConfirmDeleteButton({
  onConfirm,
  label = "删除",
  confirmLabel = "确认删除",
  cancelLabel = "取消",
  variant = "soft",
  size = "sm",
  color = "red",
  disabled = false,
  timeout = 6000,
  icon,
  className,
  children,
  ...props
}) {
  const [state, setState] = React.useState("idle")
  const rootRef = React.useRef(null)
  const cancelRef = React.useRef(null)
  const mountedRef = React.useRef(true)

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 展开后：Esc / 点到外面 收回；超时自动收回（执行中不收）
  React.useEffect(() => {
    if (state !== "confirm") return
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        setState("idle")
      }
    }
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setState("idle")
    }
    const timer = timeout > 0 ? setTimeout(() => setState("idle"), timeout) : null
    document.addEventListener("keydown", onKey, true)
    document.addEventListener("pointerdown", onPointer, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      document.removeEventListener("pointerdown", onPointer, true)
      if (timer) clearTimeout(timer)
    }
  }, [state, timeout])

  // 键盘触发时把焦点落到 ❌ 上：Enter 再按一次是安全的取消，Shift+Tab 到 ✅
  React.useEffect(() => {
    if (state === "confirm") cancelRef.current?.focus()
  }, [state])

  function stop(e) {
    e.stopPropagation()
    e.preventDefault()
  }

  function open(e) {
    stop(e)
    if (disabled) return
    setState("confirm")
  }

  function cancel(e) {
    stop(e)
    setState("idle")
  }

  async function confirm(e) {
    stop(e)
    if (state !== "confirm") return
    setState("pending")
    try {
      await onConfirm?.()
      if (mountedRef.current) setState("idle")
    } catch {
      // 调用方已负责错误提示；留在确认态供重试
      if (mountedRef.current) setState("confirm")
    }
  }

  function onBlur(e) {
    if (state !== "confirm") return
    const next = e.relatedTarget
    if (next && rootRef.current?.contains(next)) return
    // 焦点移出整组（Tab 走了 / 点了别处）——收回
    if (next) setState("idle")
  }

  const textMode = children != null
  // 文字按钮 sm=h-7 对应 ibtn-sm，default=h-8 对应 ibtn-md
  const iconSize = textMode ? (size === "sm" ? "sm" : size === "xs" ? "xs" : "md") : size
  const pending = state === "pending"

  return (
    <span
      ref={rootRef}
      data-slot="confirm-delete"
      data-state={state}
      className={cn("inline-flex items-center", className)}
      onBlur={onBlur}
      onClick={(e) => e.stopPropagation()}
    >
      {state === "idle" ? (
        textMode ? (
          <Button
            type="button"
            variant="destructive"
            size={size === "xs" || size === "sm" || size === "lg" ? size : "default"}
            disabled={disabled}
            onClick={open}
            {...props}
          >
            {icon ?? <Trash2 data-icon="inline-start" />}
            {children}
          </Button>
        ) : (
          <IconButton
            color={color}
            variant={variant}
            size={size}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={open}
            {...props}
          >
            {icon ?? <Trash2 />}
          </IconButton>
        )
      ) : (
        <span
          role="group"
          aria-label={confirmLabel}
          className="inline-flex items-center gap-1 animate-in fade-in-0 zoom-in-90 duration-150"
        >
          <IconButton
            color="green"
            variant="solid"
            size={iconSize}
            aria-label={confirmLabel}
            title={confirmLabel}
            disabled={pending}
            onClick={confirm}
          >
            {pending ? <Spinner /> : <Check />}
          </IconButton>
          <IconButton
            ref={cancelRef}
            color="gray"
            variant="soft"
            size={iconSize}
            aria-label={cancelLabel}
            title={cancelLabel}
            disabled={pending}
            onClick={cancel}
          >
            <X />
          </IconButton>
        </span>
      )}
    </span>
  )
}

export { ConfirmDeleteButton }
