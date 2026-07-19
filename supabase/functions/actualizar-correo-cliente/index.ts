// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Falta token de autorización" });

  const supaCaller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supaCaller.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: "No autorizado" });
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").limit(1);
  if (roleErr) return json(500, { error: roleErr.message });
  if (!roleRows || roleRows.length === 0) return json(403, { error: "Solo administradores" });

  let payload: { cliente_id?: string; nuevo_correo?: string };
  try { payload = await req.json(); } catch { return json(400, { error: "JSON inválido" }); }

  const cliente_id = (payload.cliente_id ?? "").trim();
  const nuevo_correo = (payload.nuevo_correo ?? "").trim().toLowerCase();
  if (!cliente_id || !nuevo_correo) return json(400, { error: "cliente_id y nuevo_correo son requeridos" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo_correo)) return json(400, { error: "Correo inválido" });

  const { error: updErr } = await admin
    .from("clientes")
    .update({ email: nuevo_correo, correo_generado: false })
    .eq("id", cliente_id);
  if (updErr) return json(500, { error: updErr.message });

  let warning: string | null = null;
  const { data: link } = await admin
    .from("cliente_usuarios")
    .select("user_id")
    .eq("cliente_id", cliente_id)
    .eq("activo", true)
    .maybeSingle();

  if (link?.user_id) {
    const { error: authErr } = await admin.auth.admin.updateUserById(link.user_id, { email: nuevo_correo });
    if (authErr) {
      warning = `El correo se actualizó en la ficha del cliente, pero no se pudo sincronizar con la cuenta de acceso (${authErr.message}).`;
    }
  }

  return json(200, { success: true, warning });
});
