export const CSRF_PLACEHOLDER = '__MADORI_CSRF_TOKEN__'

export function injectCsrfPlaceholder(html: string, currentToken: string): string {
  return html.replaceAll(currentToken, CSRF_PLACEHOLDER)
}

export function replaceCsrfPlaceholder(html: string, freshToken: string): string {
  return html.replaceAll(CSRF_PLACEHOLDER, freshToken)
}
