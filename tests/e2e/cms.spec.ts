import { expect, test } from '@playwright/test'

const credentials = { email: 'e2e@example.test', password: 'e2e-password' }

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/cp/login')
  await page.locator('#email:visible').fill(credentials.email)
  await page.locator('#password:visible').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/cp$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test('public site renders and control panel redirects unauthenticated visitors', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toContainText('Madori')
  await expect(page).toHaveTitle('SEO Browser Title')

  await page.goto('/cp')
  await expect(page).toHaveURL(/\/cp\/login$/)
})

test('public SEO redirects, sitemap, and 404 observations work end to end', async ({ page, request }) => {
  const redirected = await request.get('/legacy-e2e', { maxRedirects: 0 })
  expect(redirected.status()).toBe(308)
  expect(redirected.headers().location).toBe('http://localhost:3000/')

  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  const sitemapXml = await sitemap.text()
  const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]))
  expect(sitemapUrls.map(url => url.pathname)).toEqual(expect.arrayContaining([
    '/e2e/sitemap-entry',
    '/topics/releases',
  ]))
  for (const url of sitemapUrls) {
    const publicPage = await request.get(`${url.pathname}${url.search}`)
    expect(publicPage.ok(), `Sitemap URL ${url.pathname} returned ${publicPage.status()}`).toBe(true)
  }

  expect((await page.goto('/missing-seo-page'))?.status()).toBe(404)
  await signIn(page)
  const observations = await page.evaluate(async () => fetch('/api/seo/not-found').then(response => response.json()))
  expect(observations.data).toEqual(expect.arrayContaining([expect.objectContaining({ site: 'default', path: '/missing-seo-page', hits: 1 })]))

  await page.goto('/cp/seo')
  await expect(page.getByRole('heading', { name: 'SEO', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Run report' }).click()
  await expect(page.getByText('SEO report completed')).toBeVisible()

  await page.goto('/cp/seo/redirects')
  await expect(page.getByText('/legacy-e2e')).toBeVisible()
})

test('authenticated editor creates, edits, and detects stale entry changes', async ({ page }) => {
  await signIn(page)
  await page.goto('/cp/collections/e2e-articles/create')
  await page.locator('#field-title').fill('Browser Entry')
  await page.locator('#field-slug').fill('browser-entry')
  await page.locator('#field-content').fill('First version')
  await page.getByRole('button', { name: 'Create Entry' }).click()
  await expect(page).toHaveURL(/\/cp\/collections\/e2e-articles\/browser-entry$/)
  await expect(page.getByRole('tab', { name: 'SEO', exact: true })).toBeVisible()

  await page.getByRole('textbox', { name: 'Content' }).fill('Second version')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Entry saved')).toBeVisible()

  const result = await page.evaluate(async () => {
    const current = await fetch('/api/entries/e2e-articles/browser-entry').then((response) => response.json())
    const response = await fetch('/api/entries/e2e-articles/browser-entry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'External update', slug: 'browser-entry', status: 'draft', content: 'External version',
        data: current.data.data, contentHash: current.data.contentHash,
      }),
    })
    return response.status
  })
  expect(result).toBe(200)

  await page.getByRole('textbox', { name: 'Content' }).fill('Stale local version')
  const staleSave = page.waitForResponse((response) =>
    response.url().includes('/api/entries/e2e-articles/browser-entry') && response.request().method() === 'PUT'
  )
  await page.getByRole('button', { name: 'Save' }).click()
  expect((await staleSave).status()).toBe(409)
})

test('runtime settings save, anonymous form submission, and logout invalidate session', async ({ page, request }) => {
  await signIn(page)
  await page.goto('/cp/settings')
  await page.locator('#site-name').fill('Madori E2E Updated')
  await page.getByRole('button', { name: /save site settings/i }).click()
  await expect(page.getByText('Site settings saved')).toBeVisible()

  const anonymousSession = await request.get('/api/auth/validate')
  expect(anonymousSession.status()).toBe(401)
  const anonymousSubmission = await request.post('/api/forms/e2e-contact/submit', {
    data: { name: 'Anonymous visitor', age: 30, consent: true, topics: ['news'] },
  })
  expect(anonymousSubmission.status()).toBe(201)

  await page.getByRole('button', { name: /account/i }).click()
  await page.getByText('Log Out').click()
  await expect(page).toHaveURL(/\/cp\/login$/)
  await page.goto('/cp')
  await expect(page).toHaveURL(/\/cp\/login$/)
})
