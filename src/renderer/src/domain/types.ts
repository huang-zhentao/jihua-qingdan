export type Priority = 0 | 1 | 2 | 3

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Project {
  id: string
  name: string
  color: string
  sort: number
  updatedAt?: string
  /** 墓碑：有值表示已删除，同步时用来防止被远端复活 */
  deletedAt?: string
}

export interface Task {
  id: string
  projectId: string
  title: string
  /** yyyy-MM-dd */
  date: string
  /** HH:mm，省略表示全天 */
  time?: string
  endTime?: string
  notes?: string
  done: boolean
  doneAt?: string
  priority?: Priority
  /** 单条任务覆盖项目色 */
  color?: string
  /** ISO 时间字符串；M4 起用于发通知 */
  remindAt?: string
  repeat?: Repeat
  createdAt: string
  updatedAt: string
  /** 墓碑：有值表示已删除，同步时用来防止被远端复活 */
  deletedAt?: string
}

export interface Settings {
  /** 0 = 周日, 1 = 周一 */
  weekStart: 0 | 1
  showLunar: boolean
  showHoliday: boolean
  /** null = 全部项目 */
  projectFilter: string | null
  view: 'month' | 'day' | 'ai'
  /** 开机自启 */
  launchAtLogin: boolean
  theme: 'light' | 'dark' | 'system'
  /** 自动同步间隔（小时），0 表示关闭自动同步 */
  syncIntervalHours: number
}

export interface AppData {
  schemaVersion: number
  projects: Project[]
  tasks: Task[]
  settings: Settings
  meta?: { deviceId: string }
}

export type TaskDraft = Omit<Task, 'id' | 'done' | 'doneAt' | 'createdAt' | 'updatedAt'>
