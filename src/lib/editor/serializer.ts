/**
 * TipTap JSON → Markdown serializer
 *
 * Directly serializes TipTap document JSON to Markdown without
 * an intermediate HTML step, giving full control over output formatting.
 */

import type { TipTapDocument, TipTapNode, TipTapMark } from './types';

/**
 * Convert a TipTap JSON document to a Markdown string.
 */
export function serializeTipTapToMarkdown(doc: TipTapDocument): string {
  if (doc.type !== 'doc' || !doc.content || doc.content.length === 0) {
    return '';
  }
  const result = serializeNodes(doc.content);
  // Normalize to exactly one trailing newline after the last block's double newline
  return result.replace(/\n{3,}$/, '\n\n');
}

function serializeNodes(nodes: TipTapNode[]): string {
  return nodes.map((node) => serializeNode(node)).join('');
}

function serializeNode(node: TipTapNode): string {
  switch (node.type) {
    case 'paragraph':
      return serializeParagraph(node);
    case 'heading':
      return serializeHeading(node);
    case 'bulletList':
      return serializeList(node, 'bullet');
    case 'orderedList':
      return serializeList(node, 'ordered');
    case 'codeBlock':
      return serializeCodeBlock(node);
    case 'blockquote':
      return serializeBlockquote(node);
    case 'image':
      return serializeImage(node);
    case 'hardBreak':
      return '  \n';
    case 'horizontalRule':
      return '---\n\n';
    case 'table':
      return serializeTable(node);
    case 'text':
      return serializeText(node);
    default:
      // Fallback: try to serialize content if present
      if (node.content) {
        return serializeNodes(node.content);
      }
      return '';
  }
}

function serializeParagraph(node: TipTapNode): string {
  const text = serializeInlineContent(node.content || []);
  return text + '\n\n';
}

function serializeHeading(node: TipTapNode): string {
  const level = Number(node.attrs?.level ?? 1);
  const prefix = '#'.repeat(level);
  const text = serializeInlineContent(node.content || []);
  return `${prefix} ${text}\n\n`;
}

function serializeList(node: TipTapNode, type: 'bullet' | 'ordered', indent = 0): string {
  const items = node.content || [];
  let result = '';

  items.forEach((item, index) => {
    const prefix = type === 'bullet' ? '- ' : `${index + 1}. `;
    const indentStr = '  '.repeat(indent);
    result += serializeListItem(item, prefix, indentStr);
  });

  // Only add trailing newline at top level
  if (indent === 0) {
    result += '\n';
  }

  return result;
}

function serializeListItem(node: TipTapNode, prefix: string, indent: string): string {
  const content = node.content || [];
  let result = '';

  content.forEach((child, i) => {
    if (child.type === 'paragraph') {
      const text = serializeInlineContent(child.content || []);
      if (i === 0) {
        result += `${indent}${prefix}${text}\n`;
      } else {
        // Continuation paragraphs in a list item
        result += `${indent}${'  '.repeat(prefix.length > 2 ? 1 : 1)}${text}\n`;
      }
    } else if (child.type === 'bulletList') {
      result += serializeList(child, 'bullet', indent.length / 2 + 1);
    } else if (child.type === 'orderedList') {
      result += serializeList(child, 'ordered', indent.length / 2 + 1);
    } else {
      // Other block content in list items
      const serialized = serializeNode(child);
      result += serialized;
    }
  });

  return result;
}

function serializeCodeBlock(node: TipTapNode): string {
  const language = node.attrs?.language || '';
  const content = getTextContent(node);
  return `\`\`\`${language}\n${content}\n\`\`\`\n\n`;
}

function serializeBlockquote(node: TipTapNode): string {
  const inner = serializeNodes(node.content || []);
  // Prefix each line with >
  const lines = inner.trimEnd().split('\n');
  const quoted = lines.map((line) => (line ? `> ${line}` : '>')).join('\n');
  return quoted + '\n\n';
}

function serializeImage(node: TipTapNode): string {
  const src = (node.attrs?.src || '') as string;
  const alt = (node.attrs?.alt || '') as string;
  const title = node.attrs?.title as string | undefined;
  const encodedSrc = src.replace(/ /g, '%20');
  if (title) {
    return `![${alt}](${encodedSrc} "${title}")\n\n`;
  }
  return `![${alt}](${encodedSrc})\n\n`;
}

function serializeTable(node: TipTapNode): string {
  const rows = node.content || [];
  if (rows.length === 0) return '';

  const tableData: string[][] = [];

  for (const row of rows) {
    const cells: string[] = [];
    for (const cell of row.content || []) {
      const text = serializeInlineContent(getCellContent(cell));
      cells.push(text);
    }
    tableData.push(cells);
  }

  if (tableData.length === 0) return '';

  // First row is header
  const header = tableData[0];
  const separator = header.map(() => '---');
  const bodyRows = tableData.slice(1);

  let result = `| ${header.join(' | ')} |\n`;
  result += `| ${separator.join(' | ')} |\n`;
  for (const row of bodyRows) {
    result += `| ${row.join(' | ')} |\n`;
  }
  result += '\n';

  return result;
}

function getCellContent(cell: TipTapNode): TipTapNode[] {
  // Table cells contain paragraphs; extract inline content from first paragraph
  if (cell.content && cell.content.length > 0) {
    const firstBlock = cell.content[0];
    if (firstBlock.type === 'paragraph' && firstBlock.content) {
      return firstBlock.content;
    }
    if (firstBlock.content) {
      return firstBlock.content;
    }
  }
  return [];
}

function serializeInlineContent(nodes: TipTapNode[]): string {
  return nodes.map((node) => serializeInlineNode(node)).join('');
}

function serializeInlineNode(node: TipTapNode): string {
  if (node.type === 'text') {
    return serializeText(node);
  }
  if (node.type === 'hardBreak') {
    return '  \n';
  }
  if (node.type === 'image') {
    const src = node.attrs?.src || '';
    const alt = node.attrs?.alt || '';
    const title = node.attrs?.title;
    const encodedSrc = src.replace(/ /g, '%20');
    if (title) {
      return `![${alt}](${encodedSrc} "${title}")`;
    }
    return `![${alt}](${encodedSrc})`;
  }
  return '';
}

function serializeText(node: TipTapNode): string {
  let text = node.text || '';
  const marks = node.marks || [];

  // Apply marks from innermost to outermost
  for (const mark of marks) {
    text = applyMark(text, mark);
  }

  return text;
}

function applyMark(text: string, mark: TipTapMark): string {
  switch (mark.type) {
    case 'bold':
      return `**${text}**`;
    case 'italic':
      return `*${text}*`;
    case 'code':
      return `\`${text}\``;
    case 'strike':
      return `~~${text}~~`;
    case 'link': {
      const href = mark.attrs?.href || '';
      const title = mark.attrs?.title;
      if (title) {
        return `[${text}](${href} "${title}")`;
      }
      return `[${text}](${href})`;
    }
    default:
      return text;
  }
}

/**
 * Extract plain text content from a node (used for code blocks).
 */
function getTextContent(node: TipTapNode): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map((child) => getTextContent(child)).join('');
}
