ALTER TABLE public.mercancia_items ADD COLUMN IF NOT EXISTS valor_fob_4d numeric(18,4);
UPDATE public.mercancia_items SET valor_fob_4d = valor_fob WHERE valor_fob_4d IS NULL;
COMMENT ON COLUMN public.mercancia_items.valor_fob_4d IS 'Valor FOB de la línea con 4 decimales (fuente de verdad en el formulario). valor_fob se mantiene redondeado a 2 decimales para cálculos y SIGA.';
CREATE OR REPLACE FUNCTION public.mercancia_sync_fob_4d() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.valor_fob_4d IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.valor_fob_4d IS DISTINCT FROM OLD.valor_fob_4d) THEN
    NEW.valor_fob := round(NEW.valor_fob_4d, 2);
  ELSIF TG_OP = 'INSERT' OR NEW.valor_fob IS DISTINCT FROM OLD.valor_fob THEN
    NEW.valor_fob_4d := NEW.valor_fob;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mercancia_sync_fob_4d ON public.mercancia_items;
CREATE TRIGGER mercancia_sync_fob_4d BEFORE INSERT OR UPDATE ON public.mercancia_items FOR EACH ROW EXECUTE FUNCTION public.mercancia_sync_fob_4d();