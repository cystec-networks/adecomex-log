DROP TRIGGER IF EXISTS trg_completar_entrega_por_almacen ON public.almacen_stock;
DROP TRIGGER IF EXISTS trg_avanzar_orden_por_etapa ON public.etapas;
REVOKE INSERT, UPDATE, DELETE ON public.etapas FROM anon, authenticated;
COMMENT ON TABLE public.etapas IS 'DEPRECATED/ARCHIVADA: flujo viejo de 14 etapas. Solo lectura; Ordenes se mueven a mano.';
COMMENT ON FUNCTION public.completar_entrega_por_almacen() IS 'DEPRECATED: sin trigger, escribia en etapas.';
COMMENT ON FUNCTION public.avanzar_orden_por_etapa() IS 'DEPRECATED: sin trigger.';