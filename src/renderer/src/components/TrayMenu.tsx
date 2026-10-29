import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface TrayTask {
  id: string
  title: string
  date: string
}

interface TrayData {
  tasks: TrayTask[]
  dark: boolean
}

export function TrayMenu() {
  const [tasks, setTasks] = useState<TrayTask[]>([])
  const [dark, setDark] = useState(false)
  const [done, setDone] = useState<Set<string>>(new Set())
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const off = window.api.trayMenu.onData((data: TrayData) => {
      setTasks(data.tasks)
      setDark(data.dark)
      setDone(new Set())
    })
    return off
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', dark)
  }, [dark])

  // 内容变化后把窗口高度同步给主进程
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const height = Math.ceil(el.getBoundingClientRect().height)
    window.api.trayMenu.resize(height)
  }, [tasks, done])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.trayMenu.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggle = (id: string): void => {
    setDone((prev) => new Set(prev).add(id))
    window.api.trayMenu.toggle(id)
  }

  return (
    <div className="tray-card" ref={boxRef}>
      <div className="tray-head">
        <span>今天未完成</span>
        {tasks.length ? <span className="tray-count">{tasks.length}</span> : null}
      </div>

      <div className="tray-list">
        {tasks.length === 0 ? (
          <p className="tray-empty">今天没有未完成任务</p>
        ) : (
          tasks.map((task) => {
            const checked = done.has(task.id)
            return (
              <div className={checked ? 'tray-item is-done' : 'tray-item'} key={task.id}>
                <button
                  type="button"
                  className={checked ? 'tray-circle is-on' : 'tray-circle'}
                  aria-label={checked ? '已完成' : '标记完成'}
                  title={checked ? '已完成' : '标记完成'}
                  onClick={() => toggle(task.id)}
                >
                  {checked ? <span className="tray-tick" /> : null}
                </button>
                <button
                  type="button"
                  className="tray-title"
                  title="打开这条任务"
                  onClick={() => window.api.trayMenu.open(task.id)}
                >
                  {task.title}
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="tray-foot">
        <button type="button" className="tray-action" onClick={() => window.api.trayMenu.showApp()}>
          显示计划清单
        </button>
        <button type="button" className="tray-action is-quit" onClick={() => window.api.trayMenu.quit()}>
          退出
        </button>
      </div>
    </div>
  )
}
