import { Check, ChevronDown, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Project } from '../domain/types'

interface Props {
  projects: Project[]
  value: string | null
  onChange: (id: string | null) => void
  onManage: () => void
}

export function ProjectFilter({ projects, value, onChange, onManage }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = projects.find((p) => p.id === value) ?? null

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="filter" ref={ref}>
      <button type="button" className="filter-btn" onClick={() => setOpen((v) => !v)}>
        <span className="color-dot color-dot-sm" style={{ background: current?.color ?? '#C7CBD2' }} />
        <span className="filter-name">{current?.name ?? '全部项目'}</span>
        <ChevronDown size={13} strokeWidth={2} />
      </button>

      {open ? (
        <div className="filter-menu" role="menu">
          <button
            type="button"
            className={value === null ? 'filter-item is-active' : 'filter-item'}
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
          >
            <span className="color-dot color-dot-sm" style={{ background: '#C7CBD2' }} />
            <span>全部项目</span>
            {value === null ? <Check size={14} className="filter-check" /> : null}
          </button>

          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={value === project.id ? 'filter-item is-active' : 'filter-item'}
              onClick={() => {
                onChange(project.id)
                setOpen(false)
              }}
            >
              <span className="color-dot color-dot-sm" style={{ background: project.color }} />
              <span>{project.name}</span>
              {value === project.id ? <Check size={14} className="filter-check" /> : null}
            </button>
          ))}

          <div className="filter-divider" />
          <button
            type="button"
            className="filter-item"
            onClick={() => {
              setOpen(false)
              onManage()
            }}
          >
            <Settings2 size={14} strokeWidth={1.8} />
            <span>管理项目</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
