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

function generarPassword(len = 10): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const nums = "23456789";
  const all = upper + lower + nums;
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  const chars: string[] = [
    upper[buf[0] % upper.length],
    lower[buf[1] % lower.length],
    nums[buf[2] % nums.length],
  ];
  for (let i = 3; i < len; i++) chars.push(all[buf[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
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

  let payload: { estudiante_id?: string };
  try { payload = await req.json(); } catch { return json(400, { error: "JSON inválido" }); }
  const estudiante_id = (payload.estudiante_id ?? "").trim();
  if (!estudiante_id) return json(400, { error: "estudiante_id es requerido" });

  const { data: est, error: eErr } = await admin
    .from("estudiantes").select("id, email, nombre").eq("id", estudiante_id).maybeSingle();
  if (eErr) return json(500, { error: eErr.message });
  if (!est) return json(404, { error: "Estudiante no encontrado" });
  const email = (est.email ?? "").trim().toLowerCase();
  if (!email) return json(400, { error: "El estudiante no tiene correo (real o generado)" });

  const tempPassword = generarPassword(10);

  let userId: string | null = null;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
  if (found) userId = found.id;

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true,
      user_metadata: { is_portal_account: true },
    });
    if (createErr || !created?.user) return json(500, { error: createErr?.message ?? "No se pudo crear la cuenta" });
    userId = created.user.id;
  } else {
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
    if (updErr) return json(500, { error: updErr.message });
  }

  // Bloqueo: un mismo usuario no puede tener acceso activo a ambos portales.
  const { data: cliActivo } = await admin
    .from("cliente_usuarios").select("cliente_id").eq("user_id", userId).eq("activo", true).limit(1);
  if (cliActivo && cliActivo.length > 0) {
    return json(409, { error: "Este correo ya tiene acceso activo al Portal de Cliente. Un mismo correo no puede tener acceso a ambos portales — desactiva primero su acceso de cliente si quieres darle acceso de estudiante." });
  }

  const { error: upsertErr } = await admin
    .from("estudiante_usuarios")
    .upsert(
      { user_id: userId, estudiante_id, activo: true, debe_cambiar_password: true, created_by: callerId },
      { onConflict: "user_id" },
    );
  if (upsertErr) return json(500, { error: upsertErr.message });

  return json(200, { success: true, email, password: tempPassword });
});
