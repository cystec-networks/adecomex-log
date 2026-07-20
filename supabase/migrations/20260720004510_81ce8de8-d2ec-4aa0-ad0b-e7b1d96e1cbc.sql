DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT ur.user_id,
           array_agg(DISTINCT ur.role::text) AS roles,
           EXISTS (SELECT 1 FROM public.cliente_usuarios cu WHERE cu.user_id = ur.user_id AND cu.activo = true) AS es_cliente,
           EXISTS (SELECT 1 FROM public.estudiante_usuarios eu WHERE eu.user_id = ur.user_id AND eu.activo = true) AS es_estudiante
    FROM public.user_roles ur
    WHERE EXISTS (SELECT 1 FROM public.cliente_usuarios cu WHERE cu.user_id = ur.user_id AND cu.activo = true)
       OR EXISTS (SELECT 1 FROM public.estudiante_usuarios eu WHERE eu.user_id = ur.user_id AND eu.activo = true)
    GROUP BY ur.user_id
  LOOP
    RAISE NOTICE 'Cuenta mixta detectada: user_id=% roles=% es_cliente=% es_estudiante=%',
      r.user_id, r.roles, r.es_cliente, r.es_estudiante;
    DELETE FROM public.user_roles WHERE user_id = r.user_id;
  END LOOP;
END $$;