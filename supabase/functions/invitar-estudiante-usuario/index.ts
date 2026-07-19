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

  let payload: { email?: string; estudiante_id?: string; soloGenerarEnlace?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "JSON inválido" });
  }
  const email = (payload.email ?? "").trim().toLowerCase();
  const estudiante_id = (payload.estudiante_id ?? "").trim();
  const soloGenerarEnlace = !!payload.soloGenerarEnlace;
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
  let enlace: string | null = null;

  async function generarEnlaceInvite(): Promise<string | null> {
    const { data: gen, error: genErr } = await (admin.auth.admin as any).generateLink({
      type: "invite",
      email,
      options: { redirectTo },
    });
    if (genErr) {
      warning = `No se pudo generar el enlace de invitación (${genErr.message}).`;
      return null;
    }
    return gen?.properties?.action_link ?? null;
  }

  if (!userId) {
    if (soloGenerarEnlace) {
      const { data: gen, error: genErr } = await (admin.auth.admin as any).generateLink({
        type: "invite",
        email,
        options: { redirectTo, data: { is_portal_account: true } },
      });
      if (genErr || !gen?.user) return json(500, { error: genErr?.message ?? "No se pudo generar el enlace" });
      userId = gen.user.id;
      enlace = gen?.properties?.action_link ?? null;
    } else {
      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { is_portal_account: true } });
      if (invErr || !invited?.user) return json(500, { error: invErr?.message ?? "No se pudo invitar al usuario" });
      userId = invited.user.id;
    }
    try {
      await admin.auth.admin.updateUserById(userId!, { user_metadata: { is_portal_account: true } });
    } catch (_e) { /* ignore */ }
  } else {
    const lastSignInAt = existingUser?.last_sign_in_at ?? null;
    if (lastSignInAt) {
      yaConfirmado = true;
    } else if (soloGenerarEnlace) {
      enlace = await generarEnlaceInvite();
    } else {
      const { error: reinvErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (reinvErr) {
        warning = `No se pudo reenviar el correo de invitación (${reinvErr.message}), pero el vínculo quedó actualizado.`;
      }
    }
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
      { user_id: userId, estudiante_id, activo: true, created_by: callerId },
      { onConflict: "user_id" },
    );
  if (upsertErr) return json(500, { error: upsertErr.message });

  return json(200, { success: true, user_id: userId, estudiante_id, yaConfirmado, warning, enlace });
});
