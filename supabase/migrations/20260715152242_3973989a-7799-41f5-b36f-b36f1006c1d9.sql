CREATE OR REPLACE VIEW public.v_rentabilidad_expediente
WITH (security_invoker = true) AS
SELECT
  e.id AS expediente_id,
  e.numero,
  e.estado,
  e.cliente_id,
  COALESCE(f.total_facturado, 0)::numeric(14,2) AS total_facturado,
  COALESCE(c.total_costos_reales, 0)::numeric(14,2) AS total_costos_reales,
  COALESCE(g.total_gastos, 0)::numeric(14,2) AS total_gastos,
  (COALESCE(f.total_facturado,0) - COALESCE(c.total_costos_reales,0) - COALESCE(g.total_gastos,0))::numeric(14,2) AS margen_real,
  CASE WHEN COALESCE(f.total_facturado,0) > 0
    THEN ROUND(((COALESCE(f.total_facturado,0) - COALESCE(c.total_costos_reales,0) - COALESCE(g.total_gastos,0)) / f.total_facturado) * 100, 2)
    ELSE NULL
  END AS margen_pct
FROM public.expedientes e
LEFT JOIN (
  SELECT expediente_id, SUM(monto) AS total_facturado
  FROM public.facturas WHERE deleted_at IS NULL
  GROUP BY expediente_id
) f ON f.expediente_id = e.id
LEFT JOIN (
  SELECT expediente_id, SUM(monto_real) AS total_costos_reales
  FROM public.costos
  GROUP BY expediente_id
) c ON c.expediente_id = e.id
LEFT JOIN (
  SELECT expediente_id, SUM(monto) AS total_gastos
  FROM public.gastos WHERE deleted_at IS NULL AND es_reembolso = false
  GROUP BY expediente_id
) g ON g.expediente_id = e.id
WHERE e.eliminado_en IS NULL;

GRANT SELECT ON public.v_rentabilidad_expediente TO authenticated;