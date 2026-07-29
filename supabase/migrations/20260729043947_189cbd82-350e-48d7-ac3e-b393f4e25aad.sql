CREATE POLICY "staff delete solicitudes pago pendientes"
ON public.solicitudes_pago_transporte
FOR DELETE
TO authenticated
USING (
  private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'transporte'::app_role])
  AND estado = 'pendiente'
);

GRANT DELETE ON public.solicitudes_pago_transporte TO authenticated;