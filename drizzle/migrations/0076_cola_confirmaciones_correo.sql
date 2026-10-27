ALTER TABLE public.solicitudes_correo ADD COLUMN IF NOT EXISTS id_hilo text;

CREATE TABLE public.confirmaciones_correo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_correo_id uuid REFERENCES public.solicitudes_correo(id) ON DELETE SET NULL,
  expediente_id uuid REFERENCES public.expedientes(id) ON DELETE CASCADE,
  para text NOT NULL,
  cc text,
  asunto text NOT NULL,
  cuerpo text NOT NULL,
  id_hilo text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviada')),
  enviado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.confirmaciones_correo TO authenticated;
GRANT ALL ON public.confirmaciones_correo TO service_role;
ALTER TABLE public.confirmaciones_correo ENABLE ROW LEVEL SECURITY;
CREATE POLICY confirmaciones_correo_select ON public.confirmaciones_correo FOR SELECT TO authenticated USING (true);
CREATE POLICY confirmaciones_correo_insert ON public.confirmaciones_correo FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY confirmaciones_correo_update ON public.confirmaciones_correo FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.guardar_solicitud_correo_pendiente(p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $func$
DECLARE
 v_id uuid; v_actual public.solicitudes_correo%ROWTYPE; v_datos jsonb;
 v_remitente text := coalesce(nullif(lower(btrim(p_solicitud->>'remitente_correo')),''),lower(btrim(p_solicitud->>'remitente')));
 v_bl text := nullif(upper(btrim(p_solicitud->>'bl_awb')),'');
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(v_remitente,0));
 SELECT * INTO v_actual FROM public.solicitudes_correo s
 WHERE s.estado='pendiente'
 AND coalesce(nullif(lower(btrim(s.remitente_correo)),''),lower(btrim(s.remitente)))=v_remitente
 AND ((v_bl IS NOT NULL AND nullif(upper(btrim(s.bl_awb)),'')=v_bl)
 OR (v_bl IS NULL AND nullif(btrim(s.bl_awb),'') IS NULL AND s.asunto=p_solicitud->>'asunto'))
 ORDER BY s.created_at,s.id LIMIT 1 FOR UPDATE;
 IF v_actual.id IS NOT NULL THEN
  v_datos := public.fusionar_datos_correo(to_jsonb(v_actual),p_solicitud);
  UPDATE public.solicitudes_correo SET
   cuerpo=v_datos->>'cuerpo', mensaje_aislado=v_datos->>'mensaje_aislado',
   bl_awb=v_datos->>'bl_awb', eta=nullif(v_datos->>'eta','')::date,
   producto=v_datos->>'producto',cantidad=v_datos->>'cantidad',cliente_nombre=v_datos->>'cliente_nombre',
   peso_bruto_kg=nullif(v_datos->>'peso_bruto_kg','')::numeric,factura_comercial=v_datos->>'factura_comercial',
   cliente_id=nullif(v_datos->>'cliente_id','')::uuid,destinatarios=v_datos->>'destinatarios',cc=v_datos->>'cc',
   id_hilo=v_datos->>'id_hilo',
   advertencias=ARRAY(SELECT DISTINCT x FROM unnest(coalesce(v_actual.advertencias,'{}'::text[]) || ARRAY(SELECT jsonb_array_elements_text(coalesce(p_solicitud->'advertencias','[]'::jsonb)))) x),
   adjuntos=public.fusionar_adjuntos_correo(v_actual.adjuntos,p_solicitud->'adjuntos')
  WHERE id=v_actual.id AND estado='pendiente' RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'actualizado',true);
 END IF;
 INSERT INTO public.solicitudes_correo(remitente,remitente_correo,asunto,cuerpo,mensaje_aislado,bl_awb,eta,producto,cantidad,cliente_nombre,peso_bruto_kg,factura_comercial,advertencias,cliente_id,adjuntos,destinatarios,cc,id_hilo)
  VALUES(p_solicitud->>'remitente',p_solicitud->>'remitente_correo',p_solicitud->>'asunto',p_solicitud->>'cuerpo',p_solicitud->>'mensaje_aislado',p_solicitud->>'bl_awb',nullif(p_solicitud->>'eta','')::date,p_solicitud->>'producto',p_solicitud->>'cantidad',p_solicitud->>'cliente_nombre',nullif(p_solicitud->>'peso_bruto_kg','')::numeric,p_solicitud->>'factura_comercial',ARRAY(SELECT jsonb_array_elements_text(coalesce(p_solicitud->'advertencias','[]'::jsonb))),nullif(p_solicitud->>'cliente_id','')::uuid,coalesce(p_solicitud->'adjuntos','[]'::jsonb),nullif(p_solicitud->>'destinatarios',''),nullif(p_solicitud->>'cc',''),nullif(p_solicitud->>'id_hilo','')) RETURNING id INTO v_id;
 RETURN jsonb_build_object('id',v_id,'actualizado',false);
END; $func$;
REVOKE ALL ON FUNCTION public.guardar_solicitud_correo_pendiente(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_solicitud_correo_pendiente(jsonb) TO service_role;