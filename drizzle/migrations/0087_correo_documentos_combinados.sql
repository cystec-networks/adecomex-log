CREATE TABLE public.correo_documentos_combinados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id uuid REFERENCES public.solicitudes_correo(id) ON DELETE CASCADE,
  expediente_id uuid REFERENCES public.expedientes(id) ON DELETE CASCADE,
  documento_id uuid,
  nombre text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  paginas integer,
  motivo text NOT NULL DEFAULT 'paginas',
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesando','completado','error')),
  intentos integer NOT NULL DEFAULT 0,
  bloqueado_hasta timestamptz,
  resultado jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  procesado_en timestamptz,
  CHECK (solicitud_id IS NOT NULL OR expediente_id IS NOT NULL)
);
GRANT SELECT ON public.correo_documentos_combinados TO authenticated;
GRANT ALL ON public.correo_documentos_combinados TO service_role;
ALTER TABLE public.correo_documentos_combinados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "combinados lectura staff" ON public.correo_documentos_combinados FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE INDEX correo_combinados_pendientes ON public.correo_documentos_combinados (created_at) WHERE estado IN ('pendiente','procesando');
CREATE INDEX correo_combinados_solicitud ON public.correo_documentos_combinados (solicitud_id);
CREATE INDEX correo_combinados_expediente ON public.correo_documentos_combinados (expediente_id);

CREATE TABLE private.tarea_token (nombre text PRIMARY KEY, token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex'));
INSERT INTO private.tarea_token (nombre) VALUES ('documentos_combinados');
CREATE OR REPLACE FUNCTION public.validar_token_tarea(p_nombre text, p_token text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT EXISTS (SELECT 1 FROM private.tarea_token WHERE nombre = p_nombre AND token = p_token AND length(p_token) > 30)
$$;
REVOKE ALL ON FUNCTION public.validar_token_tarea(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_token_tarea(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.reservar_documento_combinado(p_id uuid DEFAULT NULL) RETURNS SETOF public.correo_documentos_combinados
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.correo_documentos_combinados c SET estado = 'procesando', intentos = intentos + 1, bloqueado_hasta = now() + interval '10 minutes'
  WHERE c.id = (
    SELECT id FROM public.correo_documentos_combinados
    WHERE (p_id IS NULL OR id = p_id) AND intentos < 3
      AND (estado = 'pendiente' OR (estado = 'procesando' AND bloqueado_hasta < now()))
    ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING c.*
$$;
REVOKE ALL ON FUNCTION public.reservar_documento_combinado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_documento_combinado(uuid) TO service_role;

-- Despertar al encolar (sin sondeo): llama al procesador del sitio publicado.
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE OR REPLACE FUNCTION private.despertar_documentos_combinados() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, extensions AS $$
BEGIN
  IF NEW.estado = 'pendiente' AND NEW.intentos < 3 THEN
    PERFORM net.http_post(
      url := 'https://app.adecomex.com/api/public/documentos-combinados',
      headers := jsonb_build_object('Content-Type','application/json','x-tarea-token',(SELECT token FROM private.tarea_token WHERE nombre='documentos_combinados')),
      body := jsonb_build_object('id', NEW.id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER despertar_documentos_combinados AFTER INSERT OR UPDATE OF estado ON public.correo_documentos_combinados
FOR EACH ROW EXECUTE FUNCTION private.despertar_documentos_combinados();