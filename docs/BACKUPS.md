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

## Verificación automática de restauración

Además del backup diario, el workflow
[`.github/workflows/verify-restore.yml`](../.github/workflows/verify-restore.yml)
corre **cada lunes a las 09:00 UTC** (1 hora después del backup) y comprueba que
el último respaldo sigue siendo restaurable, **sin tocar nunca producción**:

1. Descarga el último backup cifrado del workflow de backup.
2. Lo descifra con `BACKUP_GPG_PASSPHRASE`.
3. Verifica la integridad del archivo con `pg_restore --list` (parsea todo el TOC).
4. Lo restaura en una base Postgres **temporal y desechable** del runner y
   cuenta las tablas restauradas.

Si el run termina en verde, tienes la garantía semanal de que tus respaldos no
solo se generan, sino que de verdad se pueden restaurar.

## Runbook: qué hacer si la verificación falla

Cuando el workflow **"Verificar restauración de backup"** sale en rojo, actúa
según el paso que falló (lo indica el log del run):

| Paso que falló                       | Qué significa                                             | Qué hacer                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Descargar el último backup**       | No hay ningún run exitoso de backup del cual descargar.   | Revisa el workflow de backup: ¿corrió hoy? ¿está en verde? Si falló, arréglalo primero (suele ser `SUPABASE_DB_URL` caducado o puerto 6543 por error).    |
| **Descifrar / verificar integridad** | El archivo está corrupto o la passphrase no coincide.     | Confirma que `BACKUP_GPG_PASSPHRASE` es la misma con la que se cifró. Si cambió, los backups viejos no se podrán abrir; genera uno nuevo y guárdala bien. |
| **Restauración (best-effort)**       | El TOC es válido pero `pg_restore` no logró cargar datos. | Abre el log: los avisos de extensiones/roles de Supabase son normales. Si **0 tablas** restauradas, el dump puede estar incompleto — investiga el backup. |

**Regla de oro:** mientras el paso de _integridad_ pase (archivo descifrable y
TOC válido), tu respaldo sirve aunque la restauración best-effort dé avisos. La
restauración real en Supabase usa el procedimiento de la sección anterior, que
no depende de Postgres vanilla.

Si no puedes resolverlo, **descarga manualmente el último backup verde** y
guárdalo fuera de GitHub mientras diagnosticas: nunca te quedes sin una copia
buena a mano.
