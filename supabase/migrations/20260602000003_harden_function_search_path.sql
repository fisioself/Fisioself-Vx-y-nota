-- Endurecimiento de seguridad (advisor 0011_function_search_path_mutable):
-- fija el search_path de estas funciones para que no dependa del rol que las
-- invoque. Ambas ya referencian tablas con esquema (public.appointments) o solo
-- usan funciones de pg_catalog, así que '' no cambia su comportamiento — se
-- verificó que finance_appt_stats y patient_name_norm siguen devolviendo lo mismo.
ALTER FUNCTION public.finance_appt_stats(integer) SET search_path = '';
ALTER FUNCTION public.patient_name_norm(text) SET search_path = '';
