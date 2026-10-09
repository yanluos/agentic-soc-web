import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { IconButton } from "@/components/IconButton.jsx"
import { useTheme } from "@/components/theme-provider.jsx"

export function ModeToggle() {
  const { setTheme } = useTheme()
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  )

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [])

  return (
    <IconButton
      color="gray"
      variant="ghost"
      size="sm"
      aria-label="切换主题"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </IconButton>
  )
}
