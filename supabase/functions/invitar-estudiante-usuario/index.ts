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
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "admin")
    .limit(1);
  if (roleErr) return json(500, { error: roleErr.message });
  if (!roleRows || roleRows.length === 0) return json(403, { error: "Solo administradores pueden invitar estudiantes" });

  let payload: { email?: string; estudiante_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "JSON inválido" });
  }
  const email = (payload.email ?? "").trim().toLowerCase();
  const estudiante_id = (payload.estudiante_id ?? "").trim();
  if (!email || !estudiante_id) return json(400, { error: "email y estudiante_id son requeridos" });

  const { data: estudiante, error: estErr } = await admin
    .from("estudiantes")
    .select("id")
    .eq("id", estudiante_id)
    .maybeSingle();
  if (estErr) return json(500, { error: estErr.message });
  if (!estudiante) return json(404, { error: "Estudiante no encontrado" });

  const siteUrl = Deno.env.get("SITE_URL") ?? "https://adecomex-log.lovable.app";
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/reset-password`;

  let userId: string | null = null;
  let existingUser: any = null;
  try {
    const { data: existing } = await (admin.auth.admin as any).getUserByEmail?.(email) ?? { data: null };
    if (existing?.user?.id) {
      userId = existing.user.id;
      existingUser = existing.user;
    }
  } catch (_e) { /* ignore */ }

  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    if (found) {
      userId = found.id;
      existingUser = found;
    }
  }

  let yaConfirmado = false;
  let warning: string | null = null;

  if (!userId) {
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (invErr || !invited?.user) return json(500, { error: invErr?.message ?? "No se pudo invitar al usuario" });
    userId = invited.user.id;
  } else {
    const lastSignInAt = existingUser?.last_sign_in_at ?? null;
    if (lastSignInAt) {
      yaConfirmado = true;
    } else {
      const { error: reinvErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (reinvErr) {
        warning = `No se pudo reenviar el correo de invitación (${reinvErr.message}), pero el vínculo quedó actualizado.`;
      }
    }
  }

  const { error: upsertErr } = await admin
    .from("estudiante_usuarios")
    .upsert(
      { user_id: userId, estudiante_id, activo: true, created_by: callerId },
      { onConflict: "user_id" },
    );
  if (upsertErr) return json(500, { error: upsertErr.message });

  return json(200, { success: true, user_id: userId, estudiante_id, yaConfirmado, warning });
});
