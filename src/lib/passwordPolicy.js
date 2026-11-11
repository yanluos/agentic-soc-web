// 密码策略 —— 与 soc-auth/password_policy.go 保持一致(服务端为准,这里只做即时提示)。
const MIN_LEN = 10
const MAX_BYTES = 72
const RUN = 4
const KEYBOARD_ROWS = [
  "`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./",
  "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
]
const WEAK_BASES = new Set([
  "password", "passw0rd", "p@ssw0rd", "p@ssword", "admin", "administrator",
  "root", "toor", "welcome", "qwerty", "letmein", "iloveyou", "changeme",
  "default", "test", "guest", "user", "login", "master", "security", "secret",
  "soc", "agenticsoc", "abc", "system", "manager", "super", "superman",
])

const isAlnum = (c) => /^[a-z0-9]$/i.test(c)

function hasRepeatRun(s) {
  return new RegExp(`(.)\\1{${RUN - 1}}`, "u").test(s)
}

function hasSequenceRun(s) {
  const cs = [...s]
  let up = 1
  let down = 1
  for (let i = 1; i < cs.length; i++) {
    const a = cs[i - 1].codePointAt(0)
    const b = cs[i].codePointAt(0)
    const ok = isAlnum(cs[i]) && isAlnum(cs[i - 1])
    up = ok && b === a + 1 ? up + 1 : 1
    down = ok && b === a - 1 ? down + 1 : 1
    if (up >= RUN || down >= RUN) return true
  }
  for (let i = 0; i + RUN <= cs.length; i++) {
    const w = cs.slice(i, i + RUN).join("")
    for (const row of KEYBOARD_ROWS) {
      if (row.includes(w) || [...row].reverse().join("").includes(w)) return true
    }
  }
  return false
}

function isWeakBase(low) {
  const core = low.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")
  if (!core || WEAK_BASES.has(core)) return true
  const leet = core
    .replace(/@/g, "a").replace(/0/g, "o").replace(/1/g, "i")
    .replace(/3/g, "e").replace(/[$5]/g, "s")
  return WEAK_BASES.has(leet)
}

/** 逐条规则的满足情况,用于输入框下方的清单。 */
export function passwordChecks(pw = "", username = "") {
  const low = pw.toLowerCase()
  const u = username.trim().toLowerCase()
  const classes = [/\p{Lu}/u, /\p{Ll}/u, /\p{Nd}/u, /[^\p{Lu}\p{Ll}\p{Nd}\s]/u].filter((re) =>
    re.test(pw),
  ).length
  const bytes = new TextEncoder().encode(pw).length
  return [
    { key: "len", label: `长度 ${MIN_LEN}–72 位`, ok: [...pw].length >= MIN_LEN && bytes <= MAX_BYTES },
    { key: "classes", label: "大小写/数字/符号至少三类", ok: classes >= 3 },
    { key: "space", label: "不含空格", ok: pw.length > 0 && !/[\s\p{Cc}]/u.test(pw) },
    { key: "user", label: "不含用户名", ok: pw.length > 0 && !(u.length >= 3 && low.includes(u)) },
    {
      key: "pattern",
      label: "无 1234/abcd/qwer/aaaa 类序列",
      ok: pw.length > 0 && !hasRepeatRun(low) && !hasSequenceRun(low),
    },
    { key: "weak", label: "非常见弱口令(如 Admin@123)", ok: pw.length > 0 && !isWeakBase(low) },
  ]
}

/** 返回第一条不满足的规则说明,全部满足返回 ""。 */
export function passwordProblem(pw, username) {
  const bad = passwordChecks(pw, username).find((c) => !c.ok)
  return bad ? `密码不符合安全策略:${bad.label}` : ""
}
