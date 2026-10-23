import { Check, Plus } from 'lucide-react'
import { useEffect, useRef, type CSSProperties } from 'react'
import type { Project, Task } from '../domain/types'
import { cx } from '../utils'
import { Markdown } from './Markdown'

interface Props {
  dateKey: string
  tasks: Task[]
  projects: Project[]
  anchor: { left: number; top: number }
  onClose: () => void
  onEdit: (task: Task) => void
  onToggle: (id: string) => void
  onNew: () => void
}

const WIDTH = 240
const MAX_HEIGHT = 320

export function DayPeek({ dateKey, tasks, projects, anchor, onClose, onEdit, onToggle, onNew }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const colorOf = (projectId: string): string => projects.find((p) => p.id === projectId)?.color ?? '#9AA4B2'

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8))
  const top = Math.max(40, Math.min(anchor.top, window.innerHeight - MAX_HEIGHT - 16))

  return (
    <div className="peek" ref={ref} style={{ left, top, width: WIDTH }}>
      <div className="peek-head">
        <span>{dateKey}</span>
        <span className="peek-count">共 {tasks.length} 条</span>
      </div>

      <div className="peek-list">
        {tasks.map((task) => (
          <div className="peek-item" key={task.id} onClick={() => onEdit(task)}>
            <button
              type="button"
              className={cx('peek-check', task.done && 'is-done')}
              aria-label={task.done ? '标记为未完成' : '标记为完成'}
              style={{ '--chip': task.color ?? colorOf(task.projectId) } as CSSProperties}
              onClick={(e) => {
                e.stopPropagation()
                onToggle(task.id)
              }}
            >
              <Check size={11} strokeWidth={3} />
            </button>
            <span className={cx('peek-title', task.done && 'is-done')}>{task.title}</span>
            {task.notes ? (
              <div className="peek-notes">
                <Markdown text={task.notes} />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <button type="button" className="peek-add" onClick={onNew}>
        <Plus size={13} strokeWidth={2} />
        在这一天新建
      </button>
    </div>
  )
}
