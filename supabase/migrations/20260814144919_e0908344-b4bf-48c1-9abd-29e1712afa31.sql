REVOKE EXECUTE ON FUNCTION public.expirar_cotizaciones_vencidas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expirar_cotizaciones_vencidas() TO authenticated, service_role;