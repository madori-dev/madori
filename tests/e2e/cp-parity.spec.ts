import { expect, test } from '@playwright/test'

const credentials = { email: 'e2e@example.test', password: 'e2e-password' }
const scopedCredentials = { email: 'scoped@example.test', password: 'e2e-password' }

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/cp/login')
  await page.locator('#email:visible').fill(credentials.email)
  await page.locator('#password:visible').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/cp$/)
}

async function signInScopedEditor(page: import('@playwright/test').Page) {
  await page.goto('/cp/login')
  await page.locator('#email:visible').fill(scopedCredentials.email)
  await page.locator('#password:visible').fill(scopedCredentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/cp$/)
}

test.describe.configure({ mode: 'serial' })

test('admin login loads one authenticated capability contract and shows full navigation', async ({ page }) => {
  const capabilityStatuses: number[] = []
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/users/capabilities') capabilityStatuses.push(response.status())
  })

  await signIn(page)

  for (const label of ['Collections', 'Globals', 'Navigation', 'Taxonomies', 'Assets', 'Forms', 'SEO', 'Users', 'Git']) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  expect(capabilityStatuses).toEqual([200])
})

test('capability contract retries a transient server failure', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/users/capabilities', async route => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Unavailable' } }) })
      return
    }
    await route.continue()
  })

  await signIn(page)

  await expect(page.getByRole('link', { name: 'Collections', exact: true })).toBeVisible()
  expect(attempts).toBe(2)
})

test('public navigation resolves entry references to configured collection routes', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: 'E2E article' })
  await expect(link).toHaveAttribute('href', '/e2e/sitemap-entry')
  await link.click()
  await expect(page).toHaveURL(/\/e2e\/sitemap-entry$/)
})

test('public form renders from CP blueprint and submits', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByLabel('name')).toBeVisible()
  await page.getByLabel('name').fill('Blueprint visitor')
  await page.getByLabel('age').fill('42')
  await page.getByLabel('consent').check()
  await page.getByLabel('topics').selectOption(['news', 'events'])
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Thank you — your submission has been received.')).toBeVisible()
  const response = await request.get('/api/public/forms/e2e-contact')
  expect((await response.json()).data.fields).toEqual(expect.arrayContaining([expect.objectContaining({ handle: 'name', field: expect.objectContaining({ type: 'text' }) })]))
})

test('asset manager edits filename and alt metadata', async ({ page }) => {
  await signIn(page)
  await page.goto('/cp/assets')
  const asset = page.getByRole('button', { name: 'e2e-asset.txt' })
  await asset.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Edit details' }).click()
  await page.getByLabel('Filename').fill('e2e-renamed.txt')
  await page.getByLabel('Alt text').fill('Accessible E2E asset')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Asset details updated')).toBeVisible()
  const payload = await page.evaluate(() => fetch('/api/assets').then((response) => response.json()))
  expect(payload.data).toEqual(expect.arrayContaining([expect.objectContaining({ filename: 'e2e-renamed.txt', alt: 'Accessible E2E asset' })]))
})

test('entry editor uses assigned blueprint and renders section fields', async ({ page }) => {
  await signIn(page)
  await page.goto('/cp/collections/e2e-assigned/roundtrip')
  await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
  await expect(page.getByText('A short summary')).toBeVisible()
  await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Details' }) }).locator('input').fill('After')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Entry saved')).toBeVisible()
})

test('optional asset selection can be cleared before create and after edit', async ({ page }) => {
  await signIn(page)
  const assetName = await page.evaluate(async () => (await (await fetch('/api/assets')).json()).data[0].filename as string)
  async function chooseAsset() {
    await page.getByRole('button', { name: 'Choose or drop a file' }).click()
    const picker = page.getByRole('dialog', { name: 'Select an asset' })
    await picker.getByLabel('Search files by name').fill(assetName)
    await picker.locator('button[aria-pressed]').click()
    await picker.getByRole('button', { name: 'Confirm' }).click()
  }
  async function clearAsset() {
    const assetRow = page.getByText(assetName, { exact: true }).locator('..')
    await assetRow.getByRole('button').last().click()
  }

  await page.goto('/cp/collections/e2e-assigned/create')
  await page.locator('#field-title').fill('Cleared asset create')
  await page.locator('#field-slug').fill('cleared-asset-create')
  await chooseAsset()
  await clearAsset()
  await page.getByRole('button', { name: 'Create Entry' }).click()
  await expect(page).toHaveURL(/\/cp\/collections\/e2e-assigned\/cleared-asset-create$/)
  let entry = await page.evaluate(() => fetch('/api/entries/e2e-assigned/cleared-asset-create').then(response => response.json()))
  expect(entry.data.data.hero).toBeUndefined()

  await page.goto('/cp/collections/e2e-assigned/roundtrip')
  await chooseAsset()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Entry saved')).toBeVisible()
  await clearAsset()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Entry saved')).toBeVisible()
  entry = await page.evaluate(() => fetch('/api/entries/e2e-assigned/roundtrip').then(response => response.json()))
  expect(entry.data.data.hero).toBeUndefined()
})

