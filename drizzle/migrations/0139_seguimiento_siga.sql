ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS siga_control_carga text,
  ADD COLUMN IF NOT EXISTS siga_bl_madre text,
  ADD COLUMN IF NOT EXISTS siga_buque text,
  ADD COLUMN IF NOT EXISTS siga_viaje text,
  ADD COLUMN IF NOT EXISTS siga_empresa_transportista text,
  ADD COLUMN IF NOT EXISTS siga_bandera text,
  ADD COLUMN IF NOT EXISTS siga_terminal text,
  ADD COLUMN IF NOT EXISTS siga_administracion text,
  ADD COLUMN IF NOT EXISTS cantidad_bultos numeric,
  ADD COLUMN IF NOT EXISTS siga_fecha_llegada timestamptz,
  ADD COLUMN IF NOT EXISTS siga_auto jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.expedientes.siga_auto IS 'Campos completados desde Seguimiento SIGA: {campo: {valor, documento_id, fecha, origen}}. La etiqueta Automático (SIGA) solo se muestra mientras el valor actual coincide.';

ALTER TABLE public.documentos ADD COLUMN IF NOT EXISTS lectura_siga jsonb;

CREATE TABLE public.expediente_siga_procesos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  proceso text NOT NULL,
  etiqueta text,
  numero_solicitud text,
  fecha timestamptz,
  fecha_texto text,
  estado text,
  origen text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);
CREATE UNIQUE INDEX expediente_siga_procesos_unico ON public.expediente_siga_procesos
  (expediente_id, proceso, (coalesce(numero_solicitud, '')), (coalesce(fecha_texto, '')));
