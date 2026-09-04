REVOKE ALL ON FUNCTION public.crear_hitos_default() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generar_cuotas_inscripcion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_inscripcion_pagado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inscripcion_freeze_precio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.calc_itbis_periodo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calc_itbis_periodo(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.marcar_password_cambiada_cliente() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_password_cambiada_cliente() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.marcar_password_cambiada_estudiante() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_password_cambiada_estudiante() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.expirar_cotizaciones_vencidas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expirar_cotizaciones_vencidas() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.listar_vendedores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_vendedores() TO authenticated;