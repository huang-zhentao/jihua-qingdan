import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../utils'

interface Props {
  year: number
  month: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onAdd: () => void
  onPick: (year: number, month: number) => void
  onSync?: () => void
  syncing?: boolean
  syncTitle?: string
  right?: ReactNode
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i)

export function MonthToolbar({
  year,
  month,
  onPrev,
  onNext,
  onToday,
  onAdd,
  onPick,
  onSync,
  syncing,
  syncTitle,
  right
}: Props) {
  const [open, setOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(year)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setPickerYear(year)
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, year])

  return (
    <div className="toolbar">
      <div className="month-picker" ref={ref}>
        <button type="button" className="month-title" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {year}年{month + 1}月
          {open ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
        </button>

        {open ? (
          <div className="mp-pop">
            <div className="mp-years">
              <button type="button" className="icon-btn" aria-label="上一年" onClick={() => setPickerYear((y) => y - 1)}>
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <span className="mp-year">{pickerYear}年</span>
              <button type="button" className="icon-btn" aria-label="下一年" onClick={() => setPickerYear((y) => y + 1)}>
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>

            <div className="mp-grid">
              {MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={cx('mp-month', pickerYear === year && m === month && 'is-active')}
                  onClick={() => {
                    onPick(pickerYear, m)
                    setOpen(false)
                  }}
                >
                  {m + 1}月
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="toolbar-actions">
        <button type="button" className="tb-btn" aria-label="上个月" onClick={onPrev}>
          <ChevronLeft size={16} strokeWidth={1.9} />
        </button>
        <button type="button" className="tb-btn" aria-label="下个月" onClick={onNext}>
          <ChevronRight size={16} strokeWidth={1.9} />
        </button>
        <button type="button" className="tb-btn tb-today" aria-label="回到今天" title="回到今天 (T)" onClick={onToday}>
          今
        </button>
        <button type="button" className="tb-btn" aria-label="新建日程" title="新建日程 (N)" onClick={onAdd}>
          <Plus size={16} strokeWidth={1.9} />
        </button>
      </div>

      <span className="toolbar-spacer" />
      {onSync ? (
        <button
          type="button"
          className="tb-btn tb-sync"
          aria-label="同步"
          title={syncTitle ?? '立即同步'}
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw size={15} strokeWidth={1.9} className={syncing ? 'spin' : undefined} />
        </button>
      ) : null}
      {right}
    </div>
  )
}
