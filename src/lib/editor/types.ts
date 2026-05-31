/**
 * TipTap document type definitions.
 *
 * These types represent the JSON structure that TipTap uses internally
 * to represent rich text documents.
 */

export interface TipTapMark {
  type: 'bold' | 'italic' | 'code' | 'link' | 'strike';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attrs?: Record<string, any>;
}

export interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attrs?: Record<string, any>;
}

export interface TipTapDocument {
  type: 'doc';
  content: TipTapNode[];
}
