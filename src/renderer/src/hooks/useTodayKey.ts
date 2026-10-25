import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'

/**
 * 当前日期（本地时区 yyyy-MM-dd），跨天会自动更新。
 *
 * 后台窗口的定时器会被浏览器节流，电脑休眠/修改系统时间也会让定时器失准，
 * 所以除了按「到下一个 0 点」的定时器，还额外用每分钟兜底 + 切回前台/获得焦点时立即校准。
 */
export function useTodayKey(): [string, () => void] {
  const [todayKey, setTodayKey] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  /** 立即按当前系统时间校准一次（点「今」时用，避免等下一个 tick） */
  const refresh = useCallback((): void => {
    const next = format(new Date(), 'yyyy-MM-dd')
    setTodayKey((prev) => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    let timer: number | undefined

    const schedule = (): void => {
      if (timer !== undefined) window.clearTimeout(timer)
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      timer = window.setTimeout(tick, Math.max(1000, nextMidnight.getTime() - now.getTime()))
    }

    const tick = (): void => {
      refresh()
      schedule()
    }

    // 每分钟兜底：覆盖休眠唤醒、系统时间/时区被修改的情况
    const interval = window.setInterval(tick, 60_000)
    const onFocus = (): void => tick()
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') tick()
    }

    schedule()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return [todayKey, refresh]
}
