ALTER TABLE public.operaciones_logistica
  ADD COLUMN IF NOT EXISTS notify_party text,
  ADD COLUMN IF NOT EXISTS agente_entrega text,
  ADD COLUMN IF NOT EXISTS agente_entrega_contacto text;