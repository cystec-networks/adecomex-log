CREATE TABLE public.dga_depositos_destino (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  area_codigo text,
  centro_logistico text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dga_depositos_destino_area_idx ON public.dga_depositos_destino(area_codigo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dga_depositos_destino TO authenticated;
GRANT ALL ON public.dga_depositos_destino TO service_role;
ALTER TABLE public.dga_depositos_destino ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dga_depositos_destino_select" ON public.dga_depositos_destino FOR SELECT TO authenticated USING (true);
CREATE POLICY "dga_depositos_destino_admin" ON public.dga_depositos_destino FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER dga_depositos_destino_touch BEFORE UPDATE ON public.dga_depositos_destino FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.expedientes ADD COLUMN deposito_destino text, ADD COLUMN deposito_destino_codigo text;