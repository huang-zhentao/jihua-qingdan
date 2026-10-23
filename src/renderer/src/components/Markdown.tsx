import type { ReactNode } from 'react'
import { cx } from '../utils'

/** 行内：**粗体**、`代码` */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return <span key={i}>{part}</span>
  })
}

/**
 * 极简 Markdown：标题、无序/有序列表、段落、粗体、行内代码。
 * AI 回答和任务备注共用。
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const nodes: ReactNode[] = []
  let list: string[] = []
  let ordered = false

  const flush = (): void => {
    if (!list.length) return
    const items = list.map((item, i) => <li key={i}>{renderInline(item)}</li>)
    nodes.push(
      ordered ? (
        <ol key={`ol-${nodes.length}`} className="md-list">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${nodes.length}`} className="md-list">
          {items}
        </ul>
      )
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
        <h4 key={`h-${index}`} className={cx('md-h', heading[1].length >= 3 && 'is-sub')}>
          {heading[2]}
        </h4>
      )
      return
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) {
      if (ordered) flush()
      ordered = false
      list.push(bullet[1])
      return
    }
    const num = line.match(/^\s*\d+[.、]\s+(.*)$/)
    if (num) {
      if (!ordered) flush()
      ordered = true
      list.push(num[1])
      return
    }
    flush()
    nodes.push(
      <p key={`p-${index}`} className="md-p">
        {renderInline(line)}
      </p>
    )
  })
  flush()

  return <div className={cx('md', className)}>{nodes}</div>
}
