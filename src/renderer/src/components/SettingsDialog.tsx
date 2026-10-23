import { Cloud, Loader2, Sparkles, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AppData, Settings } from '../domain/types'
import { Modal } from './Modal'

interface Props {
  open: boolean
  data: AppData
  onClose: () => void
  onSynced: (doc: AppData) => void
  onReplace: (doc: AppData) => void
  onToggle: (patch: Partial<Settings>) => void
}

type Phase = 'idle' | 'testing' | 'saving' | 'syncing'

const DEFAULT_URL = 'https://dav.jianguoyun.com/dav/'

// 平台文案差异：macOS 叫「菜单栏/登录时启动」，Windows 叫「托盘/开机自启」
const isMac = window.api?.platform === 'darwin'

export function SettingsDialog({ open, data, onClose, onSynced, onReplace, onToggle }: Props) {
  const [url, setUrl] = useState(DEFAULT_URL)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<string>('')
  const [configured, setConfigured] = useState(false)

  const [aiProviders, setAiProviders] = useState<Array<{ id: string; name: string; baseUrl: string; model: string }>>([])
  const [aiProvider, setAiProvider] = useState('deepseek')
  const [aiBase, setAiBase] = useState('https://api.deepseek.com')
  const [aiModel, setAiModel] = useState('deepseek-chat')
  const [aiKey, setAiKey] = useState('')
  const [aiHasKey, setAiHasKey] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [aiTesting, setAiTesting] = useState(false)
  const [dataPath, setDataPath] = useState('')
  const [version, setVersion] = useState('')
  const [dataMsg, setDataMsg] = useState('')

  const saveAiSettings = async (): Promise<void> => {
    const res = await window.api.ai.save({
      config: { provider: aiProvider, baseUrl: aiBase, model: aiModel },
      apiKey: aiKey
    })
    if (!res.ok) {
      setAiMessage(res.message ?? '保存失败')
      return
    }
    if (aiKey.trim()) setAiHasKey(true)
    setAiKey('')
    setAiMessage('已保存')
  }

  const testAiConnection = async (): Promise<void> => {
    setAiTesting(true)
    setAiMessage('')
    const res = await window.api.ai.test({
      config: { provider: aiProvider, baseUrl: aiBase, model: aiModel },
      apiKey: aiKey
    })
    setAiMessage(res.ok ? '连接成功' : `失败：${res.message}`)
    setAiTesting(false)
  }

  useEffect(() => {
    if (!open) return
    setMessage('')
    setPhase('idle')
    void window.api.sync.config().then((cfg) => {
      if (cfg.url) {
        setUrl(cfg.url)
        setUsername(cfg.username)
        setConfigured(true)
      }
      if (cfg.broken) setMessage('保存的同步密码读不出来了（可能是上次异常退出），请重新输入密码并保存。')
    })
    void window.api.sync.status().then((s) => {
      setConfigured(s.configured)
      if (s.status.at) setLastSync(`${new Date(s.status.at).toLocaleString()} · ${s.status.count ?? 0} 条`)
      if (s.status.state === 'error' && s.status.message) setMessage(`上次同步失败：${s.status.message}`)
    })
    void window.api.ai.config().then((cfg) => {
      setAiProviders(cfg.providers)
      setAiProvider(cfg.provider)
      setAiBase(cfg.baseUrl)
      setAiModel(cfg.model)
      setAiHasKey(cfg.hasKey)
      setAiMessage('')
    })
    void window.api.app.info().then((info) => {
      setDataPath(info.dataDir)
      setVersion(info.version ?? '')
    })
  }, [open])

  const doTest = async (): Promise<void> => {
    setPhase('testing')
    setMessage('')
    const res = await window.api.sync.test({ url, username, password })
    setMessage(res.ok ? '连接成功' : `连接失败：${res.message}`)
    setPhase('idle')
  }

  const doSync = async (saveFirst: boolean): Promise<void> => {
    setPhase(saveFirst ? 'saving' : 'syncing')
    setMessage('')
    try {
      if (saveFirst) await window.api.sync.save({ url, username, password })
      const res = await window.api.sync.now(JSON.stringify(data))
      if (!res.ok) {
        setMessage(`同步失败：${res.status.message ?? '未知错误'}`)
        setPhase('idle')
        return
      }
      if (res.raw) onSynced(JSON.parse(res.raw) as AppData)
      setConfigured(true)
      setLastSync(`${new Date(res.status.at ?? Date.now()).toLocaleString()} · ${res.status.count ?? 0} 条`)
      setMessage('同步完成')
    } catch (err) {
      setMessage(`同步失败：${(err as Error).message}`)
    }
    setPhase('idle')
  }

  const busy = phase !== 'idle'

  return (
    <Modal
      open={open}
      title="设置"
      width={480}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
          <span className="spacer" />
          <span className="settings-footnote">
            {version ? `计划清单 v${version} · ` : ''}开关类自动保存，同步与 AI 用区块内按钮
          </span>
        </>
      }
    >
      <div className="settings-section">
        <div className="settings-head">
          <Sun size={14} strokeWidth={1.8} />
          <span>通用</span>
        </div>

        <label className="toggle-row">
          <span className="toggle-label">{isMac ? '登录时启动' : '开机自启'}</span>
          <input
            type="checkbox"
            className="toggle-input"
            checked={data.settings.launchAtLogin}
            onChange={(e) => onToggle({ launchAtLogin: e.target.checked })}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
        </label>

        <label className="toggle-row">
          <span className="toggle-label">紧凑模式</span>
          <input
            type="checkbox"
            className="toggle-input"
            checked={data.settings.compactMode}
            onChange={(e) => onToggle({ compactMode: e.target.checked })}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
        </label>

        <label className="toggle-row">
          <span className="toggle-label">主题</span>
          <div className="seg">
            {(['light', 'dark', 'system'] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                className={data.settings.theme === theme ? 'seg-btn is-active' : 'seg-btn'}
                onClick={() => onToggle({ theme })}
              >
                {theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'}
              </button>
            ))}
          </div>
        </label>

        <div className="toggle-row">
          <span className="toggle-label">数据与备份</span>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                void (async () => {
                  const res = await window.api.store.import()
                  if (res.canceled) return
                  if (!res.ok) {
                    setDataMsg(`导入失败：${res.message ?? '未知错误'}`)
                    return
                  }
                  const raw = await window.api.store.read()
                  if (raw) {
                    onReplace(JSON.parse(raw))
                    setDataMsg(`已导入 ${res.count ?? 0} 条任务`)
                  }
                })()
              }}
            >
              导入数据
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                void (async () => {
                  const res = await window.api.app.openDataDir()
                  setDataMsg(res.ok ? '' : `打不开数据目录：${res.message ?? '未知错误'}`)
                })()
              }}
            >
              打开数据目录
            </button>
          </div>
        </div>

        {dataMsg ? <p className="settings-message">{dataMsg}</p> : null}

        <p className="settings-hint">
          数据目录：{dataPath || '读取中…'}
          <br />
          {isMac
            ? '点窗口左上角的红色按钮不会退出，会收进菜单栏；点菜单栏图标可以直接把今天未完成的任务勾掉，退出请用 ⌘Q 或菜单栏菜单里的「退出计划清单」。'
            : '点窗口的 × 不会退出，会收进系统托盘；右键托盘图标可以直接把今天未完成的任务勾掉，退出请用托盘菜单里的「退出计划清单」。'}
        </p>
      </div>

      <div className="settings-section">
        <div className="settings-head">
          <Cloud size={14} strokeWidth={1.8} />
          <span>坚果云 WebDAV 同步</span>
          {busy ? <Loader2 size={13} className="spin" /> : null}
        </div>

        <label className="field">
          <span className="field-label">服务器地址</span>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={DEFAULT_URL} />
        </label>

        <label className="field">
          <span className="field-label">账号（坚果云登录邮箱）</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you@example.com"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span className="field-label">应用密码（不是登录密码）</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="在坚果云「安全选项 → 添加应用」生成"
            autoComplete="new-password"
          />
        </label>

        <label className="toggle-row">
          <span className="toggle-label">自动同步</span>
          <select
            className="input input-sm"
            value={data.settings.syncIntervalHours}
            onChange={(e) => onToggle({ syncIntervalHours: Number(e.target.value) })}
          >
            <option value={0}>关闭</option>
            <option value={1}>每 1 小时</option>
            <option value={6}>每 6 小时</option>
            <option value={12}>每 12 小时</option>
            <option value={24}>每 24 小时</option>
          </select>
        </label>

        <p className="settings-hint">
          密码用系统钥匙串加密后只存本机，不会写进同步文件。
          远端文件在 <code>jihua-qingdan/data.json</code>。
        </p>

        <div className="ai-settings-actions">
          <button type="button" className="btn btn-sm" onClick={() => void doTest()} disabled={busy || !url || !username}>
            {phase === 'testing' ? '测试中…' : '测试连接'}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => void doSync(false)} disabled={busy || !configured}>
            立即同步
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void doSync(true)}
            disabled={busy || !url || !username || !password}
          >
            {phase === 'saving' || phase === 'syncing' ? '同步中…' : '保存并同步'}
          </button>
        </div>

        {message ? <p className="settings-message">{message}</p> : null}
        {lastSync ? <p className="settings-hint">上次同步：{lastSync}</p> : null}
      </div>

      <div className="settings-section">
        <div className="settings-head">
          <Sparkles size={14} strokeWidth={1.8} />
          <span>AI 分析</span>
        </div>

        <label className="field">
          <span className="field-label">服务商</span>
          <select
            className="input"
            value={aiProvider}
            onChange={(e) => {
              const id = e.target.value
              setAiProvider(id)
              const preset = aiProviders.find((p) => p.id === id)
              if (preset && preset.baseUrl) {
                setAiBase(preset.baseUrl)
                setAiModel(preset.model)
              }
              setAiMessage('')
            }}
          >
            {aiProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Base URL</span>
            <input
              className="input"
              value={aiBase}
              onChange={(e) => setAiBase(e.target.value)}
              placeholder="https://api.deepseek.com"
            />
          </label>
          <label className="field">
            <span className="field-label">模型</span>
            <input
              className="input"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder="deepseek-chat"
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">API Key</span>
          <input
            className="input"
            type="password"
            value={aiKey}
            onChange={(e) => setAiKey(e.target.value)}
            placeholder={aiHasKey ? '已保存，留空则不修改' : 'sk-...'}
            autoComplete="new-password"
          />
        </label>

        <div className="ai-settings-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void testAiConnection()}
            disabled={aiTesting || !aiBase || !aiModel}
          >
            {aiTesting ? '测试中…' : '测试连接'}
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void saveAiSettings()}>
            保存 AI 设置
          </button>
          {aiMessage ? <span className="settings-message">{aiMessage}</span> : null}
        </div>

        <p className="settings-hint">
          Key 用系统钥匙串加密后只存本机。要求服务商提供 OpenAI 兼容的 <code>/chat/completions</code> 接口；
          默认 DeepSeek，也可以填通义千问、Kimi、智谱或自建网关。
        </p>
      </div>
    </Modal>
  )
}
