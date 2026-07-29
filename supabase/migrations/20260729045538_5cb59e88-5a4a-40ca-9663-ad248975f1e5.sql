CREATE TABLE public.catalogo_viajes_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen text NOT NULL,
  destino text NOT NULL,
  tipo_servicio text,
  precio numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'DOP',
  activo boolean NOT NULL DEFAULT true,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.catalogo_viajes_transporte TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_viajes_transporte TO authenticated;
GRANT ALL ON public.catalogo_viajes_transporte TO service_role;

ALTER TABLE public.catalogo_viajes_transporte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_viajes_select_publico"
  ON public.catalogo_viajes_transporte FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "catalogo_viajes_insert_staff"
  ON public.catalogo_viajes_transporte FOR INSERT
  TO authenticated
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'transporte'::app_role]));

CREATE POLICY "catalogo_viajes_update_staff"
  ON public.catalogo_viajes_transporte FOR UPDATE
  TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'transporte'::app_role]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'transporte'::app_role]));

CREATE POLICY "catalogo_viajes_delete_staff"
  ON public.catalogo_viajes_transporte FOR DELETE
  TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'transporte'::app_role]));

CREATE TRIGGER trg_catalogo_viajes_touch
  BEFORE UPDATE ON public.catalogo_viajes_transporte
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_catalogo_viajes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.catalogo_viajes_transporte
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

ALTER TABLE public.solicitudes_pago_transporte
  ADD COLUMN catalogo_viaje_id uuid REFERENCES public.catalogo_viajes_transporte(id) ON DELETE SET NULL;