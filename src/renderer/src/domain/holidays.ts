import { format } from 'date-fns'
import { HolidayUtil, Solar } from 'lunar-typescript'

export type HolidayType = 'rest' | 'work'

export type HolidayKind = 'holiday' | 'weekend' | 'festival'

export interface HolidayMark {
  type: HolidayType
  name: string
  kind: HolidayKind
}

/** 法定节假日（放假日），用于没有调休表年份的兜底 */
const STATUTORY = new Set(['元旦节', '元旦', '春节', '端午节', '中秋节', '劳动节', '国庆节'])

/**
 * 本地补充/纠正表：官方公布晚于库更新、或需要手动调整时使用。
 * key 为 yyyy-MM-dd。
 */
const OVERRIDES: Record<string, HolidayMark> = {}

/**
 * 休 / 班 的判定顺序：
 * 1. 官方调休表（lunar-typescript 覆盖 2001–2026），最权威
 * 2. 调休表没有的年份：周末一律算休（调休上班日无法预知，等官方公布后补数据）
 * 3. 周末之外，法定节日当天也算休（元旦 / 春节 / 清明 / 劳动 / 端午 / 中秋 / 国庆）
 */
export function getHolidayMark(date: Date): HolidayMark | null {
  const key = format(date, 'yyyy-MM-dd')
  if (OVERRIDES[key]) return OVERRIDES[key]

  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()

  try {
    const holiday = HolidayUtil.getHoliday(y, m, d)
    if (holiday) {
      return { type: holiday.isWork() ? 'work' : 'rest', name: holiday.getName(), kind: 'holiday' }
    }
  } catch {
    // 库没有该年份的数据
  }

  const weekday = date.getDay()
  if (weekday === 0 || weekday === 6) {
    return { type: 'rest', name: '周末', kind: 'weekend' }
  }

  try {
    const solar = Solar.fromDate(date)
    const lunar = solar.getLunar()
    const festivals = [...lunar.getFestivals(), ...solar.getFestivals()]
    const festival = festivals.find((name) => STATUTORY.has(name))
    if (festival) return { type: 'rest', name: festival, kind: 'festival' }
    if (lunar.getJieQi() === '清明') return { type: 'rest', name: '清明节', kind: 'festival' }
  } catch {
    // 忽略
  }

  return null
}
