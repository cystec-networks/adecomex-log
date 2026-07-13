
ALTER TABLE public.mercancia_items
  ADD COLUMN IF NOT EXISTS pct_gravamen numeric(6,3),
  ADD COLUMN IF NOT EXISTS aplica_isc boolean,
  ADD COLUMN IF NOT EXISTS pct_isc numeric(6,3),
  ADD COLUMN IF NOT EXISTS pct_itbis numeric(6,3);

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS liq_siga_numero text,
  ADD COLUMN IF NOT EXISTS liq_siga_estado text,
  ADD COLUMN IF NOT EXISTS liq_oficial_total numeric(14,2);

CREATE TABLE IF NOT EXISTS public.catalogo_tasas_arancelarias (
  codigo_arancelario         text PRIMARY KEY,
  pct_gravamen               numeric(6,3),
  pct_gravamen_preferencial  numeric(6,3),
  acuerdo_preferencial       text,
  aplica_isc                 boolean NOT NULL DEFAULT false,
  pct_isc                    numeric(6,3),
  verificado                 boolean NOT NULL DEFAULT false,
  verificado_por             uuid REFERENCES auth.users(id),
  verificado_at              timestamptz,
  origen_expediente_id       uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  origen_nota                text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.catalogo_tasas_arancelarias TO authenticated;
GRANT ALL ON public.catalogo_tasas_arancelarias TO service_role;

ALTER TABLE public.catalogo_tasas_arancelarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff select tasas" ON public.catalogo_tasas_arancelarias
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY "staff insert tasas" ON public.catalogo_tasas_arancelarias
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));

-- Staff puede actualizar tasas SOLO si aún no están verificadas.
-- Admin puede modificar cualquiera y también marcar/desmarcar como verificadas.
CREATE POLICY "staff update unverified tasas" ON public.catalogo_tasas_arancelarias
  FOR UPDATE TO authenticated
  USING (
    private.is_staff(auth.uid())
    AND (verificado = false OR private.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    private.is_staff(auth.uid())
    AND (verificado = false OR private.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "admin delete tasas" ON public.catalogo_tasas_arancelarias
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_tasas_updated
  BEFORE UPDATE ON public.catalogo_tasas_arancelarias
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_tasas_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.catalogo_tasas_arancelarias
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

CREATE INDEX IF NOT EXISTS idx_tasas_verificado
  ON public.catalogo_tasas_arancelarias (verificado);
