import type { Task } from './types'

const DAY = 86400000

/** 从 remindAt 反推「提前几天」，识别不出来就当作不提醒 */
export function remindDaysOf(task: Task | null): number {
  if (!task?.remindAt) return 0
  const at = new Date(task.remindAt)
  const atDay = new Date(at.getFullYear(), at.getMonth(), at.getDate())
  const due = new Date(`${task.date}T00:00:00`)
  const diff = Math.round((due.getTime() - atDay.getTime()) / DAY)
  return diff >= 1 && diff <= 5 ? diff : 0
}

/** 提醒时间 = 截止日 09:00 往前推 N 天 */
export function remindAtFor(date: string, days: number): string | undefined {
  if (!days) return undefined
  const due = new Date(`${date}T09:00:00`)
  return new Date(due.getTime() - days * DAY).toISOString()
}
