import { addDays, format, getDay } from 'date-fns'

export interface CalendarDay {
  date: Date
  key: string
  inMonth: boolean
  /** 0 = 周日 … 6 = 周六 */
  weekday: number
}

export type WeekStart = 0 | 1

/**
 * 生成月视图网格：向前补齐到周起始，向后补齐整周。
 * 只在最后一行完全不属于本月时裁掉，所以 2026-10 会得到 5 行（9/28–11/1）。
 */
export function buildMonthGrid(year: number, month: number, weekStart: WeekStart): CalendarDay[][] {
  const first = new Date(year, month, 1)
  const offset = (getDay(first) - weekStart + 7) % 7
  const start = addDays(first, -offset)

  const days: CalendarDay[] = []
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i)
    days.push({
      date,
      key: format(date, 'yyyy-MM-dd'),
      inMonth: date.getMonth() === month && date.getFullYear() === year,
      weekday: getDay(date)
    })
  }

  while (days.length > 35 && days.slice(-7).every((d) => !d.inMonth)) {
    days.length -= 7
  }

  const weeks: CalendarDay[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}

export function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6
}

export const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function weekdayLabels(weekStart: WeekStart): string[] {
  return Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStart + i) % 7])
}
