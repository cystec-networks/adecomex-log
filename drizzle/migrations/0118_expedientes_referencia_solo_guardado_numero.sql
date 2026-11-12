DROP TRIGGER IF EXISTS zz_sincronizar_contador_expediente ON public.expedientes;
CREATE TRIGGER zz_sincronizar_contador_expediente
AFTER INSERT OR UPDATE OF numero ON public.expedientes
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_contador_numeracion();
COMMENT ON TRIGGER zz_sincronizar_contador_expediente ON public.expedientes IS 'Reference moves only on inserts and on updates that write numero (the full expediente form save always sends it, even unchanged). Background updates such as exchange-rate refresh, e-CF links or state changes do not send numero and leave the reference intact.';