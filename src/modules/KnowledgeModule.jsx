// 技能与知识库 — full-page manager over soc-ai's /agent/skills (the AI's
// operating manuals) and /agent/knowledge (reference docs it retrieves and
// cites). Both resources share the same on-disk shape and REST contract, so
// one two-pane manager serves both: searchable list rail on the left, editor
// with a Markdown preview on the right. Replaces the cramped dialog that used
// to live in the AI 助手 workbench header (that button now navigates here).

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BookOpen,
  Library,
  Plus,
  Search,
  Save,
  Eye,
  PenLine,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { MarkdownText } from "@/components/MarkdownText.jsx"
import { cardHover } from "@/lib/styles.js"
import {
  RailBody,
  RailCard,
  RailGroup,
  RailList,
  RailLoading,
  RailRow,
} from "@/components/ListRail.jsx"
import { cn } from "@/lib/utils"
import { getStoredToken } from "@/lib/jwt.js"

function authHeaders() {
  return { Authorization: `Bearer ${getStoredToken()}` }
}

async function jsonOrThrow(resp) {
  if (!resp.ok) throw new Error((await resp.text()) || `${resp.status}`)
  if (resp.status === 204) return null
  return resp.json()
}

// Names are directory components on the server, so both rules double as the
// path-traversal guard (mirror of internal/knowledge.validName and
// internal/agent's skillNameRe — keep them in sync).
//   knowledge: letters in ANY script (中文 included) + digits + - _
//   skills:    ASCII slug only — the name IS the SDK identifier ("soc:<name>")
const KNOWLEDGE_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,63}$/u
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

// Path segment for a name that may hold non-ASCII (中文 doc names).
const seg = (name) => encodeURIComponent(name)

const SKILL_COPY = {
  noun: "技能",
  listTitle: "技能",
  icon: BookOpen,
  intro:
    "技能是 AI 执行任务时遵循的操作手册(SOP)。启用后,AI 助手在任务匹配描述时自动调用并按其流程执行。",
  emptyTitle: "还没有技能",
  emptyDesc:
    "把常用的研判流程、处置 SOP 沉淀成技能,AI 助手每次都按同一套标准执行。",
  namePlaceholder: "dlp-triage",
  nameRe: SKILL_NAME_RE,
  nameError: "技能名须为小写字母/数字/连字符,如 dlp-triage",
  nameHint:
    "小写字母/数字/连字符。它同时是 SDK 里的技能标识(soc:名称),所以不支持中文;创建后不可改名。",
  descPlaceholder: "研判一条 DLP 告警:定位人员、判定风险等级并给出处置建议",
  descHint: "模型根据这句话判断何时使用该技能——写清楚适用场景。",
  contentPlaceholder: `以 Markdown 描述执行流程,模型被触发后照此操作,例如:

## 目标
研判一条告警并给出处置建议。

## 步骤
1. 用 skyeye_alert_search 拉取告警详情
2. 用 identity_search 定位涉事员工
3. 按下面的分级标准输出结论……`,
  deleteDesc: "技能目录及其全部文件将被删除,不可恢复。",
}

const KNOWLEDGE_COPY = {
  noun: "文档",
  listTitle: "文档",
  icon: Library,
  intro:
    "知识库是 AI 检索引用的内部参考资料——接口说明、研判 SOP、资产台账等。AI 助手与工作流研判前会自动检索。对外 MCP 也可检索,不要存放密码/密钥等凭据。",
  emptyTitle: "知识库还是空的",
  emptyDesc:
    "把天擎/天眼接口说明、研判 SOP、资产台账写成文档,AI 回答内部问题时就有据可依。",
  namePlaceholder: "天眼告警研判SOP",
  nameRe: KNOWLEDGE_NAME_RE,
  nameError: "文档名可用中英文字/数字/连字符/下划线,不能含空格、点或斜杠",
  nameHint:
    "支持中文。可用中英文字、数字、连字符、下划线(不能含空格/点/斜杠),最长 64 字;创建后不可改名。",
  descPlaceholder: "告警分级标准与常见误报特征:研判天眼/EDR 告警时先查本文档",
  descHint: "一句话说明文档内容与适用场景——AI 靠它决定何时来查这篇文档。",
  contentPlaceholder: `以 Markdown 记录参考内容,AI 检索命中后引用作答,例如:

## 告警分级标准
- 危急:外联已知 C2 且主机失陷……

## 常见误报
- 办公网 10.x 段对 xx 域名的批量 DNS 查询来自资产盘点系统……`,
  deleteDesc: "文档目录及其中全部文件(含手工放置的附件)将被删除,不可恢复。",
}

