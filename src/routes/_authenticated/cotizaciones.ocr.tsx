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
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cotizaciones/ocr")({
  component: CotizacionesOCR,
});

function CotizacionesOCR() {
  const nav = useNavigate();
  const extractFn = useServerFn(extractSolicitudFromDocument);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<OcrExtraction | null>(null);
  const [clienteId, setClienteId] = useState<string>("");

  const { data: clientes } = useQuery({
    queryKey: ["clientes-select"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

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
        const match = clientes.find(
          (c: any) => c.nombre.toLowerCase().includes(res.cliente!.toLowerCase()) ||
            res.cliente!.toLowerCase().includes(c.nombre.toLowerCase()),
        );
        if (match) setClienteId(match.id);
      }
      toast.success("Documento procesado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resumen = useMemo(() => {
    if (!data) return "";
    return [
      data.bl && `BL/AWB: ${data.bl}`,
      data.suplidor && `Suplidor: ${data.suplidor}`,
      data.numero_documento && `Nº Documento: ${data.numero_documento}`,
      data.productos && `Productos: ${data.productos}`,
    ].filter(Boolean).join("\n");
  }, [data]);

  const [notas, setNotas] = useState("");

  useMemo(() => {
    if (data) setNotas(resumen);
  }, [data, resumen]);

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        cliente_id: clienteId || null,
        tarifa_propuesta: null,
        moneda: "USD",
        fecha_emision: new Date().toISOString().slice(0, 10),
        notas: notas || null,
      };
      const { data: c, error } = await supabase.from("cotizaciones").insert(payload).select().single();
      if (error) throw error;
      return c;
    },
    onSuccess: (c: any) => {
      toast.success(`Cotización ${c.numero} creada`);
      nav({ to: "/cotizaciones/$id", params: { id: c.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/cotizaciones"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link>
        </Button>
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" /> OCR de documentos — Cotización
          </h1>
          <p className="text-sm text-muted-foreground">
            Sube un BL, factura o AWB en PDF/imagen. La IA extraerá los campos clave y creará un borrador de cotización.
          </p>
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
          <CardHeader><CardTitle className="text-base">2. Revisar y crear borrador</CardTitle></CardHeader>
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
            <div className="grid gap-1.5"><Label>BL / Conocimiento</Label><Input value={data.bl ?? ""} readOnly /></div>
            <div className="grid gap-1.5"><Label>Suplidor</Label><Input value={data.suplidor ?? ""} readOnly /></div>
            <div className="grid gap-1.5"><Label>Nº Documento</Label><Input value={data.numero_documento ?? ""} readOnly /></div>
            <div className="grid gap-1.5"><Label>Puerto de arribo (referencia)</Label><Input value={data.puerto_arribo ?? ""} readOnly /></div>
            <div className="grid gap-1.5 md:col-span-2"><Label>Productos</Label><Textarea rows={2} value={data.productos ?? ""} readOnly /></div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Notas (se guardarán en la cotización)</Label>
              <Textarea rows={5} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
            <p className="md:col-span-2 text-xs text-muted-foreground">
              Tipo de mercancía, origen, destino, incoterm, peso y volumen se completan manualmente en la ficha de la cotización.
            </p>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setData(null); setFile(null); }}>Descartar</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Creando…" : "Crear borrador de cotización"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
