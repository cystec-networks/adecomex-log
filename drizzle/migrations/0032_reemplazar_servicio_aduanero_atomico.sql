CREATE OR REPLACE FUNCTION public.reemplazar_servicio_aduanero(_expediente_id uuid, _filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.expediente_servicio_aduanero WHERE expediente_id = _expediente_id;
  INSERT INTO public.expediente_servicio_aduanero (expediente_id, tipo_despacho, cantidad)
  SELECT _expediente_id, f->>'tipo_despacho', (f->>'cantidad')::numeric
  FROM jsonb_array_elements(coalesce(_filas,'[]'::jsonb)) f
  WHERE coalesce(f->>'tipo_despacho','') <> '' AND (f->>'cantidad')::numeric > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.reemplazar_servicio_aduanero(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reemplazar_servicio_aduanero(uuid, jsonb) TO authenticated, service_role;