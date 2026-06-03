# Respaldos de la base de datos

La base de datos clínica (pacientes, evaluaciones, notas, finanzas) se respalda
**automáticamente todos los días** mediante el workflow
[`.github/workflows/backup.yml`](../.github/workflows/backup.yml).

El respaldo se **cifra con AES-256 antes de subirse**, así que el archivo
guardado nunca contiene datos de pacientes en claro. Solo quien tenga la
passphrase puede descifrarlo.

## Configuración inicial (una sola vez)

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
Crea estos dos secrets:

| Secret                  | Valor                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL`       | Cadena de conexión **Session pooler** o directa de Supabase (Project Settings → Database → Connection string, puerto **5432**, ya incluye la contraseña). |
| `BACKUP_GPG_PASSPHRASE` | Una passphrase larga y secreta (guárdala en tu gestor de contraseñas; **si la pierdes, no podrás restaurar**).                                            |

> ⚠️ Usa la conexión en **puerto 5432** (session pooler o directa). El
> transaction pooler (6543) no es compatible con `pg_dump`.

## Frecuencia

- **Automático:** todos los días a las 02:00 (hora CDMX).
- **Manual:** Actions → "Backup base de datos" → **Run workflow**.

Cada respaldo se guarda como _artifact_ del run, cifrado, con retención de
**30 días**.

## Recomendación importante

Los artifacts de GitHub se borran a los 30 días. **Descarga un respaldo
manualmente cada cierto tiempo** (p. ej. una vez al mes) y guárdalo en un disco
externo o nube personal. Así tienes una copia fuera de GitHub (regla 3-2-1).

## Cómo restaurar un respaldo

1. Descarga el artifact `db-backup-AAAAMMDD-HHMMSS` desde la página del run en Actions.
2. Descífralo (necesitas `BACKUP_GPG_PASSPHRASE`):

   ```bash
   gpg --batch --passphrase 'TU_PASSPHRASE' -o db.dump -d fisioself-AAAAMMDD-HHMMSS.dump.gpg
   ```

3. Restáuralo a una base de datos (idealmente primero a un proyecto de prueba,
   nunca directo sobre producción sin verificar):

   ```bash
   pg_restore --no-owner --no-privileges \
     -d "postgresql://postgres.[ref]:[password]@...pooler.supabase.com:5432/postgres" \
     db.dump
   ```

## Probar que funciona

Tras configurar los secrets, lanza el workflow manualmente una vez
(**Run workflow**) y confirma que el run termina en verde y genera el artifact.
Descarga ese primer respaldo y verifica que puedes descifrarlo con tu
passphrase. Si el `gpg -d` funciona, el respaldo es válido.
