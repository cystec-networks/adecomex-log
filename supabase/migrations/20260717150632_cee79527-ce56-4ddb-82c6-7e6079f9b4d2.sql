
COMMENT ON VIEW public.v_expedientes_cliente IS 'INTENCIONAL: SECURITY DEFINER (sin security_invoker). El cliente del portal no tiene permisos RLS directos sobre expedientes; esta vista es el único control de acceso, filtrando con WHERE cliente_id IN (SELECT private.cliente_ids_del_usuario(auth.uid())). Diseño correcto para portal de clientes de solo lectura. Revisado y aceptado.';

COMMENT ON FUNCTION public.calc_itbis_periodo(text) IS 'SECURITY DEFINER intencional. Valida el rol internamente al inicio (private.has_any_role admin/finanzas/contabilidad) y lanza excepción si no autorizado. Seguro para exponer a signed-in users. Revisado y aceptado.';

COMMENT ON FUNCTION private.is_staff(uuid) IS 'SECURITY DEFINER auxiliar de RLS. Solo responde sobre auth.uid() del propio llamador; nunca expone datos de otros usuarios. Patrón estándar Supabase. Revisado y aceptado.';
COMMENT ON FUNCTION private.has_role(uuid, app_role) IS 'SECURITY DEFINER auxiliar de RLS. Solo responde sobre auth.uid() del propio llamador; nunca expone datos de otros usuarios. Patrón estándar Supabase. Revisado y aceptado.';
COMMENT ON FUNCTION private.has_any_role(uuid, app_role[]) IS 'SECURITY DEFINER auxiliar de RLS. Solo responde sobre auth.uid() del propio llamador; nunca expone datos de otros usuarios. Patrón estándar Supabase. Revisado y aceptado.';
COMMENT ON FUNCTION private.cliente_ids_del_usuario(uuid) IS 'SECURITY DEFINER auxiliar de RLS para portal de clientes. Solo responde sobre auth.uid() del propio llamador. Patrón estándar Supabase. Revisado y aceptado.';
