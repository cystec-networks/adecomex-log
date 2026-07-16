ALTER TYPE public.expediente_estado ADD VALUE IF NOT EXISTS 'en_transito' AFTER 'digitar';
ALTER TYPE public.expediente_estado ADD VALUE IF NOT EXISTS 'entregado' AFTER 'despachado';