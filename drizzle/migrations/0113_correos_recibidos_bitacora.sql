-- Bitácora de cada correo que el script de Gmail entrega a la plataforma, con su resultado.
CREATE TABLE public.correos_recibidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  id_mensaje text,
  id_hilo text,
  remitente text NOT NULL DEFAULT '',
  remitente_correo text,
  asunto text NOT NULL DEFAULT '',
  resultado text NOT NULL DEFAULT 'procesando'
    CHECK (resultado IN ('procesando','creada','actualizada','adjuntada','descartada','error')),
  motivo text,
  reintentable boolean NOT NULL DEFAULT true,
  solicitud_id uuid REFERENCES public.solicitudes_correo(id) ON DELETE SET NULL,
  expediente_id uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  expediente_numero text,
  vinculo text CHECK (vinculo IS NULL OR vinculo IN ('numero','bl')),
  adjuntos_total integer NOT NULL DEFAULT 0,
  advertencias text[] NOT NULL DEFAULT '{}',
  propuestas jsonb NOT NULL DEFAULT '{}'::jsonb,
  intentos integer NOT NULL DEFAULT 1,
  primer_intento_at timestamptz NOT NULL DEFAULT now(),
  ultimo_intento_at timestamptz NOT NULL DEFAULT now(),
  alerta_vista_en timestamptz,
  alerta_vista_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.correos_recibidos IS 'Una fila por correo recibido del script de Gmail (clave = id de mensaje o huella); resultado final o error para auditar que ninguno se pierda.';

CREATE INDEX correos_recibidos_resultado_idx ON public.correos_recibidos (resultado, ultimo_intento_at DESC);
CREATE INDEX correos_recibidos_expediente_idx ON public.correos_recibidos (expediente_id, created_at DESC) WHERE expediente_id IS NOT NULL;
CREATE INDEX correos_recibidos_created_idx ON public.correos_recibidos (created_at DESC);

GRANT SELECT ON public.correos_recibidos TO authenticated;
GRANT UPDATE (alerta_vista_en, alerta_vista_por, propuestas) ON public.correos_recibidos TO authenticated;
GRANT ALL ON public.correos_recibidos TO service_role;

ALTER TABLE public.correos_recibidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY correos_recibidos_read ON public.correos_recibidos
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY correos_recibidos_update ON public.correos_recibidos
  FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER correos_recibidos_touch BEFORE UPDATE ON public.correos_recibidos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Registra un intento de entrega. Un correo ya creado/adjuntado no se vuelve a procesar
-- (reenvío por tiempo agotado del script) y uno en proceso reciente no se duplica.
CREATE OR REPLACE FUNCTION public.registrar_intento_correo(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r public.correos_recibidos%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.correos_recibidos WHERE clave = p->>'clave' FOR UPDATE;
  IF FOUND THEN
    IF r.resultado IN ('creada','actualizada','adjuntada') THEN
      RETURN jsonb_build_object('id', r.id, 'ya_procesado', true, 'resultado', r.resultado,
        'solicitud_id', r.solicitud_id, 'expediente_numero', r.expediente_numero, 'motivo', r.motivo);
    END IF;
    IF r.resultado = 'procesando' AND r.ultimo_intento_at > now() - interval '5 minutes' THEN
      RETURN jsonb_build_object('id', r.id, 'en_proceso', true);
    END IF;
    UPDATE public.correos_recibidos SET
      intentos = r.intentos + 1, ultimo_intento_at = now(), resultado = 'procesando', motivo = NULL,
      remitente = coalesce(p->>'remitente', r.remitente), remitente_correo = coalesce(p->>'remitente_correo', r.remitente_correo),
      asunto = coalesce(p->>'asunto', r.asunto), id_mensaje = coalesce(p->>'id_mensaje', r.id_mensaje),
      id_hilo = coalesce(p->>'id_hilo', r.id_hilo), adjuntos_total = coalesce((p->>'adjuntos_total')::int, r.adjuntos_total)
    WHERE id = r.id;
    RETURN jsonb_build_object('id', r.id, 'intentos', r.intentos + 1);
  END IF;
  INSERT INTO public.correos_recibidos (clave, id_mensaje, id_hilo, remitente, remitente_correo, asunto, adjuntos_total)
  VALUES (p->>'clave', p->>'id_mensaje', p->>'id_hilo', coalesce(p->>'remitente',''), p->>'remitente_correo',
          coalesce(p->>'asunto',''), coalesce((p->>'adjuntos_total')::int, 0))
  RETURNING * INTO r;
  RETURN jsonb_build_object('id', r.id, 'intentos', 1);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_intento_correo(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_intento_correo(jsonb) TO service_role;

-- Expedientes activos por BL/AWB ignorando espacios, guiones y mayúsculas ("SMLU 9221768A" = "SMLU9221768A").
CREATE OR REPLACE FUNCTION public.buscar_expedientes_por_bl(p_bl text)
RETURNS TABLE(id uuid, numero text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT e.id, e.numero FROM public.expedientes e
  WHERE e.eliminado_en IS NULL
    AND length(regexp_replace(upper(coalesce(p_bl,'')), '[^A-Z0-9]', '', 'g')) >= 6
    AND regexp_replace(upper(coalesce(e.bl_awb,'')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_bl), '[^A-Z0-9]', '', 'g')
  ORDER BY e.created_at DESC
  LIMIT 5
$$;
REVOKE ALL ON FUNCTION public.buscar_expedientes_por_bl(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_expedientes_por_bl(text) TO authenticated, service_role;