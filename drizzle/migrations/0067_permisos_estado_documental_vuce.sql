ALTER TYPE public.permiso_estado ADD VALUE IF NOT EXISTS 'pendiente_pago';
ALTER TABLE public.permisos ADD COLUMN IF NOT EXISTS estado_vuce text;
COMMENT ON COLUMN public.permisos.estado_vuce IS 'Estado literal leído en Detalle Solicitud VUCE; el enum estado conserva su clasificación operativa.';