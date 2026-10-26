import { Check, ChevronLeft, Inbox, Sun } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import type { Project, Task } from '../domain/types'
import { cx } from '../utils'

interface Props {
  tasks: Task[]
  projects: Project[]
  filterLabel?: string
  draggingId: string | null
  width: number
  onAdd: (title: string) => void
  onOpen: (task: Task) => void
  onToggle: (id: string) => void
  onScheduleToday: (id: string) => void
  onDragStartTask: (id: string) => void
  onDragEndTask: () => void
  onDropToInbox: (taskId: string) => void
  onCollapse: () => void
  onResize: (width: number) => void
}

const MIN_WIDTH = 180
const MAX_WIDTH = 360
const DEFAULT_WIDTH = 240

export function InboxPanel({
  tasks,
  projects,
  filterLabel,
  draggingId,
  width,
  onAdd,
  onOpen,
  onToggle,
  onScheduleToday,
  onDragStartTask,
  onDragEndTask,
  onDropToInbox,
  onCollapse,
  onResize
}: Props) {
  const [title, setTitle] = useState('')
  const [over, setOver] = useState(false)
  const [localWidth, setLocalWidth] = useState<number | null>(null)
  const startRef = useRef({ x: 0, width: width })
  const currentRef = useRef(width)

  // 拖动结束后设置里会写入新宽度，等它生效再清掉临时值，避免闪一下
  useEffect(() => {
    if (localWidth !== null && Math.abs(width - localWidth) < 1) setLocalWidth(null)
  }, [width, localWidth])

  const shownWidth = localWidth ?? width

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
    <aside className="inbox" style={{ width: shownWidth }}>
      <div
        className="inbox-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整收集箱宽度"
        title="拖动调整宽度，双击恢复默认"
        onMouseDown={startResize}
        onDoubleClick={() => onResize(DEFAULT_WIDTH)}
      />
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
    </aside>
  )
}
