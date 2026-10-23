import { Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import { isWeekend, weekdayLabels, type CalendarDay, type WeekStart } from '../domain/calendar'
import { getHolidayMark } from '../domain/holidays'
import { getDayLabel } from '../domain/lunar'
import type { Project, Task } from '../domain/types'
import { cx } from '../utils'

const MAX_CHIPS = 4

function TaskChip({
  task,
  color,
  onEdit,
  onToggle
}: {
  task: Task
  color: string
  onEdit: () => void
  onToggle: () => void
}) {
  return (
    <div
      className={cx('chip', task.done && 'is-done')}
      style={{ '--chip': color } as CSSProperties}
      title={task.title}
      onClick={(e) => {
        e.stopPropagation()
        onEdit()
      }}
    >
      <span className="chip-text">{task.title}</span>
      <button
        type="button"
        className={cx('chip-check', task.done && 'is-on')}
        aria-label={task.done ? '标记为未完成' : '标记为完成'}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        <Check size={10} strokeWidth={3} />
      </button>
    </div>
  )
}

function DayCell({
  day,
  tasks,
  projectColor,
  selected,
  today,
  onSelect,
  onEditTask,
  onToggleTask,
  onNewTask,
  onShowMore
}: {
  day: CalendarDay
  tasks: Task[]
  projectColor: (id: string) => string
  selected: boolean
  today: boolean
  onSelect: (key: string) => void
  onEditTask: (task: Task) => void
  onToggleTask: (id: string) => void
  onNewTask: (key: string) => void
  onShowMore: (key: string, anchor: { left: number; top: number }) => void
}) {
  const label = getDayLabel(day.date)
  const holiday = getHolidayMark(day.date)
  const visible = tasks.slice(0, MAX_CHIPS)
  const rest = tasks.length - visible.length

  return (
    <div
      className={cx(
        'cell',
        !day.inMonth && 'is-out',
        today && 'is-today',
        selected && 'is-selected',
        isWeekend(day.weekday) && 'is-weekend'
      )}
      role="gridcell"
      aria-selected={selected}
      onClick={() => onSelect(day.key)}
      onDoubleClick={() => onNewTask(day.key)}
      title="双击新建日程"
    >
      <div className="cell-head">
        <span className="cell-date">{day.date.getDate()}</span>
        <span className={cx('cell-lunar', label.kind !== 'lunar-day' && 'is-special')}>{label.text}</span>
        {holiday ? (
          <span className={cx('cell-badge', holiday.type)} title={holiday.name}>
            {holiday.type === 'rest' ? '休' : '班'}
          </span>
        ) : null}
      </div>

      <div className="cell-body">
        {day.inMonth &&
          visible.map((task) => (
            <TaskChip
              key={task.id}
              task={task}
              color={task.color ?? projectColor(task.projectId)}
              onEdit={() => onEditTask(task)}
              onToggle={() => onToggleTask(task.id)}
            />
          ))}
        {day.inMonth && rest > 0 ? (
          <button
            type="button"
            className="cell-more"
            onClick={(e) => {
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              onShowMore(day.key, { left: rect.left, top: rect.bottom + 6 })
            }}
          >
            +{rest}
          </button>
        ) : null}
      </div>
    </div>
  )
}

interface GridProps {
  weeks: CalendarDay[][]
  weekStart: WeekStart
  selectedKey: string
  todayKey: string
  tasksByDate: Record<string, Task[]>
  projects: Project[]
  onSelect: (key: string) => void
  onEditTask: (task: Task) => void
  onToggleTask: (id: string) => void
  onNewTask: (key: string) => void
  onShowMore: (key: string, anchor: { left: number; top: number }) => void
}

export function MonthGrid({
  weeks,
  weekStart,
  selectedKey,
  todayKey,
  tasksByDate,
  projects,
  onSelect,
  onEditTask,
  onToggleTask,
  onNewTask,
  onShowMore
}: GridProps) {
  const labels = weekdayLabels(weekStart)
  const colorOf = (projectId: string): string =>
    projects.find((p) => p.id === projectId)?.color ?? '#9AA4B2'

  return (
    <div className="calendar">
      <div className="weekheader">
        {labels.map((label, index) => (
          <div key={label} className={cx('weekheader-cell', isWeekend((weekStart + index) % 7) && 'is-weekend')}>
            {label}
          </div>
        ))}
      </div>

      <div className="grid" role="grid" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.flat().map((day) => (
          <DayCell
            key={day.key}
            day={day}
            tasks={tasksByDate[day.key] ?? []}
            projectColor={colorOf}
            selected={day.key === selectedKey}
            today={day.key === todayKey}
            onSelect={onSelect}
            onEditTask={onEditTask}
            onToggleTask={onToggleTask}
            onNewTask={onNewTask}
            onShowMore={onShowMore}
          />
        ))}
      </div>
    </div>
  )
}
