CREATE TABLE public.preferencias_usuario (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clave text NOT NULL,
  valor jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, clave)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preferencias_usuario TO authenticated;
GRANT ALL ON public.preferencias_usuario TO service_role;

ALTER TABLE public.preferencias_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gestionan sus preferencias"
ON public.preferencias_usuario FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at_preferencias()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_preferencias_usuario_updated_at
BEFORE UPDATE ON public.preferencias_usuario
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_preferencias();