const EMPTY_FORM = { name: "", description: "", content: "", category: "" }

// Radix Select rejects an empty item value, so the "no category" and
// "type a new one" choices ride on sentinels.
const CAT_NONE = "__none__"
const CAT_NEW = "__new__"

// ResourceManager is the two-pane manager for one /agent/<base> resource.
// selected: null = nothing open, "new" = draft, "<name>" = editing that item.
function ResourceManager({ base, copy, hasCategory, setError }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filter, setFilter] = useState("")
  const [mode, setMode] = useState("edit") // edit | preview
  const [newCat, setNewCat] = useState(false) // category picker → free-text input
  const CopyIcon = copy.icon

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems(
        (await jsonOrThrow(await fetch(base, { headers: authHeaders() }))) || []
      )
    } catch (err) {
      setError?.(err.message)
      toast.error(`加载${copy.noun}失败: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [base, copy.noun, setError])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Existing categories become the dropdown's options; the doc being edited
  // contributes its own so a just-saved new category never shows as blank.
  const categories = useMemo(() => {
    const set = new Set(items.map((s) => s.category).filter(Boolean))
    if (form.category) set.add(form.category)
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
  }, [items, form.category])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((s) =>
      [s.name, s.description, s.category].some((v) =>
        (v || "").toLowerCase().includes(q)
      )
    )
  }, [items, filter])

  // The rail folds docs into their category like the workflow list folds defs
  // into groups: one collapsible folder per category (sorted zh-Hans), then a
  // static 未分类 heading — shown only when at least one category exists, so
  // a flat list stays a flat list. Skills have no category → always flat.
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const groupedVisible = useMemo(() => {
    const byGroup = {}
    const ungrouped = []
    for (const s of visible) {
      const g = hasCategory ? (s.category || "").trim() : ""
      if (!g) ungrouped.push(s)
      else (byGroup[g] ||= []).push(s)
    }
    const groups = Object.keys(byGroup).sort((a, b) =>
      a.localeCompare(b, "zh-Hans-CN")
    )
    return { groups, byGroup, ungrouped }
  }, [visible, hasCategory])

  const renderRow = (s) => (
    <RailRow
      key={s.name}
      active={selected === s.name}
      disabled={!s.enabled}
      onClick={() => open(s)}
      title={s.description || s.name}
      aria-label={`编辑 ${s.name}`}
      trailing={
        <>
          {s.enabled ? null : (
            <Badge variant="outline" className="text-[10px]">
              停用
            </Badge>
          )}
          <Switch
            size="sm"
            checked={s.enabled}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onCheckedChange={(v) => toggleEnabled(s, v)}
            aria-label={`启用 ${s.name}`}
          />
        </>
      }
    >
      <span className="truncate">{s.name}</span>
    </RailRow>
  )

  async function toggleEnabled(item, enabled) {
    setItems((prev) =>
      prev.map((s) => (s.name === item.name ? { ...s, enabled } : s))
    )
    try {
      await jsonOrThrow(
        await fetch(`${base}/${seg(item.name)}`, {
          method: "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        })
      )
    } catch (err) {
      toast.error(`更新失败: ${err.message}`)
      refresh()
    }
  }

  async function open(item) {
    setMode("edit")
    setNewCat(false)
    if (!item) {
      setForm(EMPTY_FORM)
      setSelected("new")
      return
    }
    try {
      const full = await jsonOrThrow(
        await fetch(`${base}/${seg(item.name)}`, { headers: authHeaders() })
      )
      setForm({
        name: full.name,
        description: full.description || "",
        content: full.content || "",
        category: full.category || "",
      })
      setSelected(item.name)
    } catch (err) {
      toast.error(`加载${copy.noun}失败: ${err.message}`)
    }
  }

  async function save() {
    const isNew = selected === "new"
    if (isNew && !copy.nameRe.test(form.name)) {
      toast.error(copy.nameError)
      return
    }
    if (!form.description.trim()) {
      toast.error(`描述必填:${copy.descHint}`)
      return
    }
    const body = {
      name: form.name,
      description: form.description,
      content: form.content,
    }
    if (hasCategory) body.category = form.category
    setSaving(true)
    try {
      await jsonOrThrow(
        await fetch(isNew ? base : `${base}/${seg(selected)}`, {
          method: isNew ? "POST" : "PUT",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      )
      toast.success(isNew ? `${copy.noun}已创建` : `${copy.noun}已保存`)
      if (isNew) setSelected(form.name)
      // A freshly typed category is now a real option — hand the field back to
      // the dropdown so it reads the same as any other saved category.
      setNewCat(false)
      refresh()
    } catch (err) {
      toast.error(`保存失败: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function remove(name) {
    try {
      await jsonOrThrow(
        await fetch(`${base}/${seg(name)}`, {
          method: "DELETE",
          headers: authHeaders(),
        })
      )
      toast.success(`${copy.noun}已删除`)
      if (selected === name) setSelected(null)
      refresh()
    } catch (err) {
      toast.error(`删除失败: ${err.message}`)
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* list rail — the platform list card (see components/ListRail.jsx) */}
      <RailCard
        title={copy.listTitle}
        count={items.length || null}
        action={
          <IconButton
            color="blue"
            size="sm"
            aria-label={`新建${copy.noun}`}
            onClick={() => open(null)}
          >
            <Plus />
          </IconButton>
        }
        toolbar={
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`搜索${copy.noun}`}
              aria-label={`搜索${copy.noun}`}
            />
          </InputGroup>
        }
      >
        {loading ? (
          <RailLoading />
        ) : visible.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CopyIcon />
              </EmptyMedia>
              <EmptyTitle>
                {items.length === 0 ? copy.emptyTitle : "没有匹配项"}
              </EmptyTitle>
              <EmptyDescription>
                {items.length === 0
                  ? copy.emptyDesc
                  : "换个关键词,或清空搜索框。"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <RailBody>
            {groupedVisible.groups.map((g) => (
              <RailGroup
                key={g}
                label={g}
                count={groupedVisible.byGroup[g].length}
                collapsed={!!collapsedGroups[g]}
                onToggle={() =>
                  setCollapsedGroups((c) => ({ ...c, [g]: !c[g] }))
                }
              >
                {groupedVisible.byGroup[g].map(renderRow)}
              </RailGroup>
            ))}
            {groupedVisible.groups.length > 0 ? (
              groupedVisible.ungrouped.length > 0 ? (
                <RailGroup
                  label="未分类"
                  count={groupedVisible.ungrouped.length}
                  muted
                >
                  {groupedVisible.ungrouped.map(renderRow)}
                </RailGroup>
              ) : null
            ) : (
              <RailList>{groupedVisible.ungrouped.map(renderRow)}</RailList>
            )}
          </RailBody>
        )}
      </RailCard>

      {/* editor pane */}
      <Card className={cn("min-h-0 min-w-0", cardHover)}>
        <CardContent className="min-h-0 thin-scrollbar flex-1 overflow-y-auto">
          {selected === null ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PenLine />
                </EmptyMedia>
                <EmptyTitle>选择左侧条目查看或编辑</EmptyTitle>
                <EmptyDescription>{copy.intro}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">
                    {selected === "new" ? `新建${copy.noun}` : selected}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selected === "new"
                      ? "创建后不可改名。"
                      : hasCategory
                        ? "保存为 DOC.md;同目录的附件不受影响。"
                        : "保存为 SKILL.md。"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ToggleGroup
                    type="single"
                    value={mode}
                    onValueChange={(v) => v && setMode(v)}
                  >
                    <ToggleGroupItem value="edit" aria-label="编辑">
                      <PenLine />
                      编辑
                    </ToggleGroupItem>
                    <ToggleGroupItem value="preview" aria-label="预览">
                      <Eye />
                      预览
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {selected === "new" ? null : (
                    <ConfirmDeleteButton
                      variant="soft"
                      size="sm"
                      label={`删除${copy.noun}`}
                      onConfirm={() => remove(selected)}
                    />
                  )}
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <Save data-icon="inline-start" />
                    )}
                    保存
                  </Button>
                </div>
              </div>

              <FieldGroup>
                {selected === "new" ? (
                  <Field>
                    <FieldLabel htmlFor={`${base}-name`}>
                      {copy.noun}名
                    </FieldLabel>
                    <Input
                      id={`${base}-name`}
                      value={form.name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value.trim() }))
                      }
                      placeholder={copy.namePlaceholder}
                    />
                    <FieldDescription>{copy.nameHint}</FieldDescription>
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor={`${base}-desc`}>
                    描述(触发条件)
                  </FieldLabel>
                  <Input
                    id={`${base}-desc`}
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder={copy.descPlaceholder}
                  />
                  <FieldDescription>{copy.descHint}</FieldDescription>
                </Field>
                {hasCategory ? (
                  <Field>
                    <FieldLabel htmlFor={`${base}-cat`}>分类(可选)</FieldLabel>
                    {/* Field(vertical) stretches its children with *:w-full, which
                        would run a short category name across the whole pane — cap
                        the control instead of fighting that rule. */}
                    {newCat ? (
                      <div className="flex items-center gap-2">
                        <Input
                          id={`${base}-cat`}
                          className="sm:max-w-64"
                          autoFocus
                          value={form.category}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, category: e.target.value }))
                          }
                          onKeyDown={(e) =>
                            e.key === "Enter" && e.preventDefault()
                          }
                          placeholder="输入新分类名,如 研判SOP"
                        />
                        <IconButton
                          color="gray"
                          variant="ghost"
                          size="sm"
                          aria-label="取消新建分类"
                          onClick={() => {
                            setNewCat(false)
                            setForm((f) => ({ ...f, category: "" }))
                          }}
                        >
                          <X />
                        </IconButton>
                      </div>
                    ) : (
                      <Select
                        value={form.category || CAT_NONE}
                        onValueChange={(v) => {
                          if (v === CAT_NEW) {
                            setNewCat(true)
                            setForm((f) => ({ ...f, category: "" }))
                            return
                          }
                          setForm((f) => ({
                            ...f,
                            category: v === CAT_NONE ? "" : v,
                          }))
                        }}
                      >
                        <SelectTrigger
                          id={`${base}-cat`}
                          className="sm:max-w-64"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CAT_NONE}>无分类</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value={CAT_NEW}>+ 新建分类…</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <FieldDescription>
                      {newCat
                        ? "保存后这个分类会出现在下拉列表里,供其他文档复用。"
                        : "同类文档在 AI 的检索索引里归为一组。"}
                    </FieldDescription>
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor={`${base}-content`}>
                    内容(Markdown)
                  </FieldLabel>
                  {mode === "edit" ? (
                    <Textarea
                      id={`${base}-content`}
                      value={form.content}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, content: e.target.value }))
                      }
                      placeholder={copy.contentPlaceholder}
                      className="max-h-[28rem] min-h-72 font-mono text-xs"
                    />
                  ) : (
                    <div className="max-h-[28rem] min-h-72 thin-scrollbar overflow-y-auto rounded-md border p-3 text-sm">
                      {form.content.trim() ? (
                        <MarkdownText>{form.content}</MarkdownText>
                      ) : (
                        <p className="text-muted-foreground">还没有内容。</p>
                      )}
                    </div>
                  )}
                </Field>
              </FieldGroup>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function KnowledgeModule({ setError }) {
  return (
    <div className="flex h-[calc(100svh-6rem)] flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">技能与知识库</h2>
          <p className="text-sm text-muted-foreground">
            技能 = AI 执行任务的操作手册;知识库 = AI
            检索引用的内部参考资料。两者都即时生效,无需重启。
          </p>
        </div>
      </div>
      <Tabs defaultValue="knowledge" className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="knowledge">知识库</TabsTrigger>
          <TabsTrigger value="skills">技能</TabsTrigger>
        </TabsList>
        <TabsContent value="knowledge" className="flex min-h-0 flex-col">
          <ResourceManager
            base="/agent/knowledge"
            copy={KNOWLEDGE_COPY}
            hasCategory
            setError={setError}
          />
        </TabsContent>
        <TabsContent value="skills" className="flex min-h-0 flex-col">
          <ResourceManager
            base="/agent/skills"
            copy={SKILL_COPY}
            hasCategory={false}
            setError={setError}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default KnowledgeModule
