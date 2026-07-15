ALTER VIEW public.v_expedientes_cliente SET (security_invoker = false);

CREATE OR REPLACE VIEW public.v_expedientes_cliente AS
SELECT
    e.id,
    e.numero,
    e.cliente_id,
    e.estado,
    e.fecha_recibido,
    e.fecha_presentado,
    e.fecha_verificado,
    e.fecha_facturado,
    e.fecha_despachado,
    e.bl_awb,
    e.fecha_compromiso,
    e.created_at
FROM public.expedientes e
WHERE e.cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()));