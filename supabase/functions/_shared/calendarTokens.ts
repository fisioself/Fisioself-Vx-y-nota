// Helper de tokens de Google Calendar con cifrado en reposo (Supabase Vault) y
// transición SIN downtime.
//
// Lee/escribe a través de los RPC SECURITY DEFINER calendar_tokens_get / _set,
// que guardan los tokens cifrados en Supabase Vault (clave gestionada por
// Supabase, fuera de la tabla). Mientras el migration de cifrado todavía no esté
// aplicado en un entorno, esos RPC no existen: en ese caso caemos a las columnas
// en texto plano para que el calendario siga funcionando. Así el despliegue es
// independiente del orden (deploy de funciones ↔ aplicar migration).

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export interface PlainTokenRow {
  access_token?: string | null;
  refresh_token?: string | null;
}

// Devuelve los tokens descifrados de una conexión. Si el RPC no existe todavía
// (migration sin aplicar) o no devuelve nada, usa las columnas en texto plano
// que se pasaron como respaldo.
export async function getCalendarTokens(
  supabase: Supa,
  connectionId: string,
  fallbackRow?: PlainTokenRow | null
): Promise<{ access_token: string | null; refresh_token: string | null }> {
  try {
    const { data, error } = await supabase.rpc('calendar_tokens_get', {
      p_connection_id: connectionId
    });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && (row.access_token || row.refresh_token)) {
        return {
          access_token: row.access_token ?? null,
          refresh_token: row.refresh_token ?? null
        };
      }
    }
  } catch {
    // RPC ausente: caemos al respaldo en texto plano.
  }
  return {
    access_token: fallbackRow?.access_token ?? null,
    refresh_token: fallbackRow?.refresh_token ?? null
  };
}

// Cifra y guarda los tokens de una conexión. Si el RPC no existe todavía,
// escribe en las columnas en texto plano (transición). Tras aplicar el migration,
// el RPC los guarda cifrados en Supabase Vault y anula el texto plano.
export async function setCalendarTokens(
  supabase: Supa,
  connectionId: string,
  accessToken: string | null,
  refreshToken: string | null
): Promise<void> {
  const { error } = await supabase.rpc('calendar_tokens_set', {
    p_connection_id: connectionId,
    p_access_token: accessToken ?? null,
    p_refresh_token: refreshToken ?? null
  });
  if (!error) return;
  // Fallback: columnas en texto plano (antes de aplicar el migration de cifrado).
  await supabase
    .from('calendar_connections')
    .update({
      access_token: accessToken ?? null,
      refresh_token: refreshToken ?? null,
      updated_at: new Date().toISOString()
    })
    .eq('id', connectionId);
}
