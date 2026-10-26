import { CalendarDays, ListTodo, Navigation, Settings, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '../utils'

interface RailItem {
  key: string
  label: string
  icon: LucideIcon
  ready: boolean
}

const ITEMS: RailItem[] = [
  { key: 'month', label: '日历', icon: CalendarDays, ready: true },
  { key: 'tasks', label: '待办', icon: ListTodo, ready: true },
  { key: 'ai', label: 'AI 分析', icon: Sparkles, ready: true },
  { key: 'settings', label: '设置', icon: Settings, ready: true }
]

export function IconRail({ active, onSelect }: { active: string; onSelect?: (key: string) => void }) {
  return (
    <nav className="rail" aria-label="主导航">
      <div className="rail-avatar" aria-hidden="true">
        <Navigation size={17} strokeWidth={1.9} />
      </div>

      {ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            type="button"
            className={cx('rail-item', item.key === active && 'is-active', !item.ready && 'is-disabled')}
            title={item.ready ? item.label : `${item.label}（即将上线）`}
            aria-label={item.label}
            aria-current={item.key === active ? 'page' : undefined}
            onClick={() => item.ready && onSelect?.(item.key)}
          >
            <Icon size={20} strokeWidth={1.7} />
          </button>
        )
      })}
    </nav>
  )
}
