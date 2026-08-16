DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'cxp_categoria'
    AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.cxp_categoria AS ENUM ('compras', 'transportes', 'servicios', 'miscelaneos', 'otros');
  END IF;
END $$;

ALTER TABLE public.cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS categoria public.cxp_categoria NOT NULL DEFAULT 'otros';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cuentas_por_pagar TO authenticated;
GRANT ALL ON public.cuentas_por_pagar TO service_role;
