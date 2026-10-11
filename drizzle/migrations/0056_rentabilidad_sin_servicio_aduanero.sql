CREATE OR REPLACE VIEW public.v_rentabilidad_expediente WITH (security_invoker = true) AS
WITH c AS (
  SELECT expediente_id,
    sum(monto_real) FILTER (WHERE moneda = 'DOP') AS rd,
    sum(monto_real) FILTER (WHERE moneda = 'USD') AS usd
  FROM public.costos GROUP BY expediente_id
), t AS (
  SELECT expediente_id,
    sum(costo_viaje) FILTER (WHERE coalesce(flete_moneda::text,'DOP') = 'DOP') AS rd,
    sum(costo_viaje) FILTER (WHERE flete_moneda::text = 'USD') AS usd
  FROM public.transportes WHERE eliminado_en IS NULL AND coalesce(costo_viaje,0) > 0 GROUP BY expediente_id
), f AS (
  SELECT expediente_id, sum(monto) AS total_facturado FROM public.facturas WHERE deleted_at IS NULL GROUP BY expediente_id
), g AS (
  SELECT expediente_id, sum(monto) AS total_gastos FROM public.gastos WHERE deleted_at IS NULL AND es_reembolso = false GROUP BY expediente_id
)
SELECT e.id AS expediente_id, e.numero, e.estado, e.cliente_id,
  COALESCE(f.total_facturado, 0)::numeric(14,2) AS total_facturado,
  (COALESCE(c.rd,0) + COALESCE(t.rd,0))::numeric(14,2) AS total_costos_reales,
  COALESCE(g.total_gastos, 0)::numeric(14,2) AS total_gastos,
  (COALESCE(f.total_facturado,0) - COALESCE(c.rd,0) - COALESCE(t.rd,0) - COALESCE(g.total_gastos,0))::numeric(14,2) AS margen_real,
  CASE WHEN COALESCE(f.total_facturado,0) > 0
    THEN round((COALESCE(f.total_facturado,0) - COALESCE(c.rd,0) - COALESCE(t.rd,0) - COALESCE(g.total_gastos,0)) / f.total_facturado * 100, 2)
  END AS margen_pct,
  (COALESCE(c.usd,0) + COALESCE(t.usd,0))::numeric(14,2) AS total_costos_usd
FROM public.expedientes e
LEFT JOIN f ON f.expediente_id = e.id
LEFT JOIN c ON c.expediente_id = e.id
LEFT JOIN t ON t.expediente_id = e.id
LEFT JOIN g ON g.expediente_id = e.id
WHERE e.eliminado_en IS NULL;