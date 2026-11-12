-- 1) Límite diario: acción al alcanzarlo (NULL = predeterminada de la función: correos solo alerta).
ALTER TABLE public.ia_limites ADD COLUMN IF NOT EXISTS accion text;
ALTER TABLE public.ia_limites DROP CONSTRAINT IF EXISTS ia_limites_accion_check;
ALTER TABLE public.ia_limites ADD CONSTRAINT ia_limites_accion_check CHECK (accion IS NULL OR accion IN ('alerta','bloqueo'));

-- 2) Cola de correos por límite/créditos de IA.
ALTER TABLE public.correos_recibidos ADD COLUMN IF NOT EXISTS en_cola_desde timestamptz;
ALTER TABLE public.correos_recibidos ADD COLUMN IF NOT EXISTS cola_causa text;
ALTER TABLE public.correos_recibidos DROP CONSTRAINT IF EXISTS correos_recibidos_cola_causa_check;
ALTER TABLE public.correos_recibidos ADD CONSTRAINT correos_recibidos_cola_causa_check CHECK (cola_causa IS NULL OR cola_causa IN ('limite_ia','creditos_ia'));
ALTER TABLE public.correos_recibidos DROP CONSTRAINT IF EXISTS correos_recibidos_resultado_check;
ALTER TABLE public.correos_recibidos ADD CONSTRAINT correos_recibidos_resultado_check
  CHECK (resultado IN ('procesando','creada','actualizada','adjuntada','descartada','error','en_cola'));
CREATE INDEX IF NOT EXISTS correos_recibidos_cola_idx ON public.correos_recibidos (primer_intento_at) WHERE en_cola_desde IS NOT NULL;

