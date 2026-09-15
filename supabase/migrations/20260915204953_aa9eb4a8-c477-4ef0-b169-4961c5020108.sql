CREATE OR REPLACE VIEW public.vista_registro_diario
WITH (security_invoker = true) AS
SELECT
  t.id,
  'transporte'::text AS origen_tipo,
  t.created_at::date AS fecha,
  t.numero_control AS secuencia,
  'Pago Transportes'::text AS categoria,
  t.numero_control AS referencia,
  t.transportista_nombre AS beneficiario,
  COALESCE(t.descripcion, 'Pago de transporte') AS concepto,
  t.monto,
  COALESCE(t.descuento_cxc, 0) AS descuento_cxc,
  ROUND((COALESCE(
      CASE WHEN t.cantidad_viajes IS NOT NULL AND t.precio_viaje IS NOT NULL AND t.porcentaje_margen IS NOT NULL
           THEN (t.cantidad_viajes * t.precio_viaje) * (1 - t.porcentaje_margen / 100)
           ELSE NULL END,
      t.monto
    ) - COALESCE(t.descuento_cxc, 0))::numeric, 2) AS neto,
  t.id AS solicitud_id
FROM public.solicitudes_pago_transporte t
UNION ALL
SELECT
  s.id,
  'transferencia'::text AS origen_tipo,
  s.fecha,
  s.secuencia,
  s.categoria,
  COALESCE(s.factura_compra, '') AS referencia,
  s.beneficiario,
  s.concepto,
  s.monto,
  COALESCE(s.descuento_cxc, 0) AS descuento_cxc,
  ROUND((s.monto - COALESCE(s.descuento_cxc, 0))::numeric, 2) AS neto,
  s.id AS solicitud_id
FROM public.solicitudes_pago_transferencia s
WHERE s.eliminado_en IS NULL;

GRANT SELECT ON public.vista_registro_diario TO authenticated;