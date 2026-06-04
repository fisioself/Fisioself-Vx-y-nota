import { test, expect, type Page } from '@playwright/test';

// Intercepta TODA llamada al endpoint de Supabase (URL dummy del build) para que
// el E2E sea hermético: nunca toca red real ni datos de pacientes. Cada test
// decide qué responde el endpoint de token (login).
const mockSupabase = async (
  page: Page,
  tokenHandler: (route: import('@playwright/test').Route) => Promise<void> | void
) => {
  // Login con contraseña.
  await page.route('**/auth/v1/token**', tokenHandler);
  // Cualquier otra llamada a Supabase: respuesta vacía para no colgar la app.
  await page.route('**/e2e.supabase.co/**', (route) => {
    if (route.request().url().includes('/auth/v1/token')) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
};

test('no inicia sesión con campos vacíos (validación required)', async ({ page }) => {
  let tokenCalled = false;
  await mockSupabase(page, (route) => {
    tokenCalled = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /entrar/i }).click();

  // Los inputs son required: el navegador bloquea el submit y no se llama al API.
  await expect(page.getByLabel(/correo/i)).toBeFocused();
  expect(tokenCalled).toBe(false);
});

test('muestra error con credenciales inválidas', async ({ page }) => {
  await mockSupabase(page, (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Invalid login credentials'
      })
    })
  );

  await page.goto('/');
  await page.getByLabel(/correo/i).fill('noexiste@fisioself.com');
  await page.getByLabel(/contrasena|contraseña/i).fill('claveincorrecta');
  await page.getByRole('button', { name: /entrar/i }).click();

  // El error de auth se muestra en un alert accesible.
  await expect(page.getByRole('alert')).toBeVisible();
});

test('el botón muestra estado de carga al enviar', async ({ page }) => {
  // Token que tarda, para observar el estado "Entrando...".
  await mockSupabase(page, async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid_grant' })
    });
  });

  await page.goto('/');
  await page.getByLabel(/correo/i).fill('demo@fisioself.com');
  await page.getByLabel(/contrasena|contraseña/i).fill('algo');
  await page.getByRole('button', { name: /entrar/i }).click();

  await expect(page.getByRole('button', { name: /entrando/i })).toBeVisible();
});