test('blueprint sections persist configured fields', async ({ page }) => {
  await signIn(page)
  await page.goto('/cp/blueprints/collections/e2e-section-editor')
  await page.getByRole('button', { name: 'Add section' }).click()
  await page.getByPlaceholder('section_1').fill('Details')
  await page.getByRole('button', { name: 'Add field' }).last().click()
  await page.getByRole('button', { name: 'unnamed' }).click()
  await page.getByLabel('Handle').fill('summary')
  await page.getByRole('button', { name: 'Save' }).last().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.reload()
  await expect(page.locator('input[value="Details"]')).toBeVisible()
  const blueprint = await page.evaluate(async () => {
    const response = await fetch('/api/blueprints/collections/e2e-section-editor')
    return { status: response.status, payload: await response.json() }
  })
  expect(blueprint.status).toBe(200)
  expect(blueprint.payload.data.tabs.main.sections.section_1.fields[0].handle).toBe('summary')
})

test('asset blueprint authoring keeps blank max_files single and permits an explicit gallery', async ({ page }) => {
  await signIn(page)
  await page.goto('/cp/blueprints/collections/e2e-section-editor')
  await page.getByRole('button', { name: 'Add field' }).first().click()
  await page.getByText('unnamed', { exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Handle').fill('gallery')
  await sheet.getByRole('combobox').click()
  await page.getByRole('option', { name: 'asset', exact: true }).click()
  await expect(sheet.locator('#asset-max-files')).toHaveValue('1')
  await sheet.locator('#asset-max-files').fill('2')
  await sheet.locator('#asset-min-files').fill('2')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  const blueprint = await page.evaluate(async () => {
    const response = await fetch('/api/blueprints/collections/e2e-section-editor')
    return response.json()
  })
  expect(blueprint.data.tabs.main.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ handle: 'gallery', field: expect.objectContaining({ options: { min_files: 2, max_files: 2 } }) }),
  ]))
})

test('Tiptap entry content survives create, edit, and reload', async ({ page }) => {
  await signIn(page)
  await page.goto('/cp/collections/e2e-rich/create')
  await page.locator('#field-title').fill('Rich roundtrip')
  await page.locator('#field-slug').fill('rich-roundtrip')
  const editor = page.locator('[contenteditable="true"]')
  await editor.fill('First structured body')
  await page.getByRole('button', { name: 'Create Entry' }).click()
  await expect(page).toHaveURL(/\/cp\/collections\/e2e-rich\/rich-roundtrip$/)

  let entry = await page.evaluate(() => fetch('/api/entries/e2e-rich/rich-roundtrip').then((response) => response.json()))
  expect(entry.data.data.content_json).toMatchObject({ type: 'doc' })
  expect(JSON.stringify(entry.data.data.content_json)).toContain('First structured body')

  await editor.fill('Updated structured body')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Entry saved')).toBeVisible()
  await page.reload()
  await expect(editor).toContainText('Updated structured body')

  entry = await page.evaluate(() => fetch('/api/entries/e2e-rich/rich-roundtrip').then((response) => response.json()))
  expect(JSON.stringify(entry.data.data.content_json)).toContain('Updated structured body')
})

