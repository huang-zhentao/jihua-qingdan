import { Solar } from 'lunar-typescript'

export interface DayLabel {
  text: string
  kind: 'festival' | 'jieqi' | 'lunar-month' | 'lunar-day'
}

const cache = new Map<string, DayLabel>()

/** 只保留中文语境里常见的公历节日，避免出现「世界假日」「万圣节前夕」这类条目 */
const SOLAR_FESTIVALS = new Set([
  '元旦节',
  '元旦',
  '情人节',
  '妇女节',
  '植树节',
  '劳动节',
  '青年节',
  '儿童节',
  '建党节',
  '建军节',
  '教师节',
  '国庆节',
  '平安夜',
  '圣诞节'
])

function cacheKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/**
 * 日期格第二行的文字，优先级：节日 > 节气 > 农历初一（显示月份） > 农历日。
 */
export function getDayLabel(date: Date): DayLabel {
  const key = cacheKey(date)
  const cached = cache.get(key)
  if (cached) return cached

  let label: DayLabel
  try {
    const solar = Solar.fromDate(date)
    const lunar = solar.getLunar()
    const festivals = [
      ...lunar.getFestivals(),
      ...solar.getFestivals().filter((name) => SOLAR_FESTIVALS.has(name))
    ]
    const jieQi = lunar.getJieQi()

    if (festivals.length > 0) {
      label = { text: festivals[0], kind: 'festival' }
    } else if (jieQi) {
      label = { text: jieQi, kind: 'jieqi' }
    } else if (lunar.getDay() === 1) {
      label = { text: `${lunar.getMonthInChinese()}月`, kind: 'lunar-month' }
    } else {
      label = { text: lunar.getDayInChinese(), kind: 'lunar-day' }
    }
  } catch {
    label = { text: '', kind: 'lunar-day' }
  }

  cache.set(key, label)
  return label
}
