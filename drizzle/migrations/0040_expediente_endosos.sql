CREATE TABLE public.expediente_endosos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  consignatario_original_id uuid REFERENCES public.clientes(id),
  consignatario_endosado_id uuid NOT NULL REFERENCES public.clientes(id),
  fecha_endoso date,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expediente_endosos_activo_uniq ON public.expediente_endosos(expediente_id) WHERE activo;
CREATE INDEX expediente_endosos_endosado_idx ON public.expediente_endosos(consignatario_endosado_id) WHERE activo;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expediente_endosos TO authenticated;
GRANT ALL ON public.expediente_endosos TO service_role;
ALTER TABLE public.expediente_endosos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "endosos read staff" ON public.expediente_endosos FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "endosos write" ON public.expediente_endosos FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo','agente_aduanal']::app_role[]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','ejecutivo','agente_aduanal']::app_role[]));
CREATE TRIGGER expediente_endosos_touch BEFORE UPDATE ON public.expediente_endosos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER expediente_endosos_audit AFTER INSERT OR UPDATE OR DELETE ON public.expediente_endosos FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- Portal: el expediente es visible para el cliente original y el endosado
CREATE OR REPLACE FUNCTION private.expedientes_ids_del_cliente_actual()
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'private'
AS $$
  SELECT id FROM public.expedientes WHERE cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()))
  UNION
  SELECT expediente_id FROM public.expediente_endosos
   WHERE activo AND consignatario_endosado_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()));
$$;

CREATE OR REPLACE VIEW public.v_expedientes_cliente AS
 SELECT id, numero, cliente_id, estado, fecha_recibido, fecha_en_transito, fecha_presentado, fecha_verificado,
    fecha_despachado, fecha_entregado, fecha_facturado, bl_awb, puerto_arribo, numero_dua, fecha_compromiso,
    suplidor, pais_origen, numero_vuce, peso_neto, numeros_contenedores, created_at, fecha_llegada_real, descripcion_mercancia
   FROM expedientes e
  WHERE e.id IN (SELECT private.expedientes_ids_del_cliente_actual());