import type { Project, Settings } from './types'

export const SCHEMA_VERSION = 1

export const DEFAULT_PROJECTS: Project[] = [
  { id: 'default', name: '默认', color: '#9AA4B2', sort: 0 },
  { id: 'work', name: '工作', color: '#3E8EF7', sort: 1 },
  { id: 'life', name: '生活', color: '#F26D9C', sort: 2 },
  { id: 'shopping', name: '购物', color: '#F5B942', sort: 3 },
  { id: 'travel', name: '旅行', color: '#F2735B', sort: 4 },
  { id: 'study', name: '学习', color: '#E8558E', sort: 5 },
  { id: 'exercise', name: '锻炼', color: '#8E7CF0', sort: 6 },
  { id: 'research', name: '科研', color: '#7C5CF0', sort: 7 }
]

export const PROJECT_COLORS = [
  '#9AA4B2',
  '#3E8EF7',
  '#F26D9C',
  '#F5B942',
  '#F2735B',
  '#E8558E',
  '#8E7CF0',
  '#7C5CF0',
  '#2FBF71',
  '#F5833C'
]

export const DEFAULT_SETTINGS: Settings = {
  weekStart: 1,
  showLunar: true,
  showHoliday: true,
  projectFilter: null,
  view: 'month',
  launchAtLogin: false,
  theme: 'light',
  syncIntervalHours: 24
}
