import { describe, it, expect } from 'vitest';
import { parseMarkdownToTipTap } from '../../../src/lib/editor/parser';

describe('parseMarkdownToTipTap', () => {
  it('parses empty string to minimal document', () => {
    const doc = parseMarkdownToTipTap('');
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe('paragraph');
  });

  it('parses a plain paragraph', () => {
    const doc = parseMarkdownToTipTap('Hello world');
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe('paragraph');
    expect(doc.content[0].content).toHaveLength(1);
    expect(doc.content[0].content![0]).toEqual({
      type: 'text',
      text: 'Hello world',
    });
  });

  it('parses headings', () => {
    const doc = parseMarkdownToTipTap('# Title\n\n## Subtitle');
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].type).toBe('heading');
    expect(doc.content[0].attrs).toEqual({ level: 1 });
    expect(doc.content[0].content![0]).toEqual({ type: 'text', text: 'Title' });
    expect(doc.content[1].type).toBe('heading');
    expect(doc.content[1].attrs).toEqual({ level: 2 });
  });

  it('parses bold text', () => {
    const doc = parseMarkdownToTipTap('**bold**');
    const para = doc.content[0];
    expect(para.content).toHaveLength(1);
    expect(para.content![0].text).toBe('bold');
    expect(para.content![0].marks).toEqual([{ type: 'bold' }]);
  });

  it('parses italic text', () => {
    const doc = parseMarkdownToTipTap('*italic*');
    const para = doc.content[0];
    expect(para.content![0].text).toBe('italic');
    expect(para.content![0].marks).toEqual([{ type: 'italic' }]);
  });

  it('parses inline code', () => {
    const doc = parseMarkdownToTipTap('`code`');
    const para = doc.content[0];
    expect(para.content![0].text).toBe('code');
    expect(para.content![0].marks).toEqual([{ type: 'code' }]);
  });

  it('parses strikethrough', () => {
    const doc = parseMarkdownToTipTap('~~deleted~~');
    const para = doc.content[0];
    expect(para.content![0].text).toBe('deleted');
    expect(para.content![0].marks).toEqual([{ type: 'strike' }]);
  });

  it('parses links', () => {
    const doc = parseMarkdownToTipTap('[click](https://example.com)');
    const para = doc.content[0];
    expect(para.content![0].text).toBe('click');
    expect(para.content![0].marks).toEqual([
      { type: 'link', attrs: { href: 'https://example.com' } },
    ]);
  });

  it('parses links with title', () => {
    const doc = parseMarkdownToTipTap('[click](https://example.com "Title")');
    const para = doc.content[0];
    expect(para.content![0].marks).toEqual([
      { type: 'link', attrs: { href: 'https://example.com', title: 'Title' } },
    ]);
  });

  it('parses bullet lists', () => {
    const doc = parseMarkdownToTipTap('- Item 1\n- Item 2');
    expect(doc.content).toHaveLength(1);
    const list = doc.content[0];
    expect(list.type).toBe('bulletList');
    expect(list.content).toHaveLength(2);
    expect(list.content![0].type).toBe('listItem');
    expect(list.content![0].content![0].type).toBe('paragraph');
    expect(list.content![0].content![0].content![0].text).toBe('Item 1');
  });

  it('parses ordered lists', () => {
    const doc = parseMarkdownToTipTap('1. First\n2. Second');
    const list = doc.content[0];
    expect(list.type).toBe('orderedList');
    expect(list.content).toHaveLength(2);
    expect(list.content![0].content![0].content![0].text).toBe('First');
  });

  it('parses code blocks with language', () => {
    const doc = parseMarkdownToTipTap('```typescript\nconst x = 1;\n```');
    const block = doc.content[0];
    expect(block.type).toBe('codeBlock');
    expect(block.attrs).toEqual({ language: 'typescript' });
    expect(block.content![0].text).toBe('const x = 1;');
  });

  it('parses code blocks without language', () => {
    const doc = parseMarkdownToTipTap('```\nplain code\n```');
    const block = doc.content[0];
    expect(block.type).toBe('codeBlock');
    expect(block.attrs).toEqual({ language: null });
    expect(block.content![0].text).toBe('plain code');
  });

  it('parses blockquotes', () => {
    const doc = parseMarkdownToTipTap('> A wise quote');
    const bq = doc.content[0];
    expect(bq.type).toBe('blockquote');
    expect(bq.content![0].type).toBe('paragraph');
    expect(bq.content![0].content![0].text).toBe('A wise quote');
  });

  it('parses images', () => {
    const doc = parseMarkdownToTipTap('![Alt text](/img/photo.jpg "Title")');
    // Images at block level are wrapped in a paragraph by marked
    const para = doc.content[0];
    expect(para.type).toBe('paragraph');
    const img = para.content![0];
    expect(img.type).toBe('image');
    expect(img.attrs).toEqual({
      src: '/img/photo.jpg',
      alt: 'Alt text',
      title: 'Title',
    });
  });

  it('parses horizontal rules', () => {
    const doc = parseMarkdownToTipTap('Above\n\n---\n\nBelow');
    expect(doc.content).toHaveLength(3);
    expect(doc.content[0].type).toBe('paragraph');
    expect(doc.content[1].type).toBe('horizontalRule');
    expect(doc.content[2].type).toBe('paragraph');
  });

  it('parses tables', () => {
    const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |';
    const doc = parseMarkdownToTipTap(md);
    const table = doc.content[0];
    expect(table.type).toBe('table');
    expect(table.content).toHaveLength(2); // header row + 1 body row
    // Header row
    const headerRow = table.content![0];
    expect(headerRow.type).toBe('tableRow');
    expect(headerRow.content![0].type).toBe('tableHeader');
    expect(headerRow.content![0].content![0].content![0].text).toBe('Name');
    // Body row
    const bodyRow = table.content![1];
    expect(bodyRow.type).toBe('tableRow');
    expect(bodyRow.content![0].type).toBe('tableCell');
    expect(bodyRow.content![0].content![0].content![0].text).toBe('Alice');
  });

  it('parses nested lists', () => {
    const md = '- Item 1\n  - Nested 1\n  - Nested 2\n- Item 2';
    const doc = parseMarkdownToTipTap(md);
    const list = doc.content[0];
    expect(list.type).toBe('bulletList');
    // First item should have a nested list
    const firstItem = list.content![0];
    expect(firstItem.type).toBe('listItem');
    // Should have paragraph + nested bulletList
    const nestedList = firstItem.content!.find(
      (n) => n.type === 'bulletList'
    );
    expect(nestedList).toBeDefined();
    expect(nestedList!.content).toHaveLength(2);
  });

  it('parses mixed inline formatting', () => {
    const doc = parseMarkdownToTipTap('Hello **bold** and *italic* world');
    const para = doc.content[0];
    expect(para.content!.length).toBeGreaterThanOrEqual(3);
    // Find the bold node
    const boldNode = para.content!.find(
      (n) => n.marks?.some((m) => m.type === 'bold')
    );
    expect(boldNode).toBeDefined();
    expect(boldNode!.text).toBe('bold');
  });
});
