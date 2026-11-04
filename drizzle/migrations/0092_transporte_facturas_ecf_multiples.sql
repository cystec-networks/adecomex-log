CREATE TABLE public.transporte_facturas_ecf (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transporte_id uuid NOT NULL REFERENCES public.transportes(id) ON DELETE CASCADE,
  factura_ecf_id uuid NOT NULL UNIQUE REFERENCES public.facturas_ecf(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);
CREATE INDEX transporte_facturas_ecf_transporte_idx ON public.transporte_facturas_ecf(transporte_id);
GRANT SELECT, INSERT, DELETE ON public.transporte_facturas_ecf TO authenticated;
GRANT ALL ON public.transporte_facturas_ecf TO service_role;
ALTER TABLE public.transporte_facturas_ecf ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transporte facturas read staff" ON public.transporte_facturas_ecf FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "transporte facturas insert staff" ON public.transporte_facturas_ecf FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "transporte facturas delete staff" ON public.transporte_facturas_ecf FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

INSERT INTO public.transporte_facturas_ecf (transporte_id, factura_ecf_id, created_by)
SELECT DISTINCT ON (factura_ecf_id) id, factura_ecf_id, NULL FROM public.transportes
WHERE factura_ecf_id IS NOT NULL ORDER BY factura_ecf_id, created_at
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sincronizar_transporte_facturas_ecf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tid uuid := COALESCE(NEW.transporte_id, OLD.transporte_id);
DECLARE v_total numeric; v_primera record;
BEGIN
  SELECT COALESCE(sum(f.monto_total), 0) INTO v_total FROM public.transporte_facturas_ecf l
    JOIN public.facturas_ecf f ON f.id = l.factura_ecf_id AND f.eliminado_en IS NULL WHERE l.transporte_id = v_tid;
  SELECT f.id, f.encf, f.fecha_emision INTO v_primera FROM public.transporte_facturas_ecf l
    JOIN public.facturas_ecf f ON f.id = l.factura_ecf_id WHERE l.transporte_id = v_tid ORDER BY f.fecha_emision, l.created_at LIMIT 1;
  IF v_primera.id IS NULL THEN
    UPDATE public.transportes SET factura_ecf_id = NULL WHERE id = v_tid;
  ELSE
    UPDATE public.transportes SET factura_ecf_id = v_primera.id, ingreso_facturado = v_total,
      factura_numero = COALESCE(NULLIF(factura_numero, ''), v_primera.encf), factura_fecha = COALESCE(factura_fecha, v_primera.fecha_emision)
    WHERE id = v_tid;
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.sincronizar_transporte_facturas_ecf() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_sincronizar_transporte_facturas_ecf AFTER INSERT OR DELETE ON public.transporte_facturas_ecf
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_transporte_facturas_ecf();
CREATE TRIGGER audit_transporte_facturas_ecf AFTER INSERT OR DELETE ON public.transporte_facturas_ecf
FOR EACH ROW EXECUTE FUNCTION public.audit_log();