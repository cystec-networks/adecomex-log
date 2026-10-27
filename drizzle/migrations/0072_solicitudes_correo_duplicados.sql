CREATE INDEX IF NOT EXISTS solicitudes_correo_duplicados_idx
ON public.solicitudes_correo (remitente, asunto, created_at DESC)
WHERE estado IN ('pendiente', 'confirmada');

CREATE OR REPLACE FUNCTION public.crear_solicitud_correo_sin_duplicado(p_solicitud jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_remitente text := p_solicitud->>'remitente';
  v_asunto text := p_solicitud->>'asunto';
BEGIN
  -- Serializa incluso dos entregas simultáneas del mismo correo.
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(v_remitente, v_asunto)::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.solicitudes_correo
    WHERE remitente = v_remitente AND asunto = v_asunto
      AND estado IN ('pendiente', 'confirmada')
      AND created_at >= clock_timestamp() - interval '5 minutes'
  ) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.solicitudes_correo (
    remitente, remitente_correo, asunto, cuerpo, mensaje_aislado,
    bl_awb, eta, producto, cantidad, cliente_nombre, peso_bruto_kg,
    factura_comercial, advertencias, cliente_id, adjuntos
  ) VALUES (
    v_remitente, p_solicitud->>'remitente_correo', v_asunto,
    p_solicitud->>'cuerpo', p_solicitud->>'mensaje_aislado',
    p_solicitud->>'bl_awb', NULLIF(p_solicitud->>'eta', '')::date,
    p_solicitud->>'producto', p_solicitud->>'cantidad', p_solicitud->>'cliente_nombre',
    NULLIF(p_solicitud->>'peso_bruto_kg', '')::numeric,
    p_solicitud->>'factura_comercial', COALESCE(p_solicitud->'advertencias', '[]'::jsonb),
    NULLIF(p_solicitud->>'cliente_id', '')::uuid, COALESCE(p_solicitud->'adjuntos', '[]'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.crear_solicitud_correo_sin_duplicado(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crear_solicitud_correo_sin_duplicado(jsonb) TO service_role;