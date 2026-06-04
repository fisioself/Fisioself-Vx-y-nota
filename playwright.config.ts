import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 4173);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Vite lee las VITE_* de process.env EN BUILD. Inyectamos credenciales
        // dummy para que la app arranque "configurada" y muestre el login (no la
        // pantalla de "falta conectar Supabase"). Son falsas: las llamadas reales
        // a Supabase se interceptan/mockean en los specs, nunca tocan red real.
        // Turnstile se deja sin site key para que el captcha no aparezca en E2E.
        env: {
          VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://e2e.supabase.co',
          VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'e2e-anon-key'
        }
      }
});
