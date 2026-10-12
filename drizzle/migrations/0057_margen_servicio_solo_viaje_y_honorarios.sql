CREATE OR REPLACE VIEW public.v_rentabilidad_expediente WITH (security_invoker = true) AS
WITH c AS (
  SELECT expediente_id,
    sum(monto_real) FILTER (WHERE moneda = 'DOP'::moneda) AS rd,
    sum(monto_real) FILTER (WHERE moneda = 'USD'::moneda) AS usd
  FROM costos
  WHERE concepto = 'Honorarios de terceros'
  GROUP BY expediente_id
), t AS (
  SELECT expediente_id,
    sum(costo_viaje) FILTER (WHERE COALESCE(flete_moneda::text, 'DOP') = 'DOP') AS rd,
    sum(costo_viaje) FILTER (WHERE flete_moneda::text = 'USD') AS usd
  FROM transportes
  WHERE eliminado_en IS NULL AND COALESCE(costo_viaje, 0) > 0
  GROUP BY expediente_id
), f AS (
  SELECT expediente_id, sum(monto) AS total_facturado
  FROM facturas WHERE deleted_at IS NULL GROUP BY expediente_id
), g AS (
  SELECT expediente_id, sum(monto) AS total_gastos
  FROM gastos
  WHERE deleted_at IS NULL AND es_reembolso = false AND concepto = 'Honorarios de terceros'
  GROUP BY expediente_id
)
SELECT e.id AS expediente_id, e.numero, e.estado, e.cliente_id,
  COALESCE(f.total_facturado, 0)::numeric(14,2) AS total_facturado,
  (COALESCE(c.rd, 0) + COALESCE(t.rd, 0))::numeric(14,2) AS total_costos_reales,
  COALESCE(g.total_gastos, 0)::numeric(14,2) AS total_gastos,
  (COALESCE(f.total_facturado, 0) - COALESCE(c.rd, 0) - COALESCE(t.rd, 0) - COALESCE(g.total_gastos, 0))::numeric(14,2) AS margen_real,
  CASE WHEN COALESCE(f.total_facturado, 0) > 0
    THEN round((COALESCE(f.total_facturado, 0) - COALESCE(c.rd, 0) - COALESCE(t.rd, 0) - COALESCE(g.total_gastos, 0)) / f.total_facturado * 100, 2)
    ELSE NULL END AS margen_pct,
  (COALESCE(c.usd, 0) + COALESCE(t.usd, 0))::numeric(14,2) AS total_costos_usd
FROM expedientes e
LEFT JOIN f ON f.expediente_id = e.id
LEFT JOIN c ON c.expediente_id = e.id
LEFT JOIN t ON t.expediente_id = e.id
LEFT JOIN g ON g.expediente_id = e.id
WHERE e.eliminado_en IS NULL;

COMMENT ON VIEW public.v_rentabilidad_expediente IS 'Margen del servicio = facturado - Costo del viaje - Honorarios de terceros (no reembolso). Ningún otro concepto resta.';