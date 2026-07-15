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

  // Client acting as the caller (RLS applies) to verify identity + admin role
  const supaCaller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supaCaller.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: "No autorizado" });
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify admin role
  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .limit(1);
  if (roleErr) return json(500, { error: roleErr.message });
  if (!roleRows || roleRows.length === 0) return json(403, { error: "Solo administradores pueden invitar clientes" });

  let payload: { email?: string; cliente_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "JSON inválido" });
  }
  const email = (payload.email ?? "").trim().toLowerCase();
  const cliente_id = (payload.cliente_id ?? "").trim();
  if (!email || !cliente_id) return json(400, { error: "email y cliente_id son requeridos" });

  // Verify cliente exists
  const { data: cliente, error: cliErr } = await admin
    .from("clientes")
    .select("id")
    .eq("id", cliente_id)
    .maybeSingle();
  if (cliErr) return json(500, { error: cliErr.message });
  if (!cliente) return json(404, { error: "Cliente no encontrado" });

  // Try to find existing user by email
  let userId: string | null = null;
  try {
    const { data: existing } = await (admin.auth.admin as any).getUserByEmail?.(email) ?? { data: null };
    if (existing?.user?.id) userId = existing.user.id;
  } catch (_e) { /* ignore, fallback below */ }

  if (!userId) {
    // Fallback: list users and find by email
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) userId = found.id;
  }

  if (!userId) {
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://adecomex-log.lovable.app";
    const redirectTo = `${siteUrl.replace(/\/$/, "")}/portal`;
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (invErr || !invited?.user) return json(500, { error: invErr?.message ?? "No se pudo invitar al usuario" });
    userId = invited.user.id;
  }


  const { error: upsertErr } = await admin
    .from("cliente_usuarios")
    .upsert(
      { user_id: userId, cliente_id, activo: true, created_by: callerId },
      { onConflict: "user_id" },
    );
  if (upsertErr) return json(500, { error: upsertErr.message });

  return json(200, { success: true, user_id: userId, cliente_id });
});
