CREATE OR REPLACE FUNCTION public.hechos_cierre_expedientes(p_ids uuid[])
RETURNS TABLE(expediente_id uuid, hechos jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.id, jsonb_build_object(
    'estado', e.estado::text,
    'docs', jsonb_build_object(
      'factura', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo = 'Factura comercial' AND COALESCE(btrim(d.storage_path), '') <> ''),
      'bl', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo IN ('Bill of Lading', 'Guía aérea') AND COALESCE(btrim(d.storage_path), '') <> ''),
      'dua', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo IN ('Declaración Única Aduanera (DUA)', 'DUA') AND COALESCE(btrim(d.storage_path), '') <> ''),
      'liquidacion', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo = 'Reporte de Liquidación de Impuestos' AND COALESCE(btrim(d.storage_path), '') <> '')
    ),
    'numero_igra', NULLIF(btrim(COALESCE(e.numero_igra, '')), ''),
    'fecha_aprobacion_despacho', e.fecha_aprobacion_despacho,
    'factura_ecf_id', e.factura_ecf_id,
    'siga_cargado', EXISTS (SELECT 1 FROM documentos d WHERE d.expediente_id = e.id AND d.tipo = 'Seguimiento SIGA (Estado de Desaduanización)' AND COALESCE(btrim(d.storage_path), '') <> ''),
    'siga_despacho_completo', EXISTS (SELECT 1 FROM expediente_siga_procesos p WHERE p.expediente_id = e.id AND p.proceso = 'despacho' AND p.estado ILIKE '%complet%'),
    -- Facturas e-CF del Expediente (vinculada + líneas de facturación), con el mismo saldo que Cuentas por Cobrar.
    'facturas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', fe.id, 'encf', fe.encf,
        'emision', fe.fecha_emision,
        'vencimiento', fe.fecha_vencimiento_pago,
        'monto', COALESCE(fe.monto_total, 0),
        'pagado', COALESCE((SELECT sum(p.monto) FROM cxc_pagos p WHERE p.factura_id = fe.id), 0)
      ) ORDER BY fe.fecha_emision, fe.encf)
      FROM facturas_ecf fe
      WHERE fe.eliminado_en IS NULL AND fe.estado <> 'anulada'
        AND (fe.id = e.factura_ecf_id OR fe.id IN (SELECT f.factura_ecf_id FROM facturas f WHERE f.expediente_id = e.id AND f.deleted_at IS NULL AND f.factura_ecf_id IS NOT NULL))), '[]'::jsonb),
    'hitos_pendientes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', h.id, 'codigo', h.hito_codigo, 'nombre', c.nombre, 'estado', h.estado::text) ORDER BY c.orden, c.nombre)
      FROM expediente_hitos h JOIN catalogo_hitos c ON c.codigo = h.hito_codigo AND c.activo
      WHERE h.expediente_id = e.id AND h.estado NOT IN ('completado', 'no_aplica')), '[]'::jsonb),
    'transportes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'numero', t.numero_viaje, 'estado', t.estado::text, 'solicitud_pago_id', t.solicitud_pago_id,
        'conciliado', t.solicitud_pago_id IS NOT NULL AND EXISTS (SELECT 1 FROM banco_conciliaciones bc WHERE bc.solicitud_id = t.solicitud_pago_id)
      ) ORDER BY t.numero_viaje)
      FROM transportes t WHERE t.expediente_id = e.id AND t.eliminado_en IS NULL), '[]'::jsonb),
    'incidencias_abiertas', (SELECT count(*) FROM incidencias i WHERE i.expediente_id = e.id AND i.estado IN ('abierta', 'en_gestion')),
    'fechas', jsonb_build_object(
      'llegada', COALESCE(e.fecha_llegada_real, (e.siga_fecha_llegada AT TIME ZONE 'America/Santo_Domingo')::date),
      'presentado', e.fecha_presentado,
      'aprobacion', e.fecha_aprobacion_despacho,
      'despacho_siga', (SELECT (max(p.fecha) AT TIME ZONE 'America/Santo_Domingo')::date FROM expediente_siga_procesos p WHERE p.expediente_id = e.id AND p.proceso = 'despacho' AND p.estado ILIKE '%complet%'),
      'despachado', e.fecha_despachado,
      'entregado', e.fecha_entregado,
      'facturado', COALESCE((SELECT fe.fecha_emision FROM facturas_ecf fe WHERE fe.id = e.factura_ecf_id), e.fecha_facturado),
      'retiro', (SELECT min(t.fecha_salida) FROM transportes t WHERE t.expediente_id = e.id AND t.eliminado_en IS NULL),
      'cobro', (SELECT max(p.fecha_pago) FROM cxc_pagos p WHERE p.factura_id = e.factura_ecf_id OR p.factura_id IN (SELECT f.factura_ecf_id FROM facturas f WHERE f.expediente_id = e.id AND f.deleted_at IS NULL AND f.factura_ecf_id IS NOT NULL))
    )
  )
  FROM expedientes e
  WHERE e.id = ANY(p_ids) AND e.eliminado_en IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.hechos_cierre_expedientes(uuid[]) TO authenticated;