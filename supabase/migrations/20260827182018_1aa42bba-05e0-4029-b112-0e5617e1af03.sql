CREATE OR REPLACE VIEW public.v_programas_estudiante AS
SELECT id, tipo, nombre, descripcion, modalidad, duracion_horas, cantidad_encuentros,
       horas_por_encuentro, dirigido_a, metodologia, certificacion, temario,
       fecha_inicio, fecha_fin, estado, enlace_classroom
FROM public.programas_academia p
WHERE EXISTS (
  SELECT 1 FROM public.inscripciones i
  WHERE i.programa_id = p.id
    AND i.estudiante_id IN (SELECT private.estudiante_ids_del_usuario(auth.uid()))
);

REVOKE ALL ON public.v_programas_estudiante FROM anon;
REVOKE ALL ON public.v_expedientes_cliente FROM anon;
REVOKE ALL ON public.v_facturas_cliente FROM anon;
REVOKE ALL ON public.v_mercancia_cliente FROM anon;
REVOKE ALL ON public.v_permisos_cliente FROM anon;
REVOKE ALL ON public.v_inscripciones_estudiante FROM anon;
REVOKE ALL ON public.v_cuotas_estudiante FROM anon;
REVOKE ALL ON public.v_rentabilidad_expediente FROM anon;

GRANT SELECT ON public.v_programas_estudiante TO authenticated;
GRANT SELECT ON public.v_expedientes_cliente TO authenticated;
GRANT SELECT ON public.v_facturas_cliente TO authenticated;
GRANT SELECT ON public.v_mercancia_cliente TO authenticated;
GRANT SELECT ON public.v_permisos_cliente TO authenticated;
GRANT SELECT ON public.v_inscripciones_estudiante TO authenticated;
GRANT SELECT ON public.v_cuotas_estudiante TO authenticated;
GRANT SELECT ON public.v_rentabilidad_expediente TO authenticated;