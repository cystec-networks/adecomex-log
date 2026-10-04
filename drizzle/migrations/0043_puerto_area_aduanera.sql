CREATE TABLE public.dga_puerto_area (
  puerto_codigo text PRIMARY KEY,
  area_codigo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dga_puerto_area TO authenticated;
GRANT ALL ON public.dga_puerto_area TO service_role;
ALTER TABLE public.dga_puerto_area ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dga_puerto_area_select" ON public.dga_puerto_area FOR SELECT TO authenticated USING (true);
CREATE POLICY "dga_puerto_area_admin" ON public.dga_puerto_area FOR ALL TO authenticated USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
INSERT INTO public.dga_puerto_area (puerto_codigo, area_codigo) VALUES ('DOCAU','10150'),('DOHAI','10030') ON CONFLICT DO NOTHING;