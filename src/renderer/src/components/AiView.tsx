import { ArrowUp, Sparkles, Square, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import type { Project, Task } from '../domain/types'
import { cx } from '../utils'
import { useTodayKey } from '../hooks/useTodayKey'

type Range = '7d' | '30d' | 'month'

interface Props {
  tasks: Task[]
  projects: Project[]
  onOpenSettings: () => void
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

function startOf(range: Range, today: Date): Date {
  if (range === '7d') return subDays(today, 6)
  if (range === '30d') return subDays(today, 29)
  return new Date(today.getFullYear(), today.getMonth(), 1)
}

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>
  )
}

function renderMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let list: string[] = []
  const flush = (): void => {
    if (!list.length) return
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="ai-list">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    )
    list = []
  }

  text.split('\n').forEach((raw, index) => {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      return
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flush()
      nodes.push(
        <h4 key={`h-${index}`} className={cx('ai-h', heading[1].length >= 3 && 'is-sub')}>
          {heading[2]}
        </h4>
      )
      return
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) {
      list.push(bullet[1])
      return
    }
    const ordered = line.match(/^\s*\d+[.、]\s+(.*)$/)
    if (ordered) {
      list.push(ordered[1])
      return
    }
    flush()
    nodes.push(
      <p key={`p-${index}`} className="ai-p">
        {renderInline(line)}
      </p>
    )
  })
  flush()
  return nodes
}

