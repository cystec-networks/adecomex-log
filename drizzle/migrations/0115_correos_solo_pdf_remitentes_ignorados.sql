-- Remitentes cuyos correos nunca crean solicitud (dominio completo o dirección exacta).
CREATE TABLE public.remitentes_ignorados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patron text NOT NULL UNIQUE
    CHECK (patron = lower(btrim(patron)) AND patron ~ '^([a-z0-9._%+-]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  motivo text,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.remitentes_ignorados IS 'Dominios o direcciones cuyos correos se descartan sin crear solicitud ni tocar Expedientes.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remitentes_ignorados TO authenticated;
GRANT ALL ON public.remitentes_ignorados TO service_role;
ALTER TABLE public.remitentes_ignorados ENABLE ROW LEVEL SECURITY;
CREATE POLICY ri_staff_lee ON public.remitentes_ignorados FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));
CREATE POLICY ri_admin_inserta ON public.remitentes_ignorados FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY ri_admin_actualiza ON public.remitentes_ignorados FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE POLICY ri_admin_elimina ON public.remitentes_ignorados FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER remitentes_ignorados_touch BEFORE UPDATE ON public.remitentes_ignorados
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.remitentes_ignorados (patron, motivo) VALUES
  ('dph.com.do', 'Tickets y notificaciones del puerto (DPH)'),
  ('aduanas.gob.do', 'Respuestas y notificaciones de la DGA')
ON CONFLICT (patron) DO NOTHING;

-- PDF que el script vio en Gmail, para no descartar correos cuyos documentos no llegaron.
ALTER TABLE public.correos_recibidos ADD COLUMN IF NOT EXISTS pdfs_en_gmail integer;

-- Motivo opcional al descartar una solicitud desde la bandeja (individual, selección o limpieza).
ALTER TABLE public.solicitudes_correo ADD COLUMN IF NOT EXISTS motivo_descarte text;

-- Una solicitud descartada en la bandeja pasa al Registro de correos como «Descartado», con sus
-- adjuntos como respaldo, para poder recuperarla con «Crear solicitud».
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
     SET resultado = 'descartada', motivo = v_motivo, reintentable = false,
         adjuntos_respaldo = CASE WHEN adjuntos_respaldo = '[]'::jsonb THEN v_respaldo ELSE adjuntos_respaldo END
   WHERE solicitud_id = NEW.id;
  IF NOT FOUND THEN
    INSERT INTO public.correos_recibidos (clave, id_hilo, remitente, remitente_correo, asunto, resultado, motivo, reintentable,
      solicitud_id, cuerpo, destinatarios, cc, adjuntos_total, adjuntos_respaldo, primer_intento_at, ultimo_intento_at)
    VALUES ('solicitud:' || NEW.id, NEW.id_hilo, coalesce(NEW.remitente, ''), NEW.remitente_correo, coalesce(NEW.asunto, ''),
      'descartada', v_motivo, false, NEW.id, NEW.cuerpo, NEW.destinatarios, NEW.cc, jsonb_array_length(v_adjuntos), v_respaldo,
      NEW.created_at, now())
    ON CONFLICT (clave) DO UPDATE SET resultado = 'descartada', motivo = EXCLUDED.motivo, solicitud_id = EXCLUDED.solicitud_id;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.solicitud_correo_descartada_a_registro() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER solicitudes_correo_descartada_registro
  AFTER UPDATE OF estado ON public.solicitudes_correo
  FOR EACH ROW
  WHEN (OLD.estado = 'pendiente' AND NEW.estado = 'descartada')
  EXECUTE FUNCTION public.solicitud_correo_descartada_a_registro();