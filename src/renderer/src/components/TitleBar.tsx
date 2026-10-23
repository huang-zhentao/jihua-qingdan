import { Minus, Square, X } from 'lucide-react'

function LogoMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect width="16" height="16" rx="4" fill="#FF7A1A" />
      <circle cx="8" cy="8" r="3" fill="#fff" />
      <g stroke="#fff" strokeWidth="1.2" strokeLinecap="round">
        <path d="M8 1.7v1.6M8 12.7v1.6M1.7 8h1.6M12.7 8h1.6" />
      </g>
    </svg>
  )
}

export function TitleBar() {
  const isMac = window.api?.platform === 'darwin'

  return (
    <header className={isMac ? 'titlebar is-mac' : 'titlebar'}>
      <span className="titlebar-icon">
        <LogoMark />
      </span>
      <span className="titlebar-title">计划清单</span>

      {!isMac && (
        <div className="titlebar-controls">
          <button type="button" className="tb-ctrl" aria-label="最小化" onClick={() => window.api.win.minimize()}>
            <Minus size={14} strokeWidth={1.6} />
          </button>
          <button type="button" className="tb-ctrl" aria-label="最大化" onClick={() => window.api.win.toggleMaximize()}>
            <Square size={11} strokeWidth={1.6} />
          </button>
          <button type="button" className="tb-ctrl is-close" aria-label="关闭" onClick={() => window.api.win.close()}>
            <X size={14} strokeWidth={1.6} />
          </button>
        </div>
      )}
    </header>
  )
}