export function AiView({ tasks, projects, onOpenSettings }: Props) {
  const [range, setRange] = useState<Range>('7d')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [model, setModel] = useState('')
  const bufferRef = useRef('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void window.api.ai.config().then((cfg) => {
      setHasKey(cfg.hasKey)
      setModel(cfg.model)
    })
  }, [])

  useEffect(() => {
    const offChunk = window.api.ai.onChunk((piece) => {
      bufferRef.current += piece
      const content = bufferRef.current
      setMessages((prev) => {
        const copy = [...prev]
        if (copy.length && copy[copy.length - 1].role === 'assistant') {
          copy[copy.length - 1] = { role: 'assistant', content }
        }
        return copy
      })
    })
    const offDone = window.api.ai.onDone(() => {
      setRunning(false)
      bufferRef.current = ''
      setMessages((prev) => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant' && !last.content.trim()) {
          copy[copy.length - 1] = { role: 'assistant', content: '（模型没有返回内容）' }
        }
        return copy
      })
    })
    const offError = window.api.ai.onError((message) => {
      setRunning(false)
      setError(message)
      bufferRef.current = ''
      setMessages((prev) => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant' && !last.content.trim()) copy.pop()
        return copy
      })
    })
    const offAborted = window.api.ai.onAborted(() => {
      setRunning(false)
      bufferRef.current = ''
      setMessages((prev) => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last?.role === 'assistant' && !last.content.trim()) {
          copy[copy.length - 1] = { role: 'assistant', content: '（已停止）' }
        }
        return copy
      })
    })
    return () => {
      offChunk()
      offDone()
      offError()
      offAborted()
    }
  }, [])

  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [messages, running])

  const [todayKey] = useTodayKey()
  const today = useMemo(() => parseISO(todayKey), [todayKey])
  const fromKey = format(startOf(range, today), 'yyyy-MM-dd')
  const toKey = format(today, 'yyyy-MM-dd')

  const inRange = useMemo(
    () => tasks.filter((t) => !t.deletedAt && t.date && t.date >= fromKey && t.date <= toKey),
    [tasks, fromKey, toKey]
  )

  const stats = useMemo(() => {
    const done = inRange.filter((t) => t.done).length
    const byProject = new Map<string, { name: string; total: number; done: number }>()
    for (const task of inRange) {
      const name = projects.find((p) => p.id === task.projectId)?.name ?? '未分类'
      const entry = byProject.get(name) ?? { name, total: 0, done: 0 }
      entry.total++
      if (task.done) entry.done++
      byProject.set(name, entry)
    }
    return { total: inRange.length, done, undone: inRange.length - done, byProject: [...byProject.values()] }
  }, [inRange, projects])

  const systemPrompt = useMemo(() => {
    const lines = inRange
      .slice()
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      .slice(-60)
      .map((task) => {
        const name = projects.find((p) => p.id === task.projectId)?.name ?? '未分类'
        return `- ${task.date} [${name}] ${task.done ? '已完成' : '未完成'}：${task.title}`
      })
    return [
      '你是「计划清单」里的中文工作助理，负责帮用户回顾和安排任务。',
      '只根据下面给出的任务数据回答，不要编造不存在的任务或数字；不确定就说不知道。',
      '回答用简洁的 Markdown，可用小标题和列表，控制在 300 字以内。',
      '',
      `统计区间：${fromKey} 至 ${toKey}`,
      `任务总数：${stats.total}，已完成：${stats.done}，未完成：${stats.undone}`,
      `按项目：${stats.byProject.map((p) => `${p.name} ${p.done}/${p.total}`).join('，') || '无'}`,
      '',
      '任务明细：',
      lines.join('\n') || '（该区间没有任务）'
    ].join('\n')
  }, [inRange, projects, fromKey, toKey, stats])

  const send = (text: string): void => {
    const content = text.trim()
    if (!content || running) return
    // 先占住 running，避免连按两次 Enter 发出两条
    setRunning(true)
    void (async () => {
      const cfg = await window.api.ai.config()
      setHasKey(cfg.hasKey)
      if (!cfg.hasKey) {
        setRunning(false)
        onOpenSettings()
        return
      }
      setError('')
      const next: ChatMsg[] = [...messages, { role: 'user', content }]
      setMessages([...next, { role: 'assistant', content: '' }])
      setInput('')
      bufferRef.current = ''
      const history = next.slice(-10).map((m) => ({ role: m.role, content: m.content }))
      window.api.ai.chat([{ role: 'system', content: systemPrompt }, ...history])
      inputRef.current?.focus()
    })().catch(() => setRunning(false))
  }

  const stop = (): void => {
    window.api.ai.abort()
  }

  const clear = (): void => {
    if (running) return
    setMessages([])
    setError('')
  }

  const quick = [
    { label: '总结这段时间的工作', text: '帮我总结这段时间的工作，分完成情况、重点和风险三部分。' },
    { label: '哪些事拖太久了', text: '看看有没有拖了很久还没完成的任务，指出最该优先处理的几条。' },
    { label: '给下周排个优先级', text: '根据这些未完成的任务，帮我安排下周的优先级，给个顺序。' }
  ]

  return (
    <div className="ai-view">
      <aside className="ai-side">
        <div className="ai-side-head">
          <Sparkles size={15} strokeWidth={1.9} />
          <span>AI 助手</span>
        </div>

        <div className="ai-range">
          {(
            [
              ['7d', '最近 7 天'],
              ['30d', '最近 30 天'],
              ['month', '本月']
            ] as Array<[Range, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cx('ai-range-btn', range === key && 'is-active')}
              onClick={() => setRange(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ai-stats">
          <div className="ai-stat">
            <span className="ai-stat-num">{stats.total}</span>
            <span className="ai-stat-label">任务</span>
          </div>
          <div className="ai-stat">
            <span className="ai-stat-num">{stats.done}</span>
            <span className="ai-stat-label">完成</span>
          </div>
          <div className="ai-stat">
            <span className="ai-stat-num">{stats.undone}</span>
            <span className="ai-stat-label">未完成</span>
          </div>
        </div>

        <div className="ai-projects">
          {stats.byProject.map((p) => (
            <div className="ai-project" key={p.name}>
              <span>{p.name}</span>
              <span>
                {p.done}/{p.total}
              </span>
            </div>
          ))}
        </div>

        <p className="ai-hint">
          {model ? `当前模型：${model}` : '尚未配置模型'}
          <button type="button" className="ai-link" onClick={onOpenSettings}>
            去设置
          </button>
        </p>
      </aside>

      <section className="ai-main">
        <header className="ai-head">
          <div>
            <h3 className="ai-title">对话</h3>
            <p className="ai-sub">
              {fromKey} 至 {toKey} · 共 {stats.total} 条
            </p>
          </div>
          <button type="button" className="icon-btn ai-clear" aria-label="清空对话" title="清空对话" onClick={clear}>
            <Trash2 size={15} strokeWidth={1.8} />
          </button>
        </header>

        <div className="ai-output" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="ai-empty">
              <Sparkles size={26} strokeWidth={1.4} />
              <p>问我关于这段时间的任务</p>
              <div className="ai-quick">
                {quick.map((q) => (
                  <button key={q.label} type="button" className="ai-quick-btn" onClick={() => send(q.text)}>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="ai-chat">
              {messages.map((msg, index) => (
                <div key={index} className={cx('ai-msg', msg.role)}>
                  {msg.role === 'assistant' ? (
                    <div className="ai-bubble">
                      {msg.content ? renderMarkdown(msg.content) : <span className="ai-thinking">思考中…</span>}
                    </div>
                  ) : (
                    <div className="ai-bubble">{msg.content}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {error ? <p className="ai-error">{error}</p> : null}
        </div>

        <div className="ai-composer">
          <textarea
            ref={inputRef}
            className="ai-input"
            rows={2}
            placeholder="问点什么，比如「这周哪些事最重要」…（Enter 发送，Shift+Enter 换行）"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
          />
          <button
            type="button"
            className={running ? 'btn ai-send is-stop' : 'btn btn-primary ai-send'}
            onClick={() => (running ? stop() : send(input))}
            disabled={!running && !input.trim()}
            aria-label={running ? '停止生成' : '发送'}
            title={running ? '停止生成' : '发送'}
          >
            {running ? <Square size={13} strokeWidth={2.4} /> : <ArrowUp size={16} strokeWidth={2.2} />}
          </button>
        </div>
      </section>
    </div>
  )
}
