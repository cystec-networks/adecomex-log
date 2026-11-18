CREATE TABLE IF NOT EXISTS public.autocompletado_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  fuente text NOT NULL,
  anterior jsonb NOT NULL DEFAULT '{}'::jsonb,
  contenedores jsonb NOT NULL DEFAULT '[]'::jsonb,
  aplicado_en timestamptz NOT NULL DEFAULT now(),
  deshecho_en timestamptz,
  deshecho_por uuid
);
COMMENT ON TABLE public.autocompletado_lotes IS
  'Qué se completó desde el BL/AWB o la Factura comercial en cada Expediente, con el valor anterior de cada campo, para poder deshacer el lote.';
CREATE INDEX IF NOT EXISTS autocompletado_lotes_lote_idx ON public.autocompletado_lotes (lote_id);
CREATE INDEX IF NOT EXISTS autocompletado_lotes_exp_idx ON public.autocompletado_lotes (expediente_id);

GRANT SELECT, INSERT, UPDATE ON public.autocompletado_lotes TO authenticated;
GRANT ALL ON public.autocompletado_lotes TO service_role;
ALTER TABLE public.autocompletado_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff lee lotes de autocompletado" ON public.autocompletado_lotes;
CREATE POLICY "Staff lee lotes de autocompletado" ON public.autocompletado_lotes
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff registra lotes de autocompletado" ON public.autocompletado_lotes;
CREATE POLICY "Staff registra lotes de autocompletado" ON public.autocompletado_lotes
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Staff deshace lotes de autocompletado" ON public.autocompletado_lotes;
CREATE POLICY "Staff deshace lotes de autocompletado" ON public.autocompletado_lotes
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.deshacer_autocompletado_lote(p_lote uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  it public.autocompletado_lotes%ROWTYPE;
  k text;
  permitidos text[] := ARRAY[
    'bl_awb','naviera','puerto_salida','puerto_salida_codigo','puerto_arribo','puerto_arribo_codigo',
    'fecha_cargado','medio_transporte','peso_bruto','peso_neto','cantidad_bultos','tipo_carga',
    'pais_procedencia','pais_procedencia_codigo','suplidor','factura_comercial','total_fob','seguro',
    'flete','otros','incoterm','pais_origen','pais_origen_codigo','descripcion_mercancia'
  ];
  restaurados int := 0;
  contenedores_borrados int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.autocompletado_lotes WHERE lote_id = p_lote AND deshecho_en IS NULL) THEN
    RAISE EXCEPTION 'El lote no existe o ya fue deshecho';
  END IF;
  FOR it IN SELECT * FROM public.autocompletado_lotes WHERE lote_id = p_lote AND deshecho_en IS NULL ORDER BY id LOOP
    FOREACH k IN ARRAY coalesce(ARRAY(SELECT jsonb_object_keys(it.anterior)), '{}'::text[]) LOOP
      IF NOT (k = ANY (permitidos)) THEN CONTINUE; END IF;
      EXECUTE format('UPDATE public.expedientes SET %I = $1::jsonb, auto_documento = coalesce(auto_documento, ''{}''::jsonb) - $2 WHERE id = $3', k)
        USING it.anterior -> k, k, it.expediente_id;
      restaurados := restaurados + 1;
    END LOOP;
    IF jsonb_typeof(it.contenedores) = 'array' AND jsonb_array_length(it.contenedores) > 0 THEN
      DELETE FROM public.expediente_contenedores
       WHERE expediente_id = it.expediente_id
         AND numero_contenedor IN (
           SELECT nullif(btrim(x.numero), '') FROM jsonb_to_recordset(it.contenedores) AS x(numero text));
      contenedores_borrados := contenedores_borrados + jsonb_array_length(it.contenedores);
    END IF;
    UPDATE public.autocompletado_lotes SET deshecho_en = now(), deshecho_por = auth.uid() WHERE id = it.id;
    INSERT INTO public.auditoria (entidad, entidad_id, accion, usuario_id, cambios)
    VALUES ('expedientes', it.expediente_id, 'autocompletado_documento_deshecho', auth.uid(),
      jsonb_build_object('lote_id', p_lote, 'documento_id', it.documento_id, 'fuente', it.fuente,
        'campos', coalesce(it.anterior, '{}'::jsonb), 'contenedores', coalesce(it.contenedores, '[]'::jsonb)));
  END LOOP;
  RETURN jsonb_build_object('restaurados', restaurados, 'contenedores', contenedores_borrados);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deshacer_autocompletado_lote(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deshacer_autocompletado_lote(uuid) TO service_role;