ALTER TABLE public.catalogo_regimenes ADD COLUMN IF NOT EXISTS tipo_operacion text NOT NULL DEFAULT 'importacion';

UPDATE public.catalogo_regimenes SET tipo_operacion = 'importacion' WHERE tipo_operacion IS NULL OR tipo_operacion = '';

ALTER TABLE public.catalogo_regimenes DROP CONSTRAINT IF EXISTS catalogo_regimenes_codigo_key;
ALTER TABLE public.catalogo_regimenes ADD CONSTRAINT catalogo_regimenes_codigo_tipo_key UNIQUE (codigo, tipo_operacion);

INSERT INTO public.catalogo_regimenes (codigo, nombre, estado, tipo_operacion) VALUES
  ('2','Admisión Temporal','activo','exportacion'),
  ('20','Consumo de Reexportación','activo','exportacion'),
  ('4','Depósito Logístico','activo','exportacion'),
  ('16','Exportación Nacional','activo','exportacion'),
  ('17','Reembaque','activo','exportacion'),
  ('5','Salida Temporal','activo','exportacion'),
  ('11','Zonas Francas Industriales y Especiales','activo','exportacion')
ON CONFLICT (codigo, tipo_operacion) DO NOTHING;

ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS regimen_codigo_exportacion text;