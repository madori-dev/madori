import { expect, test } from '@playwright/test'

test('fallback unsaved guard cancels and accepts back and forward without losing edits', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'navigation', { configurable: true, value: undefined })
  })
  await page.goto('/cp/login')
  await page.locator('#email:visible').fill('e2e@example.test')
  await page.locator('#password:visible').fill('e2e-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/cp$/)
  await page.goto('/cp/collections/e2e-articles')
  await page.getByRole('link', { name: /Sitemap Collection Entry/i }).click()
  await expect(page.locator('#field-content')).toBeVisible()
  await page.locator('#field-content').fill('Fallback traversal change')
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()

  const dialogs: string[] = []
  page.once('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss() })
  await page.goBack()
  await expect(page).toHaveURL(/sitemap-entry$/)
  await expect(page.locator('#field-content')).toHaveValue('Fallback traversal change')
  expect(dialogs).toEqual(['confirm'])

  page.once('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept() })
  await page.goBack()
  await expect(page).toHaveURL(/\/cp\/collections\/e2e-articles$/)
  expect(dialogs).toEqual(['confirm', 'confirm'])

  // Establish forward history using ordinary client links while form is clean.
  await page.getByRole('link', { name: /Sitemap Collection Entry/i }).click()
  await expect(page.locator('#field-content')).toBeVisible()
  await page.locator('a[href="/cp/collections"]').first().click()
  await expect(page).toHaveURL(/\/cp\/collections$/)
  await page.goBack()
  await expect(page.locator('#field-content')).toBeVisible()
  await page.locator('#field-content').fill('Forward traversal change')
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()

  page.once('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss() })
  await page.goForward()
  await expect(page).toHaveURL(/sitemap-entry$/)
  await expect(page.locator('#field-content')).toHaveValue('Forward traversal change')
  expect(dialogs).toEqual(['confirm', 'confirm', 'confirm'])

  page.once('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept() })
  await page.goForward()
  await expect(page).toHaveURL(/\/cp\/collections$/)
  expect(dialogs).toEqual(['confirm', 'confirm', 'confirm', 'confirm'])
})
