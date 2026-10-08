ALTER TABLE public.etapas DISABLE TRIGGER trg_avanzar_orden_por_etapa;
COMMENT ON FUNCTION public.avanzar_orden_por_etapa() IS 'DEPRECATED: flujo viejo de 14 etapas; trigger desactivado';
COMMENT ON TABLE public.etapas IS 'DEPRECATED: flujo viejo de 14 etapas, sin uso en la aplicación; pendiente de archivar';