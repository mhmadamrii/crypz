import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const THEME_KEY = 'crypz-theme'

// Runs before paint so the stored theme never flashes. Dark is the default.
export const themeScript = `try{var t=localStorage.getItem('${THEME_KEY}');document.documentElement.classList.toggle('dark',t!=='light')}catch(e){}`

export function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle('dark')
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {}
  }
  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle light or dark theme">
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  )
}
