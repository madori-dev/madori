import { expect, test } from '@playwright/test'

const credentials = { email: 'e2e@example.test', password: 'e2e-password' }

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/cp/login')
  await page.locator('#email:visible').fill(credentials.email)
  await page.locator('#password:visible').fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/cp$/)
}

test.describe('audit regressions', () => {
  test('loaded entry is clean, internal links confirm changes, and save clears confirmation', async ({ page }) => {
    await signIn(page)
    await page.goto('/cp/collections/e2e-articles')
    await page.getByRole('link', { name: /Sitemap Collection Entry/i }).click()
    await expect(page.locator('#field-content')).toHaveValue(/Collection route rendered/)

    // Initial data load must not mark form dirty.
    await page.locator('a[href="/cp/collections"]').first().click()
    await expect(page).toHaveURL(/\/cp\/collections$/)

    await page.goto('/cp/collections/e2e-articles/sitemap-entry')
    await page.locator('#field-content').fill('Changed locally')
    let cancelled = false
    page.once('dialog', async (dialog) => { cancelled = dialog.type() === 'confirm'; await dialog.dismiss() })
    await page.locator('a[href="/cp/collections"]').first().click()
    expect(cancelled).toBe(true)
    await expect(page).toHaveURL(/\/cp\/collections\/e2e-articles\/sitemap-entry$/)

    await expect(page.locator('#field-content')).toHaveValue('Changed locally')

    const acceptedDialogs: string[] = []
    page.once('dialog', async (dialog) => { acceptedDialogs.push(dialog.type()); await dialog.accept() })
    await page.locator('a[href="/cp/collections"]').first().click()
    await expect(page).toHaveURL(/\/cp\/collections$/)
    expect(acceptedDialogs).toEqual(['confirm'])

    await page.goto('/cp/collections/e2e-articles/sitemap-entry')
    await page.locator('#field-content').fill('Changed locally')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Entry saved')).toBeVisible()
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => { dialogs.push(dialog.type()); await dialog.accept() })
    await page.locator('a[href="/cp/collections"]').first().click()
    await expect(page).toHaveURL(/\/cp\/collections$/)
    expect(dialogs).toEqual([])
    await page.goBack()
    await expect(page).toHaveURL(/\/cp\/collections\/e2e-articles\/sitemap-entry$/)
  })

  test('back navigation is recoverable after unsaved edit', async ({ page }) => {
    await signIn(page)
    await page.goto('/cp/collections/e2e-articles')
    await page.getByRole('link', { name: /Sitemap Collection Entry/i }).click()
    await page.locator('#field-content').fill('Back navigation change')
    await page.waitForTimeout(250)

    const cancelledDialog = page.waitForEvent('dialog')
    await page.evaluate(() => window.history.back())
    const cancelled = await cancelledDialog
    expect(cancelled.type()).toBe('confirm')
    await cancelled.dismiss()
    await expect(page).toHaveURL(/\/cp\/collections\/e2e-articles\/sitemap-entry$/)
    await expect(page.locator('#field-content')).toHaveValue('Back navigation change')

    const acceptedDialog = page.waitForEvent('dialog')
    await page.evaluate(() => window.history.back())
    const accepted = await acceptedDialog
    expect(accepted.type()).toBe('confirm')
    await accepted.accept()
    await expect(page).toHaveURL(/\/cp\/collections\/e2e-articles$/)
  })

  test('required fields and cleared number fields use accessible labels and server validation', async ({ page }) => {
    await page.goto('/')
    const age = page.getByLabel('Age')
    await expect(age).toHaveAttribute('id', 'age')
    await age.fill('42')
    await age.fill('')
    await page.getByLabel('Name').fill('Browser validation')
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.locator('ul[role="alert"]')).toContainText(/required|number/i)
  })
})
