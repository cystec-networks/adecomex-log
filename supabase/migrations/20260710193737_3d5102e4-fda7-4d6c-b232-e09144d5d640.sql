
-- Nuevo enum de estados
ALTER TYPE public.expediente_estado RENAME TO expediente_estado_old;

CREATE TYPE public.expediente_estado AS ENUM ('digitar','presentar','verificar','facturar','despachado');

-- Quitar default temporalmente
ALTER TABLE public.expedientes ALTER COLUMN estado DROP DEFAULT;

-- Convertir columna mapeando valores antiguos a nuevos
ALTER TABLE public.expedientes
  ALTER COLUMN estado TYPE public.expediente_estado
  USING (
    CASE estado::text
      WHEN 'abierto' THEN 'digitar'
      WHEN 'en_proceso' THEN 'presentar'
      WHEN 'retenido' THEN 'verificar'
      WHEN 'cerrado' THEN 'despachado'
      WHEN 'cancelado' THEN 'facturar'
      ELSE 'digitar'
    END
  )::public.expediente_estado;

ALTER TABLE public.expedientes ALTER COLUMN estado SET DEFAULT 'digitar'::public.expediente_estado;

DROP TYPE public.expediente_estado_old;
