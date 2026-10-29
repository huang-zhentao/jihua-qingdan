import { Check, ChevronLeft, Inbox, Sun } from 'lucide-react'
import { addDays, format, parseISO, startOfWeek, subWeeks } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import type { Project, Task } from '../domain/types'
import { cx } from '../utils'

interface Props {
  tasks: Task[]
  projects: Project[]
  filterLabel?: string
  draggingId: string | null
  width: number
  /** 每天完成的任务数，key = yyyy-MM-dd */
  doneCounts: Record<string, number>
  todayKey: string
  weekStart: 0 | 1
  showHeat: boolean
  onAdd: (title: string) => void
  onOpen: (task: Task) => void
  onToggle: (id: string) => void
  onScheduleToday: (id: string) => void
  onDragStartTask: (id: string) => void
  onDragEndTask: () => void
  onDropToInbox: (taskId: string) => void
  onCollapse: () => void
  onResize: (width: number) => void
  onJumpDate: (dateKey: string) => void
}

const MIN_WIDTH = 180
const MAX_WIDTH = 360
const DEFAULT_WIDTH = 240

const CELL = 14
const GAP = 4
const LABEL_W = 16

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

function levelOf(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}

export function InboxPanel({
  tasks,
  projects,
  filterLabel,
  draggingId,
  width,
  doneCounts,
  todayKey,
  weekStart,
  showHeat,
  onAdd,
  onOpen,
  onToggle,
  onScheduleToday,
  onDragStartTask,
  onDragEndTask,
  onDropToInbox,
  onCollapse,
  onResize,
  onJumpDate
}: Props) {
  const [title, setTitle] = useState('')
  const [over, setOver] = useState(false)
  const [localWidth, setLocalWidth] = useState<number | null>(null)
  const [panelHeight, setPanelHeight] = useState(780)
  const [tip, setTip] = useState<{ text: string; left: number; top: number; below?: boolean } | null>(null)
  const startRef = useRef({ x: 0, width: width })
  const currentRef = useRef(width)
  const asideRef = useRef<HTMLElement>(null)

  // 拖动结束后设置里会写入新宽度，等它生效再清掉临时值，避免闪一下
  useEffect(() => {
    if (localWidth !== null && Math.abs(width - localWidth) < 1) setLocalWidth(null)
  }, [width, localWidth])

  // 面板太矮时收起热力图，只留标题和图例
  useEffect(() => {
    const el = asideRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setPanelHeight(el.clientHeight))
    ro.observe(el)
    setPanelHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const shownWidth = localWidth ?? width

  const weekCount = Math.max(
    8,
    Math.min(16, Math.floor((shownWidth - LABEL_W - 10 + GAP) / (CELL + GAP)))
  )
  const showGrid = panelHeight >= 480

  const columns = useMemo(() => {
    const today = parseISO(todayKey)
    const start = startOfWeek(today, { weekStartsOn: weekStart === 1 ? 1 : 0 })
    const first = subWeeks(start, weekCount - 1)
    const cols: Array<Array<{ key: string; count: number; future: boolean }>> = []
    for (let w = 0; w < weekCount; w++) {
      const days: Array<{ key: string; count: number; future: boolean }> = []
      for (let d = 0; d < 7; d++) {
        const date = addDays(first, w * 7 + d)
        const key = format(date, 'yyyy-MM-dd')
        days.push({ key, count: doneCounts[key] ?? 0, future: key > todayKey })
      }
      cols.push(days)
    }
    return cols
  }, [todayKey, weekCount, weekStart, doneCounts])

  const monthLabels = useMemo(() => {
    const labels: Array<{ col: number; text: string }> = []
    columns.forEach((days, i) => {
      const month = parseISO(days[0].key).getMonth()
      if (i === 0 || month !== parseISO(columns[i - 1][0].key).getMonth()) {
        labels.push({ col: i, text: `${month + 1}月` })
      }
    })
    return labels
  }, [columns])

  const weekTotal = columns[columns.length - 1].reduce((sum, d) => sum + (d.future ? 0 : d.count), 0)
  const weekdays = Array.from({ length: 7 }, (_, i) => WEEKDAY_CN[(weekStart + i) % 7])

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    startRef.current = { x: e.clientX, width: shownWidth }
    currentRef.current = shownWidth
    document.body.classList.add('is-resizing')

    const onMove = (ev: MouseEvent): void => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startRef.current.width + ev.clientX - startRef.current.x))
      currentRef.current = next
      setLocalWidth(next)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('is-resizing')
      onResize(Math.round(currentRef.current))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const colorOf = (task: Task): string =>
    task.color ?? projects.find((p) => p.id === task.projectId)?.color ?? '#9AA4B2'

  const submit = (): void => {
    const value = title.trim()
    if (!value) return
    onAdd(value)
    setTitle('')
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setOver(false)
    const id = e.dataTransfer.getData('text/task-id')
    if (id) onDropToInbox(id)
    onDragEndTask()
  }

  return (
    <aside className="inbox" ref={asideRef} style={{ width: shownWidth }}>
      <div
        className="inbox-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整收集箱宽度"
        title="拖动调整宽度，双击恢复默认"
        onMouseDown={startResize}
        onDoubleClick={() => onResize(DEFAULT_WIDTH)}
      />

      <div className="inbox-top">
        <header className="inbox-head">
          <Inbox size={15} strokeWidth={1.9} />
          <span className="inbox-title-text">收集箱</span>
          <span className="inbox-count">{tasks.length}</span>
          {filterLabel ? <span className="inbox-filter">{filterLabel}</span> : null}
          <button
            type="button"
            className="inbox-collapse"
            aria-label="收起收集箱"
            title="收起收集箱"
            onClick={onCollapse}
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
        </header>

        <div className="inbox-add">
          <input
            className="inbox-input"
            placeholder="记一条，稍后安排"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
        </div>

        <div
          className={cx('inbox-list', over && 'is-over')}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('text/task-id')) return
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={handleDrop}
        >
          {tasks.length === 0 ? (
            <div className="inbox-empty">
              <p>暂时没有未排期的任务</p>
              <p className="inbox-empty-sub">想到什么先记在这里，拖到右边日历的某天即可安排</p>
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className={cx('inbox-item', draggingId === task.id && 'is-dragging')}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/task-id', task.id)
                  e.dataTransfer.effectAllowed = 'move'
                  onDragStartTask(task.id)
                }}
                onDragEnd={onDragEndTask}
                onClick={() => onOpen(task)}
              >
                <button
                  type="button"
                  className={cx('inbox-check', task.done && 'is-done')}
                  aria-label={task.done ? '标记为未完成' : '标记为完成'}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(task.id)
                  }}
                >
                  <Check size={10} strokeWidth={3} />
                </button>

                <span className={cx('inbox-item-title', task.done && 'is-done')}>{task.title}</span>

                <span className="inbox-dot" style={{ background: colorOf(task) } as CSSProperties} />

                <button
                  type="button"
                  className="inbox-today"
                  title="安排到今天"
                  aria-label="安排到今天"
                  onClick={(e) => {
                    e.stopPropagation()
                    onScheduleToday(task.id)
                  }}
                >
                  <Sun size={12} strokeWidth={2} />
                </button>
              </div>
            ))
          )}
        </div>

        <footer className="inbox-foot">拖动到右边日期即可安排</footer>
      </div>

      {showHeat ? (<div className="inbox-heat">
        <div className="heat-head">
          <span className="heat-title">完成情况</span>
          <span className="heat-sub">近 {weekCount} 周</span>
        </div>

        {showGrid ? (
          <div className="heat-body">
            <div className="heat-months" style={{ marginLeft: LABEL_W }}>
              {monthLabels.map((m) => (
                <span key={`${m.col}-${m.text}`} style={{ left: m.col * (CELL + GAP) }}>
                  {m.text}
                </span>
              ))}
            </div>

            <div className="heat-grid">
              <div className="heat-weekdays">
                {weekdays.map((label, i) => (
                  <span key={i} className={i % 2 === 0 ? '' : 'is-blank'}>
                    {label}
                  </span>
                ))}
              </div>
              <div
                className="heat-cells"
                style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gridAutoColumns: `${CELL}px`, gap: GAP }}
                onMouseLeave={() => setTip(null)}
              >
                {columns.map((days, ci) =>
                  days.map((d, di) => {
                    const level = d.future ? -1 : levelOf(d.count)
                    return (
                      <div
                        key={d.key}
                        className={cx(
                          'heat-cell',
                          level === 0 && 'lv0',
                          level === 1 && 'lv1',
                          level === 2 && 'lv2',
                          level === 3 && 'lv3',
                          level === 4 && 'lv4',
                          d.key === todayKey && 'is-today',
                          d.future && 'is-future'
                        )}
                        onMouseEnter={(e) => {
                          if (level < 0) return
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          const host = (e.currentTarget.closest('.heat-body') as HTMLElement)?.getBoundingClientRect()
                          if (!host) return
                          const top = rect.top - host.top
                          const below = top < 24
                          setTip({
                            text: `${d.key.slice(5).replace('-', '月')}日 · ${d.count ? `完成 ${d.count} 条` : '没有完成'}`,
                            left: rect.left - host.left + CELL / 2,
                            top: below ? top + CELL + 6 : top - 6,
                            below
                          })
                        }}
                        onClick={() => {
                          if (level >= 0) onJumpDate(d.key)
                        }}
                        role={level >= 0 ? 'button' : undefined}
                        data-col={ci}
                        data-row={di}
                      />
                    )
                  })
                )}
              </div>
            </div>

            {tip ? (
              <div className={cx('heat-tip', tip.below && 'is-below')} style={{ left: tip.left, top: tip.top }}>
                {tip.text}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="heat-foot">
          <span className="heat-week">
            本周完成 <b>{weekTotal}</b> 条
          </span>
          <span className="heat-legend">
            Less
            <i className="heat-swatch lv0" />
            <i className="heat-swatch lv1" />
            <i className="heat-swatch lv2" />
            <i className="heat-swatch lv3" />
            <i className="heat-swatch lv4" />
            More
          </span>
        </div>
      </div>) : null}
    </aside>
  )
}
