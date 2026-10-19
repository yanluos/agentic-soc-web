// 用户菜单里的「外观」子菜单:浅色 / 深色 / 跟随系统(原顶栏太阳/月亮按钮,
// 2026-10-12 移入用户菜单)。只存本浏览器 localStorage,不是服务端设置。
import { Monitor, Moon, Palette, Sun } from "lucide-react"
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme } from "@/components/theme-provider.jsx"

export function ThemeSubMenu() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette />
        外观
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun />
            浅色
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            深色
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor />
            跟随系统
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
