/**
 * Markdown → TipTap JSON parser
 *
 * Uses `marked` to tokenize Markdown, then transforms tokens
 * into TipTap JSON document structure.
 */

import { Lexer, type Token, type Tokens } from 'marked';
import type { TipTapDocument, TipTapNode, TipTapMark } from './types';

/**
 * Convert a Markdown string to a TipTap JSON document.
 */
export function parseMarkdownToTipTap(markdown: string): TipTapDocument {
  const lexer = new Lexer();
  const tokens = lexer.lex(markdown);
  const content = transformBlockTokens(tokens);

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

function transformBlockTokens(tokens: Token[]): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  for (const token of tokens) {
    const node = transformBlockToken(token);
    if (node) {
      nodes.push(node);
    }
  }

  return nodes;
}

function transformBlockToken(token: Token): TipTapNode | null {
  switch (token.type) {
    case 'paragraph':
      return transformParagraph(token as Tokens.Paragraph);
    case 'heading':
      return transformHeading(token as Tokens.Heading);
    case 'code':
      return transformCodeBlock(token as Tokens.Code);
    case 'blockquote':
      return transformBlockquote(token as Tokens.Blockquote);
    case 'list':
      return transformList(token as Tokens.List);
    case 'hr':
      return { type: 'horizontalRule' };
    case 'image':
      return transformImage(token as Tokens.Image);
    case 'table':
      return transformTable(token as Tokens.Table);
    case 'html':
      return transformHtml(token as Tokens.HTML);
    case 'space':
      return null;
    default:
      return null;
  }
}

function transformParagraph(token: Tokens.Paragraph): TipTapNode {
  const content = transformInlineTokens(token.tokens || []);
  return {
    type: 'paragraph',
    ...(content.length > 0 ? { content } : {}),
  };
}

function transformHeading(token: Tokens.Heading): TipTapNode {
  const content = transformInlineTokens(token.tokens || []);
  return {
    type: 'heading',
    attrs: { level: token.depth },
    ...(content.length > 0 ? { content } : {}),
  };
}

function transformCodeBlock(token: Tokens.Code): TipTapNode {
  return {
    type: 'codeBlock',
    attrs: { language: token.lang || null },
    content: [{ type: 'text', text: token.text }],
  };
}

function transformBlockquote(token: Tokens.Blockquote): TipTapNode {
  const content = transformBlockTokens(token.tokens || []);
  return {
    type: 'blockquote',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

function transformList(token: Tokens.List): TipTapNode {
  const type = token.ordered ? 'orderedList' : 'bulletList';
  const items = token.items.map((item) => transformListItem(item));
  return {
    type,
    content: items,
  };
}

function transformListItem(token: Tokens.ListItem): TipTapNode {
  const content = transformListItemContent(token.tokens || []);
  return {
    type: 'listItem',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

function transformListItemContent(tokens: Token[]): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  for (const token of tokens) {
    if (token.type === 'text' && 'tokens' in token && token.tokens) {
      // Inline text in list items — wrap in paragraph
      const content = transformInlineTokens(token.tokens);
      nodes.push({
        type: 'paragraph',
        ...(content.length > 0 ? { content } : {}),
      });
    } else if (token.type === 'list') {
      // Nested list
      nodes.push(transformList(token as Tokens.List));
    } else if (token.type === 'space') {
      // Skip whitespace tokens
      continue;
    } else {
      const node = transformBlockToken(token);
      if (node) {
        nodes.push(node);
      }
    }
  }

  return nodes;
}

function transformImage(token: Tokens.Image): TipTapNode {
  return {
    type: 'image',
    attrs: {
      src: token.href,
      alt: token.text || null,
      title: token.title || null,
    },
  };
}

function transformTable(token: Tokens.Table): TipTapNode {
  const rows: TipTapNode[] = [];

  // Header row
  const headerCells = token.header.map((cell) => ({
    type: 'tableHeader' as const,
    content: [
      {
        type: 'paragraph' as const,
        ...(cell.tokens.length > 0
          ? { content: transformInlineTokens(cell.tokens) }
          : {}),
      },
    ],
  }));
  rows.push({ type: 'tableRow', content: headerCells });

  // Body rows
  for (const row of token.rows) {
    const cells = row.map((cell) => ({
      type: 'tableCell' as const,
      content: [
        {
          type: 'paragraph' as const,
          ...(cell.tokens.length > 0
            ? { content: transformInlineTokens(cell.tokens) }
            : {}),
        },
      ],
    }));
    rows.push({ type: 'tableRow', content: cells });
  }

  return {
    type: 'table',
    content: rows,
  };
}

function transformHtml(token: Tokens.HTML): TipTapNode | null {
  // Handle <br> tags as hard breaks within a paragraph
  if (token.text.trim() === '<br>' || token.text.trim() === '<br/>') {
    return {
      type: 'paragraph',
      content: [{ type: 'hardBreak' }],
    };
  }
  // Skip other HTML — TipTap doesn't have a generic HTML node
  return null;
}

function transformInlineTokens(tokens: Token[]): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  for (const token of tokens) {
    const inlineNodes = transformInlineToken(token);
    nodes.push(...inlineNodes);
  }

  return nodes;
}

function transformInlineToken(token: Token): TipTapNode[] {
  switch (token.type) {
    case 'text':
      return [{ type: 'text', text: (token as Tokens.Text).text }];
    case 'strong':
      return transformMarkedInline(token as Tokens.Strong, { type: 'bold' });
    case 'em':
      return transformMarkedInline(token as Tokens.Em, { type: 'italic' });
    case 'del':
      return transformMarkedInline(token as Tokens.Del, { type: 'strike' });
    case 'codespan':
      return [
        {
          type: 'text',
          text: (token as Tokens.Codespan).text,
          marks: [{ type: 'code' }],
        },
      ];
    case 'link':
      return transformLink(token as Tokens.Link);
    case 'image':
      return [
        {
          type: 'image',
          attrs: {
            src: (token as Tokens.Image).href,
            alt: (token as Tokens.Image).text || null,
            title: (token as Tokens.Image).title || null,
          },
        },
      ];
    case 'br':
      return [{ type: 'hardBreak' }];
    case 'escape':
      return [{ type: 'text', text: (token as Tokens.Escape).text }];
    default:
      return [];
  }
}

function transformMarkedInline(
  token: { tokens?: Token[] },
  mark: TipTapMark
): TipTapNode[] {
  const innerTokens = token.tokens || [];
  const innerNodes = transformInlineTokens(innerTokens);

  // Apply the mark to all text nodes within
  return innerNodes.map((node) => {
    if (node.type === 'text') {
      const existingMarks = node.marks || [];
      return { ...node, marks: [...existingMarks, mark] };
    }
    // For non-text nodes (like images), return as-is
    return node;
  });
}

function transformLink(token: Tokens.Link): TipTapNode[] {
  const mark: TipTapMark = {
    type: 'link',
    attrs: {
      href: token.href,
      ...(token.title ? { title: token.title } : {}),
    },
  };

  const innerNodes = transformInlineTokens(token.tokens || []);

  // Apply link mark to all text nodes within
  return innerNodes.map((node) => {
    if (node.type === 'text') {
      const existingMarks = node.marks || [];
      return { ...node, marks: [...existingMarks, mark] };
    }
    return node;
  });
}
