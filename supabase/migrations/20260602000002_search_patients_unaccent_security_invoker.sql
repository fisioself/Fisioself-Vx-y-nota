-- CORRECCIÓN DE SEGURIDAD de 20260602000001_search_patients_unaccent.sql.
--
-- La versión previa era SECURITY DEFINER, lo que saltaba el RLS de patients
-- (devolvía pacientes de TODAS las clínicas) y, al no revocar EXECUTE de PUBLIC,
-- quedaba llamable por el rol anon vía /rest/v1/rpc. Para una app clínica con
-- datos reales eso es una fuga de PII.
--
-- La pasamos a SECURITY INVOKER (respeta RLS: cada usuario solo ve los pacientes
-- de su clínica, igual que la búsqueda anterior con PostgREST) y revocamos el
-- acceso de anon/public.

CREATE OR REPLACE FUNCTION public.search_patients_unaccent(p_query text)
RETURNS SETOF public.patients
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT *
  FROM public.patients
  WHERE
    public.unaccent(lower(full_name)) ILIKE '%' || public.unaccent(lower(p_query)) || '%'
    OR phone ILIKE '%' || p_query || '%'
    OR email ILIKE '%' || p_query || '%'
  ORDER BY full_name
  LIMIT 50;
$$;

REVOKE EXECUTE ON FUNCTION public.search_patients_unaccent(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_patients_unaccent(text) TO authenticated;
