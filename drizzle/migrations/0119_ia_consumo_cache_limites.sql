CREATE TABLE public.ia_consumo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  funcion text NOT NULL,
  modelo text NOT NULL,
  tokens_entrada integer NOT NULL DEFAULT 0,
  tokens_salida integer NOT NULL DEFAULT 0,
  costo_estimado numeric(14,6) NOT NULL DEFAULT 0,
  usuario_id uuid,
  reutilizado boolean NOT NULL DEFAULT false,
  via_texto boolean NOT NULL DEFAULT false
);
CREATE INDEX ia_consumo_created_idx ON public.ia_consumo (created_at DESC);
CREATE INDEX ia_consumo_funcion_idx ON public.ia_consumo (funcion, created_at DESC);
GRANT SELECT ON public.ia_consumo TO authenticated;
GRANT ALL ON public.ia_consumo TO service_role;
ALTER TABLE public.ia_consumo ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_consumo_select_admin ON public.ia_consumo FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
COMMENT ON TABLE public.ia_consumo IS 'One row per AI call (or reused cached result) with estimated credit cost; written only by the server.';

CREATE TABLE public.ia_cache (
  clave text PRIMARY KEY,
  funcion text NOT NULL,
  modelo text NOT NULL,
  resultado text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  usado_at timestamptz NOT NULL DEFAULT now(),
  usos integer NOT NULL DEFAULT 0
);
CREATE INDEX ia_cache_usado_idx ON public.ia_cache (usado_at);
GRANT ALL ON public.ia_cache TO service_role;
ALTER TABLE public.ia_cache ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ia_cache IS 'Server-only AI result cache keyed by sha256 of the full request (model, prompt and file), so prompt changes invalidate entries automatically.';

CREATE TABLE public.ia_limites (
  funcion text PRIMARY KEY,
  limite_diario numeric(12,4),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ia_limites TO authenticated;
GRANT ALL ON public.ia_limites TO service_role;
ALTER TABLE public.ia_limites ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_limites_select_admin ON public.ia_limites FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ia_limites_insert_admin ON public.ia_limites FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ia_limites_update_admin ON public.ia_limites FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ia_limites_delete_admin ON public.ia_limites FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.ia_configuracion (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  presupuesto_mensual numeric(12,2),
  creditos_agotados_at timestamptz,
  creditos_agotados_mensaje text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.ia_configuracion TO authenticated;
GRANT ALL ON public.ia_configuracion TO service_role;
ALTER TABLE public.ia_configuracion ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_configuracion_select_admin ON public.ia_configuracion FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ia_configuracion_insert_admin ON public.ia_configuracion FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ia_configuracion_update_admin ON public.ia_configuracion FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.resumen_consumo_ia(p_desde date, p_hasta date)
RETURNS TABLE(dia date, funcion text, modelo text, llamadas bigint, reutilizadas bigint, via_texto bigint, tokens_entrada bigint, tokens_salida bigint, costo numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT (c.created_at AT TIME ZONE 'America/Santo_Domingo')::date AS dia, c.funcion, c.modelo,
    count(*) FILTER (WHERE NOT c.reutilizado), count(*) FILTER (WHERE c.reutilizado), count(*) FILTER (WHERE c.via_texto),
    coalesce(sum(c.tokens_entrada),0)::bigint, coalesce(sum(c.tokens_salida),0)::bigint, coalesce(sum(c.costo_estimado),0)
  FROM public.ia_consumo c
  WHERE c.created_at >= (p_desde::timestamp AT TIME ZONE 'America/Santo_Domingo')
    AND c.created_at < ((p_hasta + 1)::timestamp AT TIME ZONE 'America/Santo_Domingo')
  GROUP BY 1, 2, 3
$$;
REVOKE ALL ON FUNCTION public.resumen_consumo_ia(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_consumo_ia(date, date) TO authenticated, service_role;

-- Panel alert for staff: only the budget percentage and the credits-exhausted signal, never per-call data.
CREATE OR REPLACE FUNCTION public.estado_presupuesto_ia()
RETURNS TABLE(presupuesto numeric, gastado_mes numeric, restante_pct numeric, creditos_agotados_at timestamptz, creditos_agotados_mensaje text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE inicio timestamptz := (date_trunc('month', now() AT TIME ZONE 'America/Santo_Domingo')) AT TIME ZONE 'America/Santo_Domingo';
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RETURN; END IF;
  RETURN QUERY
  SELECT cfg.presupuesto_mensual,
    coalesce((SELECT sum(c.costo_estimado) FROM public.ia_consumo c WHERE c.created_at >= inicio), 0),
    CASE WHEN cfg.presupuesto_mensual > 0 THEN round(100 * (1 - coalesce((SELECT sum(c.costo_estimado) FROM public.ia_consumo c WHERE c.created_at >= inicio), 0) / cfg.presupuesto_mensual), 1) END,
    cfg.creditos_agotados_at, cfg.creditos_agotados_mensaje
  FROM (SELECT * FROM public.ia_configuracion WHERE singleton UNION ALL SELECT true, NULL, NULL, NULL, now(), NULL WHERE NOT EXISTS (SELECT 1 FROM public.ia_configuracion)) cfg
  LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.estado_presupuesto_ia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_presupuesto_ia() TO authenticated, service_role;

ALTER TABLE public.asistente_preguntas_frecuentes ADD COLUMN respuesta text;
COMMENT ON COLUMN public.asistente_preguntas_frecuentes.respuesta IS 'Optional fixed answer written by an admin; when present the assistant shows it without calling AI.';