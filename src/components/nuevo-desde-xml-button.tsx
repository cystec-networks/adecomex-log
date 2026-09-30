import { useState } from "react";
import { toast } from "sonner";
import { FileCode2, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { parsearXmlDua, XmlDuaError, type XmlDuaResultado } from "@/lib/siga-xml-import";

export type XmlAplicado = {
  campos: Record<string, any>;
  productos: any[];
  contenedores: Array<{ numero: string; sello1: string; sello2: string; tipo: string }>;
  clienteId: string | null;
  clienteNombre: string | null;
};

type Fila = { label: string; valor: string; estado: "ok" | "revisar" | "vacio"; nota?: string };

const soloDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

function medioDesdeNombre(nombre: string): string {
  const n = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (n.includes("mar") || n.includes("sea") || n.includes("ocean")) return "Marítimo";
  if (n.includes("aer") || n.includes("air")) return "Aéreo";
  if (n.includes("terr") || n.includes("land") || n.includes("road")) return "Terrestre";
  return nombre;
}

async function resolver(r: XmlDuaResultado) {
  const c = r.campos;
  const codPaises = [c.pais_origen_codigo, c.pais_procedencia_codigo, ...r.productos.map((p) => p.pais_origen_codigo)].filter(Boolean);
  const codPuertos = [c.puerto_arribo_codigo, c.puerto_salida_codigo].filter(Boolean);
  const [paises, puertos, areas, regs, acs, mts, clientes] = await Promise.all([
    codPaises.length ? supabase.from("dga_paises").select("codigo,pais").in("codigo", codPaises) : Promise.resolve({ data: [] as any[] }),
    codPuertos.length ? supabase.from("dga_puertos").select("codigo,puerto").in("codigo", codPuertos) : Promise.resolve({ data: [] as any[] }),
    c.area_aduanera_codigo ? supabase.from("dga_areas").select("codigo,area").eq("codigo", c.area_aduanera_codigo) : Promise.resolve({ data: [] as any[] }),
    c.regimen_codigo ? supabase.from("catalogo_regimenes").select("codigo,nombre,tipo_operacion").eq("codigo", c.regimen_codigo) : Promise.resolve({ data: [] as any[] }),
    c.acuerdo_codigo ? supabase.from("catalogo_acuerdos").select("codigo,nombre").eq("codigo", c.acuerdo_codigo) : Promise.resolve({ data: [] as any[] }),
    c.metodo_transporte_codigo ? supabase.from("catalogo_metodos_transporte").select("codigo,nombre").eq("codigo", c.metodo_transporte_codigo) : Promise.resolve({ data: [] as any[] }),
    supabase.from("clientes").select("id,nombre,rnc"),
  ]);
  const pais = new Map((paises.data ?? []).map((p: any) => [p.codigo, p.pais]));
  const puerto = new Map((puertos.data ?? []).map((p: any) => [p.codigo, p.puerto]));
  const area = (areas.data ?? [])[0] as any;
  const esExp = r.tipo === "Exportación";
  const regList = (regs.data ?? []) as any[];
  const reg = regList.find((x) => String(x.tipo_operacion ?? "").toLowerCase().startsWith(esExp ? "export" : "import")) ?? regList[0];
  const ac = (acs.data ?? [])[0] as any;
  const mt = (mts.data ?? [])[0] as any;
  const rnc = soloDigitos(r.clienteRnc);
  const cli = rnc ? ((clientes.data ?? []) as any[]).find((x) => soloDigitos(x.rnc) === rnc) : null;

  const filas: Fila[] = [];
  const campos: Record<string, any> = { tipo_operacion: r.tipo };
  const put = (label: string, keys: Record<string, any>, mostrar: string, estado?: Fila["estado"], nota?: string) => {
    const tiene = Object.values(keys).some((v) => v !== "" && v !== null && v !== undefined);
    if (tiene) Object.assign(campos, keys);
    filas.push({ label, valor: tiene ? mostrar : "", estado: estado ?? (tiene ? "ok" : "vacio"), nota });
  };
  const codNom = (label: string, cod: string, nom: string | undefined, kNom: string, kCod: string) => {
    if (!cod) return put(label, {}, "");
    if (nom) return put(label, { [kNom]: nom, [kCod]: cod }, `${nom} (${cod})`);
    // Código no está en nuestro catálogo: se guarda el código y se pide revisar.
    put(label, { [kCod]: cod }, cod, "revisar", "Código no encontrado en el catálogo");
  };

  filas.push({ label: "Tipo de operación", valor: r.tipo, estado: "ok" });
  if (cli) {
    filas.push({ label: "Cliente", valor: `${cli.nombre} (RNC ${cli.rnc})`, estado: "ok" });
  } else {
    filas.push({
      label: "Cliente",
      valor: r.clienteNombre ? `${r.clienteNombre}${rnc ? ` (RNC ${rnc})` : ""}` : "",
      estado: r.clienteNombre || rnc ? "revisar" : "vacio",
      nota: r.clienteNombre || rnc ? "No existe un cliente con ese RNC — selecciónalo o créalo" : undefined,
    });
  }
  put("BL / AWB", { bl_awb: c.bl_awb }, c.bl_awb);
  put("Factura comercial", { factura_comercial: c.factura_comercial }, c.factura_comercial);
  if (!esExp) put("Suplidor", { suplidor: c.suplidor, suplidor_rnc: c.suplidor_rnc }, [c.suplidor, c.suplidor_rnc].filter(Boolean).join(" · "));
  put("Naviera", { naviera: c.naviera }, c.naviera);
  codNom("Área aduanera", c.area_aduanera_codigo, area?.area, "area_aduanera", "area_aduanera_codigo");
  if (!esExp) {
    codNom("Puerto de arribo", c.puerto_arribo_codigo, puerto.get(c.puerto_arribo_codigo), "puerto_arribo", "puerto_arribo_codigo");
    codNom("País de procedencia", c.pais_procedencia_codigo, pais.get(c.pais_procedencia_codigo), "pais_procedencia", "pais_procedencia_codigo");
  } else {
    codNom("Puerto de salida", c.puerto_salida_codigo, puerto.get(c.puerto_salida_codigo), "puerto_salida", "puerto_salida_codigo");
  }
  codNom("País de origen", c.pais_origen_codigo, pais.get(c.pais_origen_codigo), "pais_origen", "pais_origen_codigo");
  if (c.metodo_transporte_codigo) {
    if (mt) put("Medio de transporte", { medio_transporte: medioDesdeNombre(mt.nombre), metodo_transporte_codigo: mt.codigo }, `${mt.nombre} (${mt.codigo})`);
    else put("Medio de transporte", { metodo_transporte_codigo: c.metodo_transporte_codigo }, c.metodo_transporte_codigo, "revisar", "Código no encontrado en el catálogo");
  } else put("Medio de transporte", {}, "");
  if (c.regimen_codigo) {
    if (reg) {
      put("Régimen", esExp ? { regimen_codigo_exportacion: reg.codigo } : { regimen_aduanero: reg.nombre }, `${reg.nombre} (${reg.codigo})`);
    } else put("Régimen", {}, c.regimen_codigo, "revisar", "Código no encontrado en el catálogo — elígelo a mano");
  } else put("Régimen", {}, "");
  if (c.acuerdo_codigo) {
    if (ac) put("Acuerdo comercial", { acuerdo_codigo: ac.codigo, acuerdo_comercial: ac.nombre }, `${ac.nombre} (${ac.codigo})`);
    else put("Acuerdo comercial", {}, c.acuerdo_codigo, "revisar", "Código no encontrado en el catálogo — elígelo a mano");
  } else put("Acuerdo comercial", {}, "");
  put("Fecha estimada (ETA)", { fecha_compromiso: c.fecha_compromiso }, c.fecha_compromiso);
  if (esExp) put("Fecha de declaración", { fecha_recibido: c.fecha_recibido }, c.fecha_recibido);
  const money = (n: number | null) => (n == null ? "" : n.toLocaleString("es-DO", { minimumFractionDigits: 2 }));
  put("FOB total", { total_fob: c.total_fob }, money(c.total_fob));
  put("Seguro", { seguro: c.seguro }, money(c.seguro));
  put("Flete", { flete: c.flete }, money(c.flete));
  put("Otros", { otros: c.otros }, money(c.otros));
  put("Peso bruto (kg)", { peso_bruto: c.peso_bruto }, String(c.peso_bruto ?? ""));
  put("Peso neto (kg)", { peso_neto: c.peso_neto }, String(c.peso_neto ?? ""));
  put("Permiso VUCE", { numero_vuce: c.numero_vuce }, c.numero_vuce);
  put("Observaciones", { observaciones: c.observaciones }, c.observaciones);
  if (esExp) {
    put("Comprador", { buyer_codigo: c.buyer_codigo, buyer_nombre: c.buyer_nombre, buyer_nacionalidad: c.buyer_nacionalidad }, [c.buyer_nombre, c.buyer_codigo].filter(Boolean).join(" · "));
    put("Declarante", { declarante_codigo: c.declarante_codigo, declarante_nombre: c.declarante_nombre, declarante_nacionalidad: c.declarante_nacionalidad }, [c.declarante_nombre, c.declarante_codigo].filter(Boolean).join(" · "));
    const zf = { zf_valor_cif: c.zf_valor_cif, zf_valor_materiales: c.zf_valor_materiales, zf_valor_salario: c.zf_valor_salario, zf_valor_servicio: c.zf_valor_servicio, zf_otros_valores: c.zf_otros_valores };
    const conZf = Object.values(zf).some((v) => v);
    put("Zona Franca", conZf ? zf : {}, conZf ? "Valores cargados" : "");
  }

  const productos = r.productos.map((p, i) => ({
    ...p,
    id: `xml-${Date.now()}-${i}`,
    item_no: i + 1,
    pais_origen: pais.get(p.pais_origen_codigo) ?? null,
    estado_producto_codigo: p.estado_producto_codigo || null,
  }));
  const sinArancel = productos.filter((p) => !p.codigo_arancelario).length;
  filas.push({
    label: "Líneas de mercancía",
    valor: productos.length ? `${productos.length} línea(s)` : "",
    estado: !productos.length ? "vacio" : sinArancel ? "revisar" : "ok",
    nota: sinArancel ? `${sinArancel} sin código arancelario` : undefined,
  });
  filas.push({
    label: "Contenedores",
    valor: r.contenedores.length ? r.contenedores.map((x) => x.numero).join(", ") : "",
    estado: r.contenedores.length ? "ok" : "vacio",
    nota: !r.contenedores.length && !esExp ? "El DUA de importación no incluye contenedores; agrégalos a mano" : undefined,
  });

  const aplicado: XmlAplicado = {
    campos,
    productos,
    contenedores: r.contenedores,
    clienteId: cli?.id ?? null,
    clienteNombre: cli ? null : r.clienteNombre || null,
  };
  return { filas, aplicado };
}

export function NuevoDesdeXmlButton({ onAplicar }: { onAplicar: (d: XmlAplicado) => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ filas: Fila[]; aplicado: XmlAplicado; advertencias: string[] } | null>(null);

  const reset = () => { setFile(null); setError(null); setRes(null); setCargando(false); };

  const leer = async () => {
    if (!file) return;
    setCargando(true); setError(null); setRes(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new XmlDuaError("Archivo demasiado grande (máx 10MB).");
      const parsed = parsearXmlDua(await file.text());
      const { filas, aplicado } = await resolver(parsed);
      setRes({ filas, aplicado, advertencias: parsed.advertencias });
    } catch (e: any) {
      setError(e instanceof XmlDuaError ? e.message : `No se pudo leer el archivo: ${e?.message ?? "error desconocido"}`);
    } finally {
      setCargando(false);
    }
  };

  const llenos = res?.filas.filter((f) => f.estado === "ok").length ?? 0;
  const revisar = res?.filas.filter((f) => f.estado === "revisar").length ?? 0;
  const vacios = res?.filas.filter((f) => f.estado === "vacio").length ?? 0;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <FileCode2 className="h-4 w-4 text-accent" />
        Nuevo desde XML
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5 text-accent" /> Nuevo expediente desde XML (DUA / SIGA)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label>Archivo XML de Importación o Exportación</Label>
              <Input type="file" accept=".xml,text/xml,application/xml" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); setError(null); }} />
            </div>
            {!res && (
              <Button onClick={leer} disabled={!file || cargando}>
                {cargando ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Leyendo…</> : <>Leer XML</>}
              </Button>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                <div>
                  <div className="font-medium">{error}</div>
                  <div className="text-muted-foreground">Puedes cerrar esta ventana y llenar el formulario a mano.</div>
                </div>
              </div>
            )}
            {res && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3 text-success" />{llenos} llenados</Badge>
                  <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3 text-warning" />{revisar} por revisar</Badge>
                  <Badge variant="outline" className="gap-1 text-muted-foreground">{vacios} vacíos (completar a mano)</Badge>
                </div>
                {res.advertencias.map((a) => (
                  <div key={a} className="text-xs text-muted-foreground">• {a}</div>
                ))}
                <div className="rounded-md border divide-y text-sm">
                  {res.filas.map((f) => (
                    <div key={f.label} className="grid grid-cols-[1.25rem_10rem_1fr] items-start gap-2 px-3 py-1.5">
                      {f.estado === "ok" ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5" />
                        : f.estado === "revisar" ? <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                        : <span className="mt-1.5 h-2 w-2 rounded-full bg-muted-foreground/40 justify-self-center" />}
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="min-w-0 break-words">
                        {f.valor || <span className="text-muted-foreground">— vacío</span>}
                        {f.nota && <span className="block text-xs text-warning">{f.nota}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Nada se guarda todavía: los datos pasan al formulario para que los revises y pulses "Crear expediente".</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>
            {res && (
              <Button onClick={() => { onAplicar(res.aplicado); setOpen(false); reset(); toast.success("Datos del XML cargados — revisa y ajusta antes de crear"); }}>
                Usar estos datos
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
