CREATE OR REPLACE FUNCTION public.calcular_vacaciones_acumuladas(_fecha_ingreso date)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _fecha_ingreso IS NULL OR _fecha_ingreso > CURRENT_DATE THEN 0
    ELSE (
      LEAST(FLOOR(( (EXTRACT(YEAR FROM AGE(CURRENT_DATE, _fecha_ingreso))*12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, _fecha_ingreso)))::int ) / 12)::int, 4) * 14
      + GREATEST(FLOOR(( (EXTRACT(YEAR FROM AGE(CURRENT_DATE, _fecha_ingreso))*12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, _fecha_ingreso)))::int ) / 12)::int - 4, 0) * 18
    )
  END;
$$;