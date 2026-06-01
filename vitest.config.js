import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.idea/**',
      '.git/**',
      '.cache/**',
      'e2e/**',
      'playwright-report/**',
      'test-results/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['src/types/**', 'e2e/**'],
      thresholds: {
        // Umbrales con ~1.5-2 puntos de colchón bajo la cobertura real, para que
        // un cambio pequeño no rompa el CI pero la cobertura no pueda regresar.
        statements: 40,
        branches: 34,
        functions: 36,
        lines: 41
      }
    }
  }
});
