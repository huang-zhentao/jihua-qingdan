import { Notification } from 'electron'

export interface ReminderItem {
  id: string
  title: string
  at: string
  date: string
}

const timers = new Map<string, NodeJS.Timeout>()

const MAX_AHEAD = 7 * 24 * 60 * 60 * 1000

export function syncReminders(
  list: ReminderItem[],
  onOpen: (taskId: string, date: string) => void,
  onFire?: (item: ReminderItem) => void
): number {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()

  const now = Date.now()
  let scheduled = 0

  for (const item of list) {
    const at = new Date(item.at).getTime()
    if (Number.isNaN(at) || at > now + MAX_AHEAD) continue
    if (at < now - 60_000) continue

    const delay = Math.max(0, at - now)
    const timer = setTimeout(() => {
      onFire?.(item)
      try {
        const notification = new Notification({
          title: '计划清单',
          body: item.title,
          silent: false
        })
        notification.on('click', () => onOpen(item.id, item.date))
        notification.show()
      } catch {
        // 通知发不出来不影响主流程
      }
      timers.delete(item.id)
    }, delay)

    timers.set(item.id, timer)
    scheduled++
  }

  return scheduled
}
