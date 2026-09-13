ALTER TABLE public.operaciones_logistica
  ADD COLUMN IF NOT EXISTS shipper_nombre text,
  ADD COLUMN IF NOT EXISTS shipper_tax_id text,
  ADD COLUMN IF NOT EXISTS shipper_direccion text,
  ADD COLUMN IF NOT EXISTS shipper_telefono text,
  ADD COLUMN IF NOT EXISTS shipper_email text,
  ADD COLUMN IF NOT EXISTS bl_hijo_numero text UNIQUE;

CREATE SEQUENCE IF NOT EXISTS public.bl_hijo_seq;
GRANT USAGE ON SEQUENCE public.bl_hijo_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bl_hijo_set_numero() RETURNS trigger AS $$
BEGIN
  IF NEW.bl_hijo_numero IS NULL OR NEW.bl_hijo_numero = '' THEN
    NEW.bl_hijo_numero := 'ADX-HBL-' || lpad(nextval('public.bl_hijo_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bl_hijo_numero ON public.operaciones_logistica;
CREATE TRIGGER trg_bl_hijo_numero BEFORE INSERT ON public.operaciones_logistica
  FOR EACH ROW EXECUTE FUNCTION public.bl_hijo_set_numero();