import { describe, it, expect } from 'vitest';
import { serializeTipTapToMarkdown } from '../../../src/lib/editor/serializer';
import type { TipTapDocument } from '../../../src/lib/editor/types';

describe('serializeTipTapToMarkdown', () => {
  it('serializes an empty document', () => {
    const doc: TipTapDocument = { type: 'doc', content: [] };
    expect(serializeTipTapToMarkdown(doc)).toBe('');
  });

  it('serializes a paragraph with plain text', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('Hello world\n\n');
  });

  it('serializes headings at different levels', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Subtitle' }],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('# Title\n\n### Subtitle\n\n');
  });

  it('serializes bold, italic, and code marks', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'code', marks: [{ type: 'code' }] },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '**bold** and *italic* and `code`\n\n'
    );
  });

  it('serializes strikethrough', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'deleted', marks: [{ type: 'strike' }] },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('~~deleted~~\n\n');
  });

  it('serializes links', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click here',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '[click here](https://example.com)\n\n'
    );
  });

  it('serializes links with title', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'link',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://example.com', title: 'Example' },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '[link](https://example.com "Example")\n\n'
    );
  });

  it('serializes bullet lists', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Item 1' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Item 2' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('- Item 1\n- Item 2\n\n');
  });

  it('serializes ordered lists', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'First' }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Second' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('1. First\n2. Second\n\n');
  });

  it('serializes code blocks with language', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const x = 1;' }],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '```typescript\nconst x = 1;\n```\n\n'
    );
  });

  it('serializes code blocks without language', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'plain code' }],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('```\nplain code\n```\n\n');
  });

  it('serializes blockquotes', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'A wise quote' }],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('> A wise quote\n\n');
  });

  it('serializes images', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: '/img/photo.jpg', alt: 'A photo', title: null },
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('![A photo](/img/photo.jpg)\n\n');
  });

  it('serializes images with title', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: '/img/photo.jpg', alt: 'A photo', title: 'Photo title' },
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '![A photo](/img/photo.jpg "Photo title")\n\n'
    );
  });

  it('serializes horizontal rules', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Above' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Below' }],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      'Above\n\n---\n\nBelow\n\n'
    );
  });

  it('serializes tables', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Name' }],
                    },
                  ],
                },
                {
                  type: 'tableHeader',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Age' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Alice' }],
                    },
                  ],
                },
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '30' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n\n'
    );
  });

  it('serializes hard breaks', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Line 1' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Line 2' },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('Line 1  \nLine 2\n\n');
  });

  it('serializes nested marks (bold + italic)', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bold italic',
              marks: [{ type: 'bold' }, { type: 'italic' }],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe('***bold italic***\n\n');
  });

  it('serializes nested bullet lists', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Parent item' }],
                },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'Child item 1' }],
                        },
                      ],
                    },
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'Child item 2' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Second parent' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = serializeTipTapToMarkdown(doc);
    expect(result).toBe(
      '- Parent item\n  - Child item 1\n  - Child item 2\n- Second parent\n\n'
    );
  });

  it('serializes ordered list nested inside bullet list', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Steps:' }],
                },
                {
                  type: 'orderedList',
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'First' }],
                        },
                      ],
                    },
                    {
                      type: 'listItem',
                      content: [
                        {
                          type: 'paragraph',
                          content: [{ type: 'text', text: 'Second' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = serializeTipTapToMarkdown(doc);
    expect(result).toBe(
      '- Steps:\n  1. First\n  2. Second\n\n'
    );
  });

  it('serializes tables with formatted cell content', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        { type: 'text', text: 'Feature', marks: [{ type: 'bold' }] },
                      ],
                    },
                  ],
                },
                {
                  type: 'tableHeader',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Status' }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Docs',
                          marks: [{ type: 'link', attrs: { href: '/docs' } }],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        { type: 'text', text: 'Done', marks: [{ type: 'code' }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '| **Feature** | Status |\n| --- | --- |\n| [Docs](/docs) | `Done` |\n\n'
    );
  });

  it('serializes multi-line code blocks', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'javascript' },
          content: [
            { type: 'text', text: 'function hello() {\n  return "world";\n}' },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '```javascript\nfunction hello() {\n  return "world";\n}\n```\n\n'
    );
  });

  it('serializes embedded asset image references', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Check out this screenshot:' }],
        },
        {
          type: 'image',
          attrs: {
            src: '/assets/images/screenshot-2024.png',
            alt: 'Dashboard screenshot',
            title: null,
          },
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Pretty neat, right?' }],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      'Check out this screenshot:\n\n![Dashboard screenshot](/assets/images/screenshot-2024.png)\n\nPretty neat, right?\n\n'
    );
  });

  it('serializes inline image within paragraph (asset reference)', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Click ' },
            {
              type: 'image',
              attrs: { src: '/assets/icons/arrow.svg', alt: 'arrow', title: null },
            },
            { type: 'text', text: ' to continue' },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      'Click ![arrow](/assets/icons/arrow.svg) to continue\n\n'
    );
  });

  it('serializes blockquote with multiple paragraphs', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First paragraph.' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Second paragraph.' }],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '> First paragraph.\n>\n> Second paragraph.\n\n'
    );
  });

  it('serializes bold text inside a link', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'important link',
              marks: [
                { type: 'bold' },
                { type: 'link', attrs: { href: 'https://example.com' } },
              ],
            },
          ],
        },
      ],
    };
    expect(serializeTipTapToMarkdown(doc)).toBe(
      '[**important link**](https://example.com)\n\n'
    );
  });
});
