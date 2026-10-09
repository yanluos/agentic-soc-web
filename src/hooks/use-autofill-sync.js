import { useEffect, useRef } from "react"

/**
 * 让受控 input 能接住密码管理器(1Password / Chrome / Keychain / 企业填充器)
 * 的自动填充。
 *
 * 受控 input 上 React 会给 node.value 装自己的 setter 并维护一个 value
 * tracker:填充器直接 `el.value = "..."` 再派发 input 事件时,tracker 已经是
 * 新值,React 的合成 onChange 判定为「没变化」而把事件吞掉 —— DOM 里看得见
 * 密码,组件 state 却还是空串,下一次 re-render 就把它清掉,提交时报「请输入
 * 用户名和密码」。用原生监听绕开合成事件层就能拿到,再兜一次 timeout 覆盖
 * 那些只写 value、连事件都不发的填充器。
 *
 * 用法:
 *   const ref = useAutofillSync(setPassword)
 *   <Input ref={ref} value={password} onChange={...} />
 * 提交时用 `ref.current?.value` 作为真值(见 fieldValue)。
 */
export function useAutofillSync(setValue) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () => setValue(el.value)
    el.addEventListener("input", sync)
    el.addEventListener("change", sync)
    const id = setTimeout(sync, 0)
    return () => {
      el.removeEventListener("input", sync)
      el.removeEventListener("change", sync)
      clearTimeout(id)
    }
  }, [setValue])

  return ref
}

/** 取字段真值:DOM 优先,元素没挂载时回落到 state。 */
export function fieldValue(ref, fallback) {
  const v = ref.current?.value
  return v === undefined || v === null ? fallback : v
}
