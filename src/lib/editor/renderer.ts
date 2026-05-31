import type { TipTapDocument, TipTapNode, TipTapMark } from './types'

/**
 * Render a TipTap JSON document to HTML, preserving alignment and table structure.
 */
export function renderTipTapToHtml(doc: TipTapDocument): string {
  if (!doc || doc.type !== 'doc' || !doc.content) return ''
  return doc.content.map(renderNode).join('')
}

function renderNode(node: TipTapNode): string {
  switch (node.type) {
    case 'paragraph':
      return renderBlock('p', node)
    case 'heading': {
      const level = node.attrs?.level ?? 1
      return renderBlock(`h${level}`, node)
    }
    case 'bulletList':
      return `<ul>${(node.content ?? []).map(renderNode).join('')}</ul>`
    case 'orderedList':
      return `<ol>${(node.content ?? []).map(renderNode).join('')}</ol>`
    case 'listItem':
      return `<li>${(node.content ?? []).map(renderNode).join('')}</li>`
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map(renderNode).join('')}</blockquote>`
    case 'codeBlock': {
      const lang = node.attrs?.language ?? ''
      const code = (node.content ?? []).map(renderInline).join('')
      return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapeHtml(code)}</code></pre>`
    }
    case 'horizontalRule':
      return '<hr>'
    case 'image': {
      const src = node.attrs?.src ?? ''
      const alt = node.attrs?.alt ?? ''
      const title = node.attrs?.title
      const width = node.attrs?.width
      const height = node.attrs?.height
      const alignment = node.attrs?.alignment ?? 'center'
      const styles: string[] = ['max-width: 100%', 'border-radius: 6px', 'display: block']
      if (width) styles.push(`width: ${typeof width === 'number' ? width + 'px' : width}`)
      if (height) styles.push(`height: ${typeof height === 'number' ? height + 'px' : height}`)
      if (alignment === 'center') {
        styles.push('margin-left: auto', 'margin-right: auto')
      } else if (alignment === 'right') {
        styles.push('margin-left: auto', 'margin-right: 0')
      } else {
        styles.push('margin-left: 0', 'margin-right: auto')
      }
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${title ? ` title="${escapeAttr(title)}"` : ''} style="${styles.join('; ')}">`
    }
    case 'table':
      return `<table>${(node.content ?? []).map(renderNode).join('')}</table>`
    case 'tableRow':
      return `<tr>${(node.content ?? []).map(renderNode).join('')}</tr>`
    case 'tableHeader': {
      const attrs = cellAttrs(node)
      return `<th${attrs}>${(node.content ?? []).map(renderNode).join('')}</th>`
    }
    case 'tableCell': {
      const attrs = cellAttrs(node)
      return `<td${attrs}>${(node.content ?? []).map(renderNode).join('')}</td>`
    }
    case 'hardBreak':
      return '<br>'
    case 'text':
      return renderTextNode(node)
    default:
      // Unknown node: render children if any
      if (node.content) {
        return node.content.map(renderNode).join('')
      }
      return ''
  }
}

function renderBlock(tag: string, node: TipTapNode): string {
  const style = getAlignmentStyle(node)
  const attrStr = style ? ` style="${style}"` : ''
  const inner = (node.content ?? []).map(renderInline).join('')
  return `<${tag}${attrStr}>${inner}</${tag}>`
}

function renderInline(node: TipTapNode): string {
  if (node.type === 'text') {
    return renderTextNode(node)
  }
  if (node.type === 'hardBreak') {
    return '<br>'
  }
  if (node.type === 'image') {
    const src = node.attrs?.src ?? ''
    const alt = node.attrs?.alt ?? ''
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`
  }
  return ''
}

function renderTextNode(node: TipTapNode): string {
  let text = escapeHtml(node.text ?? '')
  if (node.marks) {
    for (const mark of node.marks) {
      text = applyMark(text, mark)
    }
  }
  return text
}

function applyMark(text: string, mark: TipTapMark): string {
  switch (mark.type) {
    case 'bold':
      return `<strong>${text}</strong>`
    case 'italic':
      return `<em>${text}</em>`
    case 'strike':
      return `<s>${text}</s>`
    case 'code':
      return `<code>${text}</code>`
    case 'link': {
      const href = mark.attrs?.href ?? ''
      const target = mark.attrs?.target
      return `<a href="${escapeAttr(href)}"${target ? ` target="${escapeAttr(target)}"` : ''}>${text}</a>`
    }
    default:
      return text
  }
}

function getAlignmentStyle(node: TipTapNode): string {
  const align = node.attrs?.textAlign
  if (align && align !== 'left') {
    return `text-align: ${align}`
  }
  return ''
}

function cellAttrs(node: TipTapNode): string {
  const parts: string[] = []
  if (node.attrs?.colspan && node.attrs.colspan > 1) {
    parts.push(`colspan="${node.attrs.colspan}"`)
  }
  if (node.attrs?.rowspan && node.attrs.rowspan > 1) {
    parts.push(`rowspan="${node.attrs.rowspan}"`)
  }
  return parts.length ? ' ' + parts.join(' ') : ''
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
