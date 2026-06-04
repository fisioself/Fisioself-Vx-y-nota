import { test, expect } from '@playwright/test';

// Smoke E2E: con credenciales (dummy) de build, la app arranca y muestra el
// LoginScreen. Confirma de punta a punta que el bundle carga, los chunks lazy
// resuelven, el árbol React monta y no hay errores de runtime en el navegador
// real — cosas que los tests unitarios (jsdom) no pueden garantizar.
test('la app arranca y muestra la pantalla de acceso sin errores de runtime', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  // Marca de FISIOSELF y encabezado de acceso privado.
  await expect(page.getByText('FISIOSELF', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /acceso privado/i })).toBeVisible();

  // Campos de credenciales y botón de entrar presentes.
  await expect(page.getByLabel(/correo/i)).toBeVisible();
  await expect(page.getByLabel(/contrasena|contraseña/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();

  expect(errors, `Errores inesperados en la página: ${errors.join('\n')}`).toEqual([]);
});

test('el documento expone el título de FISIOSELF', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/fisioself/i);
});
