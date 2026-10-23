import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PROJECT_COLORS } from '../domain/defaults'
import type { Project } from '../domain/types'
import { Modal } from './Modal'

interface Props {
  open: boolean
  projects: Project[]
  taskCounts: Record<string, number>
  onClose: () => void
  onAdd: (name: string, color: string) => void
  onUpdate: (id: string, patch: Partial<Omit<Project, 'id'>>) => void
  onDelete: (id: string) => void
}

export function ProjectDialog({ open, projects, taskCounts, onClose, onAdd, onUpdate, onDelete }: Props) {
  const [newName, setNewName] = useState('')
  const [paletteFor, setPaletteFor] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const add = (): void => {
    const name = newName.trim()
    if (!name) return
    const used = new Set(projects.map((p) => p.color))
    const color = PROJECT_COLORS.find((c) => !used.has(c)) ?? PROJECT_COLORS[1]
    onAdd(name, color)
    setNewName('')
  }

  return (
    <Modal
      open={open}
      title="管理项目"
      width={480}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        </>
      }
    >
      <div className="project-list">
        {projects.map((project) => {
          const count = taskCounts[project.id] ?? 0
          const isDefault = project.id === 'default'
          return (
            <div className="project-row" key={project.id}>
              <button
                type="button"
                className="color-dot"
                style={{ background: project.color }}
                aria-label="修改颜色"
                onClick={() => setPaletteFor(paletteFor === project.id ? null : project.id)}
              />

              <input
                className="input input-flat"
                value={project.name}
                maxLength={20}
                onChange={(e) => onUpdate(project.id, { name: e.target.value })}
              />

              <span className="project-count">{count > 0 ? `${count} 条` : ''}</span>

              <button
                type="button"
                className="icon-btn icon-btn-danger"
                aria-label={`删除项目 ${project.name}`}
                disabled={isDefault}
                title={isDefault ? '默认项目不能删除' : '删除项目（其中的日程会移到「默认」）'}
                onClick={() => setConfirmId(project.id)}
              >
                <Trash2 size={15} strokeWidth={1.8} />
              </button>

              {paletteFor === project.id ? (
                <div className="palette">
                  {PROJECT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={color === project.color ? 'palette-dot is-active' : 'palette-dot'}
                      style={{ background: color }}
                      aria-label={color}
                      onClick={() => {
                        onUpdate(project.id, { color })
                        setPaletteFor(null)
                      }}
                    />
                  ))}
                </div>
              ) : null}

              {confirmId === project.id ? (
                <div className="inline-confirm">
                  <span>删除后，这个项目下的 {count} 条日程会移动到「默认」。</span>
                  <button type="button" className="btn btn-sm" onClick={() => setConfirmId(null)}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      onDelete(project.id)
                      setConfirmId(null)
                    }}
                  >
                    删除
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="project-add">
        <input
          className="input"
          placeholder="新项目名称，回车添加"
          value={newName}
          maxLength={20}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="btn btn-primary" onClick={add} disabled={!newName.trim()}>
          <Plus size={15} strokeWidth={2} />
          添加
        </button>
      </div>
    </Modal>
  )
}
