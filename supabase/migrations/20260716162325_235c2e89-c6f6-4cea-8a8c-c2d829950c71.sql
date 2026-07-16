DROP VIEW IF EXISTS public.v_expedientes_cliente;
CREATE VIEW public.v_expedientes_cliente AS
SELECT id,
   numero,
   cliente_id,
   estado,
   fecha_recibido,
   fecha_en_transito,
   fecha_presentado,
   fecha_verificado,
   fecha_despachado,
   fecha_entregado,
   fecha_facturado,
   bl_awb,
   fecha_compromiso,
   created_at
FROM expedientes e
WHERE (cliente_id IN ( SELECT private.cliente_ids_del_usuario(auth.uid()) AS cliente_ids_del_usuario));
GRANT SELECT ON public.v_expedientes_cliente TO authenticated;