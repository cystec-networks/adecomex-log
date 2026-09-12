import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { extractSolicitudFromDocument, type OcrExtraction } from "@/lib/ai-ocr.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, X, FileUp, Loader2, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DgaCombobox } from "@/components/dga-combobox";

export const Route = createFileRoute("/_authenticated/expedientes/nuevo")({
  component: NuevoExpediente,
});

function NuevoExpediente() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const extractFn = useServerFn(extractSolicitudFromDocument);

  const [blFile, setBlFile] = useState<File | null>(null);
  const [facFile, setFacFile] = useState<File | null>(null);
  const blRes = useRef<OcrExtraction | null>(null);
  const facRes = useRef<OcrExtraction | null>(null);
  const applied = useRef<Record<string, any>>({});
  const [contenedores, setContenedores] = useState<OcrExtraction["contenedores"]>(null);

  const { data: clientes } = useQuery({
    queryKey: ["clientes-lite"],
    queryFn: async () => (await supabase.from("clientes").select("id,nombre").order("nombre")).data ?? [],
  });

  const [form, setForm] = useState({
    cliente_id: "",
    bl_awb: "",
    factura_comercial: "",
    suplidor: "",
    naviera: "",
    puerto_arribo: "",
    puerto_arribo_codigo: "",
    puerto_salida: "",
    puerto_salida_codigo: "",
    fecha_cargado: "",
    fecha_compromiso: "",
    sla_dias: 5,
    observaciones: "",
    tipo_operacion: "Importación",
    tipo_carga: "",
    medio_transporte: "",
    pais_origen: "",
    pais_origen_codigo: "",
    pais_procedencia: "",
    pais_procedencia_codigo: "",
    incoterm: "",
    descripcion_mercancia: "",
    peso_bruto: "" as string | number,
    peso_neto: "" as string | number,
    contacto_solicitud: "",
    total_fob: "" as string | number,
    seguro: "" as string | number,
    flete: "" as string | number,
    otros: "" as string | number,
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const runExtract = async (f: File) => {
    if (f.size > 15 * 1024 * 1024) throw new Error("Archivo demasiado grande (máx 15MB).");
    const buf = await f.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return await extractFn({
      data: { filename: f.name, mime: f.type || "application/pdf", base64: btoa(binary) },
    });
  };

  const pick = <K extends keyof OcrExtraction>(
    a: OcrExtraction | null,
    b: OcrExtraction | null,
    k: K,
  ): OcrExtraction[K] | null => {
    const va = a ? a[k] : null;
    if (va !== null && va !== undefined && va !== "") return va;
    const vb = b ? b[k] : null;
    if (vb !== null && vb !== undefined && vb !== "") return vb;
    return null;
  };

  const combinar = (): OcrExtraction => {
    const bl = blRes.current;
    const fac = facRes.current;
    const fromBl = <K extends keyof OcrExtraction>(k: K) => pick(bl, fac, k);
    const fromFac = <K extends keyof OcrExtraction>(k: K) => pick(fac, bl, k);
    return {
      bl: fromBl("bl"),
      medio_transporte: fromBl("medio_transporte"),
      puerto_salida: fromBl("puerto_salida"),
      puerto_arribo: fromBl("puerto_arribo"),
      naviera: fromBl("naviera"),
      peso_bruto_kg: fromBl("peso_bruto_kg"),
      peso_neto_kg: fromBl("peso_neto_kg"),
      contenedores: fromBl("contenedores"),
      fecha_cargado: fromBl("fecha_cargado"),
      eta: fromBl("eta"),
      pais_procedencia: fromBl("pais_procedencia"),
      cliente: fromFac("cliente"),
      suplidor: fromFac("suplidor"),
      numero_documento: fromFac("numero_documento"),
      productos: fromFac("productos"),
      pais_origen: fromFac("pais_origen"),
      incoterm: fromFac("incoterm"),
      factura_comercial: fromFac("factura_comercial"),
      descripcion_mercancia: fromFac("descripcion_mercancia"),
      fob_total: fromFac("fob_total"),
      seguro: fromFac("seguro"),
      flete: fromFac("flete"),
      otros_gastos: fromFac("otros_gastos"),
    };
  };

  const resolverContraCatalogo = async (
    tabla: "dga_paises" | "dga_puertos",
    campoNombre: "pais" | "puerto",
    valorTexto: string | null,
  ): Promise<{ nombre: string | null; codigo: string | null }> => {
    if (!valorTexto) return { nombre: null, codigo: null };
    const { data } = await (supabase.from(tabla) as any)
      .select(`codigo, ${campoNombre}`)
      .ilike(campoNombre, `%${valorTexto}%`)
      .limit(1)
      .maybeSingle();
    return data ? { nombre: data[campoNombre], codigo: data.codigo } : { nombre: valorTexto, codigo: null };
  };

  const aplicarCombinado = async () => {
    const res = combinar();

    const [pOrigen, pProced, ptSalida, ptArribo] = await Promise.all([
      resolverContraCatalogo("dga_paises", "pais", res.pais_origen),
      resolverContraCatalogo("dga_paises", "pais", res.pais_procedencia),
      resolverContraCatalogo("dga_puertos", "puerto", res.puerto_salida),
      resolverContraCatalogo("dga_puertos", "puerto", res.puerto_arribo),
    ]);
    if (res.contenedores?.length) setContenedores(res.contenedores);

    const obs = [
      res.suplidor && `Suplidor: ${res.suplidor}`,
      res.numero_documento && `Nº Documento: ${res.numero_documento}`,
      res.productos && `Productos: ${res.productos}`,
    ]
      .filter(Boolean)
      .join("\n");

    setForm((f) => {
      const next: any = { ...f };
      // solo sobrescribe campos vacíos o que el usuario no haya editado a mano
      const put = (k: string, v: any) => {
        if (v === null || v === undefined || v === "") return;
        const actual = (f as any)[k];
        if (actual === "" || actual === null || actual === undefined || actual === applied.current[k]) {
          next[k] = v;
          applied.current[k] = v;
        }
      };
      put("bl_awb", res.bl);
      put("factura_comercial", res.factura_comercial ?? res.numero_documento);
      put("suplidor", res.suplidor);
      put("naviera", res.naviera);
      put("puerto_arribo", ptArribo.nombre);
      put("puerto_arribo_codigo", ptArribo.codigo);
      put("puerto_salida", ptSalida.nombre);
      put("puerto_salida_codigo", ptSalida.codigo);
      put("fecha_cargado", res.fecha_cargado);
      put("fecha_compromiso", res.eta);
      put("medio_transporte", res.medio_transporte ? (res.medio_transporte === "aereo" ? "Aéreo" : "Marítimo") : null);
      put("pais_origen", pOrigen.nombre);
      put("pais_origen_codigo", pOrigen.codigo);
      put("pais_procedencia", pProced.nombre);
      put("pais_procedencia_codigo", pProced.codigo);
      put("incoterm", res.incoterm);
      put("total_fob", res.fob_total);
      put("seguro", res.seguro);
      put("flete", res.flete);
      put("otros", res.otros_gastos);
      put("peso_bruto", res.peso_bruto_kg);
      put("peso_neto", res.peso_neto_kg);
      put("descripcion_mercancia", res.descripcion_mercancia || obs);
      put("observaciones", obs);
      return next;
    });

    if (res.cliente && clientes) {
      const match = (clientes as any[]).find(
        (c) =>
          c.nombre.toLowerCase().includes(res.cliente!.toLowerCase()) ||
          res.cliente!.toLowerCase().includes(c.nombre.toLowerCase()),
      );
      if (match) setForm((f) => (f.cliente_id ? f : { ...f, cliente_id: match.id }));
    }
  };

  const onBlExtracted = (res: OcrExtraction) => {
    blRes.current = res;
    aplicarCombinado();
    toast.success("BL procesado — revisa y ajusta los campos");
  };

  const onFacturaExtracted = (res: OcrExtraction) => {
    facRes.current = res;
    aplicarCombinado();
    toast.success("Factura procesada — revisa y ajusta los campos");
  };

  const confirmar = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.fecha_compromiso) payload.fecha_compromiso = null;
      if (!payload.fecha_cargado) payload.fecha_cargado = null;
      if (!payload.cliente_id) payload.cliente_id = null;
      payload.peso_bruto = payload.peso_bruto === "" ? null : Number(payload.peso_bruto);
      payload.peso_neto = payload.peso_neto === "" ? null : Number(payload.peso_neto);
      for (const k of ["total_fob", "seguro", "flete", "otros"]) {
        payload[k] = payload[k] === "" ? null : Number(payload[k]);
      }
      if (contenedores?.length) payload.numeros_contenedores = contenedores.map((c) => c.numero).join(", ");

      const { data, error } = await supabase.from("expedientes").insert(payload).select().single();
      if (error) throw error;

      if (contenedores?.length) {
        await supabase.from("expediente_contenedores").insert(
          contenedores.map((c, i) => ({
            expediente_id: data.id,
            item_no: i + 1,
            numero_contenedor: c.numero,
            sello1: c.sello1,
            sello2: c.sello2,
            tipo_contenedor: c.tipo,
          })),
        );
      }
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: data.id, accion: "creado" });
      return data;
    },
    onSuccess: (exp) => {
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      toast.success(`Expediente ${exp.numero} creado`);
      nav({ to: "/expedientes/$id", params: { id: exp.id }, search: { nuevo: "1" } });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="bg-emerald-50/40 min-h-screen">
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/expedientes">
              <ArrowLeft className="h-4 w-4 mr-1" />Volver
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold">Nuevo Expediente</h1>
            <p className="text-sm text-muted-foreground">
              Sube un BL o factura comercial para autollenar los campos, o complétalos a mano. El número se genera automáticamente.
            </p>
          </div>
          <Button variant="outline" onClick={() => nav({ to: "/expedientes" })}>
            <X className="h-4 w-4 mr-1" />Cancelar
          </Button>
          <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
            <Check className="h-4 w-4 mr-1" />{confirmar.isPending ? "Creando…" : "Crear expediente"}
          </Button>
        </div>

        {contenedores?.length ? (
          <p className="text-xs text-muted-foreground">{contenedores.length} contenedor(es) detectado(s)</p>
        ) : null}

        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Información general</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Cliente</Label>
              <Select value={form.cliente_id || undefined} onValueChange={(v) => set("cliente_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                <SelectContent>
                  {(clientes ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Tipo de operación</Label><Input value={form.tipo_operacion} onChange={(e) => set("tipo_operacion", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Tipo de carga</Label><Input value={form.tipo_carga} onChange={(e) => set("tipo_carga", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>BL / AWB / Guía</Label><Input value={form.bl_awb} onChange={(e) => set("bl_awb", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Factura comercial</Label><Input value={form.factura_comercial} onChange={(e) => set("factura_comercial", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Exportador / Suplidor</Label><Input value={form.suplidor} onChange={(e) => set("suplidor", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Contacto</Label><Input value={form.contacto_solicitud} onChange={(e) => set("contacto_solicitud", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Incoterm</Label><Input value={form.incoterm} onChange={(e) => set("incoterm", e.target.value)} placeholder="FOB, CIF, EXW…" /></div>
            <div className="grid gap-1.5"><Label>SLA (días)</Label><Input type="number" value={form.sla_dias} onChange={(e) => set("sla_dias", Number(e.target.value))} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Transporte y ruta</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Medio de transporte</Label>
              <Select value={form.medio_transporte || undefined} onValueChange={(v) => set("medio_transporte", v)}>
                <SelectTrigger><SelectValue placeholder="Selecciona medio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Marítimo">Marítimo</SelectItem>
                  <SelectItem value="Aéreo">Aéreo</SelectItem>
                  <SelectItem value="Terrestre">Terrestre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Naviera / Aerolínea</Label><Input value={form.naviera} onChange={(e) => set("naviera", e.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label>Puerto de salida</Label>
              <DgaCombobox
                table="dga_puertos"
                value={form.puerto_salida}
                codigo={form.puerto_salida_codigo}
                onChange={(nombre, codigo) => setForm((f) => ({ ...f, puerto_salida: nombre, puerto_salida_codigo: codigo }))}
                placeholder="Buscar puerto de salida"
              />
              {form.puerto_salida && !form.puerto_salida_codigo && (
                <span className="text-[11px] text-amber-700">Sin código DGA: selecciona el puerto del catálogo para el XML.</span>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Puerto de arribo</Label>
              <DgaCombobox
                table="dga_puertos"
                value={form.puerto_arribo}
                codigo={form.puerto_arribo_codigo}
                onChange={(nombre, codigo) => setForm((f) => ({ ...f, puerto_arribo: nombre, puerto_arribo_codigo: codigo }))}
                placeholder="Buscar puerto (catálogo DGA)"
              />
              {form.puerto_arribo && !form.puerto_arribo_codigo && (
                <span className="text-[11px] text-amber-700">Sin código DGA: selecciona el puerto del catálogo para el XML.</span>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>País de origen</Label>
              <DgaCombobox
                table="dga_paises"
                value={form.pais_origen}
                codigo={form.pais_origen_codigo}
                onChange={(nombre, codigo) => setForm((f) => ({ ...f, pais_origen: nombre, pais_origen_codigo: codigo }))}
                placeholder="Buscar país de origen"
              />
              {form.pais_origen && !form.pais_origen_codigo && (
                <span className="text-[11px] text-amber-700">Sin código DGA: selecciona el país del catálogo para el XML.</span>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>País de procedencia</Label>
              <DgaCombobox
                table="dga_paises"
                value={form.pais_procedencia}
                codigo={form.pais_procedencia_codigo}
                onChange={(nombre, codigo) => setForm((f) => ({ ...f, pais_procedencia: nombre, pais_procedencia_codigo: codigo }))}
                placeholder="Buscar país de procedencia"
              />
              {form.pais_procedencia && !form.pais_procedencia_codigo && (
                <span className="text-[11px] text-amber-700">Sin código DGA: selecciona el país del catálogo para el XML.</span>
              )}
            </div>
            <div className="grid gap-1.5"><Label>Fecha de cargado</Label><Input type="date" value={form.fecha_cargado} onChange={(e) => set("fecha_cargado", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>ETA / Fecha de llegada</Label><Input type="date" value={form.fecha_compromiso} onChange={(e) => set("fecha_compromiso", e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Mercancía</CardTitle>
          </CardHeader>
          <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5"><Label>Peso bruto (kg)</Label><Input type="number" value={form.peso_bruto} onChange={(e) => set("peso_bruto", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Peso neto (kg)</Label><Input type="number" value={form.peso_neto} onChange={(e) => set("peso_neto", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Valor FOB total</Label><Input type="number" value={form.total_fob} onChange={(e) => set("total_fob", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Seguro</Label><Input type="number" value={form.seguro} onChange={(e) => set("seguro", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Flete</Label><Input type="number" value={form.flete} onChange={(e) => set("flete", e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Otros gastos</Label><Input type="number" value={form.otros} onChange={(e) => set("otros", e.target.value)} /></div>
            <div className="grid gap-1.5 md:col-span-2 lg:col-span-3">
              <Label>Descripción de mercancía</Label>
              <Textarea rows={4} value={form.descripcion_mercancia} onChange={(e) => set("descripcion_mercancia", e.target.value)} />
            </div>
            <div className="grid gap-1.5 md:col-span-2 lg:col-span-3">
              <Label>Observaciones</Label>
              <Textarea rows={4} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Campos exclusivos del expediente</CardTitle>
            <p className="text-xs text-muted-foreground">Declaración DUA, Nº de despacho, Nº de permiso, Solicitud de permiso (VUCE), Etapa, mercancía, etc. se completan luego, desde el detalle del expediente.</p>
          </CardHeader>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => nav({ to: "/expedientes" })}>Cancelar</Button>
          <Button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}>
            <Check className="h-4 w-4 mr-1" />{confirmar.isPending ? "Creando…" : "Crear expediente"}
          </Button>
        </div>
      </div>
    </div>
  );
}
