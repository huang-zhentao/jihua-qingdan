import type { Priority } from './types'

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: '无',
  1: '低',
  2: '中',
  3: '高'
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  0: '#B4B9C0',
  1: '#5B8DEF',
  2: '#F5B942',
  3: '#F2547D'
}

/** 提醒时间：提前 N 天（0 = 不提醒） */
export const REMIND_DAYS = [0, 1, 2, 3, 4, 5] as const

export function remindLabel(days: number): string {
  return days === 0 ? '不提醒' : `提前 ${days} 天`
}

/** 任务可选的背景色（浅色系，和月视图里的条一致） */
export const TASK_COLORS = [
  '#9AA4B2',
  '#5B8DEF',
  '#6FBF73',
  '#F5B942',
  '#F2735B',
  '#E8558E',
  '#8E7CF0',
  '#7C5CF0',
  '#D9B98C',
  '#6ED4A8'
]


/** HSL → #rrggbb */
function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number): string => {
    const k = (n + h / 30) % 12
    const color = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** 随机任务色：限定饱和度和亮度，保证浅底深字在月视图里可读 */
export function randomTaskColor(): string {
  const hue = Math.floor(Math.random() * 360)
  const saturation = 56 + Math.floor(Math.random() * 22) // 56–77
  const lightness = 46 + Math.floor(Math.random() * 14) // 46–59
  return hslToHex(hue, saturation, lightness)
}
