/**
 * Taxonomy Suggester feature module — analyzes entry content against existing
 * taxonomy terms and suggests relevant ones with relevance scores.
 *
 * Satisfies Requirements 10.1, 10.2, 10.3.
 */

import { z } from 'zod'
import type { ProviderAdapter, TokenUsage } from '../provider/interface'

/**
 * A taxonomy term with its handle and display title.
 */
export interface TaxonomyTerm {
  handle: string
  title: string
}

/**
 * A single taxonomy suggestion with a relevance score.
 */
export interface TaxonomySuggestion {
  term: TaxonomyTerm
  score: number // 0-1 relevance score
}

/**
 * Options for the taxonomy suggestion operation.
 */
export interface TaxonomySuggesterOptions {
  provider: ProviderAdapter
}

/**
 * Result of the taxonomy suggestion operation.
 */
export interface TaxonomySuggesterResult {
  suggestions: TaxonomySuggestion[]
  usage: TokenUsage
}

const TAXONOMY_SYSTEM_PROMPT =
  'You are a content categorization assistant. Your job is to analyze content and ' +
  'determine how relevant each taxonomy term is to the content. ' +
  'Rate each term with a relevance score from 0 to 1, where:\n' +
  '- 1.0 = the term is a perfect match for the content topic\n' +
  '- 0.7-0.9 = the term is highly relevant\n' +
  '- 0.4-0.6 = the term is somewhat relevant\n' +
  '- 0.1-0.3 = the term has minor relevance\n' +
  '- 0 = the term is not relevant at all\n\n' +
  'Only include terms with a score above 0. Be selective — most content should only ' +
  'match a few terms strongly. Return only the JSON structure requested.'

/**
 * Analyzes entry content against existing taxonomy terms and returns a ranked
 * list of suggestions ordered by relevance score descending.
 *
 * Req 10.1: Analyzes entry content against all existing terms in the taxonomy.
 * Req 10.2: Returns a ranked list ordered by relevance score descending.
 * Req 10.3: Returns data suitable for presenting as selectable options.
 *
 * Returns empty suggestions when content is empty or no terms are provided.
 */
export async function suggestTaxonomyTerms(
  content: string,
  existingTerms: TaxonomyTerm[],
  options: TaxonomySuggesterOptions,
): Promise<TaxonomySuggesterResult> {
  if (!content.trim() || existingTerms.length === 0) {
    return {
      suggestions: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  }

  const suggestionsSchema = z.object({
    scores: z.array(
      z.object({
        handle: z.string(),
        score: z.number().min(0).max(1),
      }),
    ),
  })

  const termsContext = existingTerms
    .map((t) => `- "${t.title}" (handle: ${t.handle})`)
    .join('\n')

  const prompt =
    `Analyze the following content and rate the relevance of each taxonomy term.\n\n` +
    `Content:\n${content}\n\n` +
    `Available taxonomy terms:\n${termsContext}\n\n` +
    `For each term that has any relevance to the content, return its handle and a score between 0 and 1.`

  const result = await options.provider.generateStructured(prompt, suggestionsSchema, {
    systemPrompt: TAXONOMY_SYSTEM_PROMPT,
    temperature: 0.3,
  })

  // Build a lookup map for term data
  const termMap = new Map<string, TaxonomyTerm>()
  for (const term of existingTerms) {
    termMap.set(term.handle, term)
  }

  // Filter to valid terms, clamp scores, and sort descending by score
  const suggestions: TaxonomySuggestion[] = result.data.scores
    .filter((s) => termMap.has(s.handle) && s.score > 0)
    .map((s) => ({
      term: termMap.get(s.handle)!,
      score: Math.min(1, Math.max(0, s.score)),
    }))
    .sort((a, b) => b.score - a.score)

  return {
    suggestions,
    usage: result.usage,
  }
}
