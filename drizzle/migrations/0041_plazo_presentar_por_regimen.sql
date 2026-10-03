ALTER TABLE public.catalogo_regimenes ADD COLUMN dias_habiles_presentar integer;
UPDATE public.catalogo_regimenes SET dias_habiles_presentar = 5;
ALTER TABLE public.expedientes ADD COLUMN plazo_presentar_override integer;
UPDATE public.expedientes SET plazo_presentar_override = sla_dias WHERE sla_dias IS NOT NULL AND sla_dias <> 5;
COMMENT ON COLUMN public.expedientes.sla_dias IS 'DEPRECATED: replaced by catalogo_regimenes.dias_habiles_presentar + expedientes.plazo_presentar_override';