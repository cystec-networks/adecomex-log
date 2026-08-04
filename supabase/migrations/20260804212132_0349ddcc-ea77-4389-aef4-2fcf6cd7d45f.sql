CREATE OR REPLACE FUNCTION public.calcular_vacaciones_vigentes(_fecha_ingreso date, _dias_tomados_ultimo_anio integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _fecha_ingreso IS NULL OR _fecha_ingreso > CURRENT_DATE THEN 0
    ELSE GREATEST(
      (CASE WHEN (FLOOR((((EXTRACT(YEAR FROM AGE(CURRENT_DATE, _fecha_ingreso))*12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, _fecha_ingreso)))::int) / 12))::int + 1) >= 5 THEN 18 ELSE 14 END)
      - COALESCE(_dias_tomados_ultimo_anio, 0), 0)
  END;
$$;