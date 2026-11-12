ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS creado_por uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS actualizado_en timestamptz,
  ADD COLUMN IF NOT EXISTS actualizado_por uuid,
  ADD COLUMN IF NOT EXISTS actualizado_origen text,
  ADD COLUMN IF NOT EXISTS origen_cambio text;

COMMENT ON COLUMN public.documentos.creado_por IS 'Usuario que subió la primera versión (null en documentos anteriores o creados por procesos automáticos).';
COMMENT ON COLUMN public.documentos.actualizado_en IS 'Fecha y hora del último reemplazo del archivo; solo la escribe el trigger documentos_versionar_archivo.';
COMMENT ON COLUMN public.documentos.actualizado_por IS 'Usuario del último reemplazo del archivo; solo la escribe el trigger.';
COMMENT ON COLUMN public.documentos.actualizado_origen IS 'Origen del último reemplazo (manual, correo, generado...).';
COMMENT ON COLUMN public.documentos.origen_cambio IS 'Entrada transitoria: el cliente indica el origen del reemplazo en el mismo UPDATE; el trigger la lee y la deja en NULL.';

CREATE TABLE public.documento_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos(id) ON DELETE CASCADE,
  expediente_id uuid NOT NULL,
  tipo text NOT NULL,
  storage_path text NOT NULL,
  file_hash text,
  codigo_siga text,
  subido_en timestamptz NOT NULL,
  subido_por uuid,
  actualizado_en_previo timestamptz,
  actualizado_por_previo uuid,
  actualizado_origen_previo text,
  reemplazado_en timestamptz NOT NULL DEFAULT now(),
  reemplazado_por uuid,
  origen text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documento_versiones_documento_idx ON public.documento_versiones (documento_id, reemplazado_en DESC);
CREATE INDEX documento_versiones_expediente_idx ON public.documento_versiones (expediente_id);

GRANT SELECT ON public.documento_versiones TO authenticated;
GRANT ALL ON public.documento_versiones TO service_role;
ALTER TABLE public.documento_versiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documento_versiones staff read" ON public.documento_versiones
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.documentos_versionar_archivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origen text := coalesce(nullif(btrim(NEW.origen_cambio), ''), 'manual');
  v_usuario uuid;
  v_ultima public.documento_versiones%ROWTYPE;
BEGIN
  NEW.origen_cambio := NULL;

  IF TG_OP = 'INSERT' THEN
    NEW.creado_por := coalesce(auth.uid(), NEW.creado_por);
    NEW.actualizado_en := NULL;
    NEW.actualizado_por := NULL;
    NEW.actualizado_origen := NULL;
    RETURN NEW;
  END IF;

  NEW.creado_por := OLD.creado_por;
  v_usuario := CASE WHEN auth.uid() IS NOT NULL THEN auth.uid()
                    WHEN NEW.actualizado_por IS DISTINCT FROM OLD.actualizado_por THEN NEW.actualizado_por END;

  -- Sin cambio de archivo (o primera carga sobre una fila sin archivo): el sello no se toca.
  IF OLD.storage_path IS NULL OR NEW.storage_path IS NULL OR NEW.storage_path = OLD.storage_path OR v_origen = 'sin_version' THEN
    NEW.actualizado_en := OLD.actualizado_en;
    NEW.actualizado_por := OLD.actualizado_por;
    NEW.actualizado_origen := OLD.actualizado_origen;
    RETURN NEW;
  END IF;

  -- Compensación de un guardado fallido: vuelve al archivo de la última versión.
  SELECT * INTO v_ultima FROM public.documento_versiones
   WHERE documento_id = OLD.id ORDER BY reemplazado_en DESC, created_at DESC LIMIT 1;
  IF FOUND AND v_ultima.storage_path = NEW.storage_path THEN
    DELETE FROM public.documento_versiones WHERE id = v_ultima.id;
    NEW.actualizado_en := v_ultima.actualizado_en_previo;
    NEW.actualizado_por := v_ultima.actualizado_por_previo;
    NEW.actualizado_origen := v_ultima.actualizado_origen_previo;
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('documentos', NEW.expediente_id, 'documento_reemplazo_revertido', v_usuario,
      jsonb_build_object('documento_id', NEW.id, 'tipo', NEW.tipo, 'codigo_siga', NEW.codigo_siga,
        'archivo_restaurado', NEW.storage_path, 'archivo_retirado', OLD.storage_path));
    RETURN NEW;
  END IF;

  INSERT INTO public.documento_versiones (
    documento_id, expediente_id, tipo, storage_path, file_hash, codigo_siga,
    subido_en, subido_por, actualizado_en_previo, actualizado_por_previo, actualizado_origen_previo,
    reemplazado_en, reemplazado_por, origen)
  VALUES (
    OLD.id, OLD.expediente_id, OLD.tipo, OLD.storage_path, OLD.file_hash, OLD.codigo_siga,
    coalesce(OLD.actualizado_en, OLD.created_at),
    CASE WHEN OLD.actualizado_en IS NOT NULL THEN OLD.actualizado_por ELSE OLD.creado_por END,
    OLD.actualizado_en, OLD.actualizado_por, OLD.actualizado_origen,
    now(), v_usuario, v_origen);

  NEW.actualizado_en := now();
  NEW.actualizado_por := v_usuario;
  NEW.actualizado_origen := v_origen;
  -- «Recibido» es la fecha de la primera carga y no cambia con los reemplazos.
  NEW.fecha_recepcion := coalesce(OLD.fecha_recepcion, NEW.fecha_recepcion);

  INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
  VALUES ('documentos', NEW.expediente_id, 'documento_reemplazado', v_usuario,
    jsonb_build_object('documento_id', NEW.id, 'tipo', NEW.tipo, 'codigo_siga', NEW.codigo_siga,
      'archivo_anterior', OLD.storage_path, 'archivo_nuevo', NEW.storage_path, 'origen', v_origen));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.documentos_versionar_archivo() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER documentos_versionar_archivo
  BEFORE INSERT OR UPDATE ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION public.documentos_versionar_archivo();