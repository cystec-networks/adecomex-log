DROP POLICY IF EXISTS confirmaciones_correo_select ON public.confirmaciones_correo;
DROP POLICY IF EXISTS confirmaciones_correo_insert ON public.confirmaciones_correo;
DROP POLICY IF EXISTS confirmaciones_correo_update ON public.confirmaciones_correo;
REVOKE DELETE ON public.confirmaciones_correo FROM authenticated;
REVOKE ALL ON public.confirmaciones_correo FROM anon;

CREATE POLICY confirmaciones_correo_select ON public.confirmaciones_correo
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY confirmaciones_correo_insert ON public.confirmaciones_correo
  FOR INSERT TO authenticated WITH CHECK (
    private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'ejecutivo'::app_role,'agente_aduanal'::app_role])
    AND estado = 'pendiente' AND enviado_en IS NULL
    AND expediente_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.solicitudes_correo s
      WHERE s.id = solicitud_correo_id AND s.expediente_id = confirmaciones_correo.expediente_id
        AND s.id_hilo IS NOT DISTINCT FROM confirmaciones_correo.id_hilo)
  );

CREATE POLICY confirmaciones_correo_update ON public.confirmaciones_correo
  FOR UPDATE TO authenticated
  USING (
    private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'ejecutivo'::app_role,'agente_aduanal'::app_role])
    AND estado = 'pendiente' AND enviado_en IS NULL
  )
  WITH CHECK (
    private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'operaciones'::app_role,'ejecutivo'::app_role,'agente_aduanal'::app_role])
    AND estado = 'pendiente' AND enviado_en IS NULL
    AND EXISTS (SELECT 1 FROM public.solicitudes_correo s
      WHERE s.id = solicitud_correo_id AND s.expediente_id = confirmaciones_correo.expediente_id
        AND s.id_hilo IS NOT DISTINCT FROM confirmaciones_correo.id_hilo)
  );