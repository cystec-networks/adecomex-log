
CREATE TABLE public.gastos_operativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto text NOT NULL,
  monto numeric(14,2) NOT NULL CHECK (monto >= 0),
  moneda moneda NOT NULL DEFAULT 'DOP',
  fecha date NOT NULL,
  es_recurrente boolean NOT NULL DEFAULT false,
  comprobante_url text,
  notas text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  eliminado_en timestamptz,
  eliminado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gastos_operativos TO authenticated;
GRANT ALL ON public.gastos_operativos TO service_role;

ALTER TABLE public.gastos_operativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gastos_op read admin" ON public.gastos_operativos FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "gastos_op insert admin" ON public.gastos_operativos FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "gastos_op update admin" ON public.gastos_operativos FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "gastos_op delete admin" ON public.gastos_operativos FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX gastos_op_fecha_idx ON public.gastos_operativos(fecha);
CREATE INDEX gastos_op_eliminado_idx ON public.gastos_operativos(eliminado_en);

CREATE TRIGGER gastos_op_touch_updated_at
  BEFORE UPDATE ON public.gastos_operativos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER gastos_op_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.gastos_operativos
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();
