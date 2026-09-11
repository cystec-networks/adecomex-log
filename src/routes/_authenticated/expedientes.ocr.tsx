import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { extractSolicitudFromDocument, type OcrExtraction } from "@/lib/ai-ocr.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileUp, Sparkles, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OcrContextualHelp } from "@/components/ocr-contextual-help";

export const Route = createFileRoute("/_authenticated/expedientes/ocr")({
  component: ExpedientesOCR,
});

function ExpedientesOCR() {
  const nav = useNavigate();
  const extractFn = useServerFn(extractSolicitudFromDocument);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<OcrExtraction | null>(null);
  const [clienteId, setClienteId] = useState<string>("");

  const { data: clientes } = useQuery({
    queryKey: ["clientes-lite"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const [bl, setBl] = useState("");
  const [factura, setFactura] = useState("");
  const [suplidor, setSuplidor] = useState("");
  const [puerto, setPuerto] = useState("");
  const [eta, setEta] = useState("");
  const [obs, setObs] = useState("");

  const extract = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecciona un archivo PDF o imagen.");
      if (file.size > 15 * 1024 * 1024) throw new Error("Archivo demasiado grande (máx 15MB).");
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      return await extractFn({
        data: { filename: file.name, mime: file.type || "application/pdf", base64 },
      });
    },
    onSuccess: (res) => {
      setData(res);
      if (res.cliente && clientes) {
        const match = (clientes as any[]).find(
          (c) => c.nombre.toLowerCase().includes(res.cliente!.toLowerCase()) ||
            res.cliente!.toLowerCase().includes(c.nombre.toLowerCase()),
        );
        if (match) setClienteId(match.id);
      }
      toast.success("Documento procesado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const observacionesAuto = useMemo(() => {
    if (!data) return "";
    return [
      data.suplidor && `Suplidor: ${data.suplidor}`,
      data.numero_documento && `Nº Documento: ${data.numero_documento}`,
      data.productos && `Productos: ${data.productos}`,
    ].filter(Boolean).join("\n");
  }, [data]);

  useEffect(() => {
    if (!data) return;
    setBl(data.bl ?? "");
    setFactura(data.numero_documento ?? "");
    setSuplidor(data.suplidor ?? "");
    setPuerto(data.puerto_arribo ?? "");
    setEta(data.eta ?? "");
    setObs(observacionesAuto);
  }, [data, observacionesAuto]);

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        tipo_operacion: "Importación",
        bl_awb: bl || null,
        factura_comercial: factura || null,
        suplidor: suplidor || null,
        puerto_arribo: puerto || null,
        observaciones: obs || null,
        descripcion_mercancia: obs || null,
        sla_dias: 5,
      };
      if (clienteId) payload.cliente_id = clienteId;
      if (eta) payload.fecha_compromiso = eta;
      const { data: exp, error } = await supabase.from("expedientes").insert(payload).select().single();
      if (error) throw error;
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: exp.id, accion: "creado:ocr" });
      return exp;
    },
    onSuccess: (exp) => {
      toast.success(`Expediente ${exp.numero} creado`);
      nav({ to: "/expedientes/$id", params: { id: exp.id }, search: { nuevo: "1" } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/expedientes"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link>
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" /> Nuevo Expediente por OCR
          </h1>
          <p className="text-sm text-muted-foreground">
            Sube un BL, factura o AWB en PDF/imagen. La IA extraerá los campos clave y creará el expediente directamente.
          </p>
          <OcrContextualHelp>
            Usa esto solo para arrancar un Expediente directo, sin Cotización ni Orden previas (por ejemplo, si el trato comercial ya se manejó fuera del sistema). Si ya existe una Cotización u Orden para este embarque, conviértela a Expediente desde ahí en vez de crear uno nuevo aquí — evita duplicar el registro.
          </OcrContextualHelp>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Cargar documento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Archivo (PDF, JPG, PNG — máx 15MB)</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setData(null); }}
            />
          </div>
          <Button onClick={() => extract.mutate()} disabled={!file || extract.isPending}>
            {extract.isPending
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Procesando…</>
              : <><FileUp className="h-4 w-4 mr-1" />Extraer datos</>}
          </Button>
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader><CardTitle className="text-base">2. Revisar y crear expediente</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Cliente {data.cliente && <span className="text-xs text-muted-foreground">(detectado: {data.cliente})</span>}</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente…" /></SelectTrigger>
                <SelectContent>
                  {(clientes ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>BL / AWB / Guía</Label><Input value={bl} onChange={(e) => setBl(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Factura comercial</Label><Input value={factura} onChange={(e) => setFactura(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Exportador / Suplidor</Label><Input value={suplidor} onChange={(e) => setSuplidor(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Puerto de arribo</Label><Input value={puerto} onChange={(e) => setPuerto(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>ETA (fecha de llegada)</Label><Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} /></div>
            <div className="grid gap-1.5 md:col-span-2"><Label>Productos detectados</Label><Textarea rows={2} value={data.productos ?? ""} readOnly /></div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Observaciones</Label>
              <Textarea rows={5} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setData(null); setFile(null); }}>Descartar</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Creando…" : "Crear expediente"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
