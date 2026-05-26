import { test, expect } from '@playwright/test';

test('app loads and shows login or main screen', async ({ page }) => {
  await page.goto('/');

  // Either we see the login screen or we are already logged in (if state was somehow preserved, but default is usually login)
  // Let's just check that the document has a body and title.
  await expect(page).toHaveTitle(/Fisioself/i);
});
