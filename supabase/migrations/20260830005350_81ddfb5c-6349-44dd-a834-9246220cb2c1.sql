CREATE OR REPLACE VIEW public.v_pagos_cliente AS
SELECT p.id, p.factura_id, p.monto, p.fecha_pago, e.id AS expediente_id
FROM public.cxc_pagos p
JOIN public.facturas_ecf f ON f.id = p.factura_id
JOIN public.expedientes e ON e.factura_ecf_id = f.id
WHERE f.eliminado_en IS NULL
  AND e.cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid()));

GRANT SELECT ON public.v_pagos_cliente TO authenticated;
GRANT ALL ON public.v_pagos_cliente TO service_role;