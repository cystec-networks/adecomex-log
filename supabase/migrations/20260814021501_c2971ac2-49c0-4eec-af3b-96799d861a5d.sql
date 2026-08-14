CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, extensions
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE TABLE public.dga_productos_historico (
  codigo_producto text PRIMARY KEY,
  partida_arancelaria text,
  nombre_producto text,
  cod_marca text,
  marca text,
  cod_modelo text,
  modelo text,
  unidad text,
  pais text,
  especificaciones text,
  regimen text,
  estado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  busqueda text GENERATED ALWAYS AS (
    lower(public.immutable_unaccent(coalesce(nombre_producto,'') || ' ' || coalesce(partida_arancelaria,'') || ' ' || coalesce(marca,'') || ' ' || coalesce(modelo,'') || ' ' || coalesce(codigo_producto,'')))
  ) STORED
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dga_productos_historico TO authenticated;
GRANT ALL ON public.dga_productos_historico TO service_role;

ALTER TABLE public.dga_productos_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select dga productos" ON public.dga_productos_historico
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "admin insert dga productos" ON public.dga_productos_historico
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admin update dga productos" ON public.dga_productos_historico
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admin delete dga productos" ON public.dga_productos_historico
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_dga_productos_busqueda ON public.dga_productos_historico USING gin (busqueda gin_trgm_ops);
CREATE INDEX idx_dga_productos_partida ON public.dga_productos_historico (partida_arancelaria);

CREATE TRIGGER trg_dga_productos_updated BEFORE UPDATE ON public.dga_productos_historico
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.mercancia_items
  ADD COLUMN IF NOT EXISTS product_code text,
  ADD COLUMN IF NOT EXISTS cod_marca text,
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS cod_modelo text,
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS especificaciones text;