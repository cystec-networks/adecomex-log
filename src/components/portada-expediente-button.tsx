import { useState } from "react";
import { FileBadge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { esc, htmlAPdf } from "@/lib/oficios";
import { estadoLabel } from "@/lib/estados-expediente";
import membreteAsset from "@/assets/oficio-membrete.png.asset.json";

const CHECKLIST = [
  "Declaración Única Aduanera (DUA)", "Reporte de Liquidación de Impuestos",
  "Factura comercial", "Bill of Lading", "Lista de empaque",
  "Certificado de origen", "Certificado sanitario",
  "Certificado fitosanitario", "Certificado de análisis",
];

const v = (x: unknown) => (x == null || String(x).trim() === "" ? "—" : esc(x));
const num = (x: unknown, d = 2) =>
  x == null || x === "" || isNaN(Number(x)) ? "—" : Number(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fecha = (s?: string | null) => {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : s;
};

/** Portada del Expediente: PDF de una página carta, solo lectura. */
export function PortadaExpedienteButton({ expedienteId }: { expedienteId: string }) {
  const [cargando, setCargando] = useState(false);

  const generar = async () => {
    setCargando(true);
    let host: HTMLDivElement | null = null;
    try {
      const { data: u } = await supabase.auth.getUser();
      const [expRes, itemsRes, docsRes, contRes, profRes] = await Promise.all([
        supabase.from("expedientes").select("*, clientes(nombre, rnc)").eq("id", expedienteId).maybeSingle(),
        supabase.from("mercancia_items").select("valor_fob").eq("expediente_id", expedienteId).is("deleted_at", null),
        supabase.from("documentos").select("tipo, estado, fecha_recepcion, created_at").eq("expediente_id", expedienteId),
        supabase.from("expediente_contenedores").select("numero").eq("expediente_id", expedienteId).order("item_no"),
        u.user ? supabase.from("profiles").select("nombre").eq("id", u.user.id).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      if (expRes.error) throw expRes.error;
      const e: any = expRes.data ?? {};
      const items: any[] = itemsRes.data ?? [];
      const fob = items.reduce((s, i) => s + (Number(i.valor_fob) || 0), 0);
      const conts = (contRes.data ?? []).map((c: any) => c.numero).filter(Boolean).join(", ") || e.numeros_contenedores || "";

      const latest = new Map<string, any>();
      for (const d of docsRes.data ?? []) {
        const p = latest.get(d.tipo);
        const t = (x: any) => new Date(x?.fecha_recepcion ?? x?.created_at ?? 0).getTime();
        if (!p || t(d) >= t(p)) latest.set(d.tipo, d);
      }
      const ok = (t: string) => ["recibido", "aprobado", "observado"].includes(latest.get(t)?.estado);
      const recibidos = CHECKLIST.filter(ok).length;
      const usuario = profRes?.data?.nombre || u.user?.email || "—";
      const ahora = new Date().toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" });

      const row = (l: string, val: string) =>
        `<tr><td style="color:#555;padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top;width:42%">${l}</td><td style="padding:3px 0;font-weight:600;word-break:break-word">${val}</td></tr>`;
      const sec = (t: string, rows: string) =>
        `<div style="border:1px solid #bbb;border-radius:4px;margin-bottom:12px"><div style="background:#1f3a5f;color:#fff;font-weight:700;font-size:10pt;padding:4px 8px;letter-spacing:.5px">${t}</div><table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin:4px 8px;width:calc(100% - 16px)">${rows}</table></div>`;

      const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#000;width:100%;height:9.6in;display:flex;flex-direction:column">
<div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #1f3a5f;padding-bottom:6px;margin-bottom:12px">
<div><img src="${new URL(membreteAsset.url, window.location.origin).href}" crossorigin="anonymous" style="height:70px;display:block"><div style="font-size:9pt;margin-left:90px">RNC: 130-481301</div></div>
<div style="text-align:right"><div style="font-size:16pt;font-weight:700;color:#1f3a5f">PORTADA DEL EXPEDIENTE</div><div style="font-size:20pt;font-weight:700">${v(e.numero)}</div></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;border:1px solid #bbb;border-radius:4px;padding:8px;margin-bottom:12px;font-size:9.5pt">
<div><div style="color:#555">Estado actual</div><b>${v(estadoLabel(e.estado))}</b></div>
<div style="grid-column:span 2"><div style="color:#555">Consignatario</div><b>${v(e.clientes?.nombre)}</b>${e.clientes?.rnc ? `<br>RNC: ${esc(e.clientes.rnc)}` : ""}</div>
<div><div style="color:#555">ETA</div><b>${fecha(e.fecha_compromiso)}</b></div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
<div>
${sec("TRANSPORTE", row("BL / AWB", v(e.bl_awb)) + row("Puerto de arribo", v(e.puerto_arribo)) + (conts ? row("Contenedores", esc(conts)) : ""))}
${sec("DECLARACIÓN", row("N.º de DUA", v(e.numero_dua)) + row("N.º de despacho", v(e.numero_igra)) + row("N.º permiso VUCE", v(e.numero_vuce)) + row("Régimen Aduanero", v(e.regimen_aduanero)) + (e.rectificacion_tecnica ? row("N.º Trámite RT", v(e.numero_tramite_rectificacion)) : ""))}
</div>
<div>
${sec("MERCANCÍA (RESUMEN)", row("Descripción", v(e.descripcion_mercancia)) + row("Peso neto (kg)", num(e.peso_neto)) + row("Peso bruto (kg)", num(e.peso_bruto)) + row("Cantidad de ítems", String(items.length)) + row("Valor FOB total (US$)", num(fob)))}
${sec("RESULTADO OFICIAL DGA", row("N.º Liquidación SIGA", v(e.liq_siga_numero)) + row("Estado", v(e.liq_siga_estado)) + row("Total oficial (RD$)", num(e.liq_oficial_total)))}
</div>
</div>
<div style="border:1px solid #bbb;border-radius:4px">
<div style="background:#1f3a5f;color:#fff;font-weight:700;font-size:10pt;padding:4px 8px;display:flex;justify-content:space-between"><span>CHECKLIST DE RECEPCIÓN</span><span>${recibidos} de ${CHECKLIST.length} documentos recibidos</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 16px;padding:8px;font-size:9.5pt">
${CHECKLIST.map((t) => `<div><span style="display:inline-block;width:16px;font-weight:700;color:${ok(t) ? "#15803d" : "#888"}">${ok(t) ? "&#10003;" : "&#9675;"}</span>${esc(t)}</div>`).join("")}
</div></div>
<div style="flex:1"></div>
<div style="border-top:1px solid #999;padding-top:4px;font-size:8.5pt;color:#444;display:flex;justify-content:space-between"><span>Generado: ${esc(ahora)}</span><span>Por: ${esc(usuario)}</span><span>ADECOMEX SRL</span></div>
</div>`;

      host = document.createElement("div");
      host.style.cssText = "position:fixed;left:-10000px;top:0;width:8.5in;padding:0.1in;background:#fff";
      host.innerHTML = html;
      document.body.appendChild(host);
      await Promise.all(Array.from(host.querySelectorAll("img")).map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
      const pdf = await htmlAPdf(host);
      pdf.save(`Portada Expediente ${e.numero ?? ""}.pdf`.trim());
      toast.success("Portada descargada");
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo generar la portada");
    } finally {
      host?.remove();
      setCargando(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={generar} disabled={cargando}>
      {cargando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileBadge className="h-4 w-4 mr-1" />}
      Descargar Portada (PDF)
    </Button>
  );
}
