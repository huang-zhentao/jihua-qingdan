import { useEffect } from 'react'

interface Props {
  message: string
  actionLabel?: string
  onAction?: () => void
  onClose: () => void
}

export function Toast({ message, actionLabel, onAction, onClose }: Props) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000)
    return () => clearTimeout(timer)
  }, [message, onClose])

  return (
    <div className="toast" role="status">
      <span className="toast-text">{message}</span>
      {actionLabel ? (
        <button type="button" className="toast-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
