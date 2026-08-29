CREATE TABLE public.catalogo_tasa_servicio_aduanero (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_despacho text NOT NULL,
  unidad text NOT NULL,
  tarifa_usd numeric NOT NULL,
  activo boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.catalogo_tasa_servicio_aduanero TO authenticated;
GRANT ALL ON public.catalogo_tasa_servicio_aduanero TO service_role;
ALTER TABLE public.catalogo_tasa_servicio_aduanero ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasa_servicio select" ON public.catalogo_tasa_servicio_aduanero FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasa_servicio admin write" ON public.catalogo_tasa_servicio_aduanero FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'admin'::app_role));
INSERT INTO public.catalogo_tasa_servicio_aduanero (tipo_despacho, unidad, tarifa_usd) VALUES
  ('Despacho carga consolidada importada por kilo o fracción de kilo', 'kg', 0.37),
  ('Despacho contenedores importados de 20 pies', 'contenedor20', 110.31),
  ('Despacho contenedores importados de 40 y 45 pies', 'contenedor4045', 147.07),
  ('Despacho de vehículos', 'vehiculo', 147.07),
  ('Despacho mercancías sueltas o a granel por TM', 'tm', 0.74);