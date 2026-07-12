import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Save, MailSearch } from "lucide-react";
import { GMAIL_AUTHUSER_KEY, GMAIL_AUTHUSER_DEFAULT } from "@/lib/system-settings";

export const Route = createFileRoute("/_authenticated/admin/configuracion")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: r } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!r) throw redirect({ to: "/dashboard" });
  },
  component: AdminConfiguracion,
});

function AdminConfiguracion() {
  const qc = useQueryClient();

  const { data: gmailRow } = useQuery({
    queryKey: ["system_settings", GMAIL_AUTHUSER_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key,value,description,updated_at")
        .eq("key", GMAIL_AUTHUSER_KEY)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [gmailAuthuser, setGmailAuthuser] = useState<string>(GMAIL_AUTHUSER_DEFAULT);

  useEffect(() => {
    if (gmailRow?.value != null) setGmailAuthuser(gmailRow.value);
  }, [gmailRow?.value]);

  const save = useMutation({
    mutationFn: async () => {
      const n = Number.parseInt(gmailAuthuser, 10);
      if (!Number.isFinite(n) || n < 0 || n > 9) {
        throw new Error("El índice debe ser un número entero entre 0 y 9");
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("system_settings")
        .upsert(
          {
            key: GMAIL_AUTHUSER_KEY,
            value: String(n),
            description:
              "Índice de cuenta de Gmail (u/N) donde está iniciada operaciones@adecomex.com en el navegador de la oficina.",
            updated_by: u.user?.id ?? null,
          },
          { onConflict: "key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["system_settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar"),
  });

  const previewUrl = `https://mail.google.com/mail/u/${encodeURIComponent(gmailAuthuser || "0")}/#search/EXP-2025-0042`;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Configuración del sistema</h1>
        <p className="text-sm text-muted-foreground">
          Ajustes generales editables por administradores.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailSearch className="h-5 w-5 text-primary" />
            Correo (Gmail)
          </CardTitle>
          <CardDescription>
            Configuración usada por los botones "Buscar en Correo" en Expedientes, Solicitudes y Transportes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 max-w-xs">
            <Label htmlFor="gmail-authuser">
              Índice de cuenta de Gmail para operaciones@adecomex.com
            </Label>
            <Input
              id="gmail-authuser"
              type="number"
              min={0}
              max={9}
              step={1}
              value={gmailAuthuser}
              onChange={(e) => setGmailAuthuser(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Corresponde al orden en que la cuenta aparece cuando se inicia sesión en Gmail
              en las computadoras de la oficina: <code>0</code> = primera cuenta,{" "}
              <code>1</code> = segunda, <code>2</code> = tercera, etc. Valor por defecto: <code>1</code>.
            </p>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <div className="font-medium mb-1">Vista previa del enlace generado</div>
            <code className="block break-all text-[11px]">{previewUrl}</code>
          </div>

          <div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-1" />
              Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
