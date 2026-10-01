ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS factura_ecf_id uuid REFERENCES public.facturas_ecf(id) ON DELETE SET NULL;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS editada_manual boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS facturas_factura_ecf_id_idx ON public.facturas(factura_ecf_id);