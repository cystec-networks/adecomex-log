
-- facturas_ecf
CREATE TABLE IF NOT EXISTS public.facturas_ecf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encf TEXT NOT NULL,
  tipo_comprobante TEXT NOT NULL,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento_ncf DATE,
  codigo_seguridad TEXT,
  fecha_firma TIMESTAMPTZ,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_razon_social TEXT,
  cliente_rnc TEXT,
  subtotal_gravado NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal_exento NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_itbis NUMERIC(14,2) NOT NULL DEFAULT 0,
  otros_impuestos NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_isc_e NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_isc_av NUMERIC(14,2) NOT NULL DEFAULT 0,
  cdt NUMERIC(14,2) NOT NULL DEFAULT 0,
  propina_legal NUMERIC(14,2) NOT NULL DEFAULT 0,
  monto_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  pdf_url TEXT,
  notas TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  eliminado_en TIMESTAMPTZ,
  eliminado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS facturas_ecf_encf_unique ON public.facturas_ecf(encf) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS facturas_ecf_cliente_idx ON public.facturas_ecf(cliente_id);
CREATE INDEX IF NOT EXISTS facturas_ecf_fecha_idx ON public.facturas_ecf(fecha_emision DESC);
CREATE INDEX IF NOT EXISTS facturas_ecf_eliminado_idx ON public.facturas_ecf(eliminado_en);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas_ecf TO authenticated;
GRANT ALL ON public.facturas_ecf TO service_role;
ALTER TABLE public.facturas_ecf ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facturas_ecf select" ON public.facturas_ecf
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "facturas_ecf insert" ON public.facturas_ecf
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "facturas_ecf update" ON public.facturas_ecf
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "facturas_ecf delete" ON public.facturas_ecf
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_facturas_ecf_touch BEFORE UPDATE ON public.facturas_ecf
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_facturas_ecf_audit AFTER INSERT OR UPDATE OR DELETE ON public.facturas_ecf
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- facturas_ecf_lineas
CREATE TABLE IF NOT EXISTS public.facturas_ecf_lineas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id UUID NOT NULL REFERENCES public.facturas_ecf(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 1,
  cantidad NUMERIC(14,3) NOT NULL DEFAULT 1,
  descripcion TEXT NOT NULL,
  unidad TEXT,
  precio NUMERIC(14,2) NOT NULL DEFAULT 0,
  itbis NUMERIC(14,2) NOT NULL DEFAULT 0,
  descuento NUMERIC(14,2) NOT NULL DEFAULT 0,
  recargo NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  gravado BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS facturas_ecf_lineas_factura_idx ON public.facturas_ecf_lineas(factura_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas_ecf_lineas TO authenticated;
GRANT ALL ON public.facturas_ecf_lineas TO service_role;
ALTER TABLE public.facturas_ecf_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facturas_ecf_lineas select" ON public.facturas_ecf_lineas
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "facturas_ecf_lineas write" ON public.facturas_ecf_lineas
  FOR ALL TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));

-- Link columns
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS factura_ecf_id UUID REFERENCES public.facturas_ecf(id) ON DELETE SET NULL;
ALTER TABLE public.transportes ADD COLUMN IF NOT EXISTS factura_ecf_id UUID REFERENCES public.facturas_ecf(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS expedientes_factura_ecf_idx ON public.expedientes(factura_ecf_id);
CREATE INDEX IF NOT EXISTS transportes_factura_ecf_idx ON public.transportes(factura_ecf_id);

-- Extend gastos_operativos to contabilidad
DROP POLICY IF EXISTS "gastos_op insert admin" ON public.gastos_operativos;
DROP POLICY IF EXISTS "gastos_op read admin" ON public.gastos_operativos;
DROP POLICY IF EXISTS "gastos_op update admin" ON public.gastos_operativos;
DROP POLICY IF EXISTS "gastos_op delete admin" ON public.gastos_operativos;
CREATE POLICY "gastos_op select" ON public.gastos_operativos
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "gastos_op insert" ON public.gastos_operativos
  FOR INSERT TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "gastos_op update" ON public.gastos_operativos
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'contabilidad'::app_role]));
CREATE POLICY "gastos_op delete" ON public.gastos_operativos
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
