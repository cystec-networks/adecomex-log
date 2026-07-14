
-- Add fiscal columns to gastos and gastos_operativos for DGII 606 report
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS tipo_bienes_servicios integer,
  ADD COLUMN IF NOT EXISTS monto_facturado_servicios numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_facturado_bienes numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_proporcionalidad_349 numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_llevado_costo numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_percibido_compras numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isr_percibido_compras numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo_retencion_isr integer,
  ADD COLUMN IF NOT EXISTS impuesto_selectivo_consumo numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otros_impuestos_tasas numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_propina_legal numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.gastos
  DROP CONSTRAINT IF EXISTS gastos_tipo_bienes_servicios_check,
  ADD CONSTRAINT gastos_tipo_bienes_servicios_check
    CHECK (tipo_bienes_servicios IS NULL OR tipo_bienes_servicios BETWEEN 1 AND 11);

ALTER TABLE public.gastos
  DROP CONSTRAINT IF EXISTS gastos_tipo_retencion_isr_check,
  ADD CONSTRAINT gastos_tipo_retencion_isr_check
    CHECK (tipo_retencion_isr IS NULL OR tipo_retencion_isr BETWEEN 1 AND 9);

ALTER TABLE public.gastos_operativos
  ADD COLUMN IF NOT EXISTS tipo_bienes_servicios integer,
  ADD COLUMN IF NOT EXISTS monto_facturado_servicios numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_facturado_bienes numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_proporcionalidad_349 numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_llevado_costo numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itbis_percibido_compras numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS isr_percibido_compras numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo_retencion_isr integer,
  ADD COLUMN IF NOT EXISTS impuesto_selectivo_consumo numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otros_impuestos_tasas numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_propina_legal numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.gastos_operativos
  DROP CONSTRAINT IF EXISTS gastos_operativos_tipo_bienes_servicios_check,
  ADD CONSTRAINT gastos_operativos_tipo_bienes_servicios_check
    CHECK (tipo_bienes_servicios IS NULL OR tipo_bienes_servicios BETWEEN 1 AND 11);

ALTER TABLE public.gastos_operativos
  DROP CONSTRAINT IF EXISTS gastos_operativos_tipo_retencion_isr_check,
  ADD CONSTRAINT gastos_operativos_tipo_retencion_isr_check
    CHECK (tipo_retencion_isr IS NULL OR tipo_retencion_isr BETWEEN 1 AND 9);

-- Seed empresa_rnc setting (do not overwrite if already configured)
INSERT INTO public.system_settings (key, value, description)
VALUES ('empresa_rnc', '', 'RNC de la empresa (usado en encabezado del archivo 606 DGII)')
ON CONFLICT (key) DO NOTHING;
