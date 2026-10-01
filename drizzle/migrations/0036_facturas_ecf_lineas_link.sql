ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS ecf_linea_id uuid REFERENCES public.facturas_ecf_lineas(id) ON DELETE SET NULL;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS gravado boolean;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS itbis numeric NOT NULL DEFAULT 0;