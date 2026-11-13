CREATE OR REPLACE VIEW public.vista_registro_diario WITH (security_invoker = true) AS
SELECT t.id,
  'transporte'::text AS origen_tipo,
  t.created_at::date AS fecha,
  t.numero_control AS secuencia,
  'Pago Transportes'::text AS categoria,
  COALESCE(tr.refs, ''::text) AS referencia,
  t.transportista_nombre AS beneficiario,
  COALESCE(t.descripcion, 'Pago de transporte'::text) AS concepto,
  t.monto,
  COALESCE(t.descuento_cxc, 0::numeric) AS descuento_cxc,
  round(COALESCE(
    CASE WHEN t.cantidad_viajes IS NOT NULL AND t.precio_viaje IS NOT NULL AND t.porcentaje_margen IS NOT NULL
      THEN t.cantidad_viajes::numeric * t.precio_viaje * (1::numeric - t.porcentaje_margen / 100::numeric)
      ELSE NULL::numeric END, t.monto) - COALESCE(t.descuento_cxc, 0::numeric), 2) AS neto,
  t.id AS solicitud_id,
  'manual'::text AS origen,
  'pagada'::text AS estado,
  bc.movimiento_id,
  m.referencia AS referencia_bancaria,
  m.fecha AS fecha_banco,
  bc.diferencia AS diferencia_banco,
  bc.motivo_diferencia,
  (bc.id IS NOT NULL) AS conciliado,
  false AS retroactiva
FROM public.solicitudes_pago_transporte t
LEFT JOIN LATERAL (
  SELECT string_agg(x.numero_viaje, ', ' ORDER BY x.numero_viaje) AS refs
  FROM public.transportes x WHERE x.solicitud_pago_id = t.id AND x.eliminado_en IS NULL
) tr ON true
LEFT JOIN public.banco_conciliaciones bc ON bc.origen_tipo = 'transporte' AND bc.solicitud_id = t.id
LEFT JOIN public.banco_movimientos m ON m.id = bc.movimiento_id
UNION ALL
SELECT s.id,
  'transferencia'::text AS origen_tipo,
  s.fecha,
  s.secuencia,
  s.categoria,
  COALESCE(s.factura_compra, ''::text) AS referencia,
  s.beneficiario,
  s.concepto,
  s.monto,
  COALESCE(s.descuento_cxc, 0::numeric) AS descuento_cxc,
  round(s.monto - COALESCE(s.descuento_cxc, 0::numeric), 2) AS neto,
  s.id AS solicitud_id,
  s.origen,
  s.estado,
  bc.movimiento_id,
  m.referencia AS referencia_bancaria,
  m.fecha AS fecha_banco,
  bc.diferencia AS diferencia_banco,
  bc.motivo_diferencia,
  (bc.id IS NOT NULL) AS conciliado,
  s.retroactiva
FROM public.solicitudes_pago_transferencia s
LEFT JOIN public.banco_conciliaciones bc ON bc.origen_tipo = 'transferencia' AND bc.solicitud_id = s.id
LEFT JOIN public.banco_movimientos m ON m.id = bc.movimiento_id
WHERE s.eliminado_en IS NULL AND s.estado <> 'anulada';
GRANT SELECT ON public.vista_registro_diario TO authenticated;