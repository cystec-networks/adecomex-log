ALTER TABLE public.ordenes
  ADD COLUMN origen text,
  ADD COLUMN destino text,
  ADD COLUMN incoterm text,
  ADD COLUMN peso_kg numeric,
  ADD COLUMN volumen_m3 numeric,
  ADD COLUMN tarifa_propuesta numeric,
  ADD COLUMN moneda public.moneda;

UPDATE public.ordenes SET origen = cot_origen, destino = cot_destino,
  incoterm = cot_incoterm, peso_kg = cot_peso_kg, volumen_m3 = cot_volumen_m3,
  tarifa_propuesta = cot_tarifa_propuesta, moneda = COALESCE(cot_moneda, 'USD'::public.moneda);

CREATE OR REPLACE FUNCTION public.inicializar_operativos_orden()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.origen := COALESCE(NEW.origen, NEW.cot_origen);
  NEW.destino := COALESCE(NEW.destino, NEW.cot_destino);
  NEW.incoterm := COALESCE(NEW.incoterm, NEW.cot_incoterm);
  NEW.peso_kg := COALESCE(NEW.peso_kg, NEW.cot_peso_kg);
  NEW.volumen_m3 := COALESCE(NEW.volumen_m3, NEW.cot_volumen_m3);
  NEW.tarifa_propuesta := COALESCE(NEW.tarifa_propuesta, NEW.cot_tarifa_propuesta);
  NEW.moneda := COALESCE(NEW.moneda, NEW.cot_moneda, 'USD'::public.moneda);
  RETURN NEW;
END;
$$;
CREATE TRIGGER ordenes_inicializar_operativos BEFORE INSERT ON public.ordenes
FOR EACH ROW EXECUTE FUNCTION public.inicializar_operativos_orden();
COMMENT ON FUNCTION public.inicializar_operativos_orden() IS 'Copies the order quotation snapshot into independent operational fields on creation only; later edits never synchronize back to quotation history.';