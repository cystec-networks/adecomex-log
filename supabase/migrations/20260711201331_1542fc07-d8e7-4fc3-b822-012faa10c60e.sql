CREATE TABLE public.mercancia_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  item_no integer NOT NULL,
  codigo_arancelario text,
  detalle_producto text,
  unidad_medida text,
  cantidad numeric(14,3) DEFAULT 0,
  peso numeric(14,3) DEFAULT 0,
  valor_fob numeric(14,2) DEFAULT 0,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mercancia_items TO authenticated;
GRANT ALL ON public.mercancia_items TO service_role;

ALTER TABLE public.mercancia_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select mercancia" ON public.mercancia_items FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "staff insert mercancia" ON public.mercancia_items FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff update mercancia" ON public.mercancia_items FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "staff delete mercancia" ON public.mercancia_items FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

CREATE TRIGGER trg_mercancia_updated BEFORE UPDATE ON public.mercancia_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_mercancia_audit AFTER INSERT OR UPDATE OR DELETE ON public.mercancia_items FOR EACH ROW EXECUTE FUNCTION public.audit_log();

CREATE INDEX idx_mercancia_expediente ON public.mercancia_items(expediente_id) WHERE deleted_at IS NULL;