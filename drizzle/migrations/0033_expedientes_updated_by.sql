ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS updated_by uuid;
COMMENT ON COLUMN public.expedientes.updated_by IS 'Usuario que hizo la última modificación (lo fija un trigger).';
CREATE OR REPLACE FUNCTION public.expedientes_set_updated_by()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_by := auth.uid();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_expedientes_set_updated_by ON public.expedientes;
CREATE TRIGGER trg_expedientes_set_updated_by BEFORE UPDATE ON public.expedientes
FOR EACH ROW EXECUTE FUNCTION public.expedientes_set_updated_by();