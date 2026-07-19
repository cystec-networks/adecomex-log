
ALTER TABLE public.cliente_usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password boolean NOT NULL DEFAULT true;
ALTER TABLE public.estudiante_usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.marcar_password_cambiada_cliente()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.cliente_usuarios
  SET debe_cambiar_password = false
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.marcar_password_cambiada_estudiante()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.estudiante_usuarios
  SET debe_cambiar_password = false
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.marcar_password_cambiada_cliente() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marcar_password_cambiada_estudiante() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marcar_password_cambiada_cliente() TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_password_cambiada_estudiante() TO authenticated;
