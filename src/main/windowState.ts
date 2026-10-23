import { app, screen } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULT_STATE: WindowState = { width: 1180, height: 868, maximized: false }

function statePath(): string {
  return join(app.getPath('userData'), 'window.json')
}

export function loadWindowState(): WindowState {
  try {
    const raw = JSON.parse(readFileSync(statePath(), 'utf8')) as WindowState
    if (typeof raw.width !== 'number' || typeof raw.height !== 'number') return DEFAULT_STATE
    // 屏幕变小/换了显示器时，别把窗口放到看不见的地方
    if (typeof raw.x === 'number' && typeof raw.y === 'number') {
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea
        return raw.x! < b.x + b.width - 80 && raw.x! + raw.width > b.x + 80 && raw.y! >= b.y - 20 && raw.y! < b.y + b.height - 80
      })
      if (!visible) return { ...DEFAULT_STATE, maximized: raw.maximized, width: raw.width, height: raw.height }
    }
    return raw
  } catch {
    return DEFAULT_STATE
  }
}

export function saveWindowState(state: WindowState): void {
  try {
    mkdirSync(dirname(statePath()), { recursive: true })
    writeFileSync(statePath(), JSON.stringify(state), 'utf8')
  } catch {
    // 窗口状态存不下来不影响使用
  }
}
