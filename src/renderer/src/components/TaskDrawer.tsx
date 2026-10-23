import { AlignLeft, Bell, Calendar, Check, ChevronRight, Circle, Flag, Palette, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PRIORITY_COLORS, PRIORITY_LABELS, REMIND_DAYS, TASK_COLORS, remindLabel } from '../domain/constants'
import { remindAtFor, remindDaysOf } from '../domain/reminder'
import type { Priority, Project, Task, TaskDraft } from '../domain/types'
import { cx } from '../utils'
import { ConfirmDialog } from './ConfirmDialog'
import { Markdown } from './Markdown'

interface Props {
  open: boolean
  task: Task | null
  defaultDate: string
  projects: Project[]
  defaultProjectId: string
  onClose: () => void
  onSave: (draft: TaskDraft, done: boolean) => void
  onToggleDone: (taskId: string) => void
  onDelete: () => void
}

function randomColor(): string {
  return TASK_COLORS[Math.floor(Math.random() * TASK_COLORS.length)]
}

export function TaskDrawer({
  open,
  task,
  defaultDate,
  projects,
  defaultProjectId,
  onClose,
  onSave,
  onToggleDone,
  onDelete
}: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [priority, setPriority] = useState<Priority>(0)
  const [color, setColor] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState(false)
  const [remindDays, setRemindDays] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setDate(task?.date ?? defaultDate)
    setProjectId(task?.projectId ?? defaultProjectId)
    setPriority(task?.priority ?? 0)
    setColor(task?.color ?? randomColor())
    setNotes(task?.notes ?? '')
    setPreview(false)
    setRemindDays(remindDaysOf(task))
    setDone(task?.done ?? false)
    setError('')
    setConfirming(false)
  }, [open, task, defaultDate, defaultProjectId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !confirming) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, confirming, onClose])

  const save = (): void => {
    const value = title.trim()
    if (!value) {
      setError('先写点什么吧')
      return
    }
    onSave(
      {
        title: value,
        date,
        remindAt: remindAtFor(date, remindDays),
        projectId,
        priority,
        color: color ?? undefined,
        notes: notes.trim() || undefined
      },
      done
    )
    setError('')
  }

  const toggleDone = (): void => {
    const next = !done
    setDone(next)
    if (task) onToggleDone(task.id)
  }

  return (
    <>
      <div className={cx('drawer-scrim', open && 'is-open')} onClick={onClose} />

      <aside className={cx('drawer', open && 'is-open')} aria-hidden={!open}>
        <div className="drawer-head">
          <button type="button" className="icon-btn" aria-label="收起" onClick={onClose}>
            <ChevronRight size={18} strokeWidth={1.8} />
          </button>

          <div className="drawer-actions">
            {task ? (
              <button type="button" className="btn btn-delete" onClick={() => setConfirming(true)}>
                删除
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={save}>
              {task ? '保存' : '创建'}
            </button>
          </div>
        </div>

        <div className="drawer-body">
          <div className="drawer-title-row">
            <button
              type="button"
              className={cx('title-dot', done && 'is-done')}
              aria-label={done ? '标记为未完成' : '标记为完成'}
              title={done ? '标记为未完成' : '标记为完成'}
              style={done ? undefined : { color: color ?? '#C7CBD2' }}
              onClick={toggleDone}
            >
              {done ? <Check size={12} strokeWidth={3} /> : <Circle size={16} strokeWidth={1.6} />}
            </button>
            <input
              className="drawer-title"
              placeholder="记些重要的事情吧~"
              value={title}
              maxLength={200}
              autoFocus
              onChange={(e) => {
                setTitle(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  save()
                }
              }}
            />
          </div>
          {error ? <p className="drawer-error">{error}</p> : null}

          <div className="drawer-fields">
            <label className="drow">
              <span className="dlabel">
                <Tag size={13} strokeWidth={1.7} />
                项目分类
              </span>
              <select className="dcontrol" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="drow">
              <span className="dlabel">
                <Flag size={13} strokeWidth={1.7} />
                优先级
              </span>
              <div className="dcontrol priority-group">
                {([0, 1, 2, 3] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={cx('priority-btn', priority === p && 'is-active')}
                    style={{ '--p': PRIORITY_COLORS[p] } as React.CSSProperties}
                    onClick={() => setPriority(p)}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="drow">
              <span className="dlabel">
                <Palette size={13} strokeWidth={1.7} />
                背景色
              </span>
              <div className="dcontrol color-group">
                <button
                  type="button"
                  className={cx('color-choice is-auto', color === null && 'is-active')}
                  onClick={() => setColor(null)}
                  title="跟随项目"
                />
                {TASK_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cx('color-choice', color === c && 'is-active')}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            <label className="drow">
              <span className="dlabel">
                <Calendar size={13} strokeWidth={1.7} />
                日期
              </span>
              <input className="dcontrol" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            <label className="drow">
              <span className="dlabel">
                <Bell size={13} strokeWidth={1.7} />
                提醒时间
              </span>
              <select
                className="dcontrol"
                value={remindDays}
                onChange={(e) => setRemindDays(Number(e.target.value))}
              >
                {REMIND_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {remindLabel(d)}
                  </option>
                ))}
              </select>
            </label>

            <div className="drow is-block">
              <div className="dnotes-head">
                <span className="dlabel">
                  <AlignLeft size={13} strokeWidth={1.7} />
                  备注
                </span>
                {notes.trim() ? (
                  <button type="button" className="dnotes-toggle" onClick={() => setPreview((v) => !v)}>
                    {preview ? '编辑' : '预览'}
                  </button>
                ) : null}
              </div>

              {preview ? (
                <div className="dnotes-preview">
                  <Markdown text={notes} />
                </div>
              ) : (
                <textarea
                  className="dnotes"
                  rows={8}
                  placeholder="支持简单 Markdown：**粗体**、- 列表、1. 编号、# 标题、`代码`（800 字）"
                  value={notes}
                  maxLength={800}
                  onChange={(e) => setNotes(e.target.value)}
                />
              )}
            </div>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={confirming}
        message="删除事项后，事项内的所有数据（包含备注等）将全部删除且不可恢复"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          onDelete()
        }}
      />
    </>
  )
}
