CREATE TABLE public.catalogo_hitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  descripcion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalogo_hitos TO authenticated;
GRANT ALL ON public.catalogo_hitos TO service_role;
ALTER TABLE public.catalogo_hitos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leen catalogo_hitos" ON public.catalogo_hitos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gestiona catalogo_hitos" ON public.catalogo_hitos
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_catalogo_hitos_updated
  BEFORE UPDATE ON public.catalogo_hitos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.catalogo_hitos (codigo, nombre, orden) VALUES
  ('verificacion_mercancia_puerto', 'Verificación de Mercancía en Puerto', 10),
  ('confirmacion_valores_impuestos', 'Confirmación de Valores de Impuestos al Cliente', 20),
  ('expediente_fisico_puerto', 'Expediente Físico Enviado al Puerto', 30),
  ('expediente_digital_puerto', 'Expediente Digital Enviado al Puerto', 40),
  ('documentos_transportista', 'Documentos Enviados al Transportista', 50),
  ('cita_asignada_puerto', 'Cita Asignada en el Puerto', 60);

CREATE TYPE public.hito_estado AS ENUM ('pendiente', 'en_curso', 'completado', 'no_aplica');

CREATE TABLE public.expediente_hitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  hito_codigo text NOT NULL REFERENCES public.catalogo_hitos(codigo) ON UPDATE CASCADE,
  orden int NOT NULL DEFAULT 0,
  estado public.hito_estado NOT NULL DEFAULT 'pendiente',
  fecha_programada date,
  fecha_cumplimiento date,
  responsable_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expediente_id, hito_codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expediente_hitos TO authenticated;
GRANT ALL ON public.expediente_hitos TO service_role;
ALTER TABLE public.expediente_hitos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leen exp_hitos" ON public.expediente_hitos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados crean exp_hitos" ON public.expediente_hitos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados actualizan exp_hitos" ON public.expediente_hitos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin borra exp_hitos" ON public.expediente_hitos
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_exp_hitos_exp ON public.expediente_hitos(expediente_id);
CREATE INDEX idx_exp_hitos_estado ON public.expediente_hitos(estado);
CREATE INDEX idx_exp_hitos_fecha_prog ON public.expediente_hitos(fecha_programada);

CREATE TRIGGER trg_exp_hitos_updated
  BEFORE UPDATE ON public.expediente_hitos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.crear_hitos_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.expediente_hitos (expediente_id, hito_codigo, orden, estado)
  SELECT NEW.id, codigo, orden, 'pendiente'::hito_estado
  FROM public.catalogo_hitos
  WHERE activo = true
  ORDER BY orden;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crear_hitos_default
  AFTER INSERT ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.crear_hitos_default();

INSERT INTO public.expediente_hitos (expediente_id, hito_codigo, orden, estado)
SELECT e.id, c.codigo, c.orden, 'pendiente'::hito_estado
FROM public.expedientes e
CROSS JOIN public.catalogo_hitos c
WHERE c.activo = true;