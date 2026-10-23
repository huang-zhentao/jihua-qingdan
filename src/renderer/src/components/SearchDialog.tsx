import { CornerDownLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Project, Task } from '../domain/types'
import { cx } from '../utils'

interface Props {
  open: boolean
  tasks: Task[]
  projects: Project[]
  onClose: () => void
  onPick: (task: Task) => void
}

export function SearchDialog({ open, tasks, projects, onClose, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    window.setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return tasks
      .filter((t) => !t.deletedAt && (t.title.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || a.createdAt.localeCompare(b.createdAt))
      .slice(0, 40)
  }, [tasks, query])

  const colorOf = (projectId: string): string => projects.find((p) => p.id === projectId)?.color ?? '#9AA4B2'
  const nameOf = (projectId: string): string => projects.find((p) => p.id === projectId)?.name ?? '默认'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && results[active]) {
        e.preventDefault()
        onPick(results[active])
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, results, active, onPick, onClose])

  if (!open) return null

  return (
    <div className="search-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-card" role="dialog" aria-modal="true" aria-label="搜索日程">
        <div className="search-input-row">
          <Search size={16} strokeWidth={1.9} className="search-icon" />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="搜索日程标题或备注…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
          />
          <kbd className="search-kbd">Esc</kbd>
        </div>

        <div className="search-results">
          {query.trim() === '' ? (
            <p className="search-empty">输入关键词开始搜索</p>
          ) : results.length === 0 ? (
            <p className="search-empty">没有匹配的日程</p>
          ) : (
            results.map((task, index) => (
              <button
                key={task.id}
                type="button"
                className={cx('search-item', index === active && 'is-active', task.done && 'is-done')}
                onMouseEnter={() => setActive(index)}
                onClick={() => onPick(task)}
              >
                <span className="color-dot color-dot-sm" style={{ background: colorOf(task.projectId) }} />
                <span className="search-title">{task.title}</span>
                <span className="search-meta">
                  {nameOf(task.projectId)} · {task.date}
                </span>
                {index === active ? <CornerDownLeft size={13} className="search-enter" /> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
