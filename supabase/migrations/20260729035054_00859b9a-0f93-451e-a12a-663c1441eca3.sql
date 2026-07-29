CREATE SEQUENCE IF NOT EXISTS public.solicitudes_pago_transporte_seq;

CREATE TABLE public.solicitudes_pago_transporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_control text NOT NULL UNIQUE DEFAULT ('SPT-' || lpad(nextval('public.solicitudes_pago_transporte_seq')::text, 6, '0')),
  transportista_nombre text NOT NULL,
  transportista_rnc text,
  telefono text,
  monto numeric(14,2) NOT NULL DEFAULT 0,
  moneda text NOT NULL DEFAULT 'DOP',
  referencia_viaje text,
  descripcion text,
  transporte_id uuid REFERENCES public.transportes(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','vinculada')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.spt_set_numero_control()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.numero_control IS NULL OR btrim(NEW.numero_control) = '' THEN
    NEW.numero_control := 'SPT-' || lpad(nextval('public.solicitudes_pago_transporte_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_spt_set_numero_control
BEFORE INSERT ON public.solicitudes_pago_transporte
FOR EACH ROW EXECUTE FUNCTION public.spt_set_numero_control();

GRANT SELECT, UPDATE ON public.solicitudes_pago_transporte TO authenticated;
GRANT ALL ON public.solicitudes_pago_transporte TO service_role;
GRANT USAGE ON SEQUENCE public.solicitudes_pago_transporte_seq TO service_role;

ALTER TABLE public.solicitudes_pago_transporte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff transporte lee solicitudes de pago"
ON public.solicitudes_pago_transporte FOR SELECT TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'transporte'::app_role]));

CREATE POLICY "staff transporte actualiza solicitudes de pago"
ON public.solicitudes_pago_transporte FOR UPDATE TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'transporte'::app_role]))
WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'transporte'::app_role]));

ALTER TABLE public.transportes ADD COLUMN IF NOT EXISTS numero_control_pago text;