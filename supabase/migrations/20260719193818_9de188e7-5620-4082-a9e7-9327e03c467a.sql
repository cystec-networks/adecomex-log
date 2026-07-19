
ALTER TABLE public.estudiantes ADD COLUMN IF NOT EXISTS correo_generado boolean NOT NULL DEFAULT false;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS correo_generado boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.autogen_correo_estudiante()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    NEW.email := 'est-' || substr(NEW.id::text, 1, 8) || '@portal.adecomex.local';
    NEW.correo_generado := true;
  ELSE
    NEW.correo_generado := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.autogen_correo_cliente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    NEW.email := 'cli-' || substr(NEW.id::text, 1, 8) || '@portal.adecomex.local';
    NEW.correo_generado := true;
  ELSE
    NEW.correo_generado := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autogen_correo_estudiante ON public.estudiantes;
CREATE TRIGGER trg_autogen_correo_estudiante
BEFORE INSERT ON public.estudiantes
FOR EACH ROW EXECUTE FUNCTION public.autogen_correo_estudiante();

DROP TRIGGER IF EXISTS trg_autogen_correo_cliente ON public.clientes;
CREATE TRIGGER trg_autogen_correo_cliente
BEFORE INSERT ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.autogen_correo_cliente();
