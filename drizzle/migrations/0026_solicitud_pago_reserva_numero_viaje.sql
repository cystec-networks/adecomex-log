ALTER TABLE public.solicitudes_pago_transporte ADD COLUMN IF NOT EXISTS numero_viaje TEXT;
UPDATE public.solicitudes_pago_transporte s SET numero_viaje = t.numero_viaje
FROM (SELECT DISTINCT ON (solicitud_pago_id) solicitud_pago_id, numero_viaje FROM public.transportes WHERE solicitud_pago_id IS NOT NULL ORDER BY solicitud_pago_id, numero_viaje) t
WHERE t.solicitud_pago_id = s.id AND s.numero_viaje IS NULL;
UPDATE public.solicitudes_pago_transporte SET numero_viaje = 'TR-' || lpad(nextval('public.transportes_seq')::text, 6, '0') WHERE numero_viaje IS NULL;
ALTER TABLE public.solicitudes_pago_transporte ALTER COLUMN numero_viaje SET DEFAULT ('TR-' || lpad(nextval('public.transportes_seq')::text, 6, '0'));
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_pago_transporte_numero_viaje_key ON public.solicitudes_pago_transporte(numero_viaje);
COMMENT ON COLUMN public.solicitudes_pago_transporte.numero_viaje IS 'N° de Viaje (TR) reservado al registrar la solicitud; se asigna al Transporte al convertir. numero_control (TF) sigue siendo el control interno de Finanzas.';