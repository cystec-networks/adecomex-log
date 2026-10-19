CREATE TABLE public.copiloto_clasificaciones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 archivo text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 lineas jsonb NOT NULL,
 CONSTRAINT copiloto_archivo_valido CHECK (length(archivo) BETWEEN 1 AND 500),
 CONSTRAINT copiloto_lineas_array CHECK (jsonb_typeof(lineas) = 'array' AND jsonb_array_length(lineas) > 0)
);
GRANT SELECT, INSERT ON public.copiloto_clasificaciones TO authenticated;
GRANT ALL ON public.copiloto_clasificaciones TO service_role;
ALTER TABLE public.copiloto_clasificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY copiloto_historial_staff_read ON public.copiloto_clasificaciones FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY copiloto_historial_staff_insert ON public.copiloto_clasificaciones FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE INDEX copiloto_clasificaciones_fecha_idx ON public.copiloto_clasificaciones (created_at DESC);