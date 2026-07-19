DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT cu.user_id, cu.cliente_id, eu.estudiante_id
    FROM public.cliente_usuarios cu
    JOIN public.estudiante_usuarios eu ON eu.user_id = cu.user_id
    WHERE cu.activo = true AND eu.activo = true
  LOOP
    RAISE NOTICE 'Conflicto portal doble: user_id=% cliente_id=% estudiante_id=% -> desactivando acceso de estudiante',
      r.user_id, r.cliente_id, r.estudiante_id;
    UPDATE public.estudiante_usuarios
      SET activo = false
      WHERE user_id = r.user_id AND activo = true;
  END LOOP;
END $$;