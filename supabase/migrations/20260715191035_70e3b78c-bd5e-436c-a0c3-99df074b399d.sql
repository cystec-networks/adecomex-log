
-- 1 & principio 2: eliminar políticas de cliente sobre transportes y expedientes
DROP POLICY IF EXISTS "cliente_ve_transportes_de_sus_expedientes" ON public.transportes;
DROP POLICY IF EXISTS "cliente_ve_sus_expedientes" ON public.expedientes;

-- 3: vista restringida para clientes
DROP VIEW IF EXISTS public.v_expedientes_cliente;
CREATE VIEW public.v_expedientes_cliente
WITH (security_invoker = true) AS
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
WHERE e.cliente_id IN (
  SELECT private.cliente_ids_del_usuario(auth.uid())
);

-- 4: grants
GRANT SELECT ON public.v_expedientes_cliente TO authenticated;
