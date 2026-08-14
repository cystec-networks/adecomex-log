CREATE TYPE public.orden_estado AS ENUM ('abierta','en_transito','declarada','impuestos_pagados','despachada','entregada');

ALTER TABLE public.ordenes ALTER COLUMN estado DROP DEFAULT;

ALTER TABLE public.ordenes
  ALTER COLUMN estado TYPE public.orden_estado
  USING (CASE WHEN estado IN ('abierta','en_transito','declarada','impuestos_pagados','despachada','entregada') THEN estado ELSE 'abierta' END)::public.orden_estado;

ALTER TABLE public.ordenes ALTER COLUMN estado SET DEFAULT 'abierta'::public.orden_estado;
ALTER TABLE public.ordenes ALTER COLUMN estado SET NOT NULL;