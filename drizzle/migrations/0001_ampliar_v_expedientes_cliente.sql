CREATE OR REPLACE VIEW public.v_expedientes_cliente AS
SELECT
    e.id,
    e.numero,
    e.cliente_id,
    e.estado,
    e.fecha_recibido,
    e.fecha_en_transito,
    e.fecha_presentado,
    e.fecha_verificado,
    e.fecha_despachado,
    e.fecha_entregado,
    e.fecha_facturado,
    e.bl_awb,
    e.puerto_arribo,
    e.numero_dua,
    e.fecha_compromiso,
    e.suplidor,
    e.pais_origen,
    e.numero_vuce,
    e.peso_neto,
    e.numeros_contenedores,
    e.created_at,
    e.fecha_llegada_real,
    e.descripcion_mercancia
FROM public.expedientes e
WHERE e.cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()));