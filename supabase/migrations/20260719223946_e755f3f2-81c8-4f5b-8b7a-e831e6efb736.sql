
-- Ampliar v_expedientes_cliente con puerto_arribo y numero_dua
DROP VIEW IF EXISTS public.v_expedientes_cliente;
CREATE VIEW public.v_expedientes_cliente AS
SELECT
  id, numero, cliente_id, estado,
  fecha_recibido, fecha_en_transito, fecha_presentado, fecha_verificado,
  fecha_despachado, fecha_entregado, fecha_facturado,
  bl_awb, puerto_arribo, numero_dua,
  fecha_compromiso, created_at
FROM public.expedientes e
WHERE cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()));

COMMENT ON VIEW public.v_expedientes_cliente IS
'Vista de solo lectura para el Portal de Cliente. Definida sin security_invoker de forma intencional: filtra por private.cliente_ids_del_usuario(auth.uid()) que ya restringe visibilidad al cliente autenticado.';

GRANT SELECT ON public.v_expedientes_cliente TO authenticated;

-- Vista de mercancía (sin arancel ni FOB)
DROP VIEW IF EXISTS public.v_mercancia_cliente;
CREATE VIEW public.v_mercancia_cliente AS
SELECT
  m.id, m.expediente_id, m.item_no, m.detalle_producto,
  m.cantidad, m.unidad_medida, m.peso
FROM public.mercancia_items m
WHERE m.deleted_at IS NULL
  AND m.expediente_id IN (
    SELECT id FROM public.expedientes
    WHERE cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()))
  );

COMMENT ON VIEW public.v_mercancia_cliente IS
'Vista de mercancía para el Portal de Cliente. Sin security_invoker por diseño: expone solo columnas no sensibles (excluye codigo_arancelario y valor_fob) filtradas por expedientes del cliente autenticado.';

GRANT SELECT ON public.v_mercancia_cliente TO authenticated;

-- Vista de permisos
DROP VIEW IF EXISTS public.v_permisos_cliente;
CREATE VIEW public.v_permisos_cliente AS
SELECT
  p.id, p.expediente_id, p.numero, p.tipo, p.estado,
  p.fecha_solicitud, p.fecha_emision, p.fecha_vencimiento
FROM public.permisos p
WHERE p.eliminado_en IS NULL
  AND p.expediente_id IN (
    SELECT id FROM public.expedientes
    WHERE cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()))
  );

COMMENT ON VIEW public.v_permisos_cliente IS
'Vista de permisos para el Portal de Cliente. Sin security_invoker por diseño: excluye observaciones e institución emisora (uso interno) y filtra por expedientes del cliente autenticado.';

GRANT SELECT ON public.v_permisos_cliente TO authenticated;

-- Vista de facturas (facturas_ecf no tiene expediente_id: se deriva via expedientes.factura_ecf_id)
DROP VIEW IF EXISTS public.v_facturas_cliente;
CREATE VIEW public.v_facturas_cliente AS
SELECT
  f.id,
  e.id AS expediente_id,
  f.encf,
  f.fecha_emision,
  f.monto_total,
  f.pdf_url
FROM public.facturas_ecf f
JOIN public.expedientes e ON e.factura_ecf_id = f.id
WHERE f.eliminado_en IS NULL
  AND e.cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()));

COMMENT ON VIEW public.v_facturas_cliente IS
'Vista de facturas e-CF para el Portal de Cliente. Sin security_invoker por diseño: expone solo e-NCF, fecha, monto y PDF, filtrado por expedientes del cliente autenticado.';

GRANT SELECT ON public.v_facturas_cliente TO authenticated;
