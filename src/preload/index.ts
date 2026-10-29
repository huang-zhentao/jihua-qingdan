import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,
  win: {
    minimize: (): void => ipcRenderer.send('win:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('win:toggle-maximize'),
    close: (): void => ipcRenderer.send('win:close'),
    onMaximizeChange: (cb: (value: boolean) => void): (() => void) => {
      const handler = (_e: unknown, value: boolean): void => cb(value)
      ipcRenderer.on('win:maximized', handler)
      return () => ipcRenderer.removeListener('win:maximized', handler)
    }
  },
  store: {
    read: (): Promise<string | null> => ipcRenderer.invoke('store:read'),
    write: (raw: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('store:write', raw),
    backup: (): Promise<string | null> => ipcRenderer.invoke('store:backup'),
    import: (): Promise<{ ok: boolean; canceled?: boolean; count?: number; message?: string }> =>
      ipcRenderer.invoke('store:import')
  },
  notify: {
    sync: (list: Array<{ id: string; title: string; at: string; date: string }>): void =>
      ipcRenderer.send('notify:sync', list)
  },
  tray: {
    update: (tasks: Array<{ id: string; title: string; date: string }>): void =>
      ipcRenderer.send('tray:update', tasks),
    onComplete: (cb: (taskId: string) => void): (() => void) => {
      const handler = (_e: unknown, taskId: string): void => cb(taskId)
      ipcRenderer.on('tray:complete', handler)
      return () => ipcRenderer.removeListener('tray:complete', handler)
    },
    debugComplete: process.env.TRAY_TEST === '1' ? (): void => ipcRenderer.send('tray:debug-complete') : undefined,
    debugOpenMenu: process.env.TRAY_TEST === '1' ? (): void => ipcRenderer.send('tray:debug-open') : undefined
  },
  trayMenu: {
    onData: (cb: (data: { tasks: Array<{ id: string; title: string; date: string }>; dark: boolean }) => void): (() => void) => {
      const handler = (_e: unknown, data: { tasks: Array<{ id: string; title: string; date: string }>; dark: boolean }): void =>
        cb(data)
      ipcRenderer.on('tray:data', handler)
      return () => ipcRenderer.removeListener('tray:data', handler)
    },
    toggle: (taskId: string): void => ipcRenderer.send('tray:toggle', taskId),
    open: (taskId: string): void => ipcRenderer.send('tray:open', taskId),
    showApp: (): void => ipcRenderer.send('tray:show-app'),
    quit: (): void => ipcRenderer.send('tray:quit'),
    close: (): void => ipcRenderer.send('tray:close'),
    resize: (height: number): void => ipcRenderer.send('tray:resize', height)
  },
  sync: {
    status: (): Promise<{ configured: boolean; status: { state: string; at?: string; message?: string; count?: number } }> =>
      ipcRenderer.invoke('sync:status'),
    config: (): Promise<{ url: string; username: string; broken: boolean }> => ipcRenderer.invoke('sync:config'),
    save: (cfg: { url: string; username: string; password: string }): Promise<boolean> =>
      ipcRenderer.invoke('sync:save', cfg),
    test: (cfg: { url: string; username: string; password: string }): Promise<{ ok: boolean; message: string }> =>
      ipcRenderer.invoke('sync:test', cfg),
    now: (raw: string): Promise<{ ok: boolean; raw?: string; status: { state: string; at?: string; message?: string; count?: number } }> =>
      ipcRenderer.invoke('sync:now', raw)
  },
  ai: {
    config: (): Promise<{
      provider: string
      baseUrl: string
      model: string
      hasKey: boolean
      providers: Array<{ id: string; name: string; baseUrl: string; model: string }>
    }> => ipcRenderer.invoke('ai:config'),
    save: (payload: {
      config: { provider: string; baseUrl: string; model: string }
      apiKey?: string
    }): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('ai:save', payload),
    test: (payload: {
      config: { provider: string; baseUrl: string; model: string }
      apiKey: string
    }): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('ai:test', payload),
    chat: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): void =>
      ipcRenderer.send('ai:chat', { messages }),
    abort: (): void => ipcRenderer.send('ai:abort'),
    onAborted: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('ai:aborted', handler)
      return () => ipcRenderer.removeListener('ai:aborted', handler)
    },
    onChunk: (cb: (text: string) => void): (() => void) => {
      const handler = (_e: unknown, text: string): void => cb(text)
      ipcRenderer.on('ai:chunk', handler)
      return () => ipcRenderer.removeListener('ai:chunk', handler)
    },
    onDone: (cb: (full: string) => void): (() => void) => {
      const handler = (_e: unknown, full: string): void => cb(full)
      ipcRenderer.on('ai:done', handler)
      return () => ipcRenderer.removeListener('ai:done', handler)
    },
    onError: (cb: (message: string) => void): (() => void) => {
      const handler = (_e: unknown, message: string): void => cb(message)
      ipcRenderer.on('ai:error', handler)
      return () => ipcRenderer.removeListener('ai:error', handler)
    }
  },
  app: {
    info: (): Promise<{ version: string; dataDir: string; dataFile: string }> => ipcRenderer.invoke('app:info'),
    openDataDir: (): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('app:openDataDir'),
    setLoginItem: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('app:setLoginItem', enabled),
    getLoginItem: (): Promise<boolean> => ipcRenderer.invoke('app:getLoginItem'),
    onOpenTask: (cb: (taskId: string, date: string) => void): (() => void) => {
      const handler = (_e: unknown, taskId: string, date: string): void => cb(taskId, date)
      ipcRenderer.on('app:open-task', handler)
      return () => ipcRenderer.removeListener('app:open-task', handler)
    },
    onOpenSettings: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('app:open-settings', handler)
      return () => ipcRenderer.removeListener('app:open-settings', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
