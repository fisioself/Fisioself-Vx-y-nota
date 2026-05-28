import { test, expect } from '@playwright/test';

test('app loads and exposes Fisioself title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Fisioself/i);
});
