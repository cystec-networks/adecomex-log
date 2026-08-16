ALTER TABLE public.catalogo_tarifas_servicios ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.cotizaciones_servicios_lineas ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.cotizaciones_servicios_lineas ADD COLUMN IF NOT EXISTS gravado boolean NOT NULL DEFAULT true;
ALTER TABLE public.facturas_ecf_lineas ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE public.cotizaciones_servicios ADD COLUMN IF NOT EXISTS factura_id uuid REFERENCES public.facturas_ecf(id) ON DELETE SET NULL;

UPDATE public.catalogo_tarifas_servicios SET codigo = '4001-01'
  WHERE servicio = 'Honorarios Gestiones Aduanales';
UPDATE public.catalogo_tarifas_servicios SET codigo = '4001-05'
  WHERE servicio = 'Honorarios Gestiones de Permiso';