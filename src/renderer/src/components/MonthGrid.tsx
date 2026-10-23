import { getISOWeek } from 'date-fns'
import { Check } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { isWeekend, weekdayLabels, type CalendarDay, type WeekStart } from '../domain/calendar'
import { getHolidayMark } from '../domain/holidays'
import { getDayLabel } from '../domain/lunar'
import type { Project, Task } from '../domain/types'
import { cx } from '../utils'

/** 任务条尺寸（与 styles.css 保持一致），用来算一格能塞下几条 */
const METRICS = {
  normal: { chip: 22, gap: 3, more: 16, overhead: 40 },
  compact: { chip: 16, gap: 2, more: 13, overhead: 30 }
}

/** 按格子实际高度算「显示几条 + 溢出几条」，保证 +N 项不截断 */
function fitChips(rowHeight: number, compact: boolean, count: number): { visible: number; rest: number } {
  const m = compact ? METRICS.compact : METRICS.normal
  const row = rowHeight > 0 ? rowHeight : 150
  const avail = Math.max(0, row - m.overhead)
  const maxNoMore = Math.max(1, Math.floor((avail + m.gap) / (m.chip + m.gap)))
  if (count <= maxNoMore) return { visible: count, rest: 0 }
  const maxWithMore = Math.max(0, Math.floor((avail - m.more - m.gap) / (m.chip + m.gap)))
  const visible = Math.min(count, maxWithMore)
  return { visible, rest: count - visible }
}

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
      {task.time ? <span className="chip-time">{task.time}</span> : null}
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
  rowHeight,
  compact,
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
  rowHeight: number
  compact: boolean
  onSelect: (key: string) => void
  onEditTask: (task: Task) => void
  onToggleTask: (id: string) => void
  onNewTask: (key: string) => void
  onShowMore: (key: string, anchor: { left: number; top: number }) => void
}) {
  const label = getDayLabel(day.date)
  const holiday = getHolidayMark(day.date)
  const { visible: visibleCount, rest } = fitChips(rowHeight, compact, tasks.length)
  const visible = tasks.slice(0, visibleCount)

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
        <span
          className={cx(
            'cell-lunar',
            label.kind !== 'lunar-day' && 'is-special',
            label.kind === 'festival' && 'is-festival',
            label.kind === 'jieqi' && 'is-jieqi'
          )}
        >
          {label.text}
        </span>
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
            +{rest} 项
          </button>
        ) : null}
      </div>
    </div>
  )
}

interface GridProps {
  weeks: CalendarDay[][]
  weekStart: WeekStart
  compact: boolean
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
  compact,
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
  const gridRef = useRef<HTMLDivElement>(null)
  const [rowHeight, setRowHeight] = useState(0)

  // 行高随窗口/周数变化：实时量出来，紧凑模式才能「一屏塞满」
  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = (): void => setRowHeight(el.clientHeight / weeks.length)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [weeks.length])
  const colorOf = (projectId: string): string =>
    projects.find((p) => p.id === projectId)?.color ?? '#9AA4B2'

  return (
    <div className={cx('calendar', compact && 'is-compact')}>
      <div className="weekheader">
        {labels.map((label, index) => (
          <div key={label} className={cx('weekheader-cell', isWeekend((weekStart + index) % 7) && 'is-weekend')}>
            {label}
          </div>
        ))}
      </div>

      <div className="cal-wrap">
        <div className="weeknums" aria-hidden="true">
          {weeks.map((week) => (
            <div key={week[0].key} className="weeknum">
              {getISOWeek(week[weekStart === 1 ? 0 : 1].date)}
            </div>
          ))}
        </div>

        <div
          ref={gridRef}
          className="grid"
          role="grid"
          style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
        >
          {weeks.flat().map((day) => (
            <DayCell
              key={day.key}
              day={day}
              tasks={tasksByDate[day.key] ?? []}
              projectColor={colorOf}
              selected={day.key === selectedKey}
              today={day.key === todayKey}
              rowHeight={rowHeight}
              compact={compact}
              onSelect={onSelect}
              onEditTask={onEditTask}
              onToggleTask={onToggleTask}
              onNewTask={onNewTask}
              onShowMore={onShowMore}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
