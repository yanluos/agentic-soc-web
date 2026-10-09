// Admin: user CRUD + invite code minting. Uses raw `fetch` (not the
// shared apiClient) because /users is on the auth service and has its own
// conventions (e.g. PUT vs PATCH inconsistency).

import { useCallback, useEffect, useState } from "react"
import { Copy, Plus, UserPlus, KeyRound, ShieldCheck, ShieldOff } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/IconButton.jsx"
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton.jsx"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cardHover } from "@/lib/styles"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldContent } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { modules as staticModules } from "@/constants.js"
import { getStoredToken } from "@/lib/jwt.js"

// Fallback when the plugin host is unreachable: the core descriptors (only
// real backend grants — the settings_* UI pages ride on "settings").
const FALLBACK_GRANTS = staticModules
  .filter((m) => m.id !== "users" && !m.id.startsWith("settings_"))
  .map((m) => ({ id: m.id, label: m.label, source: "core", kind: "module" }))

const SOURCE_LABEL = { core: "平台" }

// Fetches GET /api/v1/plugins/modules — core modules + every enabled plugin's
// modules + ownerless tables (table:<slug>) — the single grantable list.
async function fetchGrantableModules() {
  const resp = await fetch("/api/v1/plugins/modules", { headers: authHeaders() })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const list = await resp.json()
  return (Array.isArray(list) ? list : []).filter((m) => m.id !== "users")
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getStoredToken()}`,
  }
}

async function fetchUsers() {
  const resp = await fetch("/users", { headers: authHeaders() })
  if (!resp.ok) throw new Error(`加载用户失败: ${resp.status}`)
  return resp.json()
}

async function createUser(body) {
  const resp = await fetch("/users", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || `创建失败: ${resp.status}`)
  }
  return resp.json()
}

async function updateUser(id, body) {
  const resp = await fetch(`/users/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || `更新失败: ${resp.status}`)
  }
  return resp.json()
}

