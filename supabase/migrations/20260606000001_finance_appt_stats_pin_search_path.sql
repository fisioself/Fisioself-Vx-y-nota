-- El advisor "function_search_path_mutable" marca finance_appt_stats porque su
-- search_path es mutable por rol (riesgo de secuestro de search_path). Lo fijamos
-- a 'public' (referencia tablas de ese schema) sin tocar el cuerpo de la función.
ALTER FUNCTION public.finance_appt_stats(p_months_back integer)
  SET search_path = public, pg_temp;
