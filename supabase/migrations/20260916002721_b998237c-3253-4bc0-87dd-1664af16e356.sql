ALTER SEQUENCE public.solicitudes_pago_transferencia_seq RESTART WITH 12761;

ALTER TABLE public.solicitudes_pago_transferencia
  ALTER COLUMN secuencia SET DEFAULT ('TF-' || lpad(nextval('public.solicitudes_pago_transferencia_seq')::text, 7, '0'));