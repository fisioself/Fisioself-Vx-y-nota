import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Manual vendor chunking keeps third-party code in stable cache buckets so
// shipping app changes does not invalidate the React / Supabase / Sentry
// bundles in the browser cache.
export default defineConfig({
  plugins: [react()],
  // ID de build único por deploy (sha de Vercel) para invalidar cachés que
  // dependan de la versión, como el caché persistido de React Query (PHI).
  define: {
    __BUILD_ID__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || 'dev')
  },
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
          // @fullcalendar: undefined (NO catch-all 'vendor') a propósito. Solo lo
          // usa NativeCalendar, que se carga diferido (lazy) desde el Panel. Al
          // devolver undefined, Rollup lo mete en el chunk async de NativeCalendar
          // y sus ~375 kB se descargan SOLO al abrir la agenda, no en el arranque.
          // (Forzarlo a un chunk nombrado hacía que rolldown-vite lo precargara
          // con modulepreload en index.html, anulando el lazy-load.)
          if (id.includes('@fullcalendar')) return undefined;
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
