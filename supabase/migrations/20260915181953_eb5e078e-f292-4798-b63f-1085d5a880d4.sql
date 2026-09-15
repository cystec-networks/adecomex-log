CREATE TABLE public.recordatorios_descartados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, reminder_id)
);
GRANT SELECT, INSERT, DELETE ON public.recordatorios_descartados TO authenticated;
GRANT ALL ON public.recordatorios_descartados TO service_role;
ALTER TABLE public.recordatorios_descartados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recordatorios_descartados propios" ON public.recordatorios_descartados FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());