import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Manual vendor chunking keeps third-party code in stable cache buckets so
// shipping app changes does not invalidate the React / Supabase / Sentry
// bundles in the browser cache.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Skip @sentry entirely: src/lib/sentry.js uses a dynamic import()
          // so Rollup creates an async chunk that only loads when the DSN is
          // configured. Forcing it into a named chunk here would make it
          // eager and defeat the lazy load.
          if (id.includes('@sentry')) return undefined;
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('posthog-js')) return 'vendor-posthog';
          if (id.includes('react-markdown') || id.includes('remark-') || id.includes('micromark')) {
            return 'vendor-markdown';
          }
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'vendor-react';
          }
          return 'vendor';
        }
      }
    }
  }
});
