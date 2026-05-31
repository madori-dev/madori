/**
 * Authenticated fetch wrapper for CP pages.
 * Redirects to /cp/login on 401 responses instead of showing raw errors.
 */
export async function cpFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init)

  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/cp/login'
    // Return a never-resolving promise to prevent the caller from processing the response
    return new Promise(() => {})
  }

  return res
}
