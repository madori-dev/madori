/**
 * TipTap document type definitions.
 *
 * These types represent the JSON structure that TipTap uses internally
 * to represent rich text documents.
 */

export interface TipTapMark {
  type: 'bold' | 'italic' | 'code' | 'link' | 'strike';
  attrs?: Record<string, unknown>;
}

export interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
  attrs?: Record<string, unknown>;
}

export interface TipTapDocument {
  type: 'doc';
  content: TipTapNode[];
}