async function deleteUser(id) {
  const resp = await fetch(`/users/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || `删除失败: ${resp.status}`)
  }
}

async function resetUserOtp(id) {
  const resp = await fetch(`/users/${id}/otp`, {
    method: "DELETE",
    headers: authHeaders(),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || `重置失败: ${resp.status}`)
  }
}

async function mintInvite() {
  const resp = await fetch("/invites", {
    method: "POST",
    headers: authHeaders(),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(text || `签发失败: ${resp.status}`)
  }
  return resp.json()
}

export function UserManagementModule({ currentUser, setError }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [otpResetTarget, setOtpResetTarget] = useState(null)
  const [invite, setInvite] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchUsers()
      setUsers(list)
    } catch (err) {
      setError?.(err.message)
    } finally {
      setLoading(false)
    }
  }, [setError])

  useEffect(() => {
    reload()
  }, [reload])

  async function handleMint() {
    try {
      const data = await mintInvite()
      setInvite({ ...data, mintedAt: Date.now() })
      toast.success("已签发邀请码")
    } catch (err) {
      setError?.(err.message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">用户管理</h2>
          <p className="text-sm text-muted-foreground">管理员可创建、编辑和删除用户,并签发注册邀请码</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleMint}>
            <KeyRound data-icon="inline-start" />
            签发邀请码
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus data-icon="inline-start" />
            新建用户
          </Button>
        </div>
      </div>

      {invite ? (
        <InvitePanel invite={invite} onClear={() => setInvite(null)} />
      ) : null}

      <Card className={cardHover}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>已授权模块</TableHead>
                <TableHead>两步验证</TableHead>
                <TableHead className="w-32 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center">
                    <Spinner className="mx-auto" />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    暂无用户
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.username}
                      {u.id === currentUser?.id ? (
                        <Badge variant="secondary" className="ml-2">当前</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {u.is_admin ? (
                        <Badge>管理员</Badge>
                      ) : (
                        <Badge variant="secondary">普通用户</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(u.is_admin ? ["*"] : u.modules || []).map((m) => (
                          <Badge key={m} variant="outline" className="font-mono text-xs">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.otp_enabled ? (
                        <div className="flex items-center gap-1">
                          <Badge>
                            <ShieldCheck data-icon="inline-start" />
                            已启用
                          </Badge>
                          <IconButton
                            color="orange"
                            variant="ghost"
                            size="sm"
                            onClick={() => setOtpResetTarget(u)}
                            aria-label="重置两步验证"
                          >
                            <ShieldOff />
                          </IconButton>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditTarget(u)}
                        >
                          编辑
                        </Button>
                        <ConfirmDeleteButton
                          variant="soft"
                          size="sm"
                          label="删除用户"
                          disabled={u.id === currentUser?.id}
                          onConfirm={async () => {
                            try {
                              await deleteUser(u.id)
                              toast.success("已删除")
                              reload()
                            } catch (err) {
                              setError?.(err.message)
                            }
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (body) => {
          try {
            await createUser(body)
            toast.success("已创建")
            setCreateOpen(false)
            reload()
          } catch (err) {
            setError?.(err.message)
          }
        }}
      />

      <EditUserDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={async (body) => {
          try {
            await updateUser(editTarget.id, body)
            toast.success("已更新")
            setEditTarget(null)
            reload()
          } catch (err) {
            setError?.(err.message)
          }
        }}
      />

      <AlertDialog open={!!otpResetTarget} onOpenChange={(o) => !o && setOtpResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置 {otpResetTarget?.username} 的两步验证?</AlertDialogTitle>
            <AlertDialogDescription>
              用于用户丢失认证器时解锁:重置后该用户仅凭密码即可登录,可自行重新启用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await resetUserOtp(otpResetTarget.id)
                  toast.success("已重置两步验证")
                  setOtpResetTarget(null)
                  reload()
                } catch (err) {
                  setError?.(err.message)
                }
              }}
            >
              重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

function InvitePanel({ invite, onClear }) {
  const [remaining, setRemaining] = useState(() => msLeft(invite))
  useEffect(() => {
    const id = setInterval(() => setRemaining(msLeft(invite)), 1000)
    return () => clearInterval(id)
  }, [invite])
  const expired = remaining <= 0
  const code = invite.code || invite.invite_code || ""

  return (
    <Card className={cardHover}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">新邀请码</CardTitle>
        <CardDescription>单次使用,5 分钟内有效</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <InputGroup className="max-w-md">
            <InputGroupInput
              value={code}
              readOnly
              className={expired ? "line-through text-muted-foreground" : "font-mono"}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="复制"
                onClick={() => {
                  navigator.clipboard.writeText(code).then(
                    () => toast.success("已复制"),
                    () => toast.error("复制失败"),
                  )
                }}
                disabled={expired}
              >
                <Copy />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <Badge variant={expired ? "destructive" : "secondary"}>
            {expired ? "已过期" : formatMMSS(remaining)}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClear}>
            关闭
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function msLeft(invite) {
  if (!invite) return 0
  const expiresAt = invite.expires_at ? new Date(invite.expires_at).getTime() : null
  if (expiresAt) return Math.max(0, expiresAt - Date.now())
  const minted = invite.mintedAt || 0
  return Math.max(0, minted + 5 * 60 * 1000 - Date.now())
}

function formatMMSS(ms) {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

function CreateUserDialog({ open, onOpenChange, onSubmit }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [selected, setSelected] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setUsername("")
      setPassword("")
      setIsAdmin(false)
      setSelected([])
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建用户</DialogTitle>
          <DialogDescription>创建后用户可以立即登录。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setSubmitting(true)
            try {
              await onSubmit({
                username,
                password,
                is_admin: isAdmin,
                modules: isAdmin ? [] : selected,
              })
            } finally {
              setSubmitting(false)
            }
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cu-user">用户名</FieldLabel>
              <Input
                id="cu-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cu-pw">密码</FieldLabel>
              <Input
                id="cu-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="cu-admin"
                checked={isAdmin}
                onCheckedChange={(c) => setIsAdmin(!!c)}
              />
              <FieldLabel htmlFor="cu-admin">管理员 (可访问所有模块)</FieldLabel>
            </Field>
            {isAdmin ? null : (
              <ModuleCheckboxes
                selected={selected}
                onChange={setSelected}
              />
            )}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({ target, onClose, onSubmit }) {
  const [password, setPassword] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [selected, setSelected] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (target) {
      setPassword("")
      setIsAdmin(!!target.is_admin)
      setSelected(Array.isArray(target.modules) ? target.modules : [])
    }
  }, [target])

  if (!target) return null

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑用户 {target.username}</DialogTitle>
          <DialogDescription>留空密码表示不修改。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const body = { is_admin: isAdmin, modules: isAdmin ? [] : selected }
            if (password) {
              body.password = password
            }
            setSubmitting(true)
            try {
              await onSubmit(body)
            } finally {
              setSubmitting(false)
            }
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="eu-pw">新密码 (可选)</FieldLabel>
              <Input
                id="eu-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="留空则不修改"
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="eu-admin"
                checked={isAdmin}
                onCheckedChange={(c) => setIsAdmin(!!c)}
              />
              <FieldLabel htmlFor="eu-admin">管理员 (可访问所有模块)</FieldLabel>
            </Field>
            {isAdmin ? null : (
              <ModuleCheckboxes
                selected={selected}
                onChange={setSelected}
              />
            )}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ModuleCheckboxes({ selected, onChange }) {
  const set = new Set(selected)
  const [catalog, setCatalog] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchGrantableModules()
      .then((list) => {
        if (!cancelled) setCatalog(list)
      })
      .catch(() => {
        if (!cancelled) setCatalog(FALLBACK_GRANTS)
      })
    return () => {
      cancelled = true
    }
  }, [])
  const list = catalog || FALLBACK_GRANTS
  // Group: 平台 first, then plugins (by source), tables last.
  const groups = []
  const byKey = new Map()
  for (const m of list) {
    const key = m.kind === "table" ? "__tables" : m.source || "core"
    if (!byKey.has(key)) {
      const label = key === "__tables" ? "数据表" : SOURCE_LABEL[key] || `插件 · ${key}`
      const g = { key, label, items: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    byKey.get(key).items.push(m)
  }
  groups.sort((a, b) => (a.key === "core" ? -1 : b.key === "core" ? 1 : a.key === "__tables" ? 1 : b.key === "__tables" ? -1 : a.label.localeCompare(b.label)))
  const toggle = (id, c) => {
    const next = new Set(set)
    if (c) next.add(id)
    else next.delete(id)
    onChange([...next])
  }
  return (
    <FieldSet>
      <FieldLegend variant="label">授权模块</FieldLegend>
      <FieldDescription>仅在非管理员时生效{catalog === null ? " · 加载模块目录…" : ""}</FieldDescription>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.label}</div>
            <div className="grid grid-cols-2 gap-2">
              {g.items.map((m) => (
                <Field key={m.id} orientation="horizontal">
                  <Checkbox id={`mod-${m.id}`} checked={set.has(m.id)} onCheckedChange={(c) => toggle(m.id, c)} />
                  <FieldLabel htmlFor={`mod-${m.id}`} className="font-normal" title={m.description || m.id}>
                    {m.label}
                    {m.dangerous ? <span className="ml-1 text-[10px] text-destructive">高危</span> : null}
                  </FieldLabel>
                </Field>
              ))}
            </div>
          </div>
        ))}
      </div>
    </FieldSet>
  )
}

export default UserManagementModule
