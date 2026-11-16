// 安全事件顶栏快速搜索:输入即筛选。关键字在详情左栏那些基本信息里模糊匹配(后端 ILIKE),
// 停顿 300ms 后把 where 交给宿主 GenericTableModule(setSearchWhere),与筛选面板条件 AND。
// 回车立即生效,Esc / X 清空。
import { useEffect, useMemo, useRef, useState } from "react"
import { Search, X } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

// 参与匹配的列(id 由后端按 id::text 匹配)。
export const SEARCH_FIELDS = [
  "id",
  "标题",
  "威胁指标",
  "涉事资产",
  "责任员工",
  "责任人邮箱",
  "前台公司",
  "组织架构",
  "来源",
  "告警类型",
]
const DEBOUNCE_MS = 300

export function searchWords(q) {
  return String(q || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
}

// 词与词 AND,每个词在各列 OR。值里的 ASCII 括号会截断后端的 leaf 解析,
// 换成 ILIKE 单字符通配 `_`。
export function buildSearchWhere(q) {
  const words = searchWords(q).map((w) => w.replace(/[()]/g, "_"))
  if (!words.length) return ""
  return words
    .map((w) => `(${SEARCH_FIELDS.map((f) => `(${f},like,${w})`).join("~or")})`)
    .join("~and")
}

export function QuickSearch({ searchWhere, setSearchWhere }) {
  const [q, setQ] = useState("")
  const inputRef = useRef(null)
  const where = useMemo(() => buildSearchWhere(q), [q])

  // 最新的宿主状态放 ref,防抖回调里读,避免依赖变化重置计时。
  const hostRef = useRef({ searchWhere, setSearchWhere })
  hostRef.current = { searchWhere, setSearchWhere }

  function apply(w) {
    const { searchWhere: cur, setSearchWhere: set } = hostRef.current
    if ((cur || "") !== w) set?.(w)
  }

  useEffect(() => {
    const t = setTimeout(() => apply(where), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [where])

  // `/` 或 ⌘K/Ctrl+K 聚焦(输入框/文本域里打 `/` 不抢)。
  useEffect(() => {
    function onKey(e) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  function clear() {
    setQ("")
    apply("")
    inputRef.current?.focus()
  }

  return (
    <InputGroup className="soc-field-sm h-7 w-44">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        value={q}
        placeholder="搜索 ID / IP / 人员…"
        className="text-xs placeholder:text-xs placeholder:text-muted-foreground/60"
        aria-label="快速搜索安全事件"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            apply(where)
          } else if (e.key === "Escape" && q) {
            e.preventDefault()
            clear()
          }
        }}
      />
      {q || searchWhere ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="清空搜索" onClick={clear}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}

export default QuickSearch
