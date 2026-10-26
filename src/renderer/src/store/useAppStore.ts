import { create } from 'zustand'
import { DEFAULT_PROJECTS, DEFAULT_SETTINGS, SCHEMA_VERSION } from '../domain/defaults'
import { TASK_COLORS } from '../domain/constants'
import type { AppData, Project, Settings, Task, TaskDraft } from '../domain/types'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function emptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: DEFAULT_PROJECTS.map((p) => ({ ...p, updatedAt: new Date().toISOString() })),
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    meta: { deviceId: uid() }
  }
}

/** 读取到的数据做一遍兜底，避免旧版本/手改文件把界面搞崩 */
function normalize(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') return emptyData()
  const input = raw as Partial<AppData>
  const projects = Array.isArray(input.projects) && input.projects.length > 0 ? input.projects : emptyData().projects
  const tasks = Array.isArray(input.tasks) ? input.tasks : []
  return {
    schemaVersion: typeof input.schemaVersion === 'number' ? input.schemaVersion : SCHEMA_VERSION,
    projects: projects.map((p, i) => ({
      id: String(p.id ?? uid()),
      name: String(p.name ?? '未命名'),
      color: String(p.color ?? '#9AA4B2'),
      sort: typeof p.sort === 'number' ? p.sort : i
    })),
    tasks: tasks
      .filter(
        (t) =>
          t &&
          typeof t.title === 'string' &&
          (t.date === undefined || t.date === null || typeof t.date === 'string')
      )
      .map((t) => ({
        ...t,
        id: String(t.id ?? uid()),
        projectId: String(t.projectId ?? 'default'),
        title: String(t.title),
        // 没有日期 = 还在收集箱
        date: t.date ? String(t.date) : undefined,
        done: Boolean(t.done),
        createdAt: t.createdAt ?? new Date().toISOString(),
        updatedAt: t.updatedAt ?? new Date().toISOString()
      })),
    settings: { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) }
  }
}

interface AppState {
  ready: boolean
  error: string | null
  data: AppData
  /** 本地修改计数：只有用户操作会 +1，同步回来的数据不动它 */
  rev: number
  lastDeleted: { task: Task } | null

  load: () => Promise<void>

  createTask: (draft: TaskDraft) => Task
  updateTask: (id: string, patch: Partial<Omit<Task, 'id'>>) => void
  toggleTask: (id: string) => void
  deleteTask: (id: string) => void
  undoDelete: () => void
  clearLastDeleted: () => void

  addProject: (name: string, color: string) => void
  updateProject: (id: string, patch: Partial<Omit<Project, 'id'>>) => void
  deleteProject: (id: string) => void

  setFilter: (projectId: string | null) => void
  updateSettings: (patch: Partial<Settings>) => void
  replaceData: (doc: AppData) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

export const useAppStore = create<AppState>((set, get) => {
  const queueSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const { data } = get()
      void window.api.store.write(JSON.stringify(data)).then((res) => {
        if (!res.ok) set({ error: `保存失败：${res.error ?? '未知错误'}` })
        else set({ error: null })
      })
    }, 400)
  }

  const commit = (patch: Partial<AppData>): void => {
    set((s) => ({ data: { ...s.data, ...patch }, rev: s.rev + 1 }))
    queueSave()
  }

  return {
    ready: false,
    error: null,
    data: emptyData(),
    rev: 0,
    lastDeleted: null,

    load: async () => {
      try {
        const raw = await window.api.store.read()
        if (!raw) {
          const data = emptyData()
          set({ data, ready: true })
          await window.api.store.write(JSON.stringify(data))
          return
        }
        set({ data: normalize(JSON.parse(raw)), ready: true })
      } catch (err) {
        set({ data: emptyData(), ready: true, error: `数据读取失败：${(err as Error).message}` })
      }
    },

    createTask: (draft) => {
      const now = new Date().toISOString()
      const task: Task = {
        ...draft,
        title: draft.title.trim(),
        notes: draft.notes?.trim() || undefined,
        id: uid(),
        color: draft.color ?? TASK_COLORS[Math.floor(Math.random() * TASK_COLORS.length)],
        done: false,
        createdAt: now,
        updatedAt: now
      }
      commit({ tasks: [...get().data.tasks, task] })
      return task
    },

    updateTask: (rawId, patch) => {
      const id = rawId
      commit({
        tasks: get().data.tasks.map((t) =>
          t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
        )
      })
    },

    toggleTask: (rawId) => {
      const id = rawId
      const now = new Date().toISOString()
      commit({
        tasks: get().data.tasks.map((t) =>
          t.id === id
            ? { ...t, done: !t.done, doneAt: !t.done ? now : undefined, updatedAt: now }
            : t
        )
      })
    },

    deleteTask: (rawId) => {
      const id = rawId
      const task = get().data.tasks.find((t) => t.id === id)
      if (!task) return
      const now = new Date().toISOString()
      set({ lastDeleted: { task } })
      commit({
        tasks: get().data.tasks.map((t) => (t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t))
      })
    },

    undoDelete: () => {
      const last = get().lastDeleted
      if (!last) return
      const now = new Date().toISOString()
      commit({
        tasks: get().data.tasks.map((t) =>
          t.id === last.task.id ? { ...t, deletedAt: undefined, updatedAt: now } : t
        )
      })
      set({ lastDeleted: null })
    },

    clearLastDeleted: () => set({ lastDeleted: null }),

    addProject: (name, color) => {
      const projects = get().data.projects
      const project: Project = {
        id: uid(),
        name: name.trim() || '新项目',
        color,
        sort: projects.length,
        updatedAt: new Date().toISOString()
      }
      commit({ projects: [...projects, project] })
    },

    updateProject: (id, patch) => {
      commit({
        projects: get().data.projects.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
        )
      })
    },

    deleteProject: (id) => {
      if (id === 'default') return
      const state = get()
      const now = new Date().toISOString()
      const tasks = state.data.tasks.map((t) => (t.projectId === id ? { ...t, projectId: 'default', updatedAt: now } : t))
      // 项目也走墓碑，避免同步时被另一台设备复活
      const projects = state.data.projects.map((p) =>
        p.id === id ? { ...p, deletedAt: now, updatedAt: now } : p
      )
      const projectFilter = state.data.settings.projectFilter === id ? null : state.data.settings.projectFilter
      commit({ projects, tasks, settings: { ...state.data.settings, projectFilter } })
    },

    setFilter: (projectId) => {
      commit({ settings: { ...get().data.settings, projectFilter: projectId } })
    },

    updateSettings: (patch) => {
      commit({ settings: { ...get().data.settings, ...patch } })
    },

    replaceData: (doc) => {
      set({ data: doc })
      queueSave()
    }
  }
})
