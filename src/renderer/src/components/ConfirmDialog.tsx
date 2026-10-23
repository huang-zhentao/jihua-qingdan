import { useEffect } from 'react'

interface Props {
  open: boolean
  message: string
  cancelText?: string
  confirmText?: string
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  message,
  cancelText = '放弃',
  confirmText = '确认删除',
  onCancel,
  onConfirm
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
      if (e.key === 'Enter') {
        e.stopPropagation()
        onConfirm()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  return (
    <div className="confirm-mask" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-card" role="alertdialog" aria-modal="true">
        <p className="confirm-text">{message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onCancel}>
            {cancelText}
          </button>
          <button type="button" className="btn btn-danger-solid" onClick={onConfirm} autoFocus>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
