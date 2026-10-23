import type { Task } from './types'

/**
 * 把任务摊到给定日期上。只按任务自身日期落位。
 */
export function expandTasks(tasks: Task[], keys: string[]): Record<string, Task[]> {
  const set = new Set(keys)
  const map: Record<string, Task[]> = {}
  for (const task of tasks) {
    if (!set.has(task.date)) continue
    ;(map[task.date] ??= []).push(task)
  }
  for (const list of Object.values(map)) {
    list.sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        (a.time ?? '99:99').localeCompare(b.time ?? '99:99') ||
        a.createdAt.localeCompare(b.createdAt)
    )
  }
  return map
}
