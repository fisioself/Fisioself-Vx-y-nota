-- Búsqueda de pacientes sin sensibilidad a acentos ni mayúsculas.
-- Permite encontrar "Antonio Pérez" escribiendo "antonio perez".
--
-- unaccent es una extensión estándar de PostgreSQL (incluida en Supabase).
-- La función se llama desde el cliente con supabase.rpc('search_patients_unaccent').

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.search_patients_unaccent(p_query text)
RETURNS SETOF public.patients
LANGUAGE sql
STABLE
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.search_patients_unaccent(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_patients_unaccent(text) FROM anon;
