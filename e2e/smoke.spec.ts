import { test, expect } from '@playwright/test';

// Smoke test: the production preview boots and either prompts for Supabase
// config (when env vars are missing) or shows the login screen. Both states
// confirm the bundle loaded, the service worker did not break the shell,
// and the React tree mounted without runtime errors.
test('app boots and renders the auth or config shell', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  await expect(page.locator('main.shell')).toBeVisible();

  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText(/Falta conectar Supabase|FISIOSELF|Acceso/i);

  expect(errors, `Unexpected page errors: ${errors.join('\n')}`).toEqual([]);
});

test('login form is reachable when Supabase is configured', async ({ page }) => {
  test.skip(
    !process.env.VITE_SUPABASE_URL,
    'Skipping: requires VITE_SUPABASE_URL in the build env'
  );

  await page.goto('/');

  const emailField = page.getByLabel(/correo|email/i);
  await expect(emailField).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar|iniciar|acceder/i })).toBeVisible();
});
