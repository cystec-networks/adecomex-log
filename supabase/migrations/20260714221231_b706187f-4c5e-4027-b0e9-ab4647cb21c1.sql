
-- Add estado column to facturas_ecf (needed for 608 - Anulados)
ALTER TABLE public.facturas_ecf
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'emitida'
  CHECK (estado IN ('emitida','anulada'));

ALTER TABLE public.facturas_ecf
  ADD COLUMN IF NOT EXISTS fecha_anulacion DATE,
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

CREATE INDEX IF NOT EXISTS facturas_ecf_estado_idx ON public.facturas_ecf(estado);

-- envios_dgii: historial de generación de reportes fiscales
CREATE TABLE public.envios_dgii (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formato TEXT NOT NULL CHECK (formato IN ('606','607','608')),
  periodo TEXT NOT NULL CHECK (periodo ~ '^[0-9]{6}$'),
  fecha_generado TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_enviado TIMESTAMPTZ,
  numero_acuse TEXT,
  archivo_path TEXT,
  generado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cantidad_registros INT NOT NULL DEFAULT 0,
  monto_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (formato, periodo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.envios_dgii TO authenticated;
GRANT ALL ON public.envios_dgii TO service_role;

ALTER TABLE public.envios_dgii ENABLE ROW LEVEL SECURITY;

CREATE POLICY "envios_dgii select"
  ON public.envios_dgii FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'finanzas'::app_role, 'contabilidad'::app_role]));

CREATE POLICY "envios_dgii insert"
  ON public.envios_dgii FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'finanzas'::app_role, 'contabilidad'::app_role]));

CREATE POLICY "envios_dgii update"
  ON public.envios_dgii FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'finanzas'::app_role, 'contabilidad'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'finanzas'::app_role, 'contabilidad'::app_role]));

CREATE POLICY "envios_dgii delete"
  ON public.envios_dgii FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_envios_dgii_touch BEFORE UPDATE ON public.envios_dgii
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
