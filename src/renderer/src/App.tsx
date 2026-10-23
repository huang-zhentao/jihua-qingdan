import { addDays, addMonths, format, parseISO } from 'date-fns'
import { Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DayPeek } from './components/DayPeek'
import { DayView } from './components/DayView'
import { AiView } from './components/AiView'
import { IconRail } from './components/IconRail'
import { MonthGrid } from './components/MonthGrid'
import { MonthToolbar } from './components/MonthToolbar'
import { ProjectDialog } from './components/ProjectDialog'
import { ProjectFilter } from './components/ProjectFilter'
import { SearchDialog } from './components/SearchDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { TaskDrawer } from './components/TaskDrawer'
import { TitleBar } from './components/TitleBar'
import { Toast } from './components/Toast'
import { buildMonthGrid } from './domain/calendar'
import { expandTasks } from './domain/occurrence'
import type { AppData, Task, TaskDraft } from './domain/types'
import { useAppStore } from './store/useAppStore'

// 快捷键提示按平台显示：macOS 用 ⌘，Windows 用 Ctrl
const isMac = window.api?.platform === 'darwin'

interface DrawerState {
  open: boolean
  task: Task | null
  date: string
}

export function App() {
  const data = useAppStore((s) => s.data)
  const ready = useAppStore((s) => s.ready)
  const error = useAppStore((s) => s.error)
  const lastDeleted = useAppStore((s) => s.lastDeleted)
  const rev = useAppStore((s) => s.rev)
  const load = useAppStore((s) => s.load)
  const createTask = useAppStore((s) => s.createTask)
  const updateTask = useAppStore((s) => s.updateTask)
  const toggleTask = useAppStore((s) => s.toggleTask)
  const deleteTask = useAppStore((s) => s.deleteTask)
  const undoDelete = useAppStore((s) => s.undoDelete)
  const clearDeleted = useAppStore((s) => s.clearLastDeleted)
  const addProject = useAppStore((s) => s.addProject)
  const updateProject = useAppStore((s) => s.updateProject)
  const deleteProject = useAppStore((s) => s.deleteProject)
  const setFilter = useAppStore((s) => s.setFilter)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const replaceData = useAppStore((s) => s.replaceData)

  const today = useMemo(() => new Date(), [])
  const todayKey = format(today, 'yyyy-MM-dd')

  const view = data.settings.view
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }))
  const [selectedKey, setSelectedKey] = useState(todayKey)
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, task: null, date: todayKey })
  const [projectOpen, setProjectOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [peek, setPeek] = useState<{ key: string; anchor: { left: number; top: number } } | null>(null)

  const syncConfigured = useRef(false)
  const applyingRemote = useRef(false)
  const lastSyncAt = useRef(0)
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  const [lastSyncLabel, setLastSyncLabel] = useState('')

  const refreshSyncStatus = useCallback(async () => {
    const s = await window.api.sync.status()
    if (s.status.at) setLastSyncLabel(new Date(s.status.at).toLocaleString())
  }, [])

  const runSync = useCallback(
    async (manual = false) => {
      if (applyingRemote.current) return
      setSyncing(true)
      try {
        const raw = JSON.stringify(useAppStore.getState().data)
        const res = await window.api.sync.now(raw)
        if (res.ok) {
          lastSyncAt.current = Date.now()
          if (res.raw) {
            applyingRemote.current = true
            replaceData(JSON.parse(res.raw) as AppData)
            window.setTimeout(() => {
              applyingRemote.current = false
            }, 600)
          }
          if (manual) setSyncNote(`同步完成 · ${new Date().toLocaleTimeString()}`)
          void refreshSyncStatus()
        } else if (manual) {
          setSyncNote(`同步失败：${res.status?.message ?? '未知错误'}`)
        }
      } finally {
        setSyncing(false)
      }
    },
    [replaceData, refreshSyncStatus]
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = data.settings.theme === 'dark' || (data.settings.theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('theme-dark', dark)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [data.settings.theme])

  // 提醒排程
  useEffect(() => {
    if (!ready) return
    const list = data.tasks
      .filter((t) => t.remindAt && !t.done && !t.deletedAt)
      .map((t) => ({ id: t.id, title: t.title, at: t.remindAt as string, date: t.date }))
    window.api.notify.sync(list)
  }, [ready, data.tasks])

  // 点通知打开对应日程
  useEffect(() => {
    return window.api.app.onOpenTask((taskId, date) => {
      const task = useAppStore.getState().data.tasks.find((t) => t.id === taskId)
      setSelectedKey(date)
      const parsed = parseISO(date)
      setCursor({ year: parsed.getFullYear(), month: parsed.getMonth() })
      if (task) setDrawer({ open: true, task, date: task.date })
    })
  }, [])

  // macOS 菜单「设置…」(⌘,) 打开设置；Windows 没有这个菜单项，不会触发
  useEffect(() => {
    return window.api.app.onOpenSettings(() => setSettingsOpen(true))
  }, [])

  // 把今天未完成的任务同步到托盘菜单
  useEffect(() => {
    if (!ready) return
    const list = data.tasks
      .filter((t) => !t.deletedAt && !t.done && t.date === todayKey)
      .map((t) => ({ id: t.id, title: t.title, date: t.date }))
    window.api.tray.update(list)
  }, [ready, data.tasks, todayKey])

  // 托盘里点了某条任务 → 标记完成
  useEffect(() => {
    return window.api.tray.onComplete((taskId) => {
      const task = useAppStore.getState().data.tasks.find((t) => t.id === taskId)
      if (task && !task.done) toggleTask(taskId)
    })
  }, [toggleTask])

  // 启动同步一次
  useEffect(() => {
    if (!ready) return
    void window.api.sync.status().then((s) => {
      syncConfigured.current = s.configured
      if (s.status.at) setLastSyncLabel(new Date(s.status.at).toLocaleString())
      if (s.configured) void runSync()
    })
  }, [ready, runSync])

  // 改动后延迟同步：静置 15 秒再同步，且两次自动同步至少间隔 5 分钟
  useEffect(() => {
    if (!ready || !syncConfigured.current || rev === 0) return
    const timer = window.setTimeout(() => {
      if (applyingRemote.current) return
      const since = Date.now() - lastSyncAt.current
      if (since < 5 * 60 * 1000) return
      void runSync()
    }, 15000)
    return () => window.clearTimeout(timer)
  }, [ready, rev, runSync])

  // 按用户选择的间隔自动同步（0 = 关闭）
  useEffect(() => {
    if (!ready) return
    const hours = data.settings.syncIntervalHours
    if (!hours || hours <= 0) return
    const timer = window.setInterval(
      () => {
        if (!syncConfigured.current) return
        void window.api.sync.status().then((s) => {
          if (s.configured) void runSync()
        })
      },
      hours * 60 * 60 * 1000
    )
    return () => window.clearInterval(timer)
  }, [ready, data.settings.syncIntervalHours, runSync])

  const projects = useMemo(() => data.projects.filter((p) => !p.deletedAt), [data.projects])
  const filter = data.settings.projectFilter
  const liveTasks = useMemo(() => data.tasks.filter((t) => !t.deletedAt), [data.tasks])
  const visibleTasks = useMemo(
    () => (filter ? liveTasks.filter((t) => t.projectId === filter) : liveTasks),
    [liveTasks, filter]
  )

  const weeks = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, data.settings.weekStart),
    [cursor, data.settings.weekStart]
  )

  const gridKeys = useMemo(() => weeks.flat().map((d) => d.key), [weeks])

  const tasksByDate = useMemo(
    () => expandTasks(visibleTasks, gridKeys.length ? gridKeys : [selectedKey]),
    [visibleTasks, gridKeys, selectedKey]
  )

  const dayTasks = useMemo(
    () => expandTasks(visibleTasks, [selectedKey])[selectedKey] ?? [],
    [visibleTasks, selectedKey]
  )

  const daysWithTasks = useMemo(() => {
    const set = new Set<string>()
    for (const task of visibleTasks) set.add(task.date)
    return set
  }, [visibleTasks])

  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const task of liveTasks) counts[task.projectId] = (counts[task.projectId] ?? 0) + 1
    return counts
  }, [liveTasks])

  const colorOf = useCallback(
    (projectId: string) => projects.find((p) => p.id === projectId)?.color ?? '#9AA4B2',
    [projects]
  )

  const shiftMonth = (delta: number): void => {
    const next = addMonths(new Date(cursor.year, cursor.month, 1), delta)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
  }

  const goToday = (): void => {
    setCursor({ year: today.getFullYear(), month: today.getMonth() })
    setSelectedKey(todayKey)
  }

  const openCreate = useCallback((dateKey: string) => {
    setPeek(null)
    setSelectedKey(dateKey)
    setDrawer({ open: true, task: null, date: dateKey })
  }, [])

  const openEdit = useCallback((task: Task) => {
    setPeek(null)
    setSelectedKey(task.date)
    const parsed = parseISO(task.date)
    setCursor({ year: parsed.getFullYear(), month: parsed.getMonth() })
    setDrawer({ open: true, task, date: task.date })
  }, [])

  const handleSave = (draft: TaskDraft, done: boolean): void => {
    if (drawer.task) {
      updateTask(drawer.task.id, { ...draft, done, doneAt: done ? new Date().toISOString() : undefined })
    } else {
      const created = createTask(draft)
      if (done) toggleTask(created.id)
    }
    const parsed = parseISO(draft.date)
    setCursor({ year: parsed.getFullYear(), month: parsed.getMonth() })
    setSelectedKey(draft.date)
    setDrawer((d) => ({ ...d, open: false }))
  }

  const handleDelete = (): void => {
    if (!drawer.task) return
    deleteTask(drawer.task.id)
    setDrawer((d) => ({ ...d, open: false }))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (drawer.open || projectOpen || settingsOpen || searchOpen) return

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        openCreate(selectedKey)
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        goToday()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const delta = e.key === 'ArrowLeft' ? -1 : 1
        const next = addDays(parseISO(selectedKey), delta)
        setSelectedKey(format(next, 'yyyy-MM-dd'))
        setCursor({ year: next.getFullYear(), month: next.getMonth() })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={drawer.open ? 'app has-drawer' : 'app'}>
      <TitleBar />

      <div className="app-body">
        <IconRail
          active={view === 'month' ? 'month' : view === 'day' ? 'tasks' : 'ai'}
          onSelect={(key) => {
            if (key === 'month') updateSettings({ view: 'month' })
            if (key === 'tasks') updateSettings({ view: 'day' })
            if (key === 'ai') updateSettings({ view: 'ai' })
            if (key === 'settings') setSettingsOpen(true)
          }}
        />

        <main className="workspace">
          {view === 'month' ? (
            <>
              <MonthToolbar
                year={cursor.year}
                month={cursor.month}
                onPrev={() => shiftMonth(-1)}
                onNext={() => shiftMonth(1)}
                onToday={goToday}
                onAdd={() => openCreate(selectedKey)}
                onSync={() => void runSync(true)}
                syncing={syncing}
                syncTitle={
                  lastSyncLabel ? `上次同步：${lastSyncLabel} · 点击立即同步` : '立即同步'
                }
                onPick={(y, m) => setCursor({ year: y, month: m })}
                right={
                  <div className="toolbar-right">
                    <button
                      type="button"
                      className="tb-btn"
                      aria-label="搜索日程"
                      title={`搜索日程 (${isMac ? '⌘K' : 'Ctrl+K'})`}
                      onClick={() => setSearchOpen(true)}
                    >
                      <Search size={15} strokeWidth={1.9} />
                    </button>
                    <ProjectFilter
                      projects={projects}
                      value={filter}
                      onChange={setFilter}
                      onManage={() => setProjectOpen(true)}
                    />
                  </div>
                }
              />

              <MonthGrid
                weeks={weeks}
                weekStart={data.settings.weekStart}
                selectedKey={selectedKey}
                todayKey={todayKey}
                tasksByDate={tasksByDate}
                projects={projects}
                onSelect={(key) => {
                  setSelectedKey(key)
                  openCreate(key)
                }}
                onEditTask={openEdit}
                onToggleTask={toggleTask}
                onNewTask={openCreate}
                onShowMore={(key, anchor) => {
                  setSelectedKey(key)
                  setPeek({ key, anchor })
                }}
              />

              <button
                type="button"
                className="fab-add"
                aria-label="新建日程"
                title="新建日程"
                onClick={() => openCreate(selectedKey)}
              >
                <Plus size={22} strokeWidth={2.2} />
              </button>
            </>
          ) : view === 'day' ? (
            <DayView
              dateKey={selectedKey}
              weekStart={data.settings.weekStart}
              tasks={dayTasks}
              allTasks={liveTasks}
              daysWithTasks={daysWithTasks}
              projects={projects}
              filter={filter}
              onSelectDate={setSelectedKey}
              onFilter={setFilter}
              onToggle={toggleTask}
              onEdit={openEdit}
              onNew={openCreate}
              onManageProjects={() => setProjectOpen(true)}
              colorOf={colorOf}
            />
          ) : (
            <AiView tasks={liveTasks} projects={projects} onOpenSettings={() => setSettingsOpen(true)} />
          )}

          {!ready ? <div className="loading-mask">正在读取数据…</div> : null}
        </main>
      </div>

      <TaskDrawer
        key={`${drawer.task?.id ?? 'new'}-${drawer.date}-${drawer.open}`}
        open={drawer.open}
        task={drawer.task}
        defaultDate={drawer.date}
        projects={projects}
        defaultProjectId={filter ?? 'default'}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        onSave={handleSave}
        onToggleDone={toggleTask}
        onDelete={handleDelete}
      />

      <ProjectDialog
        open={projectOpen}
        projects={projects}
        taskCounts={taskCounts}
        onClose={() => setProjectOpen(false)}
        onAdd={addProject}
        onUpdate={updateProject}
        onDelete={deleteProject}
      />

      <SettingsDialog
        open={settingsOpen}
        data={data}
        onClose={() => setSettingsOpen(false)}
        onSynced={(doc) => {
          syncConfigured.current = true
          lastSyncAt.current = Date.now()
          replaceData(doc)
          void refreshSyncStatus()
        }}
        onReplace={(doc) => replaceData(doc)}
        onToggle={(patch) => {
          updateSettings(patch)
          if (typeof patch.launchAtLogin === 'boolean') {
            void window.api.app.setLoginItem(patch.launchAtLogin)
          }
        }}
      />

      <SearchDialog
        open={searchOpen}
        tasks={data.tasks}
        projects={projects}
        onClose={() => setSearchOpen(false)}
        onPick={(task) => {
          setSearchOpen(false)
          openEdit(task)
        }}
      />

      {peek ? (
        <DayPeek
          dateKey={peek.key}
          tasks={tasksByDate[peek.key] ?? []}
          projects={projects}
          anchor={peek.anchor}
          onClose={() => setPeek(null)}
          onEdit={openEdit}
          onToggle={toggleTask}
          onNew={() => openCreate(peek.key)}
        />
      ) : null}

      {syncNote ? <Toast message={syncNote} onClose={() => setSyncNote('')} /> : null}

      {lastDeleted ? (
        <Toast
          message={`已删除「${lastDeleted.task.title}」`}
          actionLabel="撤销"
          onAction={undoDelete}
          onClose={clearDeleted}
        />
      ) : null}

      {error ? (
        <div className="app-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}
