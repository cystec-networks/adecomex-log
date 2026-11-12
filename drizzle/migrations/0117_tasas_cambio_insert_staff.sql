ALTER TABLE public.catalogo_tasas_cambio ALTER COLUMN created_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "tasas_cambio_insert_auth" ON public.catalogo_tasas_cambio;

CREATE POLICY "tasas_cambio_insert_staff"
ON public.catalogo_tasas_cambio
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_staff(auth.uid())
  AND created_by = auth.uid()
);