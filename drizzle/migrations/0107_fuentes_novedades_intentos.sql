CREATE TABLE public.fuentes_novedades_intentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente_id uuid NOT NULL REFERENCES public.fuentes_novedades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  exito boolean NOT NULL,
  estado text NOT NULL CHECK (estado IN ('ok', 'sin_novedades', 'error', 'no_legible')),
  codigo_http integer,
  mensaje text,
  nuevas integer NOT NULL DEFAULT 0,
  modo text CHECK (modo IN ('cron', 'manual'))
);
CREATE INDEX fuentes_novedades_intentos_fuente_idx
  ON public.fuentes_novedades_intentos (fuente_id, created_at DESC);
GRANT SELECT ON public.fuentes_novedades_intentos TO authenticated;
GRANT ALL ON public.fuentes_novedades_intentos TO service_role;
ALTER TABLE public.fuentes_novedades_intentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY fni_admin_lee ON public.fuentes_novedades_intentos FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- Punto de partida: el último resultado conocido de cada fuente ya revisada.
INSERT INTO public.fuentes_novedades_intentos (fuente_id, created_at, exito, estado, mensaje, modo)
SELECT id, ultima_revision, ultimo_estado IN ('ok', 'sin_novedades'), ultimo_estado, ultimo_mensaje, 'manual'
FROM public.fuentes_novedades
WHERE ultima_revision IS NOT NULL AND ultimo_estado <> 'sin_revisar';