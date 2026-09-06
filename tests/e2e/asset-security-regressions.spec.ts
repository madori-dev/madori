import { expect, test } from '@playwright/test'

test('new uploads and renames are served immediately from the configured root', async ({ page, request }) => {
  await page.goto('/cp/login')
  await page.locator('#email:visible').fill('e2e@example.test')
  await page.locator('#password:visible').fill('e2e-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/cp$/)

  const upload = await page.evaluate(async () => {
    const data = new FormData()
    data.set('file', new File(['runtime upload'], 'audit-runtime.txt', { type: 'text/plain' }))
    const first = await fetch('/api/assets/upload', { method: 'POST', body: data })
    const second = await fetch('/api/assets/upload', { method: 'POST', body: data })
    return [first.status, second.status]
  })
  expect(upload).toEqual([201, 409])
  const uploaded = await request.get('/assets/audit-runtime.txt')
  expect(uploaded.status()).toBe(200)
  expect(await uploaded.text()).toBe('runtime upload')

  const rename = await page.evaluate(async () => {
    const result = await fetch('/api/assets/audit-runtime.txt', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'audit-runtime-renamed.txt', alt: 'Runtime asset' }),
    })
    return result.status
  })
  expect(rename).toBe(200)
  expect((await request.get('/assets/audit-runtime.txt')).status()).toBe(404)
  expect(await (await request.get('/assets/audit-runtime-renamed.txt')).text()).toBe('runtime upload')
  expect((await request.get('/assets/audit-runtime-renamed.txt.meta.yaml')).status()).toBe(404)
})

test('configured-root SVG overrides physical public file and stays sandboxed', async ({ page, request }) => {
  await page.goto('/cp/login')
  await page.locator('#email:visible').fill('e2e@example.test')
  await page.locator('#password:visible').fill('e2e-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/cp$/)

  // Same URL exists in the project's physical public directory before build.
  const source = '<svg xmlns="http://www.w3.org/2000/svg"><text>Configured asset root</text></svg>'
  const statuses = await page.evaluate(async (svg) => {
    const upload = new FormData()
    upload.set('directory', 'logos')
    upload.set('file', new File([svg], 'MADORI M.svg', { type: 'image/svg+xml' }))
    const response = await fetch('/api/assets/upload', { method: 'POST', body: upload })
    upload.set('file', new File(['<script>document.title="unsafe"</script>'], 'unsafe.html', { type: 'image/png' }))
    const rejected = await fetch('/api/assets/upload', { method: 'POST', body: upload })
    return [response.status, rejected.status]
  }, source)
  expect(statuses).toEqual([201, 422])
  const url = '/assets/logos/MADORI%20M.svg'
  const response = await request.get(url)
  expect(response.status()).toBe(200)
  expect(await response.text()).toBe(source)
  expect(response.headers()['content-security-policy']).toBe('sandbox')
  expect(response.headers()['content-disposition']).toMatch(/^attachment/)
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  const head = await request.head(url)
  expect(head.status()).toBe(200)
  expect(await head.body()).toHaveLength(0)
  expect(head.headers()['content-security-policy']).toBe('sandbox')
})

test('missing file-like public paths return 404 and GraphQL clients may request typename', async ({ request }) => {
  expect((await request.get('/audit-missing.txt')).status()).toBe(404)
  const typename = await request.post('/api/graphql', { data: { query: '{ __typename }' } })
  expect(await typename.json()).toEqual({ data: { __typename: 'Query' } })
  const introspection = await request.post('/api/graphql', { data: { query: '{ __schema { queryType { name } } }' } })
  const payload = await introspection.json()
  expect(payload.data).toBeUndefined()
  expect(payload.errors[0].message).toContain('introspection')
})