test('settings structured rows remain editable after reload', async ({ page }) => {
  await signIn(page)
  await page.goto('/cp/settings')
  await page.getByRole('tab', { name: 'Configuration' }).click()
  await expect(page.getByText('Sites')).toBeVisible()
  await page.getByRole('button', { name: 'Add site' }).click()
  await page.getByPlaceholder('Handle').last().fill('e2e-secondary')
  await page.getByPlaceholder('https://example.com').last().fill('https://secondary.example.test')
  await page.getByPlaceholder('en-US').last().fill('en-GB')
  await page.getByRole('button', { name: 'Add root' }).click()
  await page.getByPlaceholder('content or path').last().fill('assets')
  await page.getByPlaceholder('Exclusions, one per line').last().fill('tmp/**')
  await page.getByRole('button', { name: 'Add rule' }).click()
  await page.getByPlaceholder('Trigger').last().fill('entries')
  await page.getByPlaceholder('URLs, one per line').last().fill('/e2e/**')
  await page.getByRole('button', { name: 'Save Configuration' }).click()
  await expect(page.getByText(/Configuration saved/)).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'Configuration' }).click()
  await expect(page.getByText('Sites')).toBeVisible()
})

test('SEO defaults save and reload full-value document', async ({ page }) => {
  await signIn(page)
  await page.goto('/cp/seo/defaults')
  const saved = await page.evaluate(async () => {
    const response = await fetch('/api/seo/sites/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seo: { enabled: true, robots: { following: 'nofollow', noarchive: true, noimageindex: true, nosnippet: true }, sitemap: { enabled: true, priority: 0.7, changeFrequency: 'daily' }, social: { twitterCard: 'summary', twitterSite: '@e2e', twitterCreator: '@creator' }, jsonLd: { enabled: true, type: 'custom', custom: { headline: 'E2E' } } } }) })
    return response.ok
  })
  expect(saved).toBe(true)
  await page.reload()
  const result = await page.evaluate(() => fetch('/api/seo/sites/default').then(response => response.json()))
  expect(result.data.seo).toEqual(expect.objectContaining({ robots: expect.objectContaining({ noarchive: true }), jsonLd: expect.objectContaining({ type: 'custom' }) }))
})

test('role editor creates, edits, and protects assigned role deletion', async ({ page }) => {
  await signIn(page)
  await page.goto('/cp/users/roles')
  await page.getByLabel('Handle').fill('e2e-role')
  await page.getByLabel('Display name').fill('E2E role')
  await page.getByRole('button', { name: 'Save role' }).click()
  await expect(page.getByText('E2E role')).toBeVisible()
  await page.getByRole('row', { name: /E2E role e2e-role/ }).getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Display name').fill('E2E role updated')
  await page.getByRole('button', { name: 'Save role' }).click()
  await expect(page.getByText('E2E role updated')).toBeVisible()
  const deleteResult = await page.evaluate(async () => {
    await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'e2e-role-user', name: 'Role User', email: 'role-user@example.test', password: 'e2e-password', roles: ['e2e-role'] }) })
    const response = await fetch('/api/roles/e2e-role', { method: 'DELETE' })
    return response.status
  })
  expect(deleteResult).toBe(409)
})

test('scoped editor sees only permitted content and cannot mutate other resources', async ({ page }) => {
  await signInScopedEditor(page)

  await expect(page.getByRole('link', { name: 'Collections', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Assets' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'SEO' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Quick Access' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Assets/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Users/ })).toHaveCount(0)

  const capabilities = await page.evaluate(() => fetch('/api/users/capabilities').then(response => response.json()))
  expect(capabilities.data.scopes.entries['e2e-assigned']).toMatchObject({ view: true, create: true, edit: true, delete: false })

  await page.goto('/cp/collections/e2e-assigned')
  await expect(page.getByText('Assigned entry')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create Entry' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Configure Collection' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Edit Blueprint' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete Collection' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Create Entry' }).click()
  await page.locator('#field-title').fill('Scoped created entry')
  await page.locator('#field-slug').fill('scoped-created-entry')
  await page.getByRole('button', { name: 'Create Entry' }).click()
  await expect(page).toHaveURL(/\/cp\/collections\/e2e-assigned\/scoped-created-entry$/)

  const summary = page.getByRole('group').filter({ hasText: 'Summary' }).getByRole('textbox')
  await expect(summary).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await summary.fill('Scoped editor update')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Entry saved')).toBeVisible()

  const denied = await page.evaluate(async () => {
    const response = await fetch('/api/entries/e2e-rich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Forbidden', slug: 'forbidden', status: 'draft', data: {} }),
    })
    return response.status
  })
  expect(denied).toBe(403)
})