-- Un reenvío de Gmail de un correo en cola no se procesa dos veces.
CREATE OR REPLACE FUNCTION public.registrar_intento_correo(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.correos_recibidos%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.correos_recibidos WHERE clave = p->>'clave' FOR UPDATE;
  IF FOUND THEN
    IF r.resultado IN ('creada','actualizada','adjuntada','en_cola') THEN
      RETURN jsonb_build_object('id', r.id, 'ya_procesado', true, 'resultado', r.resultado, 'cola_causa', r.cola_causa,
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
$function$;

-- 3) Turno exclusivo para procesar la cola (una sola ejecución a la vez).
CREATE TABLE IF NOT EXISTS public.tareas_turno (
  nombre text PRIMARY KEY,
  hasta timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tareas_turno TO service_role;
ALTER TABLE public.tareas_turno ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tomar_turno_tarea(p_nombre text, p_segundos integer)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  WITH t AS (
    INSERT INTO public.tareas_turno (nombre, hasta)
    VALUES (p_nombre, now() + make_interval(secs => greatest(10, least(p_segundos, 900))))
    ON CONFLICT (nombre) DO UPDATE SET hasta = excluded.hasta WHERE public.tareas_turno.hasta < now()
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM t);
$$;
CREATE OR REPLACE FUNCTION public.soltar_turno_tarea(p_nombre text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$ UPDATE public.tareas_turno SET hasta = now() WHERE nombre = p_nombre; $$;
REVOKE ALL ON FUNCTION public.tomar_turno_tarea(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.soltar_turno_tarea(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomar_turno_tarea(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.soltar_turno_tarea(text) TO service_role;

-- 4) Estado para el Panel: funciones sobre su límite diario y correos en cola.
DROP FUNCTION IF EXISTS public.estado_presupuesto_ia();
CREATE FUNCTION public.estado_presupuesto_ia()
 RETURNS TABLE(presupuesto numeric, gastado_mes numeric, restante_pct numeric, creditos_agotados_at timestamp with time zone, creditos_agotados_mensaje text, funciones_sobre_limite jsonb, correos_en_cola integer, correos_cola_causa text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inicio timestamptz := (date_trunc('month', now() AT TIME ZONE 'America/Santo_Domingo')) AT TIME ZONE 'America/Santo_Domingo';
  hoy timestamptz := (date_trunc('day', now() AT TIME ZONE 'America/Santo_Domingo')) AT TIME ZONE 'America/Santo_Domingo';
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN RETURN; END IF;
  RETURN QUERY
  SELECT cfg.presupuesto_mensual,
    coalesce((SELECT sum(c.costo_estimado) FROM public.ia_consumo c WHERE c.created_at >= inicio), 0),
    CASE WHEN cfg.presupuesto_mensual > 0 THEN round(100 * (1 - coalesce((SELECT sum(c.costo_estimado) FROM public.ia_consumo c WHERE c.created_at >= inicio), 0) / cfg.presupuesto_mensual), 1) END,
    cfg.creditos_agotados_at, cfg.creditos_agotados_mensaje,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('funcion', l.funcion, 'limite', l.limite_diario, 'gastado', g.gastado, 'accion', l.accion) ORDER BY l.funcion)
      FROM public.ia_limites l
      CROSS JOIN LATERAL (SELECT coalesce(sum(c.costo_estimado), 0) AS gastado FROM public.ia_consumo c WHERE c.funcion = l.funcion AND c.created_at >= hoy) g
      WHERE l.limite_diario > 0 AND g.gastado >= l.limite_diario
    ), '[]'::jsonb),
    (SELECT count(*)::int FROM public.correos_recibidos r WHERE r.en_cola_desde IS NOT NULL AND r.resultado IN ('en_cola','procesando')),
    (SELECT r.cola_causa FROM public.correos_recibidos r WHERE r.en_cola_desde IS NOT NULL AND r.resultado IN ('en_cola','procesando') ORDER BY r.primer_intento_at LIMIT 1)
  FROM (SELECT * FROM public.ia_configuracion WHERE singleton UNION ALL SELECT true, NULL, NULL, NULL, now(), NULL WHERE NOT EXISTS (SELECT 1 FROM public.ia_configuracion)) cfg
  LIMIT 1;
END $function$;
REVOKE ALL ON FUNCTION public.estado_presupuesto_ia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estado_presupuesto_ia() TO authenticated, service_role;

-- 5) Búsqueda semántica de novedades para el asistente (solo las relacionadas con la pregunta).
ALTER TABLE public.novedades_comercio_exterior ADD COLUMN IF NOT EXISTS embedding extensions.vector(3072);

CREATE OR REPLACE FUNCTION public.novedades_limpiar_embedding()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.titulo IS DISTINCT FROM OLD.titulo OR NEW.resumen IS DISTINCT FROM OLD.resumen THEN
    NEW.embedding := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS novedades_limpiar_embedding ON public.novedades_comercio_exterior;
CREATE TRIGGER novedades_limpiar_embedding BEFORE UPDATE OF titulo, resumen ON public.novedades_comercio_exterior
  FOR EACH ROW EXECUTE FUNCTION public.novedades_limpiar_embedding();

CREATE OR REPLACE FUNCTION public.buscar_novedades(p_embedding extensions.vector, p_limite integer DEFAULT 5)
 RETURNS TABLE(titulo text, resumen text, fecha_publicacion date, fecha_captura timestamptz, fuente_nombre text, url text, categoria text, impacto text, sectores text[], relevancia text, similitud double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT n.titulo, n.resumen, n.fecha_publicacion, n.fecha_captura, n.fuente_nombre, n.url, n.categoria, n.impacto, n.sectores, n.relevancia,
         1 - (n.embedding::halfvec(3072) <=> p_embedding::halfvec(3072))
    FROM public.novedades_comercio_exterior n
   WHERE n.embedding IS NOT NULL
   ORDER BY n.embedding::halfvec(3072) <=> p_embedding::halfvec(3072)
   LIMIT greatest(1, least(coalesce(p_limite, 5), 20))
$function$;
REVOKE ALL ON FUNCTION public.buscar_novedades(extensions.vector, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_novedades(extensions.vector, integer) TO authenticated, service_role;