import { addMonths, format, parseISO } from 'date-fns'
import { Check, ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { buildMonthGrid, weekdayLabels, type WeekStart } from '../domain/calendar'
import { getDayLabel } from '../domain/lunar'
import { remindDaysOf } from '../domain/reminder'
import { remindLabel } from '../domain/constants'
import type { Project, Task } from '../domain/types'
import { cx } from '../utils'

interface Props {
  dateKey: string
  weekStart: WeekStart
  tasks: Task[]
  allTasks: Task[]
  daysWithTasks: Set<string>
  projects: Project[]
  filter: string | null
  onSelectDate: (key: string) => void
  onFilter: (id: string | null) => void
  onToggle: (id: string) => void
  onEdit: (task: Task) => void
  onNew: (key: string) => void
  onManageProjects: () => void
  colorOf: (projectId: string) => string
}

export function DayView({
  dateKey,
  weekStart,
  tasks,
  allTasks,
  daysWithTasks,
  projects,
  filter,
  onSelectDate,
  onFilter,
  onToggle,
  onEdit,
  onNew,
  onManageProjects,
  colorOf
}: Props) {
  const selected = parseISO(dateKey)
  const [cursor, setCursor] = useState(() => ({ year: selected.getFullYear(), month: selected.getMonth() }))

  // 外部改日期（搜索、通知）时，迷你月历跟着跳
  useEffect(() => {
    const d = parseISO(dateKey)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }, [dateKey])

  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month, weekStart), [cursor, weekStart])

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const task of allTasks) map[task.projectId] = (map[task.projectId] ?? 0) + 1
    return map
  }, [allTasks])

  const list = useMemo(
    () =>
      tasks
        .filter((t) => t.date === dateKey)
        .sort((a, b) => Number(a.done) - Number(b.done) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99')),
    [tasks, dateKey]
  )

  const shift = (delta: number): void => {
    const next = addMonths(new Date(cursor.year, cursor.month, 1), delta)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
  }

  return (
    <div className="dayview">
      <aside className="dayview-side">
        <div className="mini">
          <div className="mini-head">
            <span className="mini-title">
              {cursor.year}年{cursor.month + 1}月
            </span>
            <div className="mini-nav">
              <button type="button" className="icon-btn" aria-label="上个月" onClick={() => shift(-1)}>
                <ChevronLeft size={15} strokeWidth={2} />
              </button>
              <button type="button" className="icon-btn" aria-label="下个月" onClick={() => shift(1)}>
                <ChevronRight size={15} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="mini-week">
            {weekdayLabels(weekStart).map((label) => (
              <span key={label}>{label.replace('周', '')}</span>
            ))}
          </div>

          <div className="mini-grid">
            {weeks.flat().map((day) => (
              <button
                key={day.key}
                type="button"
                className={cx(
                  'mini-day',
                  !day.inMonth && 'is-out',
                  day.key === dateKey && 'is-selected',
                  day.key === format(new Date(), 'yyyy-MM-dd') && 'is-today'
                )}
                onClick={() => {
                  onSelectDate(day.key)
                  setCursor({ year: day.date.getFullYear(), month: day.date.getMonth() })
                }}
              >
                <span className="mini-num">{day.date.getDate()}</span>
                <span className="mini-lunar">{getDayLabel(day.date).text}</span>
                {daysWithTasks.has(day.key) ? <span className="mini-dot" /> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="projects">
          <div className="projects-head">
            <span>我的项目</span>
            <button type="button" className="icon-btn" aria-label="管理项目" onClick={onManageProjects}>
              <Settings2 size={14} strokeWidth={1.8} />
            </button>
          </div>

          <button
            type="button"
            className={cx('project-item', filter === null && 'is-active')}
            onClick={() => onFilter(null)}
          >
            <span className="color-dot" style={{ background: '#C7CBD2' }} />
            <span className="project-name">全部项目</span>
            <span className={cx('project-radio', filter === null && 'is-on')} />
          </button>

          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={cx('project-item', filter === project.id && 'is-active')}
              onClick={() => onFilter(project.id)}
            >
              <span className="color-dot" style={{ background: project.color }} />
              <span className="project-name">{project.name}</span>
              <span className="project-count">{counts[project.id] ?? ''}</span>
              <span className={cx('project-radio', filter === project.id && 'is-on')} />
            </button>
          ))}
        </div>
      </aside>

      <section className="dayview-main">
        <header className="dayview-head">
          <span className="dayview-date">{dateKey}</span>
          <button type="button" className="tb-btn" aria-label="前一天" onClick={() => onSelectDate(format(new Date(selected.getTime() - 86400000), 'yyyy-MM-dd'))}>
            <ChevronLeft size={16} strokeWidth={1.9} />
          </button>
          <button type="button" className="tb-btn" aria-label="后一天" onClick={() => onSelectDate(format(new Date(selected.getTime() + 86400000), 'yyyy-MM-dd'))}>
            <ChevronRight size={16} strokeWidth={1.9} />
          </button>
          <button type="button" className="tb-btn" aria-label="新建日程" onClick={() => onNew(dateKey)}>
            <Plus size={16} strokeWidth={1.9} />
          </button>
        </header>

        <h3 className="dayview-title">日程</h3>

        {list.length === 0 ? (
          <div className="agenda-empty">
            <p>这一天还没有安排</p>
            <button type="button" className="btn btn-sm" onClick={() => onNew(dateKey)}>
              新建一条
            </button>
          </div>
        ) : (
          <ul className="agenda">
            {list.map((task) => (
              <li key={task.id} className={cx('agenda-item', task.done && 'is-done')}>
                <button
                  type="button"
                  className={cx('agenda-check', task.done && 'is-on')}
                  style={{ '--chip': task.color ?? colorOf(task.projectId) } as React.CSSProperties}
                  aria-label={task.done ? '标记为未完成' : '标记为完成'}
                  onClick={() => onToggle(task.id)}
                >
                  <Check size={12} strokeWidth={3} />
                </button>
                <button type="button" className="agenda-body" onClick={() => onEdit(task)}>
                  <span className="agenda-text">{task.title}</span>
                  {task.remindAt ? <span className="agenda-time">{remindLabel(remindDaysOf(task))}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
