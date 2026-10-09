import { useState } from "react"
import { createPortal } from "react-dom"
import {
  LogIn,
  UserPlus,
  AlertCircle,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
  Bot,
  ArrowRight,
  ArrowLeft,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cardHover } from "@/lib/styles"
import {
  Field,
  FieldLabel,
  FieldGroup,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { storeToken } from "@/lib/jwt.js"
import { useAutofillSync, fieldValue } from "@/hooks/use-autofill-sync.js"

const LOGIN_MODES = [
  { value: "login", label: "登录" },
  { value: "register", label: "注册" },
]

const FEATURES = [
  {
    icon: Shield,
    title: "安全事件与告警",
    desc: "安全告警、探针阻断、AI 工作流,统一在一个控制台。",
  },
  {
    icon: Eye,
    title: "AI 助手 + 工作流",
    desc: "浮动 AI 球随时唤起,工作流可定时运行并可视化编辑。",
  },
  {
    icon: Bot,
    title: "可自定义模块",
    desc: "在配置文件中加一个表,自动出现在侧边栏,无需写代码。",
  },
]

export function LoginOverlay({ onLogin }) {
  const [mode, setMode] = useState("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [otpRequired, setOtpRequired] = useState(false)
  const [otpCode, setOtpCode] = useState("")

  // 密码管理器的填充要靠原生监听才收得到(见 use-autofill-sync.js)
  const usernameRef = useAutofillSync(setUsername)
  const passwordRef = useAutofillSync(setPassword)
  const confirmRef = useAutofillSync(setConfirm)
  const inviteRef = useAutofillSync(setInviteCode)
  const otpRef = useAutofillSync(setOtpCode)

  function reset() {
    setError("")
    setOtpRequired(false)
    setOtpCode("")
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    // 真值取自 DOM:填充器可能只写了 input.value 而没触发任何事件
    const uname = fieldValue(usernameRef, username)
    const pass = fieldValue(passwordRef, password)
    const conf = fieldValue(confirmRef, confirm)
    const invite = fieldValue(inviteRef, inviteCode)
    const otp = fieldValue(otpRef, otpCode)
    // 回写 state:两步验证时账号/密码字段会卸载,后续那一步只剩 state 可用
    if (uname !== username) setUsername(uname)
    if (pass !== password) setPassword(pass)
    if (!uname || !pass) {
      setError("请输入用户名和密码")
      return
    }
    if (mode === "register" && pass !== conf) {
      setError("两次输入的密码不一致")
      return
    }
    if (mode === "register" && !invite) {
      setError("请输入邀请码")
      return
    }
    if (otpRequired && otp.trim().length !== 6) {
      setError("请输入 6 位动态验证码")
      return
    }
    setSubmitting(true)
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register"
      const body =
        mode === "login"
          ? {
              username: uname,
              password: pass,
              ...(otpRequired ? { otp_code: otp.trim() } : {}),
            }
          : { username: uname, password: pass, invite_code: invite }
      const resp = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const text = await resp.text()
        let parsed = null
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = null
        }
        // 密码已验证但账号开了两步验证 → 切到验证码输入步
        if (mode === "login" && parsed?.otp_required) {
          if (otpRequired) {
            setError("动态验证码不正确,请重试")
          }
          setOtpRequired(true)
          setOtpCode("")
          return
        }
        throw new Error(
          parsed?.error || parsed?.message || text || `${resp.status} ${resp.statusText}`,
        )
      }
      const data = await resp.json()
      if (!data.token) throw new Error("响应中未包含 token")
      storeToken(data.token)
      toast.success(mode === "login" ? "登录成功" : "注册成功")
      onLogin(data.user)
    } catch (err) {
      setError(err.message || "未知错误")
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid grid-cols-1 bg-background md:grid-cols-2"
      role="dialog"
      aria-modal="true"
      aria-label="登录"
    >
      {/* Brand panel — hidden on mobile */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-muted p-12 md:flex">
        {/* Decorative gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-muted via-muted to-muted/50"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-foreground/5 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-32 size-96 rounded-full bg-foreground/5 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <div
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background"
          >
            <Bot className="size-6" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold">Agentic SOC</span>
            <span className="text-xs text-muted-foreground">
              Security Operations Console
            </span>
          </div>
        </div>

        <div className="relative flex flex-col gap-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              安全运营,一处可见
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              安全告警、工单协同、探针阻断、AI 工作流 — 全部在一个控制台里。
            </p>
          </div>
          <ul className="flex flex-col gap-5">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <li key={f.title} className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background ring-1 ring-foreground/10">
                    <Icon className="size-4 text-foreground" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{f.title}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      {f.desc}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <span>v0.1</span>
          <span>© 2026 Agentic SOC</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only brand row */}
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <div
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background"
            >
              <Bot className="size-5" />
            </div>
            <span className="text-sm font-semibold">Agentic SOC</span>
          </div>

          <Card className={cardHover}>
            <CardHeader>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xl font-semibold tracking-tight">
                  {otpRequired
                    ? "两步验证"
                    : mode === "login"
                      ? "欢迎回来"
                      : "创建账号"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {otpRequired
                    ? "该账号已启用两步验证,请输入认证器中的动态验证码"
                    : mode === "login"
                      ? "输入账号继续到控制台"
                      : "输入账号、密码和邀请码"}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {otpRequired ? null : (
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={(v) => {
                    if (!v) return
                    setMode(v)
                    reset()
                  }}
                  spacing={0}
                  className="mb-6 w-full"
                >
                  {LOGIN_MODES.map((m) => (
                    <ToggleGroupItem
                      key={m.value}
                      value={m.value}
                      className="flex-1"
                    >
                      {m.value === "login" ? (
                        <LogIn data-icon="inline-start" />
                      ) : (
                        <UserPlus data-icon="inline-start" />
                      )}
                      {m.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}

              <form
                id="login-form"
                name="login"
                onSubmit={handleSubmit}
                autoComplete="on"
                className="flex flex-col gap-4"
              >
                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle data-icon="inline-start" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                {otpRequired ? (
                  <FieldGroup>
                    {/* Read-only, but a REAL autocomplete="username" field:
                        password managers need it in the DOM to keep matching
                        this step to the item they just filled — that match is
                        what makes them offer the 一次性验证码. */}
                    <Field>
                      <FieldLabel htmlFor="username">用户名</FieldLabel>
                      <Input
                        id="username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        value={username}
                        readOnly
                        tabIndex={-1}
                        className="text-muted-foreground"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="otp-code">动态验证码</FieldLabel>
                      <Input
                        ref={otpRef}
                        id="otp-code"
                        name="otp_code"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="6 位数字"
                        autoFocus
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={otpCode}
                        onChange={(e) =>
                          setOtpCode(e.target.value.replace(/\D/g, ""))
                        }
                        className="text-center font-mono text-lg tracking-[0.5em]"
                        required
                      />
                    </Field>
                  </FieldGroup>
                ) : (
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="username">用户名</FieldLabel>
                    <Input
                      ref={usernameRef}
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password">密码</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        ref={passwordRef}
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "隐藏密码" : "显示密码"}
                        >
                          {showPassword ? <EyeOff /> : <Eye />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                  {mode === "register" ? (
                    <>
                      <Field>
                        <FieldLabel htmlFor="confirm">确认密码</FieldLabel>
                        <Input
                          ref={confirmRef}
                          id="confirm"
                          name="confirm"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="invite">邀请码</FieldLabel>
                        <Input
                          ref={inviteRef}
                          id="invite"
                          name="invite_code"
                          type="text"
                          autoComplete="off"
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value)}
                          required
                          placeholder="由管理员签发"
                        />
                      </Field>
                    </>
                  ) : null}
                </FieldGroup>
                )}
                <Button type="submit" disabled={submitting} className="mt-1 w-full">
                  {submitting ? (
                    <Spinner data-icon="inline-start" />
                  ) : otpRequired ? (
                    <>
                      <ShieldCheck data-icon="inline-start" />
                      验证并登录
                    </>
                  ) : mode === "login" ? (
                    <>
                      <LogIn data-icon="inline-start" />
                      登录
                      <ArrowRight data-icon="inline-end" />
                    </>
                  ) : (
                    <>
                      <UserPlus data-icon="inline-start" />
                      注册并登录
                    </>
                  )}
                </Button>
                {otpRequired ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    disabled={submitting}
                    onClick={reset}
                  >
                    <ArrowLeft data-icon="inline-start" />
                    返回重新输入账号密码
                  </Button>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>,
    document.body,
  )
}
