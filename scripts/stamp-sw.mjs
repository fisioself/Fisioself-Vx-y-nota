// Estampa un id de build único en dist/sw.js tras `vite build`.
//
// Por qué: sw.js vive en public/ y Vite lo copia tal cual (no lo procesa ni le
// inyecta un hash). Si su contenido no cambia entre deploys, el navegador lo
// compara byte a byte, no detecta actualización y la PWA instalada se queda con
// el bundle viejo en memoria. Reemplazar __BUILD_ID__ por un valor único por
// deploy garantiza que el SW SIEMPRE se detecte como nuevo, lo que dispara el
// flujo de actualización (banner "Actualizar ahora" → SKIP_WAITING → reload).
//
// El script nunca falla el build: si falta el archivo o el placeholder, avisa y
// sale con código 0.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SW_PATH = 'dist/sw.js';
const PLACEHOLDER = '__BUILD_ID__';

function buildId() {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    (() => {
      try {
        return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim();
      } catch {
        return '';
      }
    })();
  const ts = Date.now().toString(36);
  return sha ? `${sha.slice(0, 7)}-${ts}` : ts;
}

if (!existsSync(SW_PATH)) {
  console.warn(`[stamp-sw] ${SW_PATH} no existe; nada que estampar.`);
  process.exit(0);
}

const src = readFileSync(SW_PATH, 'utf8');
if (!src.includes(PLACEHOLDER)) {
  console.warn(`[stamp-sw] No se encontró el placeholder ${PLACEHOLDER} en ${SW_PATH}.`);
  process.exit(0);
}

const id = buildId();
writeFileSync(SW_PATH, src.replaceAll(PLACEHOLDER, id));
console.info(`[stamp-sw] ${SW_PATH} estampado con build id: ${id}`);