CREATE INDEX expediente_siga_procesos_exp ON public.expediente_siga_procesos (expediente_id, fecha);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expediente_siga_procesos TO authenticated;
GRANT ALL ON public.expediente_siga_procesos TO service_role;
ALTER TABLE public.expediente_siga_procesos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff lee procesos SIGA" ON public.expediente_siga_procesos FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY "Staff registra procesos SIGA" ON public.expediente_siga_procesos FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','documentacion','agente_aduanal']::app_role[]));
CREATE POLICY "Staff actualiza procesos SIGA" ON public.expediente_siga_procesos FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','documentacion','agente_aduanal']::app_role[]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','operaciones','documentacion','agente_aduanal']::app_role[]));
CREATE POLICY "Admin borra procesos SIGA" ON public.expediente_siga_procesos FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Aplica una lectura del Seguimiento SIGA: solo completa campos vacíos (nunca Naviera, descripción
-- ni estado), registra los procesos como historial y deja una fila explícita en Auditoría.
-- SECURITY INVOKER: el usuario necesita permiso normal de edición (RLS); el correo usa service_role.
CREATE OR REPLACE FUNCTION public.aplicar_seguimiento_siga(
  p_expediente uuid, p_documento uuid, p_estado text, p_campos jsonb, p_procesos jsonb, p_lectura jsonb, p_origen text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  e public.expedientes%ROWTYPE;
  n public.expedientes%ROWTYPE;
  c jsonb := coalesce(p_campos, '{}'::jsonb);
  k text;
  completados text[] := '{}';
  auto jsonb;
  nuevos int := 0;
  permitidos text[] := ARRAY['fecha_llegada_real','siga_fecha_llegada','siga_control_carga','siga_bl_madre','siga_buque','siga_viaje',
    'siga_empresa_transportista','siga_bandera','siga_terminal','siga_administracion','peso_bruto','cantidad_bultos','area_aduanera','area_aduanera_codigo'];
BEGIN
  IF p_estado NOT IN ('aplicado','rechazado') THEN RAISE EXCEPTION 'Estado de lectura no válido: %', p_estado; END IF;
  SELECT * INTO e FROM public.expedientes WHERE id = p_expediente FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expediente no encontrado o sin permiso'; END IF;
  IF p_documento IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documentos WHERE id = p_documento AND expediente_id = p_expediente) THEN
    RAISE EXCEPTION 'El documento no pertenece al Expediente';
  END IF;

  IF p_estado = 'aplicado' THEN
    UPDATE public.expedientes SET
      fecha_llegada_real = CASE WHEN fecha_llegada_real IS NULL AND nullif(c->>'fecha_llegada_real','') IS NOT NULL THEN (c->>'fecha_llegada_real')::date ELSE fecha_llegada_real END,
      siga_fecha_llegada = CASE WHEN siga_fecha_llegada IS NULL AND nullif(c->>'siga_fecha_llegada','') IS NOT NULL THEN (c->>'siga_fecha_llegada')::timestamptz ELSE siga_fecha_llegada END,
      siga_control_carga = CASE WHEN coalesce(btrim(siga_control_carga),'') = '' AND nullif(btrim(c->>'siga_control_carga'),'') IS NOT NULL THEN btrim(c->>'siga_control_carga') ELSE siga_control_carga END,
      siga_bl_madre = CASE WHEN coalesce(btrim(siga_bl_madre),'') = '' AND nullif(btrim(c->>'siga_bl_madre'),'') IS NOT NULL THEN btrim(c->>'siga_bl_madre') ELSE siga_bl_madre END,
      siga_buque = CASE WHEN coalesce(btrim(siga_buque),'') = '' AND nullif(btrim(c->>'siga_buque'),'') IS NOT NULL THEN btrim(c->>'siga_buque') ELSE siga_buque END,
      siga_viaje = CASE WHEN coalesce(btrim(siga_viaje),'') = '' AND nullif(btrim(c->>'siga_viaje'),'') IS NOT NULL THEN btrim(c->>'siga_viaje') ELSE siga_viaje END,
      siga_empresa_transportista = CASE WHEN coalesce(btrim(siga_empresa_transportista),'') = '' AND nullif(btrim(c->>'siga_empresa_transportista'),'') IS NOT NULL THEN btrim(c->>'siga_empresa_transportista') ELSE siga_empresa_transportista END,
      siga_bandera = CASE WHEN coalesce(btrim(siga_bandera),'') = '' AND nullif(btrim(c->>'siga_bandera'),'') IS NOT NULL THEN btrim(c->>'siga_bandera') ELSE siga_bandera END,
      siga_terminal = CASE WHEN coalesce(btrim(siga_terminal),'') = '' AND nullif(btrim(c->>'siga_terminal'),'') IS NOT NULL THEN btrim(c->>'siga_terminal') ELSE siga_terminal END,
      siga_administracion = CASE WHEN coalesce(btrim(siga_administracion),'') = '' AND nullif(btrim(c->>'siga_administracion'),'') IS NOT NULL THEN btrim(c->>'siga_administracion') ELSE siga_administracion END,
      peso_bruto = CASE WHEN peso_bruto IS NULL AND (c->>'peso_bruto') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'peso_bruto')::numeric ELSE peso_bruto END,
      cantidad_bultos = CASE WHEN cantidad_bultos IS NULL AND (c->>'cantidad_bultos') ~ '^[0-9]+(\.[0-9]+)?$' THEN (c->>'cantidad_bultos')::numeric ELSE cantidad_bultos END,
      area_aduanera = CASE WHEN coalesce(btrim(area_aduanera),'') = '' AND coalesce(btrim(area_aduanera_codigo),'') = ''
          AND nullif(btrim(c->>'area_aduanera'),'') IS NOT NULL AND nullif(btrim(c->>'area_aduanera_codigo'),'') IS NOT NULL
        THEN btrim(c->>'area_aduanera') ELSE area_aduanera END,
      area_aduanera_codigo = CASE WHEN coalesce(btrim(area_aduanera),'') = '' AND coalesce(btrim(area_aduanera_codigo),'') = ''
          AND nullif(btrim(c->>'area_aduanera'),'') IS NOT NULL AND nullif(btrim(c->>'area_aduanera_codigo'),'') IS NOT NULL
        THEN btrim(c->>'area_aduanera_codigo') ELSE area_aduanera_codigo END
    WHERE id = p_expediente
    RETURNING * INTO n;

    auto := coalesce(e.siga_auto, '{}'::jsonb);
    FOREACH k IN ARRAY permitidos LOOP
      IF (to_jsonb(n) -> k) IS DISTINCT FROM (to_jsonb(e) -> k) THEN
        completados := completados || k;
        auto := auto || jsonb_build_object(k, jsonb_build_object('valor', to_jsonb(n) -> k, 'documento_id', p_documento, 'fecha', now(), 'origen', p_origen));
      END IF;
    END LOOP;
    IF array_length(completados, 1) > 0 THEN
      UPDATE public.expedientes SET siga_auto = auto WHERE id = p_expediente;
    END IF;

    WITH ins AS (
      INSERT INTO public.expediente_siga_procesos (expediente_id, documento_id, proceso, etiqueta, numero_solicitud, fecha, fecha_texto, estado, origen)
      SELECT p_expediente, p_documento, x.proceso, x.etiqueta, nullif(btrim(x.numero_solicitud), ''),
        CASE WHEN x.fecha ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN (left(x.fecha, 16)::timestamp AT TIME ZONE 'America/Santo_Domingo')
             WHEN x.fecha ~ '^\d{4}-\d{2}-\d{2}$' THEN (x.fecha::timestamp AT TIME ZONE 'America/Santo_Domingo') END,
        nullif(btrim(x.fecha), ''), nullif(btrim(x.estado), ''), p_origen
      FROM jsonb_to_recordset(coalesce(p_procesos, '[]'::jsonb)) AS x(proceso text, etiqueta text, numero_solicitud text, fecha text, estado text)
      WHERE x.proceso IN ('manifiesto_madre','manifiesto_consolidado','entrada','transportacion')
        AND (nullif(btrim(x.numero_solicitud), '') IS NOT NULL OR nullif(btrim(x.fecha), '') IS NOT NULL)
      ON CONFLICT DO NOTHING
      RETURNING 1
    ) SELECT count(*) INTO nuevos FROM ins;
  END IF;

  IF p_documento IS NOT NULL THEN
    UPDATE public.documentos
       SET lectura_siga = coalesce(p_lectura, '{}'::jsonb) || jsonb_build_object(
             'estado', p_estado, 'procesado_en', now(), 'procesado_por', auth.uid(), 'origen', p_origen,
             'completados', to_jsonb(completados))
     WHERE id = p_documento;
  END IF;

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('expedientes', p_expediente,
    CASE WHEN p_estado = 'aplicado' THEN 'seguimiento_siga_aplicado' ELSE 'seguimiento_siga_rechazado' END,
    auth.uid(),
    jsonb_build_object('documento_id', p_documento, 'origen', p_origen, 'completados', to_jsonb(completados),
      'valores', (SELECT coalesce(jsonb_object_agg(k2, to_jsonb(n) -> k2), '{}'::jsonb) FROM unnest(completados) AS k2),
      'procesos_nuevos', nuevos,
      'diferencias', coalesce(p_lectura -> 'diferencias', '[]'::jsonb),
      'errores', coalesce(p_lectura #> '{validacion,errores}', '[]'::jsonb)));

  RETURN jsonb_build_object('completados', to_jsonb(completados), 'procesos_nuevos', nuevos);
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_seguimiento_siga(uuid, uuid, text, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_seguimiento_siga(uuid, uuid, text, jsonb, jsonb, jsonb, text) TO authenticated, service_role;