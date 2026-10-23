import { useEffect, useState, type FormEvent } from 'react'
import type { Project, Task } from '../domain/types'
import { Modal } from './Modal'

interface Props {
  open: boolean
  task: Task | null
  defaultDate: string
  projects: Project[]
  defaultProjectId: string
  onClose: () => void
  onSave: (draft: { title: string; date: string; projectId: string; notes?: string }) => void
  onDelete: () => void
}

export function TaskDialog({
  open,
  task,
  defaultDate,
  projects,
  defaultProjectId,
  onClose,
  onSave,
  onDelete
}: Props) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setDate(task?.date ?? defaultDate)
    setProjectId(task?.projectId ?? defaultProjectId)
    setNotes(task?.notes ?? '')
    setError('')
  }, [open, task, defaultDate, defaultProjectId])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const value = title.trim()
    if (!value) {
      setError('标题不能为空')
      return
    }
    if (!date) {
      setError('请选择日期')
      return
    }
    onSave({ title: value, date, projectId, notes: notes.trim() || undefined })
  }

  return (
    <Modal
      open={open}
      title={task ? '编辑日程' : '新建日程'}
      onClose={onClose}
      footer={
        <>
          {task ? (
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              删除
            </button>
          ) : null}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" form="task-form" className="btn btn-primary">
            保存
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit}>
        <input
          className="input input-title"
          placeholder="要做什么？"
          value={title}
          autoFocus
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value)
            setError('')
          }}
        />

        <div className="field-row">
          <label className="field">
            <span className="field-label">日期</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">项目</span>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field-label">备注</span>
          <textarea
            className="input textarea"
            rows={3}
            placeholder="补充说明（可选）"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}
      </form>
    </Modal>
  )
}
