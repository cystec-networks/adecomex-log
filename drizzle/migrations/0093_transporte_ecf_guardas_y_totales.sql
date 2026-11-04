CREATE OR REPLACE FUNCTION public.agregar_factura_transporte(_transporte_id uuid, _factura_id uuid, _numero text, _detalle text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_t public.transportes;
BEGIN
  SELECT * INTO v_t FROM public.transportes WHERE id = _transporte_id AND eliminado_en IS NULL FOR UPDATE;
  IF NOT FOUND OR v_t.numero_viaje IS DISTINCT FROM _numero OR v_t.contenedores_detalle IS DISTINCT FROM _detalle THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.facturas_ecf WHERE id = _factura_id AND eliminado_en IS NULL) THEN RETURN false; END IF;
  INSERT INTO public.transporte_facturas_ecf(transporte_id, factura_ecf_id) VALUES (_transporte_id, _factura_id) ON CONFLICT (factura_ecf_id) DO NOTHING;
  RETURN EXISTS (SELECT 1 FROM public.transporte_facturas_ecf WHERE transporte_id = _transporte_id AND factura_ecf_id = _factura_id);
END $$;
REVOKE ALL ON FUNCTION public.agregar_factura_transporte(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agregar_factura_transporte(uuid, uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.transporte_total_ecf_guardado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.transporte_facturas_ecf WHERE transporte_id = NEW.id) THEN
    SELECT COALESCE(sum(f.monto_total),0) INTO NEW.ingreso_facturado FROM public.transporte_facturas_ecf l JOIN public.facturas_ecf f ON f.id=l.factura_ecf_id AND f.eliminado_en IS NULL WHERE l.transporte_id=NEW.id;
    SELECT l.factura_ecf_id INTO NEW.factura_ecf_id FROM public.transporte_facturas_ecf l WHERE l.transporte_id=NEW.id ORDER BY l.created_at LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.transporte_total_ecf_guardado() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_transporte_total_ecf_guardado BEFORE UPDATE ON public.transportes FOR EACH ROW EXECUTE FUNCTION public.transporte_total_ecf_guardado();

CREATE OR REPLACE FUNCTION public.transporte_ecf_total_editado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.transportes t SET ingreso_facturado = (SELECT COALESCE(sum(f.monto_total),0) FROM public.transporte_facturas_ecf l JOIN public.facturas_ecf f ON f.id=l.factura_ecf_id AND f.eliminado_en IS NULL WHERE l.transporte_id=t.id)
  WHERE t.id IN (SELECT transporte_id FROM public.transporte_facturas_ecf WHERE factura_ecf_id=NEW.id);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.transporte_ecf_total_editado() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_transporte_ecf_total_editado AFTER UPDATE OF monto_total, eliminado_en ON public.facturas_ecf FOR EACH ROW EXECUTE FUNCTION public.transporte_ecf_total_editado();