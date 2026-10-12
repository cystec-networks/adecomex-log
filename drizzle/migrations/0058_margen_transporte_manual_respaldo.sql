CREATE OR REPLACE VIEW public.v_rentabilidad_expediente WITH (security_invoker = true) AS
WITH c AS (
  SELECT expediente_id,
    sum(monto_real) FILTER (WHERE moneda = 'DOP'::moneda) AS rd,
    sum(monto_real) FILTER (WHERE moneda = 'USD'::moneda) AS usd
  FROM costos WHERE concepto = 'Honorarios de terceros' GROUP BY expediente_id
), t AS (
  SELECT expediente_id,
    sum(costo_viaje) FILTER (WHERE COALESCE(flete_moneda::text, 'DOP') = 'DOP') AS rd,
    sum(costo_viaje) FILTER (WHERE flete_moneda::text = 'USD') AS usd
  FROM transportes
  WHERE eliminado_en IS NULL AND COALESCE(costo_viaje, 0) > 0
  GROUP BY expediente_id
), tm AS (
  SELECT expediente_id, sum(monto) AS rd
  FROM gastos
  WHERE deleted_at IS NULL AND es_reembolso = false AND concepto = 'Transporte'
  GROUP BY expediente_id
), f AS (
  SELECT expediente_id, sum(monto) AS total_facturado
  FROM facturas WHERE deleted_at IS NULL GROUP BY expediente_id
), g AS (
  SELECT expediente_id, sum(monto) AS total_gastos
  FROM gastos
  WHERE deleted_at IS NULL AND es_reembolso = false AND concepto = 'Honorarios de terceros'
  GROUP BY expediente_id
), x AS (
  SELECT e.id, e.numero, e.estado, e.cliente_id,
    COALESCE(f.total_facturado, 0) AS fac,
    CASE WHEN t.expediente_id IS NOT NULL THEN COALESCE(t.rd, 0) ELSE COALESCE(tm.rd, 0) END AS trans_rd,
    COALESCE(t.usd, 0) AS trans_usd,
    COALESCE(c.rd, 0) AS hon_c_rd, COALESCE(c.usd, 0) AS hon_c_usd,
    COALESCE(g.total_gastos, 0) AS hon_g
  FROM expedientes e
  LEFT JOIN f ON f.expediente_id = e.id
  LEFT JOIN c ON c.expediente_id = e.id
  LEFT JOIN t ON t.expediente_id = e.id
  LEFT JOIN tm ON tm.expediente_id = e.id
  LEFT JOIN g ON g.expediente_id = e.id
  WHERE e.eliminado_en IS NULL
)
SELECT id AS expediente_id, numero, estado, cliente_id,
  fac::numeric(14,2) AS total_facturado,
  (hon_c_rd + trans_rd)::numeric(14,2) AS total_costos_reales,
  hon_g::numeric(14,2) AS total_gastos,
  (fac - hon_c_rd - trans_rd - hon_g)::numeric(14,2) AS margen_real,
  CASE WHEN fac > 0 THEN round((fac - hon_c_rd - trans_rd - hon_g) / fac * 100, 2) ELSE NULL END AS margen_pct,
  (hon_c_usd + trans_usd)::numeric(14,2) AS total_costos_usd
FROM x;

COMMENT ON VIEW public.v_rentabilidad_expediente IS 'Margen del servicio = facturado - transporte (Costo del viaje automático; si no existe, Transporte manual) - Honorarios de terceros (no reembolso).';