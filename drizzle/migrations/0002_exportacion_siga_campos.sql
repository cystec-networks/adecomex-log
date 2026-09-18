ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS buyer_codigo text,
  ADD COLUMN IF NOT EXISTS buyer_nombre text,
  ADD COLUMN IF NOT EXISTS buyer_nacionalidad text,
  ADD COLUMN IF NOT EXISTS declarante_codigo text,
  ADD COLUMN IF NOT EXISTS declarante_nombre text,
  ADD COLUMN IF NOT EXISTS declarante_nacionalidad text,
  ADD COLUMN IF NOT EXISTS zf_aplica boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS zf_valor_cif numeric(14,2),
  ADD COLUMN IF NOT EXISTS zf_valor_materiales numeric(14,2),
  ADD COLUMN IF NOT EXISTS zf_valor_salario numeric(14,2),
  ADD COLUMN IF NOT EXISTS zf_valor_servicio numeric(14,2),
  ADD COLUMN IF NOT EXISTS zf_otros_valores numeric(14,2);

ALTER TABLE public.mercancia_items
  ADD COLUMN IF NOT EXISTS product_year smallint,
  ADD COLUMN IF NOT EXISTS tiene_certificado_origen boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificado_origen_numero text,
  ADD COLUMN IF NOT EXISTS es_organico boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS grado_alcohol numeric(4,2);