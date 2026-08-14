DO $$
DECLARE t text; parent text; ptab text;
BEGIN
  FOR t, parent, ptab IN
    SELECT 'cotizacion_productos','cotizacion_id','cotizaciones' UNION ALL
    SELECT 'orden_productos','orden_id','ordenes' UNION ALL
    SELECT 'solicitud_productos','solicitud_id','solicitudes'
  LOOP
    EXECUTE format($f$
      CREATE TABLE public.%1$I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        %2$I uuid NOT NULL REFERENCES public.%3$I(id) ON DELETE CASCADE,
        item_no integer,
        codigo_arancelario text,
        detalle_producto text,
        unidad_medida text,
        unidad_codigo text,
        cantidad numeric(14,3) DEFAULT 0,
        peso numeric(14,3) DEFAULT 0,
        valor_fob numeric(14,2) DEFAULT 0,
        product_code text,
        cod_marca text,
        marca text,
        cod_modelo text,
        modelo text,
        especificaciones text,
        pct_gravamen numeric(6,3),
        aplica_isc boolean,
        pct_isc numeric(6,3),
        pct_itbis numeric(6,3),
        deleted_at timestamptz,
        deleted_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.%1$I TO authenticated;
      GRANT ALL ON public.%1$I TO service_role;
      ALTER TABLE public.%1$I ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "staff select %1$s" ON public.%1$I FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
      CREATE POLICY "staff insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
      CREATE POLICY "staff update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
      CREATE POLICY "staff delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));
      CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
      CREATE TRIGGER trg_%1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_log();
      CREATE INDEX idx_%1$s_parent ON public.%1$I(%2$I) WHERE deleted_at IS NULL;
    $f$, t, parent, ptab);
  END LOOP;
END $$;