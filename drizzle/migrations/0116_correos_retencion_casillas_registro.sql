-- Retención y orden del Registro de correos, y PDF cuya casilla del Expediente ya estaba ocupada.
ALTER TABLE public.correos_recibidos
  ADD COLUMN IF NOT EXISTS descartado_en timestamptz,
  ADD COLUMN IF NOT EXISTS descarte_categoria text
    CHECK (descarte_categoria IS NULL OR descarte_categoria IN ('ignorado','sin_pdf','sin_documentos','ambiguo','manual')),
  ADD COLUMN IF NOT EXISTS adjuntos_borrados_en timestamptz,
  ADD COLUMN IF NOT EXISTS conflictos jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.correos_recibidos.descartado_en IS 'Inicio de la retención: adjuntos guardados se borran a los 30 días y la línea a los 90.';
COMMENT ON COLUMN public.correos_recibidos.conflictos IS 'PDF reconocidos cuya casilla del Expediente ya tenía archivo; esperan decisión (reemplazar o descartar).';

-- Backfill antes del disparador.
UPDATE public.correos_recibidos SET descartado_en = updated_at WHERE resultado = 'descartada' AND descartado_en IS NULL;
UPDATE public.correos_recibidos SET descarte_categoria = CASE
    WHEN motivo ILIKE 'Remitente ignorado%' THEN 'ignorado'
    WHEN solicitud_id IS NOT NULL THEN 'manual'
    WHEN motivo ILIKE '%Sin documentos PDF%' OR motivo ILIKE '%no trae documentos PDF%' THEN 'sin_pdf'
    WHEN motivo ILIKE '%varios Expedientes%' THEN 'ambiguo'
    ELSE 'sin_documentos' END
  WHERE resultado = 'descartada' AND descarte_categoria IS NULL;

CREATE INDEX IF NOT EXISTS correos_recibidos_descartado_idx ON public.correos_recibidos (descartado_en) WHERE resultado = 'descartada';

CREATE OR REPLACE FUNCTION public.correos_recibidos_fecha_descarte()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.resultado = 'descartada' THEN
    IF TG_OP = 'INSERT' OR OLD.resultado IS DISTINCT FROM 'descartada' OR NEW.descartado_en IS NULL THEN
      NEW.descartado_en := now();
    END IF;
  ELSIF NEW.resultado <> 'procesando' THEN
    NEW.descartado_en := NULL;
    NEW.descarte_categoria := NULL;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER correos_recibidos_fecha_descarte
  BEFORE INSERT OR UPDATE OF resultado ON public.correos_recibidos
  FOR EACH ROW EXECUTE FUNCTION public.correos_recibidos_fecha_descarte();

-- «Quitar del registro» (selección múltiple): personal interno.
GRANT DELETE ON public.correos_recibidos TO authenticated;
CREATE POLICY correos_recibidos_delete ON public.correos_recibidos
  FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

-- El descarte manual desde la bandeja queda en la categoría «manual».
CREATE OR REPLACE FUNCTION public.solicitud_correo_descartada_a_registro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motivo text := left(coalesce(nullif(btrim(NEW.motivo_descarte), ''), 'Descartada manualmente desde la bandeja de solicitudes'), 1000);
  v_adjuntos jsonb := CASE WHEN jsonb_typeof(NEW.adjuntos) = 'array' THEN NEW.adjuntos ELSE '[]'::jsonb END;
  v_respaldo jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'nombre', coalesce(a->>'nombre', 'adjunto'), 'mime', coalesce(nullif(a->>'mime', ''), 'application/octet-stream'),
    'bytes', 0, 'storage_path', a->>'storage_path')), '[]'::jsonb)
  INTO v_respaldo
  FROM jsonb_array_elements(v_adjuntos) a
  WHERE coalesce(a->>'storage_path', '') <> '';

  UPDATE public.correos_recibidos
     SET resultado = 'descartada', motivo = v_motivo, reintentable = false, descarte_categoria = 'manual',
         adjuntos_respaldo = CASE WHEN adjuntos_respaldo = '[]'::jsonb THEN v_respaldo ELSE adjuntos_respaldo END
   WHERE solicitud_id = NEW.id;
  IF NOT FOUND THEN
    INSERT INTO public.correos_recibidos (clave, id_hilo, remitente, remitente_correo, asunto, resultado, motivo, reintentable,
      solicitud_id, cuerpo, destinatarios, cc, adjuntos_total, adjuntos_respaldo, primer_intento_at, ultimo_intento_at, descarte_categoria)
    VALUES ('solicitud:' || NEW.id, NEW.id_hilo, coalesce(NEW.remitente, ''), NEW.remitente_correo, coalesce(NEW.asunto, ''),
      'descartada', v_motivo, false, NEW.id, NEW.cuerpo, NEW.destinatarios, NEW.cc, jsonb_array_length(v_adjuntos), v_respaldo,
      NEW.created_at, now(), 'manual')
    ON CONFLICT (clave) DO UPDATE SET resultado = 'descartada', motivo = EXCLUDED.motivo, solicitud_id = EXCLUDED.solicitud_id, descarte_categoria = 'manual';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.solicitud_correo_descartada_a_registro() FROM PUBLIC, anon, authenticated;