
-- Facturas
CREATE TABLE public.facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_emision DATE,
  fecha_pago DATE,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  referencia TEXT,
  notas TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facturas TO authenticated;
GRANT ALL ON public.facturas TO service_role;
ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facturas_staff_select" ON public.facturas FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "facturas_staff_insert" ON public.facturas FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "facturas_staff_update" ON public.facturas FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "facturas_staff_delete" ON public.facturas FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

CREATE TRIGGER trg_facturas_touch BEFORE UPDATE ON public.facturas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_facturas_audit AFTER INSERT OR UPDATE OR DELETE ON public.facturas FOR EACH ROW EXECUTE FUNCTION public.audit_log();
CREATE INDEX idx_facturas_expediente ON public.facturas(expediente_id) WHERE deleted_at IS NULL;

-- Gastos
CREATE TABLE public.gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  concepto TEXT NOT NULL,
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha DATE,
  proveedor TEXT,
  es_reembolso BOOLEAN NOT NULL DEFAULT false,
  adjunto_path TEXT,
  notas TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos TO authenticated;
GRANT ALL ON public.gastos TO service_role;
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gastos_staff_select" ON public.gastos FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "gastos_staff_insert" ON public.gastos FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "gastos_staff_update" ON public.gastos FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "gastos_staff_delete" ON public.gastos FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

CREATE TRIGGER trg_gastos_touch BEFORE UPDATE ON public.gastos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_gastos_audit AFTER INSERT OR UPDATE OR DELETE ON public.gastos FOR EACH ROW EXECUTE FUNCTION public.audit_log();
CREATE INDEX idx_gastos_expediente ON public.gastos(expediente_id) WHERE deleted_at IS NULL;
