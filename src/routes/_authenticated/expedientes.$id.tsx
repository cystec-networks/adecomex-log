import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { sha256File, prefijoSiga, siguienteCodigoSiga, validarNombreSiga, nombreArchivo } from "@/lib/codigo-siga";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EndosoBadge, EndosoSection } from "@/components/expediente-endoso";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, CheckCircle2, Circle, Clock, Upload, Plus, FileText, AlertTriangle, DollarSign, Pencil, Trash2, Copy, ExternalLink, Search, Scale, ShieldCheck, LayoutGrid, FileCheck, Download, Check, FileOutput, ChevronDown, RefreshCw, Globe, Ship, Container, MoreVertical, Printer, Repeat2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { fmtLocalDate, parseLocalDate, daysFromToday, hoyRD, hoyRDISO } from "@/lib/dates";
import { calcImpuestosLinea } from "@/lib/impuestos";
import { buildPreLiquidacionPdf } from "@/lib/pdf-preliquidacion";
import { ImpuestosSuspCtx, useImpuestosSusp, useEstadoSuspensivo, esRegimenSuspensivo } from "@/lib/impuestos";
import { SolicitudReembolsoPdfButton } from "@/components/solicitud-reembolso-pdf-button";
import { ReembolsoEstadoControl } from "@/components/reembolso-estado-control";
import { useTasaCambioForExpediente, debeCongelar } from "@/lib/tasa-cambio";
import { AutoField } from "@/components/auto-field";
import { BadgeVigenciaPinDga } from "@/components/badge-vigencia";
import { AplicarCertificadoPartidas } from "@/components/aplicar-certificado-partidas";
import { OficioRectificacionButton } from "@/components/oficio-rectificacion-button";
import { PaqueteRectificacionButton } from "@/components/paquete-rectificacion-button";
import { CorreoDgaButton } from "@/components/correo-dga-button";

import { CatalogCombobox } from "@/components/catalog-combobox";
import { CatalogoAutocomplete } from "@/components/catalogo-autocomplete";
import { DepositoDestinoField } from "@/components/deposito-destino-field";
import { DgaCombobox } from "@/components/dga-combobox";
import { DgaProductoSearch } from "@/components/dga-producto-search";
import { normalizarNombre, patronSinTildes } from "@/lib/search-filter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { GenerarXmlSigaButton } from "@/components/generar-xml-siga";
import { GenerarXmlCertificadoOrigenButton } from "@/components/generar-xml-certificado-origen";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { EmailButton } from "@/components/email-button";
import { SearchEmailButton } from "@/components/search-email-button";
import { ChecklistHitos } from "@/components/checklist-hitos";
import { FacturaEcfSelector } from "@/components/factura-ecf-selector";
import { EscanearFacturaButton } from "@/components/escanear-factura-button";
import { TIPOS_BIENES_SERVICIOS, TIPOS_RETENCION_ISR } from "@/lib/fiscal-606";
import { PortadaExpedienteButton } from "@/components/portada-expediente-button";
import { ESTADO_LABEL, ESTADO_ORDEN, estadoIndex, validarAvanceEstado, fechasDespachoFaltantes } from "@/lib/estados-expediente";
import { usePlazosRegimen, plazoEfectivo, diasRegimen, venceEn, habilesRestantes, diasHabilesEntre } from "@/lib/plazo-presentacion";
import { VencePresentacion } from "@/components/vence-presentacion";
import { unitFob, loadBrokerConfig } from "@/lib/siga-xml";
import { useMyRoles, useCurrentUser } from "@/lib/auth-hooks";
import { duplicarExpediente } from "@/lib/duplicar-expediente";
import { DocumentoPreviewButton } from "@/components/documento-preview-dialog";
import { GenerarDocumentoButton } from "@/components/generar-documento-dialog";
import { TerceroExtranjeroPicker } from "@/components/terceros-extranjeros";
import { TabRecepcion } from "@/components/tab-recepcion";
import { EscanearBlButton, EscanearFacturaButton as EscanearFacturaExpButton } from "@/components/escanear-documento-expediente-buttons";
import { NuevoDesdeXmlButton } from "@/components/nuevo-desde-xml-button";
import { type OcrExtraction } from "@/lib/ai-ocr.functions";
import {
  HerramientasDgaVuceItems,
  HerramientasDgaVuceMenu,
  RastreosEnvioItems,
  RastreosEnvioMenu,
} from "@/components/accesos-rapidos-expediente";
import {
  FORMULARIO_DUA_RD,
  ServicioAduaneroFields,
  servicioAduaneroDeExpediente,
  useServicioAduaneroTotales,
  useFilasServicioAduanero,
  guardarFilasServicioAduanero,
  type FilaServicio,
} from "@/lib/servicio-aduanero";


const SUG_MEDIO = ["Marítimo", "Aéreo", "Terrestre", "Courier", "Multimodal"];
const SUG_NAVIERA = ["Maersk", "MSC", "CMA CGM", "Hapag-Lloyd", "Evergreen", "ONE", "Cosco", "Seaboard Marine", "King Ocean", "ZIM", "Copa Cargo", "DHL", "FedEx", "UPS"];
const SUG_PAIS = ["China", "Estados Unidos", "España", "México", "Colombia", "Panamá", "Brasil", "Alemania", "Italia", "Turquía", "India", "Corea del Sur", "Japón", "Vietnam", "Chile", "Argentina", "Perú", "Guatemala", "Costa Rica", "Países Bajos"];
const SUG_INCOTERM = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const SUG_PUERTO_SALIDA = ["Shanghai", "Ningbo", "Shenzhen", "Hong Kong", "Busan", "Kaohsiung", "Miami", "Port Everglades", "Jacksonville", "Houston", "New York", "Valencia", "Barcelona", "Algeciras", "Rotterdam", "Hamburgo", "Amberes", "Cartagena", "Manzanillo (PA)", "Balboa"];
const SUG_PUERTO_ARRIBO = ["Puerto Multimodal Caucedo", "Puerto de Haina Oriental", "Puerto de Haina Occidental", "Puerto de Río Haina", "Puerto de Boca Chica", "Puerto de Manzanillo", "Puerto Plata", "AILA (Las Américas)", "AIC (Cibao)", "AIP (Punta Cana)", "Aeropuerto La Isabela"];
const SUG_PREFERENCIA = ["DR-CAFTA", "EPA (Unión Europea)", "ALADI", "SGP", "Ninguna"];

const searchSchema = z.object({
  nuevo: fallback(z.string(), "").default(""),
  solicitud: fallback(z.string(), "").default(""),
  tipo: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/expedientes/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de Expediente | ADECOMEX" },
      { name: "description", content: "Consulta y gestión del expediente de importación en ADECOMEX." },
      { property: "og:title", content: "Detalle de Expediente | ADECOMEX" },
      { property: "og:description", content: "Consulta y gestión del expediente de importación en ADECOMEX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: DetalleExpediente,
});

// Helpers para inputs `datetime-local` (vigencia del PIN de pago DGA).
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localInputToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
// Fecha de Término = Fecha de registro + 96 horas exactas.
function terminoPin(registroLocal: string): string {
  const d = new Date(registroLocal);
  if (isNaN(d.getTime())) return "";
  return isoToLocalInput(new Date(d.getTime() + 96 * 3600000).toISOString());
}

// PIN de pago Almacenaje / Contenedor (Resultado oficial DGA).
const OPCIONES_PIN_ALMACENAJE = ["DPW", "HIT", "RODEMSA", "GLOBAL STORE", "DIF", "TD BONDED", "ALMADELA", "HAINA BONDED"];
const OPCIONES_PIN_CONTENEDOR = ["DPH", "FDA", "PORTCOLLECT", "VECONINTER"];
function normalizarPinesPago(payload: any) {
  for (const k of [
    "pin_almacenaje", "pin_almacenaje_fecha_registro", "pin_almacenaje_fecha_pago",
    "pin_contenedor", "pin_contenedor_fecha_registro", "pin_contenedor_fecha_pago",
    "valores_enviados_at",
  ]) {
    if (!payload[k]) payload[k] = null;
  }
  for (const k of ["pin_almacenaje_monto", "pin_contenedor_monto"]) {
    payload[k] = payload[k] === "" || payload[k] == null ? null : Number(payload[k]);
  }
  payload.valores_enviados = !!payload.valores_enviados;
  // Fechas vacías → NULL (Postgres no acepta '' en columnas date/timestamp).
  for (const k of CAMPOS_FECHA_EXPEDIENTE) {
    if (k in payload && (payload[k] === "" || (typeof payload[k] === "string" && !payload[k].trim()))) payload[k] = null;
  }
}
const CAMPOS_FECHA_EXPEDIENTE = [
  "certificado_periodo_desde", "certificado_periodo_hasta", "fecha_aprobacion_despacho", "fecha_cargado",
  "fecha_cierre", "fecha_compromiso", "fecha_despachado", "fecha_en_transito", "fecha_entregado",
  "fecha_facturado", "fecha_llegada_real", "fecha_presentado", "fecha_presentacion_real", "fecha_recibido", "fecha_tasa_manual",
  "fecha_verificado", "impuestos_override_at", "liq_siga_fecha_pago", "liq_siga_fecha_registro",
  "liq_siga_registro_at", "liq_siga_termino_at", "reembolso_fecha_pago", "reembolso_generado_at",
  "eliminado_en",
];


const TIPOS_DOC = [
  "Factura proforma","Factura comercial","Bill of Lading","Guía aérea","Lista de empaque",
  "Certificado de origen","Certificado Sanitario/Fitosanitario","Certificado de análisis",
  "Declaración Única Aduanera (DUA)","Reporte de Liquidación de Impuestos",
  "Permiso VUCE previo","Orden de compra",
  "Carta de instrucción","Póliza de seguro","DUA","Evidencia de entrega","Otro",
];

const CHECKLIST_DOCUMENTOS_BASE = [
  "Declaración Única Aduanera (DUA)","Reporte de Liquidación de Impuestos",
  "Factura comercial","Bill of Lading","Lista de empaque",
  "Certificado de origen","Certificado Sanitario/Fitosanitario","Certificado de análisis",
];

const DOC_ESTADO_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  pendiente: { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Pendiente" },
  recibido: { dot: "bg-emerald-500", text: "text-emerald-600", label: "Recibido" },
  observado: { dot: "bg-amber-500", text: "text-amber-600", label: "Observado" },
  aprobado: { dot: "bg-emerald-700", text: "text-emerald-700", label: "Aprobado" },
  vencido: { dot: "bg-destructive", text: "text-destructive", label: "Vencido" },
};

const TIPOS_INCIDENCIA = [
  "Documento faltante","Inconsistencia en factura","Diferencia de peso/cantidad",
  "Retención en aduana","Inspección física","Retraso de naviera","Cargo adicional","Dirección incorrecta","Otro",
];

const CONCEPTOS_COSTO_ADICIONALES = [
  "Gestión Aduanal", "Almacenaje", "Demora de contenedor", "Uso de Chasis", "Flete Terrestre", "Cargos Locales",
  "Gastos en Puerto", "Tasa Servicio Aduanero", "Declaración Única Aduanera", "Otros",
];
const CONCEPTOS_COSTO = [
  "Flete internacional","Seguro","Gastos portuarios","Manejo de terminal","Honorarios",
  "Aranceles","ITBIS","Transporte local","Otros",
];

const CONCEPTOS_FACTURA = [
  "Honorarios","Transporte","Gestión aduanal","Reembolso de gastos","Servicios adicionales","Otros",
];
const ESTADOS_FACTURA = ["pendiente","cobrada","anulada"];

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="h-9 px-3 rounded-md border bg-background/50 flex items-center text-sm">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

const TAB_ORDER_KEY = "exp-tab-order-v1";
const TAB_LABELS: Record<string, string> = {
  info: "Generales",
  checklist: "Seguimientos",
  liqfinal: "Liquidación",
  docs: "Documentos",
  permisos: "Permisos",
  transportes: "Transportes",
  recepcion: "Recepción",
  inc: "Incidencias",
  cost: "Finanzas",
  costprod: "Costos",
  aud: "Auditoría",
};
const DEFAULT_TAB_ORDER = Object.keys(TAB_LABELS);

// Timestamp del último guardado propio por expediente, para no auto-avisar por Realtime.
const ultimoGuardadoPropio = new Map<string, number>();

type EstadoGuardadoHeader = { hayCambios: boolean; editable: boolean; puedeEditar: boolean; pendiente: boolean; estado: "ok" | "error" | null } | null;
function publicarEstadoGuardado(e: EstadoGuardadoHeader) {
  if (typeof window === "undefined") return;
  (window as any).__expGuardado = e;
  window.dispatchEvent(new CustomEvent("exp-guardado-estado", { detail: e }));
}

function ControlesGuardadoHeader({ expedienteId, compacto = false }: { expedienteId: string; compacto?: boolean }) {
  const qc = useQueryClient();
  const [st, setSt] = useState<EstadoGuardadoHeader>(null);
  useEffect(() => {
    setSt((window as any).__expGuardado ?? null);
    const h = (ev: Event) => setSt((ev as CustomEvent).detail ?? null);
    window.addEventListener("exp-guardado-estado", h);
    return () => window.removeEventListener("exp-guardado-estado", h);
  }, []);
  const [refrescando, setRefrescando] = useState(false);
  const refrescar = async () => {
    setRefrescando(true);
    try { await refrescarExpediente(qc, expedienteId); await qc.invalidateQueries(); } finally { setRefrescando(false); }
  };
  return (
    <div className={compacto ? "flex items-center gap-1" : "flex items-center gap-1.5 border-l pl-1.5"}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-xs" role="status" title={st?.estado === "error" ? "No se pudo guardar, intenta de nuevo" : st?.hayCambios ? "Cambios sin guardar" : st?.estado === "ok" ? "Cambios guardados" : undefined}>
        {st?.estado === "error" ? <span className="text-destructive">✗<span className="sr-only">No se pudo guardar, intenta de nuevo</span></span> : st?.hayCambios ? <span className="h-2 w-2 rounded-full bg-warning"><span className="sr-only">Cambios sin guardar</span></span> : st?.estado === "ok" ? <span className="text-success">✓<span className="sr-only">Cambios guardados</span></span> : null}
      </span>
      {st?.puedeEditar ? (
        <Button size={compacto ? "sm" : "default"} className={compacto ? "w-24 shrink-0" : "w-32 shrink-0"} onClick={() => window.dispatchEvent(new Event("exp-editar"))} aria-label="Editar">
          <Pencil className="h-4 w-4 mr-1" /> Editar
        </Button>
      ) : (
        <Button
          size={compacto ? "sm" : "default"}
          className={compacto ? "relative w-24 shrink-0 px-3" : "relative w-32 shrink-0 px-3"}
          disabled={!st?.editable || st?.pendiente}
          onClick={() => window.dispatchEvent(new Event("exp-guardar"))}
          title={st ? "Guardar cambios" : "En esta ficha cada registro se guarda desde su propia ventana"}
          aria-label="Guardar cambios"
        >
          {st?.hayCambios && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background bg-amber-500" />}
          {st?.pendiente ? "Guardando…" : compacto ? "Guardar" : "Guardar cambios"}
        </Button>
      )}
      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={refrescar} disabled={refrescando} title="Refrescar datos del Expediente">
        <RefreshCw className={"h-4 w-4" + (refrescando ? " animate-spin" : "")} />
      </Button>
    </div>
  );
}

function refrescarExpediente(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: ["expediente", id] });
  qc.invalidateQueries({ queryKey: ["expedientes"] });
  qc.invalidateQueries({ queryKey: ["expedientes-hist"] });
  qc.invalidateQueries({ queryKey: ["etapas", id] });
  qc.invalidateQueries({ queryKey: ["mercancia-items", id] });
  qc.invalidateQueries({ queryKey: ["documentos", id] });
  qc.invalidateQueries({ queryKey: ["incidencias", id] });
  qc.invalidateQueries({ queryKey: ["costos", id] });
  qc.invalidateQueries({ queryKey: ["costos_producto", id] });
  qc.invalidateQueries({ queryKey: ["costos-producto-liq", id] });
  qc.invalidateQueries({ queryKey: ["facturas", id] });
  qc.invalidateQueries({ queryKey: ["gastos", id] });
  qc.invalidateQueries({ queryKey: ["rentabilidad", id] });
  toast.success("Actualizado");
}

// Expediente en blanco usado cuando la pantalla funciona en modo creación (id === "nuevo").
const EXPEDIENTE_VACIO: any = {
  id: "nuevo",
  numero: "",
  estado: "digitar",
  cliente_id: null,
  clientes: null,
  solicitudes: null,
  bl_awb: "",
  tipo_operacion: "Importación",
  sla_dias: 5,
};

function pickOcr<K extends keyof OcrExtraction>(
  a: OcrExtraction | null,
  b: OcrExtraction | null,
  k: K,
): OcrExtraction[K] | null {
  const va = a ? a[k] : null;
  if (va !== null && va !== undefined && (va as any) !== "") return va;
  const vb = b ? b[k] : null;
  if (vb !== null && vb !== undefined && (vb as any) !== "") return vb;
  return null;
}

function combinarOcr(bl: OcrExtraction | null, fac: OcrExtraction | null): OcrExtraction {
  const fromBl = <K extends keyof OcrExtraction>(k: K) => pickOcr(bl, fac, k);
  const fromFac = <K extends keyof OcrExtraction>(k: K) => pickOcr(fac, bl, k);
  return {
    bl: fromBl("bl"),
    medio_transporte: fromBl("medio_transporte"),
    puerto_salida: fromBl("puerto_salida"),
    puerto_arribo: fromBl("puerto_arribo"),
    naviera: fromBl("naviera"),
    buque: fromBl("buque"),
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
    notify_party: fromBl("notify_party"),
    agente_entrega: fromBl("agente_entrega"),
    tipo_carga: fromBl("tipo_carga"),
    tipo_carga_confianza: fromBl("tipo_carga_confianza"),
  };
}

async function resolverContraCatalogo(
  tabla: "dga_paises" | "dga_puertos",
  campoNombre: "pais" | "puerto",
  valorTexto: string | null,
): Promise<{ nombre: string | null; codigo: string | null }> {
  if (!valorTexto) return { nombre: null, codigo: null };
  const { data } = await (supabase.from(tabla) as any)
    .select(`codigo, ${campoNombre}`)
    .ilike(campoNombre, `%${valorTexto}%`)
    .limit(1)
    .maybeSingle();
  return data ? { nombre: data[campoNombre], codigo: data.codigo } : { nombre: valorTexto, codigo: null };
}

const normalizarCliente = (s: string) =>
  s.toLowerCase().replace(/[.,]/g, "").replace(/\bs\.?r\.?l\.?\b/g, "srl").replace(/\s+/g, " ").trim();

export type OcrAplicado = {
  seq: number;
  campos: Record<string, any>;
  contenedores: OcrExtraction["contenedores"];
  cliente: string | null;
  /** Solo desde XML: líneas de mercancía, cliente por RNC y reemplazo total de campos. */
  productos?: any[];
  clienteId?: string | null;
  desdeXml?: boolean;
  tipoCargaConfianza?: "alta" | "media" | null;
};

function DetalleExpediente() {
  const { id } = Route.useParams();
  const { nuevo, tipo: tipoParam } = Route.useSearch();
  const isNuevo = id === "nuevo";
  const navExp = useNavigate();
  const qc = useQueryClient();
  const [tabOrder, setTabOrder] = useState<string[]>(DEFAULT_TAB_ORDER);
  const [tabActiva, setTabActiva] = useState("info");
  const [nuevoAccionesHost, setNuevoAccionesHost] = useState<HTMLDivElement | null>(null);
  const [solicitudEndoso, setSolicitudEndoso] = useState(0);
  const abrirEndoso = () => {
    setTabActiva("info");
    setSolicitudEndoso((v) => v + 1);
  };
  const imprimirFichaGenerales = () => {
    setTabActiva("info");
    const limpiar = () => {
      document.documentElement.classList.remove("print-ficha-generales");
      window.dispatchEvent(new CustomEvent("ficha-print-mode", { detail: false }));
    };
    window.addEventListener("afterprint", limpiar, { once: true });
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("ficha-print-mode", { detail: true }));
      setTimeout(() => {
        document.documentElement.classList.add("print-ficha-generales");
        window.print();
        setTimeout(limpiar, 500);
      }, 250);
    }, 150);
  };
  const dragTab = useRef<string | null>(null);
  const [modoEdicion, setModoEdicion] = useState(!!nuevo || isNuevo);
  const { data: roles } = useMyRoles();
  const { data: plazosReg } = usePlazosRegimen();
  const canEditExpediente = (roles ?? []).some((r) =>
    ["admin", "finanzas", "operaciones", "agente_aduanal", "contabilidad"].includes(r),
  );

  // OCR (solo modo creación): BL y Factura se combinan y se aplican al formulario.
  const blRes = useRef<OcrExtraction | null>(null);
  const facRes = useRef<OcrExtraction | null>(null);
  const ocrSeq = useRef(0);
  const [ocrAplicado, setOcrAplicado] = useState<OcrAplicado | null>(null);

  const aplicarCombinado = async () => {
    const res = combinarOcr(blRes.current, facRes.current);
    const [pOrigen, pProced, ptSalida, ptArribo] = await Promise.all([
      resolverContraCatalogo("dga_paises", "pais", res.pais_origen),
      resolverContraCatalogo("dga_paises", "pais", res.pais_procedencia),
      resolverContraCatalogo("dga_puertos", "puerto", res.puerto_salida),
      resolverContraCatalogo("dga_puertos", "puerto", res.puerto_arribo),
    ]);
    const obs = [
      res.suplidor && `Suplidor: ${res.suplidor}`,
      res.numero_documento && `Nº Documento: ${res.numero_documento}`,
      res.productos && `Productos: ${res.productos}`,
    ].filter(Boolean).join("\n");

    ocrSeq.current += 1;
    setOcrAplicado({
      seq: ocrSeq.current,
      cliente: res.cliente ?? null,
      contenedores: res.contenedores ?? null,
      campos: {
        bl_awb: res.bl,
        factura_comercial: res.factura_comercial ?? res.numero_documento,
        suplidor: res.suplidor,
        naviera: res.naviera,
        puerto_arribo: ptArribo.nombre,
        puerto_arribo_codigo: ptArribo.codigo,
        puerto_salida: ptSalida.nombre,
        puerto_salida_codigo: ptSalida.codigo,
        fecha_cargado: res.fecha_cargado,
        medio_transporte: res.medio_transporte
          ? (res.medio_transporte === "aereo" ? "Aéreo" : "Marítimo")
          : null,
        pais_origen: pOrigen.nombre,
        pais_origen_codigo: pOrigen.codigo,
        pais_procedencia: pProced.nombre,
        pais_procedencia_codigo: pProced.codigo,
        incoterm: res.incoterm,
        total_fob: res.fob_total,
        seguro: res.seguro,
        flete: res.flete,
        otros: res.otros_gastos,
        peso_bruto: res.peso_bruto_kg,
        peso_neto: res.peso_neto_kg,
        descripcion_mercancia: res.descripcion_mercancia || obs,
        observaciones: obs,
        tipo_carga: res.tipo_carga,
      },
      tipoCargaConfianza: res.tipo_carga_confianza ?? null,
    });
  };

  // Aviso en tiempo real cuando otro usuario actualiza este expediente.
  useEffect(() => {
    if (isNuevo) return;
    const channel = supabase
      .channel(`expediente-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "expedientes", filter: `id=eq.${id}` },
        async (payload: any) => {
          // Solo avisar si el cambio lo hizo OTRA persona (el trigger fija updated_by).
          const autor = payload?.new?.updated_by as string | null | undefined;
          if (!autor) return;
          const { data: s } = await supabase.auth.getSession();
          if (autor === s.session?.user?.id) return;
          toast.info("Este expediente fue actualizado por otro usuario.", {
            action: { label: "Recargar", onClick: () => refrescarExpediente(qc, id) },
            duration: 15000,
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, qc, isNuevo]);


  const normalizeOrder = (saved: string[]) => {
    const valid = saved.filter((k) => DEFAULT_TAB_ORDER.includes(k));
    return [...valid, ...DEFAULT_TAB_ORDER.filter((k) => !valid.includes(k))];
  };

  // Carga el orden guardado: primero el del navegador (instantáneo), luego el del usuario en la nube
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAB_ORDER_KEY);
      if (raw) setTabOrder(normalizeOrder(JSON.parse(raw) as string[]));
    } catch { /* noop */ }

    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("preferencias_usuario")
        .select("valor")
        .eq("user_id", uid)
        .eq("clave", TAB_ORDER_KEY)
        .maybeSingle();
      const valor = data?.valor;
      if (!cancelled && Array.isArray(valor)) setTabOrder(normalizeOrder(valor as string[]));
    })();
    return () => { cancelled = true; };
  }, []);

  const persistTabOrder = async (next: string[]) => {
    try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(next)); } catch { /* noop */ }
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { error } = await supabase
      .from("preferencias_usuario")
      .upsert({ user_id: uid, clave: TAB_ORDER_KEY, valor: next }, { onConflict: "user_id,clave" });
    if (error) {
      console.error("No se pudo guardar el orden de pestañas:", error);
      toast.error("No se pudo guardar el orden de las pestañas");
    }
  };



  const { data: exp } = useQuery({
    queryKey: ["expediente", id],
    enabled: !isNuevo,
    queryFn: async () => (await supabase.from("expedientes").select("*, clientes(*), solicitudes(numero)").eq("id", id).maybeSingle()).data,
  });

  const { data: hitosHeader } = useQuery({
    queryKey: ["expediente-hitos-header", id],
    enabled: !isNuevo,
    queryFn: async () => {
      const { data } = await supabase.from("expediente_hitos")
        .select("estado, catalogo_hitos!inner(activo)")
        .eq("expediente_id", id)
        .eq("catalogo_hitos.activo", true);
      return data ?? [];
    },
  });

  const { data: permisosHeader } = useQuery({
    queryKey: ["permisos-por-expediente", id],
    enabled: !isNuevo,
    queryFn: async () => {
      const { data, error } = await supabase.from("permisos").select("*").eq("expediente_id", id).is("eliminado_en", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: documentosHeader } = useQuery({
    queryKey: ["documentos", id],
    enabled: !isNuevo,
    queryFn: async () => {
      const { data, error } = await supabase.from("documentos").select("*").eq("expediente_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const hitosDone = (hitosHeader ?? []).filter((h) => h.estado === "completado" || h.estado === "no_aplica").length;
  const hitosTotal = hitosHeader?.length ?? 0;
  const permisosNumeros = (permisosHeader ?? []).map((p: any) => p.numero).filter(Boolean).join(", ");


  const puedeForzarRegreso = (roles ?? []).some((r) => ["admin", "operaciones"].includes(r));
  const esAdminDespacho = (roles ?? []).includes("admin");
  const suspEstado = useEstadoSuspensivo((exp as any)?.regimen_aduanero, (exp as any)?.impuestos_override_manual);

  const updateEstado = useMutation({
    mutationFn: async (estado: string) => {
      const actual = (exp as any)?.estado as string;
      if (estadoIndex(estado) < estadoIndex(actual)) {
        throw new Error(
          puedeForzarRegreso
            ? "Para regresar a un estado anterior usa el botón \"Corregir estado\"."
            : "No se puede regresar el expediente a un estado anterior.",
        );
      }
      const { count: gastos } = await supabase
        .from("gastos")
        .select("id", { count: "exact", head: true })
        .eq("expediente_id", id)
        .is("deleted_at", null);
      const msg = validarAvanceEstado(actual, estado, {
        exp,
        tieneGastos: (gastos ?? 0) > 0,
        tieneFactura: !!(exp as any)?.factura_ecf_id,
      });
      if (msg) throw new Error(msg);
      let forzarDespacho: string | null = null;
      if (estadoIndex(actual) < estadoIndex("presentar") && estadoIndex(estado) >= estadoIndex("presentar")) {
        const { data: docs } = await supabase
          .from("documentos")
          .select("tipo, storage_path")
          .eq("expediente_id", id)
          .in("tipo", ["Factura comercial", "Bill of Lading"]);
        const tiene = (t: string) => (docs ?? []).some((d: any) => d.tipo === t && d.storage_path && String(d.storage_path).trim() !== "");
        const fac = tiene("Factura comercial");
        const bl = tiene("Bill of Lading");
        if (!fac || !bl) {
          const falta = !fac && !bl ? "Factura comercial y Bill of Lading" : !fac ? "Factura comercial" : "Bill of Lading";
          const bloqueo = `No se puede marcar como Presentado: falta adjuntar ${falta}.`;
          if (!puedeForzarRegreso) throw new Error(bloqueo);
          const motivo = window.prompt(`${bloqueo}\n\nComo Administración/Operaciones puedes forzar el paso por excepción justificada. Escribe el motivo (quedará en Auditoría):`);
          if (!motivo || !motivo.trim()) throw new Error(bloqueo);
          forzarDespacho = motivo.trim();
        }
      }
      if (estadoIndex(actual) < estadoIndex("despachado") && estadoIndex(estado) >= estadoIndex("despachado")) {
        const faltanFechas = fechasDespachoFaltantes(exp);
        if (faltanFechas.length) {
          const bloqueo = "No se puede despachar:\n- " + faltanFechas.join("\n- ");
          if (!esAdminDespacho) throw new Error(bloqueo);
          const motivo = window.prompt(`${bloqueo}\n\nComo Administrador puedes forzar el despacho. Escribe la justificación obligatoria (quedará en Auditoría):`);
          if (!motivo || !motivo.trim()) throw new Error(bloqueo);
          forzarDespacho = motivo.trim();
        }
        const { data: perms } = await supabase
          .from("permisos")
          .select("numero, tipo, estado")
          .eq("expediente_id", id)
          .is("eliminado_en", null)
          .neq("estado", "aprobado");
        if (perms && perms.length > 0) {
          const p: any = perms[0];
          const bloqueo = `No se puede despachar este Expediente: tiene ${perms.length} permiso(s) sin aprobar (ej. ${p.numero || p.tipo} (${p.tipo}) - Estado: ${String(p.estado).replace("_", " ")}). Todos los permisos asociados deben estar Aprobados antes de despachar.`;
          if (!puedeForzarRegreso) throw new Error(bloqueo);
          const motivo = window.prompt(`${bloqueo}\n\nComo Administración/Operaciones puedes forzar el despacho por excepción justificada. Escribe el motivo (quedará en Auditoría):`);
          if (!motivo || !motivo.trim()) throw new Error(bloqueo);
          forzarDespacho = motivo.trim();
        }
      }
      if (
        estadoIndex(actual) < estadoIndex("entregado") &&
        estadoIndex(estado) >= estadoIndex("entregado") &&
        !(exp as any)?.factura_ecf_id
      ) {
        const bloqueo = "No se puede marcar como Entregado este Expediente: falta vincular la Factura E-CF (DGII).";
        if (!puedeForzarRegreso) throw new Error(bloqueo);
        if (!forzarDespacho) {
          const motivo = window.prompt(`${bloqueo}\n\nComo Administración/Operaciones puedes forzar el paso por excepción justificada. Escribe el motivo (quedará en Auditoría):`);
          if (!motivo || !motivo.trim()) throw new Error(bloqueo);
          forzarDespacho = motivo.trim();
        }
      }
      const { error } = await supabase
        .from("expedientes")
        .update(
          (forzarDespacho
            ? { estado, forzar_regreso_estado: true, motivo_regreso_estado: forzarDespacho }
            : { estado }) as any,
        )
        .eq("id", id);
      if (error) throw error;
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: id, accion: `cambio_estado:${estado}` });
    },
    onSuccess: () => { toast.success("Estado actualizado"); qc.invalidateQueries({ queryKey: ["expediente", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const forzarRegreso = useMutation({
    mutationFn: async ({ estado, motivo }: { estado: string; motivo: string }) => {
      const { error } = await supabase
        .from("expedientes")
        .update({ estado: estado as any, forzar_regreso_estado: true, motivo_regreso_estado: motivo } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Estado corregido"); qc.invalidateQueries({ queryKey: ["expediente", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const duplicarMut = useMutation({
    mutationFn: () => duplicarExpediente(id),
    onSuccess: (nuevoId) => {
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      toast.success("Expediente duplicado — completa los datos del nuevo embarque (BL, fechas, contenedores).");
      navExp({ to: "/expedientes/$id", params: { id: nuevoId }, search: { nuevo: "1" } as any });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo duplicar el expediente"),
  });

  if (!isNuevo && !exp) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;

  const expData: any = isNuevo ? EXPEDIENTE_VACIO : exp;
  const alertasHeader: string[] = [];
  if (!isNuevo) {
    const { dias } = plazoEfectivo(expData, plazosReg);
    const vencimiento = expData.fecha_llegada_real && dias && diasRegimen(expData.regimen_aduanero, plazosReg)
      ? venceEn(expData.fecha_llegada_real, dias) : null;
    const posterior = estadoIndex(expData.estado) >= estadoIndex("verificar");
    const presentado = expData.fecha_presentacion_real ? parseLocalDate(expData.fecha_presentacion_real) : null;
    if (vencimiento && presentado && !isNaN(presentado.getTime())) {
      if (presentado > vencimiento) alertasHeader.push(`Presentación fuera de plazo (${Math.abs(diasHabilesEntre(presentado, vencimiento))} días hábiles de retraso)`);
    } else if (vencimiento && !posterior) {
      const restantes = Math.abs(habilesRestantes(vencimiento));
      const unidad = restantes === 1 ? "día hábil" : "días hábiles";
      alertasHeader.push(vencimiento < hoyRD()
        ? `Plazo de presentación vencido desde ${fmtLocalDate(vencimiento.toISOString().slice(0, 10))} (${restantes} ${unidad} transcurridos)`
        : restantes === 0 ? "Vence hoy el plazo de presentación" : `Vence en ${restantes} ${unidad}`);
    }
    if (posterior && !expData.fecha_presentacion_real) alertasHeader.push("Falta capturar la fecha de presentación");
    if (documentosHeader) {
      const faltantes = ["Factura comercial", "Bill of Lading"].filter((tipo) =>
        !documentosHeader.some((d) => d.tipo === tipo && d.storage_path?.trim()));
      if (faltantes.length) alertasHeader.push(`Documentos pendientes: ${faltantes.join(", ")}`);
      const ultimos = new Map<string, (typeof documentosHeader)[number]>();
      for (const d of documentosHeader) {
        const previo = ultimos.get(d.tipo);
        if (!previo || new Date(d.fecha_recepcion ?? d.created_at).getTime() >= new Date(previo.fecha_recepcion ?? previo.created_at).getTime()) ultimos.set(d.tipo, d);
      }
      for (const d of ultimos.values()) {
        if (["pendiente", "observado", "vencido"].includes(d.estado) && !faltantes.includes(d.tipo)) {
          alertasHeader.push(`${d.tipo}: ${DOC_ESTADO_STYLE[d.estado]?.label.toLowerCase()}`);
        }
      }
    }
    const permisosPendientes = (permisosHeader ?? []).filter((p) => p.estado !== "aprobado");
    if (permisosPendientes.length) alertasHeader.push(`Permisos pendientes de aprobación: ${permisosPendientes.length}`);
  }

  return (
    <div className={cn("max-w-[1600px] mx-auto space-y-6", (isNuevo || modoEdicion) && (nuevo || isNuevo ? "bg-emerald-50/40" : "bg-amber-50/40"))}>
      <ImpuestosSuspCtx.Provider value={suspEstado}>
      <Tabs value={tabActiva} onValueChange={setTabActiva}>
      <div
        ref={(el) => {
          if (!el || (el as any)._roSet) return;
          (el as any)._roSet = true;
          const upd = () => document.documentElement.style.setProperty("--exp-header-h", `${el.offsetHeight}px`);
          upd();
          new ResizeObserver(upd).observe(el);
        }}
        className={cn("expediente-header-container sticky top-0 z-20 border-b bg-background px-3 pb-2 pt-2 md:px-6", isNuevo ? "expediente-nuevo-header" : "expediente-detalle-header")}
      >
        <div className="space-y-1.5 md:space-y-2">
        <div className={isNuevo ? "expediente-nuevo-grid" : "expediente-header-grid"}>
          <Button variant="ghost" size="sm" asChild className="expediente-header-back shrink-0 px-2 md:px-3"><Link to="/expedientes"><ArrowLeft className="h-4 w-4 md:mr-1" /><span className="hidden md:inline exp-lbl-full">Volver</span></Link></Button>
          {isNuevo ? (
            <div className="expediente-nuevo-title min-w-0">
              <h1 className="font-display whitespace-nowrap text-lg font-bold md:text-xl">Nuevo Expediente</h1>
              <p className="expediente-nuevo-subtitle">
                Completa los campos a mano, o escanea el BL y/o la factura comercial para autollenarlos. El número se genera automáticamente.
              </p>
            </div>
          ) : (
            <div className="expediente-header-number flex items-center">
              <h1 className="font-display whitespace-nowrap text-lg font-bold md:text-xl expediente-numero">{expData.numero}</h1>
            </div>
          )}
          {!isNuevo && (
            <div className="expediente-header-state grid min-w-0 grid-cols-[auto_minmax(0,1fr)_2rem] items-center gap-1.5">
              <Label className="mb-0 whitespace-nowrap text-xs text-muted-foreground md:text-sm">Estado:</Label>
              <Select value={expData.estado} onValueChange={(v) => updateEstado.mutate(v)} disabled={!(canEditExpediente && modoEdicion)}>
                <SelectTrigger aria-label="Estado del expediente" className="h-8 w-full min-w-0 text-xs text-foreground disabled:opacity-100 [&>svg]:shrink-0 [&>svg]:opacity-100 md:text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADO_ORDEN.map((e) => (
                    <SelectItem key={e} value={e} disabled={estadoIndex(e) < estadoIndex(expData.estado)}>
                      {ESTADO_LABEL[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className={cn("w-8", !(puedeForzarRegreso && estadoIndex(expData.estado) > 0) && "invisible")}>
                <ForzarRegresoEstadoDialog
                  estadoActual={expData.estado}
                  pendiente={forzarRegreso.isPending}
                  onConfirm={(estado, motivo) => forzarRegreso.mutate({ estado, motivo })}
                />
              </div>
            </div>
          )}
          {isNuevo && (
            <div className="expediente-nuevo-scan flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" disabled={duplicarMut.isPending} onClick={() => duplicarMut.mutate()} title="Duplicar expediente" aria-label="Duplicar expediente">
                <Copy className="h-4 w-4" />
              </Button>
              <EscanearBlButton onExtracted={(res) => { blRes.current = res; void aplicarCombinado(); toast.success("BL procesado — revisa y ajusta los campos"); }} />
              <EscanearFacturaExpButton onExtracted={(res) => { facRes.current = res; void aplicarCombinado(); toast.success("Factura procesada — revisa y ajusta los campos"); }} />
              <NuevoDesdeXmlButton
                onAplicar={(d) => {
                  ocrSeq.current += 1;
                  setOcrAplicado({
                    seq: ocrSeq.current,
                    campos: d.campos,
                    contenedores: d.contenedores,
                    cliente: d.clienteNombre,
                    productos: d.productos,
                    clienteId: d.clienteId,
                    desdeXml: true,
                  });
                }}
              />
            </div>
          )}
          {(
            <div className={isNuevo ? "contents" : "hidden md:contents"}>
              {!isNuevo && <div className="expediente-header-save"><ControlesGuardadoHeader expedienteId={id} /></div>}
              <div className={isNuevo ? "expediente-nuevo-menus flex items-center gap-1.5" : "expediente-header-menus flex min-w-0 flex-wrap items-center gap-1.5"}>
              {!isNuevo && <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={duplicarMut.isPending}
                onClick={() => duplicarMut.mutate()}
                title="Duplicar expediente"
              >
                <Copy className="h-4 w-4" />
              </Button>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="px-2" title="Documentos y Reportes">
                    <FileOutput className="h-4 w-4 mr-1" /> <span className="exp-lbl-full">Documentos y Reportes</span><span className="exp-lbl-short">Documentos</span>
                    <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-1">
                  <div className="[&_button]:w-full [&_button]:justify-start [&_button]:border-0 [&_button]:rounded-sm [&_button]:font-normal [&_button]:h-9 [&_button]:px-2 [&_button]:text-sm [&_button:hover]:bg-accent">
                    <GenerarXmlSigaButton expedienteId={id} />
                    <GenerarXmlCertificadoOrigenButton expedienteId={id} />
                    <PreLiquidacionPdfButton exp={expData} />
                    <SolicitudReembolsoPdfButton exp={expData} />
                    <GenerarDocumentoButton exp={expData} />
                    {!isNuevo && <CotizacionServiciosExpedienteButton exp={expData} />}
{!isNuevo && <PortadaExpedienteButton expedienteId={id} />}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={imprimirFichaGenerales}>
                      <Printer className="h-4 w-4" /> Imprimir Ficha General (PDF)
                    </DropdownMenuItem>
                     {!isNuevo && expData.rectificacion_tecnica && (
                       <>
                         <DropdownMenuSeparator />
                         <OficioRectificacionButton expedienteId={id} />
                         <PaqueteRectificacionButton expedienteId={id} />
                         <CorreoDgaButton expedienteId={id} />
                       </>
                     )}
                  </div>
                  {!isNuevo && canEditExpediente && <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={abrirEndoso}><Repeat2 className="h-4 w-4" /> Agregar endoso</DropdownMenuItem>
                  </>}
                </DropdownMenuContent>
              </DropdownMenu>
              <HerramientasDgaVuceMenu className="px-2" />
              <RastreosEnvioMenu className="px-2" />
              {isNuevo && <div ref={setNuevoAccionesHost} className="expediente-nuevo-submit flex shrink-0 items-center gap-2 print:hidden" />}
              </div>
            </div>
          )}
          {!isNuevo && (
            <div className="expediente-header-save flex shrink-0 items-center md:hidden">
              <ControlesGuardadoHeader expedienteId={id} compacto />
            </div>
          )}
          {!isNuevo && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="expediente-header-more flex shrink-0 md:w-8 md:px-0" title="Más acciones" aria-label="Más acciones">
                  <MoreVertical className="h-4 w-4" /> <span className="md:hidden">Más acciones</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem disabled={duplicarMut.isPending} onSelect={() => duplicarMut.mutate()}>
                  <Copy className="h-4 w-4" /> {duplicarMut.isPending ? "Duplicando…" : "Duplicar"}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><FileOutput className="h-4 w-4" /> Documentos y Reportes</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64 p-1">
                    <div className="[&_button]:w-full [&_button]:justify-start [&_button]:border-0 [&_button]:rounded-sm [&_button]:font-normal [&_button]:h-9 [&_button]:px-2 [&_button]:text-sm [&_button:hover]:bg-accent">
                      <GenerarXmlSigaButton expedienteId={id} />
                      <GenerarXmlCertificadoOrigenButton expedienteId={id} />
                      <PreLiquidacionPdfButton exp={expData} />
                      <SolicitudReembolsoPdfButton exp={expData} />
                        <GenerarDocumentoButton exp={expData} />
                        <CotizacionServiciosExpedienteButton exp={expData} />
{!isNuevo && <PortadaExpedienteButton expedienteId={id} />}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={imprimirFichaGenerales}>
                          <Printer className="h-4 w-4" /> Imprimir Ficha General (PDF)
                        </DropdownMenuItem>
                        {expData.rectificacion_tecnica && (
                         <>
                           <DropdownMenuSeparator />
                           <OficioRectificacionButton expedienteId={id} />
                           <PaqueteRectificacionButton expedienteId={id} />
                           <CorreoDgaButton expedienteId={id} />
                         </>
                       )}
                    </div>
                    {canEditExpediente && <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={abrirEndoso}><Repeat2 className="h-4 w-4" /> Agregar endoso</DropdownMenuItem>
                    </>}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><ShieldCheck className="h-4 w-4" /> Herramientas DGA/VUCE</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    <HerramientasDgaVuceItems />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Ship className="h-4 w-4" /> Rastreos de Envío</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
                    <RastreosEnvioItems />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {!isNuevo && (
        <div className="expediente-info-tabla">
        <div className="expediente-info-fila2">
          <div className="expediente-header-cliente flex min-w-0 items-center gap-1.5">
          <span className="whitespace-nowrap text-muted-foreground">Cliente:</span>
          {expData.clientes ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="link" className="h-auto min-h-8 min-w-0 justify-start p-0 text-left text-sm font-semibold text-foreground underline decoration-dotted underline-offset-2" title={expData.clientes.nombre}>
                  {expData.clientes.nombre}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0 border-none bg-transparent shadow-none z-50" side="bottom" align="start" sideOffset={8}>
                <div className="rounded-md border bg-background shadow-lg px-3 py-2 text-xs space-y-0.5">
                  <div><span className="text-muted-foreground">RNC:</span> {expData.clientes.rnc ?? "—"}</div>
                  <div><span className="text-muted-foreground">Contacto:</span> {expData.clientes.contacto ?? "—"}</div>
                  <div><span className="text-muted-foreground">Email:</span> {(expData.clientes as any).email ?? "—"}</div>
                  <div><span className="text-muted-foreground">Teléfono:</span> {expData.clientes.telefono ?? "—"}</div>
                  <div><span className="text-muted-foreground">Dirección:</span> {(expData.clientes as any).direccion ?? "—"}</div>
                  <div className="mt-2 flex items-center gap-1 border-t pt-2">
                    <WhatsAppButton
                      phone={expData.clientes.telefono}
                      clientName={expData.clientes.nombre}
                      recordType="Expediente"
                      recordNumber={expData.numero}
                      variant="icon"
                    />
                    <EmailButton
                      email={(expData.clientes as any).email}
                      clientName={expData.clientes.nombre}
                      recordType="Expediente"
                      recordNumber={expData.numero}
                      variant="icon"
                    />
                    <SearchEmailButton
                      recordType="Expediente"
                      recordNumber={expData.numero}
                      variant="icon"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <span className="flex h-8 items-center truncate text-sm text-muted-foreground">Sin cliente</span>
          )}
          <EndosoBadge expedienteId={id} originalNombre={expData.clientes?.nombre} />
          </div>
          <CampoHeader etiqueta="BL/AWB" valor={expData.bl_awb} largo className="expediente-header-bl" />
          <div className="expediente-header-arrival">
          {expData.fecha_llegada_real ? (
            <div className="grid h-8 shrink-0 grid-cols-[auto_auto] items-center gap-1.5 text-xs md:text-sm" title={`Fecha de Llegada Real: ${fmtLocalDate(expData.fecha_llegada_real)}`}>
              <span className="text-muted-foreground">Llegada:</span>
              <span className="min-w-0 whitespace-nowrap font-medium">
                {fmtLocalDate(expData.fecha_llegada_real)}
              </span>
            </div>
          ) : (
          <div className="grid h-8 shrink-0 grid-cols-[auto_auto] items-center gap-1.5 text-xs md:text-sm" title={`Fecha Estimada de Llegada (ETA): ${expData.fecha_compromiso ? fmtLocalDate(expData.fecha_compromiso) : "—"}`}>
              <span className="text-muted-foreground">ETA:</span>
              <span className="min-w-0 truncate font-medium">{expData.fecha_compromiso ? fmtLocalDate(expData.fecha_compromiso) : "—"}
              {(() => {
                if (["despachado", "entregado", "facturar"].includes(expData.estado) || !expData.fecha_compromiso) return null;
                const eta = parseLocalDate(expData.fecha_compromiso);
                if (!eta) return null;
                const today = hoyRD();
                eta.setHours(0, 0, 0, 0);
                const diff = Math.round((eta.getTime() - today.getTime()) / 86400000);
                const toneClass = diff > 5 ? "text-emerald-600 dark:text-emerald-400" : diff >= 0 ? "text-amber-600 dark:text-amber-400" : "text-destructive";
                const full = diff > 0 ? `${diff} días por llegar` : diff === 0 ? "Llega hoy" : `${Math.abs(diff)} días de atraso`;
                return (
                  <span title={full} aria-label={full} className={`font-medium tabular-nums ${toneClass}`}>
                    {` (${diff} ${Math.abs(diff) === 1 ? "día" : "días"})`}
                  </span>
                );
              })()}
              </span>
          </div>
          )}
           <VencePresentacion exp={expData} canEdit={canEditExpediente} informativo />
          </div>
           <CampoHeader etiqueta="Puerto" valor={expData.puerto_arribo} largo className="expediente-header-puerto" />
        </div>
        <div className="expediente-info-fila3">
          <div className="flex h-8 min-w-0 items-center gap-1.5">
            <Label className="mb-0 whitespace-nowrap text-xs text-muted-foreground md:text-sm">Etapa :</Label>
            <span className="text-xs font-medium md:text-sm">{hitosDone} de {hitosTotal}</span>
          </div>
          <CampoHeader etiqueta="Declaración DUA" valor={expData.numero_dua} largo />
          <CampoHeader etiqueta="N.º de despacho" valor={expData.numero_igra} />
          <CampoHeader etiqueta="N.º de permiso" valor={permisosNumeros} largo />

        </div>
        </div>
        )}
        {!isNuevo && (
          <div className="mt-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-1.5">
            <Label className="mb-0 whitespace-nowrap text-xs leading-5 text-muted-foreground md:text-sm">Descripción:</Label>
            <span className="line-clamp-3 min-w-0 break-words text-xs font-medium leading-5 md:text-sm" title={expData.descripcion_mercancia ?? "—"}>
              {expData.descripcion_mercancia || "—"}
            </span>
          </div>
        )}
        {!isNuevo && alertasHeader.length > 0 && (
          <div className="expediente-header-alertas mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-0 text-destructive" role="status" aria-label="Alertas del expediente">
            {alertasHeader.map((alerta) => <span key={alerta} className="break-words">{alerta}</span>)}
          </div>
        )}
      </div>
        <TabsList className="mt-1.5 flex h-auto max-w-full flex-nowrap justify-start overflow-x-auto md:mt-1 md:flex-wrap">
          {tabOrder.map((key) => {
            const label = TAB_LABELS[key];
            if (!label) return null;
            return (
              <TabsTrigger
                key={key}
                value={key}
                disabled={isNuevo && key !== "info"}
                draggable={!isNuevo}
                onDragStart={(e) => {
                  dragTab.current = key;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragTab.current;
                  dragTab.current = null;
                  if (!from || from === key) return;
                  setTabOrder((prev) => {
                    const next = prev.filter((k) => k !== from);
                    next.splice(next.indexOf(key), 0, from);
                    void persistTabOrder(next);
                    return next;
                  });

                }}
                className="cursor-grab text-[13px] active:cursor-grabbing"
                title={isNuevo && key !== "info" ? "Disponible después de crear el Expediente." : "Arrastra para reordenar"}
              >
                {label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {isNuevo && (
          <p className="text-xs text-muted-foreground mt-1">Disponible después de crear el Expediente.</p>
        )}
      </div>
      <div className="px-6">
        <TabsContent value="info">
          <div id="ficha-generales-print">
            <div className="hidden print:block mb-4">
              <h1 className="text-xl font-bold">Expediente <span className="expediente-numero">{expData.numero}</span> — Ficha General</h1>
              <p className="text-sm text-muted-foreground">
                Cliente: {expData.clientes?.nombre ?? "—"} · Impreso el {new Date().toLocaleDateString("es-DO")}
              </p>
            </div>
          <TabInfo
            id={id}
            exp={expData}
            modoEdicion={modoEdicion}
            setModoEdicion={setModoEdicion}
            canEdit={canEditExpediente || isNuevo}
            nuevo={!!nuevo}
            isNuevo={isNuevo}
            ocrAplicado={ocrAplicado}
            tipoParam={tipoParam}
            solicitudEndoso={solicitudEndoso}
            nuevoAccionesHost={nuevoAccionesHost}
          />
          </div>
        </TabsContent>
        {!isNuevo && (
        <>
        <TabsContent value="checklist">
          <ChecklistHitos expedienteId={id} />
        </TabsContent>

        
        <TabsContent value="liqfinal"><LiquidacionFinalSection exp={expData} /></TabsContent>
        <TabsContent value="docs"><TabDocumentos expedienteId={id} /></TabsContent>

        <TabsContent value="permisos"><TabPermisosExp expedienteId={id} /></TabsContent>
        <TabsContent value="transportes"><TabTransportesExp expedienteId={id} /></TabsContent>
        <TabsContent value="recepcion"><TabRecepcion expedienteId={id} /></TabsContent>
        <TabsContent value="inc"><TabIncidencias expedienteId={id} /></TabsContent>
        <TabsContent value="cost"><TabCostos expedienteId={id} exp={expData} /></TabsContent>
        <TabsContent value="costprod"><TabCostosProducto expedienteId={id} /></TabsContent>
        <TabsContent value="aud"><TabAuditoria expedienteId={id} /></TabsContent>
        </>
        )}
      </div>
      </Tabs>
      </ImpuestosSuspCtx.Provider>
    </div>
  );
}

/** Asterisco rojo para campos obligatorios. */
function ReqMark() {
  return <span className="text-destructive mr-0.5">*</span>;
}

function Field({ label, value, onChange, type = "text", className = "", disabled = false, req = false, fieldId, highlight = false }: { label: string; value: any; onChange: (v: string) => void; type?: string; className?: string; disabled?: boolean; req?: boolean; fieldId?: string; highlight?: boolean }) {
  return (
    <div className={cn("grid gap-1.5", highlight && "ring-2 ring-destructive rounded-md p-2 -m-2", className)} id={fieldId}>
      <Label>{req && <ReqMark />}{label}</Label>
      <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}


function Section({ title, subtitle, children, id, className }: { title: React.ReactNode; subtitle?: string; children: React.ReactNode; id: string; className?: string }) {
  const [abierto, setAbierto] = useState(() => {
    try { return localStorage.getItem(`exp-section-${id}`) === "1"; } catch { return false; }
  });
  const [forzarAbierto, setForzarAbierto] = useState(false);
  useEffect(() => {
    const h = (e: Event) => setForzarAbierto((e as CustomEvent<boolean>).detail);
    window.addEventListener("ficha-print-mode", h);
    return () => window.removeEventListener("ficha-print-mode", h);
  }, []);
  const toggle = () => {
    const next = !abierto;
    setAbierto(next);
    try { localStorage.setItem(`exp-section-${id}`, next ? "1" : "0"); } catch { /* ignore */ }
  };
  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b cursor-pointer select-none" onClick={toggle}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">{title}</CardTitle>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", abierto && "rotate-180")} />
        </div>
      </CardHeader>
      {(abierto || forzarAbierto) && <CardContent className="pt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">{children}</CardContent>}
    </Card>
  );
}


function construirFormInicial(data: any, nuevo: boolean, tipoDefault = "") {
  const d = nuevo ? {} : (data || {});
  return {
    numero: d.numero ?? "",
    cliente_id: d.cliente_id ?? "",
    bl_awb: d.bl_awb ?? "",
    sla_dias: d.sla_dias ?? 5,
    fecha_compromiso: d.fecha_compromiso ?? "",
    fecha_llegada_real: d.fecha_llegada_real ?? "",
    fecha_presentacion_real: d.fecha_presentacion_real ?? "",
    fecha_cargado: d.fecha_cargado ?? "",
    medio_transporte: d.medio_transporte ?? "",
    naviera: d.naviera ?? "",
    suplidor: d.suplidor ?? "",
    suplidor_rnc: d.suplidor_rnc ?? "",
    pais_origen: d.pais_origen ?? "",
    factura_comercial: d.factura_comercial ?? "",
    incoterm: d.incoterm ?? "",
    puerto_salida: d.puerto_salida ?? "",
    puerto_salida_codigo: d.puerto_salida_codigo ?? "",
    puerto_arribo: d.puerto_arribo ?? "",
    numero_dua: d.numero_dua ?? "",
    numero_vuce: d.numero_vuce ?? "",
    numero_igra: d.numero_igra ?? "",
    fecha_aprobacion_despacho: d.fecha_aprobacion_despacho ?? "",
    descripcion_mercancia: d.descripcion_mercancia ?? "",
    peso_neto: d.peso_neto ?? "",
    peso_bruto: d.peso_bruto ?? "",
    numeros_contenedores: d.numeros_contenedores ?? "",
    preferencia_comercial: d.preferencia_comercial ?? "",
    numero_certificado_origen: d.numero_certificado_origen ?? "",
    rectificacion_tecnica: !!d.rectificacion_tecnica,
    numero_tramite_rectificacion: d.numero_tramite_rectificacion ?? "",
    producto_correcto_rectificacion: d.producto_correcto_rectificacion ?? "",
    canal_riesgo: d.canal_riesgo ?? "",
    total_fob: d.total_fob ?? "",
    seguro: d.seguro ?? "",
    flete: d.flete ?? "",
    otros: d.otros ?? "",
    // Importación nueva: régimen por defecto "Despacho a Consumo" (RegimenCode 1), editable.
    regimen_aduanero: d.regimen_aduanero ?? (nuevo && tipoDefault !== "exportacion" ? "Despacho a Consumo" : ""),
    regimen_codigo_exportacion: d.regimen_codigo_exportacion ?? "",
    acuerdo_comercial: d.acuerdo_comercial ?? "",
    acuerdo_codigo: d.acuerdo_codigo ?? "",
    observaciones: d.observaciones ?? "",
    pais_origen_codigo: d.pais_origen_codigo ?? "",
    pais_procedencia: d.pais_procedencia ?? "",
    pais_procedencia_codigo: d.pais_procedencia_codigo ?? "",
    puerto_arribo_codigo: d.puerto_arribo_codigo ?? "",
    area_aduanera: d.area_aduanera ?? "",
    area_aduanera_codigo: d.area_aduanera_codigo ?? "",
    deposito_destino: d.deposito_destino ?? "",
    deposito_destino_codigo: d.deposito_destino_codigo ?? "",
    liq_siga_numero: d.liq_siga_numero ?? "",
    liq_siga_estado: d.liq_siga_estado ?? "",
    liq_oficial_total: d.liq_oficial_total ?? "",
    liq_siga_pin_pago: d.liq_siga_pin_pago ?? "",
    liq_siga_fecha_registro: d.liq_siga_fecha_registro ?? "",
    liq_siga_fecha_pago: d.liq_siga_fecha_pago ?? "",
    liq_siga_registro_at: isoToLocalInput(d.liq_siga_registro_at),
    liq_siga_termino_at: isoToLocalInput(d.liq_siga_termino_at),
    pin_almacenaje: d.pin_almacenaje ?? "",
    pin_almacenaje_monto: d.pin_almacenaje_monto ?? "",
    pin_almacenaje_fecha_registro: d.pin_almacenaje_fecha_registro ?? "",
    pin_almacenaje_fecha_pago: d.pin_almacenaje_fecha_pago ?? "",
    pin_contenedor: d.pin_contenedor ?? "",
    pin_contenedor_monto: d.pin_contenedor_monto ?? "",
    pin_contenedor_fecha_registro: d.pin_contenedor_fecha_registro ?? "",
    pin_contenedor_fecha_pago: d.pin_contenedor_fecha_pago ?? "",
    valores_enviados: d.valores_enviados ?? false,
    valores_enviados_at: d.valores_enviados_at ?? null,
    tipo_despacho_aduanero: d.tipo_despacho_aduanero ?? "",
    cantidad_despacho: d.cantidad_despacho ?? "",
    tipo_operacion: d.tipo_operacion ?? (tipoDefault === "exportacion" ? "Exportación" : ""),
    tipo_carga: d.tipo_carga ?? "",
    contacto_solicitud: d.contacto_solicitud ?? "",
    // --- Exportación (SIGA) ---
    buyer_codigo: d.buyer_codigo ?? "",
    buyer_nombre: d.buyer_nombre ?? "",
    buyer_nacionalidad: d.buyer_nacionalidad ?? "",
    declarante_codigo: d.declarante_codigo ?? "",
    declarante_nombre: d.declarante_nombre ?? "",
    declarante_nacionalidad: d.declarante_nacionalidad ?? "",
    zf_aplica: !!d.zf_aplica,
    zf_valor_cif: d.zf_valor_cif ?? "",
    zf_valor_materiales: d.zf_valor_materiales ?? "",
    zf_valor_salario: d.zf_valor_salario ?? "",
    zf_valor_servicio: d.zf_valor_servicio ?? "",
    zf_otros_valores: d.zf_otros_valores ?? "",
  };
}

/** Campos numéricos de Zona Franca: "" → null antes de guardar. */
function normalizarCamposExportacion(payload: any) {
  const toNum = (v: any) => (v === "" || v == null ? null : Number(v));
  ["zf_valor_cif", "zf_valor_materiales", "zf_valor_salario", "zf_valor_servicio", "zf_otros_valores"].forEach((k) => {
    payload[k] = toNum(payload[k]);
  });
  payload.zf_aplica = !!payload.zf_aplica;
  ["buyer_codigo", "buyer_nombre", "buyer_nacionalidad", "declarante_codigo", "declarante_nombre", "declarante_nacionalidad", "regimen_codigo_exportacion"].forEach((k) => {
    payload[k] = (payload[k] ?? "").trim() || null;
  });
}

function TabInfo({ id, exp, modoEdicion, setModoEdicion, canEdit, nuevo, isNuevo = false, ocrAplicado = null, tipoParam = "", solicitudEndoso = 0, nuevoAccionesHost = null }: { id: string; exp: any; modoEdicion: boolean; setModoEdicion: (v: boolean) => void; canEdit: boolean; nuevo?: boolean; isNuevo?: boolean; ocrAplicado?: OcrAplicado | null; tipoParam?: string; solicitudEndoso?: number; nuevoAccionesHost?: HTMLDivElement | null }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const editable = (canEdit && modoEdicion) || isNuevo;
  const [focusedMoney, setFocusedMoney] = useState<string | null>(null);
  const [form, setForm] = useState(() => construirFormInicial(isNuevo ? null : exp, isNuevo, isNuevo ? tipoParam : ""));
  const sugeridaPresentacion = useRef(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const esExportacion = (form.tipo_operacion || "").toLowerCase().startsWith("export");
  // Exportación: precarga los datos del agente despachante de ADECOMEX si están vacíos.
  useEffect(() => {
    if (!esExportacion) return;
    setForm((f) => {
      if (f.declarante_codigo || f.declarante_nombre) return f;
      const b = loadBrokerConfig();
      return { ...f, declarante_codigo: b.declarantCode ?? "", declarante_nombre: b.declarantName ?? "", declarante_nacionalidad: f.declarante_nacionalidad || b.declarantNationality || "" };
    });
  }, [esExportacion]);
  const [filasServicioAduanero, setFilasServicioAduanero] = useState<FilaServicio[]>([]);
  const { data: filasServicioDb } = useFilasServicioAduanero(exp?.id, !isNuevo);
  useEffect(() => {
    if (filasServicioDb) setFilasServicioAduanero(filasServicioDb);
  }, [filasServicioDb]);
  const servicioAd = useServicioAduaneroTotales(filasServicioAduanero, exp?.tasa_cambio_usada);


  // ---- Modo creación: clientes, OCR y contenedores extraídos ----
  const { data: clientesLite } = useQuery({
    queryKey: ["clientes-lite"],
    enabled: isNuevo,
    queryFn: async () => (await supabase.from("clientes").select("id,nombre,rnc,contacto,email,telefono,direccion,registrado_proindustria").order("nombre")).data ?? [],
  });
  const [clienteOcr, setClienteOcr] = useState<string | null>(null);
  const [clienteExtraidoSinMatch, setClienteExtraidoSinMatch] = useState<string | null>(null);
  const ocrPuesto = useRef<Record<string, any>>({});
  // true cuando el OCR precargó "Tipo de carga" por inferencia (confianza media): se marca para confirmación.
  const [tipoCargaSugerido, setTipoCargaSugerido] = useState(false);
  const ultimoOcrSeq = useRef(0);
  const lastResetId = useRef<string | null>(null);
  /** Modo creación: líneas de mercancía en memoria hasta que exista el Expediente. */
  const [productosNuevos, setProductosNuevos] = useState<any[]>([]);
  const [camposFaltantes, setCamposFaltantes] = useState<Set<string>>(new Set());
  const puertoAreaRef = useRef<Record<string, { codigo: string; nombre: string }>>({});
  const [contenedores, setContenedores] = useState<Array<{ numero: string; sello1: string; sello2: string; tipo: string }>>([]);

  useEffect(() => {
    if (!isNuevo && !exp) return;
    if (lastResetId.current === id) return;
    lastResetId.current = id;
    setForm(construirFormInicial(isNuevo ? null : exp, isNuevo));
    setCamposFaltantes(new Set());
    setProductosNuevos([]);
    setClienteExtraidoSinMatch(null);
    setClienteOcr(null);
    ocrPuesto.current = {};
    setTipoCargaSugerido(false);
    ultimoOcrSeq.current = 0;
    clientePrevRef.current = "";
    setContenedores([]);
  }, [id, isNuevo, exp]);

  useEffect(() => {
    if (productosNuevos.length > 0) limpiarFaltante("req-mercancia");
  }, [productosNuevos]);

  useEffect(() => {
    if (!isNuevo || !ocrAplicado || ocrAplicado.seq === ultimoOcrSeq.current) return;
    ultimoOcrSeq.current = ocrAplicado.seq;
    if (ocrAplicado.contenedores?.length) {
      setContenedores(
        ocrAplicado.contenedores.map((c) => ({
          numero: c.numero ?? "",
          sello1: c.sello1 ?? "",
          sello2: c.sello2 ?? "",
          tipo: c.tipo ?? "",
        })),
      );
    }
    setForm((f) => {
      const next: any = { ...f };
      for (const [k, v0] of Object.entries(ocrAplicado.campos)) {
        if (v0 === null || v0 === undefined || v0 === "") continue;
        const v = typeof v0 === "number" ? String(v0) : v0;
        const actual = (f as any)[k];
        // XML: los códigos vienen exactos, así que reemplazan lo que haya.
        if (ocrAplicado.desdeXml || actual === "" || actual === null || actual === undefined || actual === ocrPuesto.current[k]) {
          next[k] = v;
          ocrPuesto.current[k] = v;
        }
      }
      if (ocrAplicado.clienteId) next.cliente_id = ocrAplicado.clienteId;
      // Puerto detectado → completar Área aduanera si aún está vacía.
      const areaMap = puertoAreaRef.current;
      const areaPuerto = next.puerto_arribo_codigo && areaMap[next.puerto_arribo_codigo];
      if (areaPuerto && !next.area_aduanera_codigo) {
        next.area_aduanera = areaPuerto.nombre;
        next.area_aduanera_codigo = areaPuerto.codigo;
      }
      return next;
    });
    if (ocrAplicado.productos?.length) setProductosNuevos(ocrAplicado.productos);
    if (ocrAplicado.cliente) setClienteOcr(ocrAplicado.cliente);
    setTipoCargaSugerido(ocrAplicado.campos.tipo_carga != null && ocrAplicado.tipoCargaConfianza === "media");
  }, [ocrAplicado, isNuevo]);

  useEffect(() => {
    if (!clienteOcr || !clientesLite?.length) {
      setClienteExtraidoSinMatch(null);
      return;
    }
    const match = (clientesLite as any[]).find((c: any) => {
      const a = normalizarCliente(c.nombre);
      const b = normalizarCliente(clienteOcr);
      return b && (a.includes(b) || b.includes(a));
    });
    if (match) {
      setForm((f) => (f.cliente_id ? f : { ...f, cliente_id: match.id }));
      setClienteExtraidoSinMatch(null);
    } else {
      setClienteExtraidoSinMatch(clienteOcr);
    }
  }, [clienteOcr, clientesLite]);




  // Pull existing values across expedientes to feed suggestions dynamically
  const { data: histDb } = useQuery({
    queryKey: ["expedientes-hist"],
    queryFn: async () =>
      (
        await supabase
          .from("expedientes")
          .select(
            "medio_transporte, naviera, suplidor, pais_origen, factura_comercial, incoterm, puerto_salida, puerto_arribo, numero_dua, numero_vuce, numero_igra, preferencia_comercial, numeros_contenedores, contacto_solicitud"
          )
          .limit(500)
      ).data ?? [],
  });

  const sug = useMemo(() => {
    const uniq = (key: string, base: string[] = []) => {
      const set = new Set<string>(base);
      (histDb ?? []).forEach((r: any) => {
        const v = (r?.[key] ?? "").toString().trim();
        if (v) set.add(v);
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
    };
    return {
      medio_transporte: uniq("medio_transporte", SUG_MEDIO),
      naviera: uniq("naviera", SUG_NAVIERA),
      
      pais_origen: uniq("pais_origen", SUG_PAIS),
      factura_comercial: uniq("factura_comercial"),
      incoterm: uniq("incoterm", SUG_INCOTERM),
      puerto_salida: uniq("puerto_salida", SUG_PUERTO_SALIDA),
      puerto_arribo: uniq("puerto_arribo", SUG_PUERTO_ARRIBO),
      numero_dua: uniq("numero_dua"),
      numero_vuce: uniq("numero_vuce"),
      numero_igra: uniq("numero_igra"),
      preferencia_comercial: uniq("preferencia_comercial", SUG_PREFERENCIA),
      numeros_contenedores: uniq("numeros_contenedores"),
      contacto_solicitud: uniq("contacto_solicitud"),
    };
  }, [histDb]);

  // Contacto principal del cliente seleccionado (modo creación): autocompleta
  // contacto_solicitud y limita las sugerencias a los contactos de ese cliente.
  const contactoDelCliente = useMemo(() => {
    const c = (clientesLite ?? []).find((cl: any) => cl.id === form.cliente_id);
    return (c?.contacto ?? "").toString().trim();
  }, [clientesLite, form.cliente_id]);
  const sugContactoCliente = useMemo(() => (contactoDelCliente ? [contactoDelCliente] : []), [contactoDelCliente]);
  const clientePrevRef = useRef<string>("");

  // Puerto de arribo → Área aduanera DGA (relación dga_puerto_area). Solo al cambiar el puerto; el área sigue editable.
  const { data: puertoAreaMap } = useQuery({
    queryKey: ["dga_puerto_area"],
    queryFn: async () => {
      const { data: rel } = await supabase.from("dga_puerto_area").select("puerto_codigo, area_codigo");
      const codigos = Array.from(new Set((rel ?? []).map((r) => r.area_codigo)));
      const { data: areas } = codigos.length
        ? await supabase.from("dga_areas").select("codigo, area").in("codigo", codigos)
        : { data: [] as any[] };
      const nombre = new Map((areas ?? []).map((a: any) => [a.codigo, a.area]));
      const m: Record<string, { codigo: string; nombre: string }> = {};
      (rel ?? []).forEach((r) => { if (nombre.has(r.area_codigo)) m[r.puerto_codigo] = { codigo: r.area_codigo, nombre: nombre.get(r.area_codigo) }; });
      return m;
    },
    staleTime: 10 * 60_000,
  });
  puertoAreaRef.current = puertoAreaMap ?? {};
  useEffect(() => {
    if (!isNuevo) return;
    if (form.cliente_id === clientePrevRef.current) return;
    clientePrevRef.current = form.cliente_id;
    const c = (clientesLite ?? []).find((cl: any) => cl.id === form.cliente_id);
    if (c) setForm((f) => ({ ...f, contacto_solicitud: (c.contacto ?? "").toString().trim() }));
  }, [form.cliente_id, clientesLite, isNuevo]);

  const { data: contenedoresDb } = useQuery({
    queryKey: ["expediente-contenedores", exp.id],
    enabled: !isNuevo,
    queryFn: async () =>
      (await supabase.from("expediente_contenedores").select("*").eq("expediente_id", exp.id).order("item_no")).data ?? [],
  });
  useEffect(() => {
    if (!contenedoresDb) return;
    setContenedores(
      contenedoresDb.map((c: any) => ({
        numero: c.numero_contenedor ?? "",
        sello1: c.sello1 ?? "",
        sello2: c.sello2 ?? "",
        tipo: c.tipo_contenedor ?? "",
      })),
    );
  }, [contenedoresDb]);
  const setCont = (i: number, k: string, v: string) =>
    setContenedores((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  /** Cuenta los contenedores capturados y arma las líneas de Servicio Aduanero. */
  const autocompletarDesdeContenedores = () => {
    if (!contenedores.length) {
      toast.error("No hay contenedores capturados en el Expediente.");
      return;
    }
    const conteo: Record<string, number> = {};
    const sinClasificar: string[] = [];
    contenedores.forEach((c, i) => {
      const t = (c.tipo || "").toLowerCase();
      if (/40|45/.test(t)) conteo["contenedor4045"] = (conteo["contenedor4045"] ?? 0) + 1;
      else if (/20/.test(t)) conteo["contenedor20"] = (conteo["contenedor20"] ?? 0) + 1;
      else sinClasificar.push(c.numero?.trim() || `Contenedor #${i + 1}`);
    });
    const nuevasFilas = Object.entries(conteo).map(([tipo, cantidad]) => ({ tipo_despacho: tipo, cantidad }));
    setFilasServicioAduanero(nuevasFilas);
    toast.success(`Autocompletado desde ${contenedores.length} contenedor(es)`);
    if (sinClasificar.length) {
      toast.warning(
        `No se pudo identificar el tamaño de: ${sinClasificar.join(", ")}. Agrégalos manualmente a la lista.`,
        { duration: 8000 },
      );
    }
  };


  const { data: mercItems } = useQuery({
    queryKey: ["mercancia-items", exp.id],
    enabled: !isNuevo,
    queryFn: async () => (await supabase.from("mercancia_items").select("*").eq("expediente_id", exp.id).is("deleted_at", null).order("item_no")).data ?? [],
  });

  const sumFob = useMemo(
    () => (isNuevo ? productosNuevos : (mercItems ?? [])).reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0),
    [mercItems, productosNuevos, isNuevo],
  );

  useEffect(() => {
    const seguroActual = form.seguro;
    const vacio = seguroActual === "" || seguroActual == null || Number(seguroActual) === 0;
    if (vacio && sumFob > 0) {
      set("seguro", (sumFob * 0.02).toFixed(2));
    }
  }, [sumFob]);


  // Fecha que rige la tasa del expediente (manual o la de creación / hoy para uno nuevo).
  const fechaTasaVigente = (form as any).fecha_tasa_manual
    ? String((form as any).fecha_tasa_manual).slice(0, 10)
    : (!isNuevo && exp?.created_at ? String(exp.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10));

  // Tasa del catálogo para esa fecha (usada en la captura del Expediente nuevo).
  const { data: tasaCatalogoFecha } = useQuery({
    queryKey: ["catalogo_tasas_cambio", fechaTasaVigente],
    enabled: isNuevo,
    queryFn: async () => {
      const { data } = await supabase.from("catalogo_tasas_cambio").select("tasa").eq("fecha", fechaTasaVigente).maybeSingle();
      return data?.tasa != null ? Number(data.tasa) : null;
    },
  });
  const [tasaNuevaInput, setTasaNuevaInput] = useState("");

  // Catálogo de Acuerdos Comerciales (SIGA): el código es la fuente de verdad del AgreementCode.
  const { data: acuerdosComerciales } = useQuery({
    queryKey: ["catalogo_acuerdos", "selector"],
    queryFn: async () => {
      const { data } = await supabase.from("catalogo_acuerdos").select("codigo, nombre").order("codigo");
      return data ?? [];
    },
  });

  // Catálogo de regímenes de Exportación (SIGA), separado del de Importación.
  const { data: regimenesExportacion } = useQuery({
    queryKey: ["catalogo_regimenes", "exportacion"],
    enabled: esExportacion,
    queryFn: async () => {
      const { data } = await supabase
        .from("catalogo_regimenes")
        .select("codigo, nombre")
        .eq("tipo_operacion", "exportacion")
        .order("nombre");
      return data ?? [];
    },
  });

  // Tasa efectiva del expediente: la ya guardada o la del catálogo para la fecha que rige.
  const resolverTasaEfectiva = async (): Promise<number | null> => {
    const directa = Number(exp?.tasa_cambio_usada);
    if (!isNuevo && directa > 0) return directa;
    if (isNuevo && Number(tasaNuevaInput) > 0) return Number(tasaNuevaInput);
    const { data } = await supabase.from("catalogo_tasas_cambio").select("tasa").eq("fecha", fechaTasaVigente).maybeSingle();
    return data?.tasa != null ? Number(data.tasa) : null;
  };

  const exigirTasaOficial = async (payload: any) => {
    const tasaEfectiva = await resolverTasaEfectiva();
    if (!tasaEfectiva || tasaEfectiva <= 0) {
      toast.error("Debes asignar la Tasa Oficial DGA antes de guardar el Expediente.");
      document.getElementById(isNuevo ? "tasa-oficial-nuevo" : "tasa-oficial-captura")?.scrollIntoView({ behavior: "smooth", block: "center" });
      throw new Error("Tasa Oficial DGA requerida");
    }
    payload.tasa_cambio_usada = tasaEfectiva;
    // Si el usuario la capturó aquí (Expediente nuevo), guárdala también en el catálogo del día.
    if (isNuevo && Number(tasaNuevaInput) > 0 && Number(tasaCatalogoFecha) !== Number(tasaNuevaInput)) {
      await supabase
        .from("catalogo_tasas_cambio")
        .upsert({ fecha: fechaTasaVigente, tasa: Number(tasaNuevaInput) }, { onConflict: "fecha" });
      qc.invalidateQueries({ queryKey: ["catalogo_tasas_cambio"] });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      const contValidos = contenedores.filter((c) => c.numero.trim());
      if (contValidos.length) payload.numeros_contenedores = contValidos.map((c) => c.numero.trim()).join(", ");
      if (!payload.cliente_id) payload.cliente_id = null;
      if (!payload.tipo_operacion || !payload.tipo_operacion.trim()) payload.tipo_operacion = "Importación";
      if (!payload.fecha_compromiso) payload.fecha_compromiso = null;
      if (!payload.fecha_llegada_real) payload.fecha_llegada_real = null;
      if (!payload.fecha_cargado) payload.fecha_cargado = null;
      if (!payload.fecha_aprobacion_despacho) payload.fecha_aprobacion_despacho = null;
      payload.peso_neto = payload.peso_neto === "" ? null : Number(payload.peso_neto);
      payload.peso_bruto = payload.peso_bruto === "" ? null : Number(payload.peso_bruto);
      const toNum = (v: any) => (v === "" || v == null ? null : Number(v));
      payload.total_fob = sumFob || 0;
      payload.seguro = toNum(payload.seguro);
      payload.flete = toNum(payload.flete);
      payload.otros = toNum(payload.otros);
      payload.total_cif = (payload.total_fob ?? 0) + (payload.seguro ?? 0) + (payload.flete ?? 0) + (payload.otros ?? 0);
      payload.liq_oficial_total = toNum(payload.liq_oficial_total);
      payload.cantidad_despacho = toNum(payload.cantidad_despacho);
      if (!payload.tipo_despacho_aduanero) payload.tipo_despacho_aduanero = null;
      if (!payload.liq_siga_numero) payload.liq_siga_numero = null;
      if (!payload.liq_siga_estado) payload.liq_siga_estado = null;
      if (!payload.liq_siga_pin_pago) payload.liq_siga_pin_pago = null;
      if (!payload.liq_siga_fecha_pago) payload.liq_siga_fecha_pago = null;
      payload.liq_siga_registro_at = localInputToIso(payload.liq_siga_registro_at);
      payload.liq_siga_termino_at = localInputToIso(payload.liq_siga_termino_at);
      payload.liq_siga_fecha_registro = payload.liq_siga_registro_at
        ? isoToLocalInput(payload.liq_siga_registro_at).slice(0, 10)
        : null;
      normalizarPinesPago(payload);
      if (!payload.regimen_aduanero) payload.regimen_aduanero = null;
      if (!payload.acuerdo_comercial) payload.acuerdo_comercial = null;
      if (!payload.acuerdo_codigo) payload.acuerdo_codigo = null;
      // Régimen suspensivo: confirmar antes de poner en cero impuestos capturados.
      if ((payload.regimen_aduanero ?? "") !== (exp.regimen_aduanero ?? "") && !exp.impuestos_override_manual
        && (await esRegimenSuspensivo(payload.regimen_aduanero)) && !(await esRegimenSuspensivo(exp.regimen_aduanero))) {
        const { data: conImp } = await supabase.from("mercancia_items").select("id")
          .eq("expediente_id", exp.id).is("deleted_at", null)
          .or("pct_gravamen.gt.0,pct_isc.gt.0");
        if ((conImp ?? []).length > 0) {
          if (!window.confirm(`El régimen "${payload.regimen_aduanero}" es suspensivo de impuestos. ${conImp!.length} línea(s) de mercancía tienen % Gravamen o % ISC capturados y se pondrán en cero. ¿Continuar?`)) {
            throw new Error("Cambio de régimen cancelado.");
          }
          const { error: eZ } = await supabase.from("mercancia_items")
            .update({ pct_gravamen: 0, pct_isc: 0, aplica_isc: false })
            .in("id", conImp!.map((r: any) => r.id));
          if (eZ) throw eZ;
          qc.invalidateQueries({ queryKey: ["mercancia-items", exp.id] });
        }
      }
      // Congelar la tasa cuando el expediente pasa a despachado o registra resultado oficial DGA.
      if (debeCongelar({ estado: exp.estado, liq_oficial_total: payload.liq_oficial_total, tasa_cambio_congelada: exp.tasa_cambio_congelada })) {
        payload.tasa_cambio_congelada = true;
        if (exp.tasa_cambio_usada != null) payload.tasa_cambio_usada = Number(exp.tasa_cambio_usada);
      }
      // Tasa Oficial DGA obligatoria antes de guardar.
      normalizarCamposExportacion(payload);
      await exigirTasaOficial(payload);
      // Validar que el número VUCE no esté ya usado en otro expediente.
      const vuceChanged = form.numero_vuce && form.numero_vuce !== (exp.numero_vuce ?? "");
      if (vuceChanged) {
        const { data: conflicto } = await supabase
          .from("expedientes")
          .select("id, numero")
          .eq("numero_vuce", form.numero_vuce)
          .neq("id", exp.id)
          .maybeSingle();
        if (conflicto) {
          throw new Error(`El número de permiso "${form.numero_vuce}" ya fue utilizado en el Expediente ${conflicto.numero}.`);
        }
      }
      const { error } = await supabase.from("expedientes").update(payload).eq("id", exp.id);
      if (error) throw error;
      await supabase.from("expediente_contenedores").delete().eq("expediente_id", exp.id);
      if (contValidos.length) {
        const { error: eCont } = await supabase.from("expediente_contenedores").insert(
          contValidos.map((c, i) => ({
            expediente_id: exp.id,
            item_no: i + 1,
            numero_contenedor: c.numero.trim(),
            sello1: c.sello1.trim() || null,
            sello2: c.sello2.trim() || null,
            tipo_contenedor: c.tipo.trim() || null,
          })),
        );
        if (eCont) throw eCont;
      }
      await guardarFilasServicioAduanero(exp.id, filasServicioAduanero);
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: exp.id, accion: "editado" });

    },
    onSuccess: () => {
      ultimoGuardadoPropio.set(exp.id, Date.now());
      toast.success("✓ Cambios guardados");
      {
        const falt = [
          !String(form.numero_dua ?? "").trim() && "Declaración DUA",
          !String(form.numero_igra ?? "").trim() && "Número de despacho",
          !String(form.regimen_aduanero ?? "").trim() && "Régimen Aduanero",
        ].filter(Boolean);
        if (falt.length) toast.warning(`Campos requeridos pendientes en Declaración: ${falt.join(", ")}. Serán obligatorios para pasar a Despachado.`);
      }
      setModoEdicion(false);
      if (nuevo) {
        nav({ to: "/expedientes/$id", params: { id: exp.id }, search: {} });
      }
      qc.invalidateQueries({ queryKey: ["expediente", exp.id] });
      qc.invalidateQueries({ queryKey: ["expediente-contenedores", exp.id] });
      qc.invalidateQueries({ queryKey: ["expediente-servicio-aduanero", exp.id] });

      qc.invalidateQueries({ queryKey: ["expedientes"] });
      qc.invalidateQueries({ queryKey: ["expedientes-hist"] });
    },
    onError: (e: any) => {
      if (e?.message === "Tasa Oficial DGA requerida") return; // ya se notificó con scroll al campo
      if (e?.code === "23505") {
        const msg = String(e?.message || "");
        if (msg.includes("numero_vuce")) {
          toast.error("Ese número de permiso ya está en uso en otro Expediente — actualiza la página e intenta de nuevo.");
        } else if (msg.includes("numero") || msg.includes("expedientes_numero")) {
          toast.error("Ese número de Expediente ya está en uso — elige otro número o actualiza la página.");
        } else {
          toast.error("Ya existe un registro con ese mismo valor en un campo único — revisa los datos e intenta de nuevo.");
        }
      } else {
        toast.error(e.message);
      }
    },
  });

  // Indicador de cambios sin guardar y resultado del último guardado.
  const [base, setBase] = useState<string | null>(null);
  const [estadoGuardado, setEstadoGuardado] = useState<null | "ok" | "error">(null);
  const snapshot = JSON.stringify([form, contenedores]);
  useEffect(() => {
    if (modoEdicion && !isNuevo) setBase((b) => b ?? snapshot);
    if (!modoEdicion) setBase(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoEdicion, isNuevo]);
  const hayCambios = editable && !isNuevo && base !== null && base !== snapshot;
  useEffect(() => {
    if (hayCambios && estadoGuardado === "ok") setEstadoGuardado(null);
  }, [hayCambios, estadoGuardado]);
  useEffect(() => {
    if (save.isSuccess) {
      setEstadoGuardado("ok");
      const t = setTimeout(() => setEstadoGuardado(null), 4000);
      return () => clearTimeout(t);
    }
    if (save.isError) {
      setEstadoGuardado("error");
      toast.error("✗ No se pudo guardar, intenta de nuevo");
      const t = setTimeout(() => setEstadoGuardado(null), 6000);
      return () => clearTimeout(t);
    }
  }, [save.isSuccess, save.isError, save.submittedAt]);



  // Creación de un Expediente nuevo (id === "nuevo").
  const crear = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      const contValidos = contenedores.filter((c) => c.numero.trim());
      if (!payload.numero) delete payload.numero; // numeración automática
      if (!payload.fecha_compromiso) payload.fecha_compromiso = null;
      if (!payload.tipo_operacion || !payload.tipo_operacion.trim()) payload.tipo_operacion = "Importación";
      if (!payload.fecha_llegada_real) payload.fecha_llegada_real = null;
      if (!payload.fecha_cargado) payload.fecha_cargado = null;
      if (!payload.cliente_id) payload.cliente_id = null;
      const toNum = (v: any) => (v === "" || v == null ? null : Number(v));
      payload.peso_neto = toNum(payload.peso_neto);
      payload.peso_bruto = toNum(payload.peso_bruto);
      payload.total_fob = productosNuevos.length ? sumFob : toNum(payload.total_fob);
      payload.seguro = toNum(payload.seguro);
      payload.flete = toNum(payload.flete);
      payload.otros = toNum(payload.otros);
      payload.total_cif = (payload.total_fob ?? 0) + (payload.seguro ?? 0) + (payload.flete ?? 0) + (payload.otros ?? 0);
      payload.liq_oficial_total = toNum(payload.liq_oficial_total);
      payload.cantidad_despacho = toNum(payload.cantidad_despacho);
      if (!payload.tipo_despacho_aduanero) payload.tipo_despacho_aduanero = null;
      if (!payload.liq_siga_numero) payload.liq_siga_numero = null;
      if (!payload.liq_siga_estado) payload.liq_siga_estado = null;
      if (!payload.liq_siga_pin_pago) payload.liq_siga_pin_pago = null;
      if (!payload.liq_siga_fecha_pago) payload.liq_siga_fecha_pago = null;
      payload.liq_siga_registro_at = localInputToIso(payload.liq_siga_registro_at);
      payload.liq_siga_termino_at = localInputToIso(payload.liq_siga_termino_at);
      payload.liq_siga_fecha_registro = payload.liq_siga_registro_at
        ? isoToLocalInput(payload.liq_siga_registro_at).slice(0, 10)
        : null;
      normalizarPinesPago(payload);
      if (!payload.regimen_aduanero) payload.regimen_aduanero = null;
      if (!payload.acuerdo_comercial) payload.acuerdo_comercial = null;
      if (!payload.acuerdo_codigo) payload.acuerdo_codigo = null;
      if (contValidos.length) payload.numeros_contenedores = contValidos.map((c) => c.numero.trim()).join(", ");

      // Tasa Oficial DGA obligatoria antes de crear.
      normalizarCamposExportacion(payload);
      await exigirTasaOficial(payload);
      if (payload.numero_vuce) {
        const { data: conflicto } = await supabase
          .from("expedientes")
          .select("id, numero")
          .eq("numero_vuce", payload.numero_vuce)
          .maybeSingle();
        if (conflicto) {
          throw new Error(`El número de permiso "${payload.numero_vuce}" ya fue utilizado en el Expediente ${conflicto.numero}.`);
        }
      }

      const { data, error } = await supabase.from("expedientes").insert(payload).select().single();
      if (error) throw error;

      if (productosNuevos.length) {
        const { error: eProd } = await supabase.from("mercancia_items").insert(
          productosNuevos.map((p: any, i: number) => {
            const { id: _localId, item_no: _no, ...resto } = p;
            return { ...resto, expediente_id: data.id, item_no: i + 1 };
          }),
        );
        if (eProd) throw eProd;
      }


      if (contValidos.length) {
        await supabase.from("expediente_contenedores").insert(
          contValidos.map((c, i) => ({
            expediente_id: data.id,
            item_no: i + 1,
            numero_contenedor: c.numero.trim(),
            sello1: c.sello1.trim() || null,
            sello2: c.sello2.trim() || null,
            tipo_contenedor: c.tipo.trim() || null,
          })),
        );
      }
      await guardarFilasServicioAduanero(data.id, filasServicioAduanero);
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: data.id, accion: "creado" });
      return data;

    },
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      qc.invalidateQueries({ queryKey: ["expedientes-hist"] });
      toast.success(`Expediente ${row.numero} creado`);
      nav({ to: "/expedientes/$id", params: { id: row.id }, search: { nuevo: "1", solicitud: "" } });
    },
    onError: (e: any) => {
      if (e?.message === "Tasa Oficial DGA requerida") return; // ya se notificó con scroll al campo
      if (e?.code === "23505") {
        toast.error("Ya existe un Expediente con ese mismo valor en un campo único — revisa los datos e intenta de nuevo.");
      } else {
        toast.error(e.message);
      }
    },
  });

  const hasSolicitud = !isNuevo && !!(exp.solicitud_id || exp.tipo_operacion || exp.tipo_carga || exp.contacto_solicitud);

  // Campos obligatorios para poder crear el Expediente.
  const lleno = (v: any) => String(v ?? "").trim() !== "";
  const OBLIGATORIOS: Array<{ id: string; ok: boolean }> = [
    { id: "req-tipo_carga", ok: lleno(form.tipo_carga) },
    { id: "req-cliente_id", ok: lleno(form.cliente_id) },
    { id: "req-suplidor", ok: esExportacion || lleno(form.suplidor) },
    { id: "req-bl_awb", ok: lleno(form.bl_awb) },
    { id: "req-factura_comercial", ok: lleno(form.factura_comercial) },
    { id: "req-puerto_arribo", ok: lleno(form.puerto_arribo) },
    { id: "req-area_aduanera", ok: lleno(form.area_aduanera) },
    { id: "req-regimen_aduanero", ok: lleno(form.regimen_aduanero) },
    { id: "req-mercancia", ok: productosNuevos.length > 0 },
    { id: "req-flete", ok: lleno(form.flete) },
    { id: "req-seguro", ok: lleno(form.seguro) },
  ];
  const limpiarFaltante = (id: string) =>
    setCamposFaltantes((prev) => {
      if (!prev.has(id)) return prev;
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  const intentarCrear = () => {
    const faltantes = OBLIGATORIOS.filter((o) => !o.ok);
    if (faltantes.length > 0) {
      setCamposFaltantes(new Set(faltantes.map((f) => f.id)));
      toast.error("Completa los campos obligatorios antes de crear el Expediente");
      const el = typeof document !== "undefined" ? document.getElementById(faltantes[0].id) : null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        (el.querySelector("input, button, textarea") as HTMLElement | null)?.focus?.();
      }
      return;
    }
    setCamposFaltantes(new Set());
    crear.mutate();
  };

  // Publica el estado de guardado para los botones del panel superior fijo.
  useEffect(() => {
    if (isNuevo) return;
    publicarEstadoGuardado({ hayCambios, editable, puedeEditar: canEdit && !modoEdicion, pendiente: save.isPending, estado: estadoGuardado });
  }, [isNuevo, hayCambios, editable, canEdit, modoEdicion, save.isPending, estadoGuardado]);
  useEffect(() => () => publicarEstadoGuardado(null), []);
  useEffect(() => {
    if (isNuevo) return;
    const onSave = () => save.mutate();
    const onEdit = () => setModoEdicion(true);
    window.addEventListener("exp-guardar", onSave);
    window.addEventListener("exp-editar", onEdit);
    return () => { window.removeEventListener("exp-guardar", onSave); window.removeEventListener("exp-editar", onEdit); };
  });

  const BotonesAccion = () => !isNuevo || !nuevoAccionesHost ? null : createPortal(
    <>
      <Button size="sm" variant="outline" onClick={() => nav({ to: "/expedientes" })}>Cancelar</Button>
      <Button size="sm" onClick={intentarCrear} disabled={crear.isPending}>
        <Check className="h-4 w-4 mr-1" /><span key={crear.isPending ? "p" : "i"}>{crear.isPending ? "Creando…" : "Crear Expediente"}</span>
      </Button>
    </>, nuevoAccionesHost
  );

  return (
    <div className="space-y-5">
      <BotonesAccion />

      {hasSolicitud && (
        <Section id="datos-solicitud-original" className="bg-muted/30 border-dashed" title={
          <span className="flex items-center justify-between gap-3">
            <span>Datos de la Solicitud Original</span>
            {exp.solicitudes?.numero && exp.solicitud_id && (
              <Link to="/solicitudes/$id" params={{ id: exp.solicitud_id }} className="text-xs font-normal text-primary underline" onClick={(e) => e.stopPropagation()}>
                {exp.solicitudes.numero} ↗
              </Link>
            )}
          </span>
        } subtitle="Referencia conservada al momento de la conversión. Tipo de operación, tipo de carga y contacto son editables con el botón &quot;Editar&quot;.">
            <Field label="Tipo de operación" value={form.tipo_operacion} onChange={(v) => set("tipo_operacion", v)} disabled={!editable} />
            {!editable
              ? <ReadOnlyField label="Tipo de carga" value={form.tipo_carga} />
              : <CatalogoAutocomplete tabla="catalogo_tipos_carga" label="Tipo de carga" value={form.tipo_carga} onChange={(v) => set("tipo_carga", v)} placeholder="Escribe o selecciona…" />}
            <ReadOnlyField label="Origen" value={exp.pais_origen} />
            <ReadOnlyField label="Incoterm" value={exp.incoterm} />
            <AutoField label="Contacto" value={form.contacto_solicitud} onChange={(v) => set("contacto_solicitud", v)} suggestion={(exp as any)?.clientes?.contacto ? [(exp as any).clientes.contacto] : []} disabled={!editable} />
        </Section>
      )}

      <Section id="informacion-general" title="1. Información general" subtitle="Identificación y logística base del expediente">
        {isNuevo ? (
          <>
            <div className={cn("grid gap-1.5", camposFaltantes.has("req-cliente_id") && "ring-2 ring-destructive rounded-md p-2 -m-2")} id="req-cliente_id">
              <Label><ReqMark />Cliente</Label>
              <Select value={form.cliente_id || undefined} onValueChange={(v) => { set("cliente_id", v); if (v) setClienteExtraidoSinMatch(null); limpiarFaltante("req-cliente_id"); }}>
                <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                <SelectContent>
                  {(clientesLite ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.cliente_id && (() => {
                const c = (clientesLite ?? []).find((cl: any) => cl.id === form.cliente_id);
                if (!c) return null;
                return (
                  <div className="mt-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
                    {c.registrado_proindustria && (
                      <div className="font-semibold text-emerald-700">Empresa registrada en PROINDUSTRIA — revisar qué partidas califican para ITBIS 9%.</div>
                    )}
                    <div><span className="text-muted-foreground">RNC:</span> {c.rnc ?? "—"}</div>
                    <div><span className="text-muted-foreground">Contacto:</span> {c.contacto ?? "—"}</div>
                    <div><span className="text-muted-foreground">Email:</span> {c.email ?? "—"}</div>
                    <div><span className="text-muted-foreground">Teléfono:</span> {c.telefono ?? "—"}</div>
                    <div><span className="text-muted-foreground">Dirección:</span> {c.direccion ?? "—"}</div>
                  </div>
                );
              })()}
              {clienteExtraidoSinMatch && (
                <p className="text-xs text-amber-600 mt-1">
                  El documento indica "{clienteExtraidoSinMatch}" — no se encontró un cliente registrado con ese nombre, selecciónalo manualmente.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label><ReqMark />Tipo de operación</Label>
              <Select value={form.tipo_operacion || "Importación"} onValueChange={(v) => set("tipo_operacion", v)} disabled={!editable}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Importación">Importación</SelectItem>
                  <SelectItem value="Exportación">Exportación</SelectItem>
                  <SelectItem value="Otros">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={cn("grid gap-1.5", camposFaltantes.has("req-tipo_carga") && "ring-2 ring-destructive rounded-md p-2 -m-2", tipoCargaSugerido && "ring-2 ring-warning rounded-md p-2 -m-2")} id="req-tipo_carga">
              <Label className="flex items-center gap-1.5"><ReqMark />Tipo de carga
                {tipoCargaSugerido && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-warning bg-warning/10 px-1.5 py-0 text-[10px] font-medium text-warning-foreground" title="Valor inferido por la IA a partir del documento — confírmalo antes de guardar">
                    <AlertTriangle className="h-3 w-3" /> Sugerido por IA — confirmar
                  </span>
                )}
              </Label>
              <CatalogoAutocomplete tabla="catalogo_tipos_carga" value={form.tipo_carga} onChange={(v) => { set("tipo_carga", v); limpiarFaltante("req-tipo_carga"); setTipoCargaSugerido(false); }} placeholder="Escribe o selecciona…" />
            </div>
            <AutoField label="Contacto" value={form.contacto_solicitud} onChange={(v) => set("contacto_solicitud", v)} suggestion={sugContactoCliente} />
          </>
        ) : (
          <Field label="Número / ID" value={form.numero} onChange={(v) => set("numero", v)} disabled={!editable} className="[&_input]:text-brand-red [&_input]:font-bold [&_input:disabled]:opacity-100" />
        )}
        <Field label="BL / AWB / Guía" value={form.bl_awb} onChange={(v) => { set("bl_awb", v); limpiarFaltante("req-bl_awb"); }} disabled={!editable} req fieldId="req-bl_awb" highlight={camposFaltantes.has("req-bl_awb")} />
        <AutoField label="Medio de transporte" value={form.medio_transporte} onChange={(v) => set("medio_transporte", v)} suggestion={sug.medio_transporte ?? []} disabled={!editable} />
        <AutoField label="Naviera" value={form.naviera} onChange={(v) => set("naviera", v)} suggestion={sug.naviera ?? []} disabled={!editable} />
        <Field label="Fecha de Cargado" value={form.fecha_cargado} onChange={(v) => set("fecha_cargado", v)} type="date" disabled={!editable} />
        <Field label="Fecha Estimada de Llegada (ETA)" value={form.fecha_compromiso} onChange={(v) => set("fecha_compromiso", v)} type="date" disabled={!editable} />
        <div className="grid gap-1">
          <Field label="Fecha de Llegada Real" value={form.fecha_llegada_real} onChange={(v) => set("fecha_llegada_real", v)} type="date" disabled={!editable} req />
          <p className="text-[11px] leading-tight text-muted-foreground">
            Se llena cuando el embarque ya arribó de verdad — a partir de esta fecha corre el plazo legal de presentación (5 días hábiles).
          </p>
        </div>
      </Section>
      {!isNuevo && <EndosoSection expedienteId={id} clienteOriginal={exp?.clientes ? { id: exp.cliente_id, nombre: exp.clientes.nombre } : null} editable={canEdit} solicitudApertura={solicitudEndoso} />}

      <Section id="datos-importacion" title={esExportacion ? "2. Datos de la operación" : "2. Datos de importación"} subtitle={esExportacion ? "Origen de la mercancía y términos comerciales" : "Origen, proveedor y términos comerciales"}>
        {!esExportacion && (
          <>
            <div className={cn("grid gap-1.5", camposFaltantes.has("req-suplidor") && "ring-2 ring-destructive rounded-md p-2 -m-2")} id="req-suplidor">
              <div className="flex items-center justify-between gap-2">
                <Label><ReqMark />Exportador / Suplidor</Label>
                {editable && (
                  <TerceroExtranjeroPicker
                    onSelect={(t) => { setForm((f) => ({ ...f, suplidor: t.nombre, suplidor_rnc: t.tid })); limpiarFaltante("req-suplidor"); }}
                  />
                )}
              </div>
              <Input value={form.suplidor} onChange={(e) => { set("suplidor", e.target.value); limpiarFaltante("req-suplidor"); }} placeholder="Nombre del exportador/suplidor" disabled={!editable} />
            </div>
            <div className="grid gap-1.5">
              <Label>TID del exportador/suplidor</Label>
              <Input value={form.suplidor_rnc ?? ""} onChange={(e) => set("suplidor_rnc", e.target.value)} placeholder="TID del exportador/suplidor" disabled={!editable} />
            </div>
          </>
        )}
        <div className="grid gap-1.5">
          <Label><ReqMark />País de origen</Label>
          <DgaCombobox
            table="dga_paises"
            value={form.pais_origen}
            codigo={form.pais_origen_codigo}
            onChange={(nombre, codigo) => setForm((f) => ({ ...f, pais_origen: nombre, pais_origen_codigo: codigo }))}
            placeholder="Selecciona país (catálogo DGA)"
            disabled={!editable}
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
            placeholder="Selecciona país (catálogo DGA)"
            disabled={!editable}
          />
          {form.pais_procedencia && !form.pais_procedencia_codigo && (
            <span className="text-[11px] text-amber-700">Sin código DGA: selecciona el país del catálogo para el XML.</span>
          )}
        </div>

        <AutoField label="Factura comercial" value={form.factura_comercial} onChange={(v) => { set("factura_comercial", v); limpiarFaltante("req-factura_comercial"); }} suggestion={sug.factura_comercial ?? []} disabled={!editable} req fieldId="req-factura_comercial" highlight={camposFaltantes.has("req-factura_comercial")} />
        <AutoField label="Incoterm" value={form.incoterm} onChange={(v) => set("incoterm", v)} suggestion={sug.incoterm ?? []} disabled={!editable} />
        <div className="grid gap-1.5">
          <Label>Puerto de salida</Label>
          <DgaCombobox
            table="dga_puertos"
            value={form.puerto_salida}
            codigo={form.puerto_salida_codigo}
            onChange={(nombre, codigo) => setForm((f) => ({ ...f, puerto_salida: nombre, puerto_salida_codigo: codigo }))}
            placeholder="Selecciona puerto (catálogo DGA)"
            disabled={!editable}
          />
          {form.puerto_salida && !form.puerto_salida_codigo && (
            <span className="text-[11px] text-amber-700">Sin código DGA: selecciona el puerto del catálogo.</span>
          )}
        </div>

      </Section>

      {esExportacion && (
        <Section id="comprador-exportacion" title="Comprador (Exportación)" subtitle="Datos del comprador y del declarante para la Declaración de Exportación">
          <Field label="Código del comprador" value={form.buyer_codigo} onChange={(v) => set("buyer_codigo", v)} disabled={!editable} />
          <Field label="Nombre del comprador" value={form.buyer_nombre} onChange={(v) => set("buyer_nombre", v)} disabled={!editable} />
          <Field label="Nacionalidad del comprador (ISO 3 letras)" value={form.buyer_nacionalidad} onChange={(v) => set("buyer_nacionalidad", v.toUpperCase())} disabled={!editable} />
          <Field label="Código del declarante" value={form.declarante_codigo} onChange={(v) => set("declarante_codigo", v)} disabled={!editable} />
          <Field label="Nombre del declarante" value={form.declarante_nombre} onChange={(v) => set("declarante_nombre", v)} disabled={!editable} />
          <Field label="Nacionalidad del declarante" value={form.declarante_nacionalidad} onChange={(v) => set("declarante_nacionalidad", v)} disabled={!editable} />
        </Section>
      )}

      {esExportacion && (
        <Section id="zona-franca" title="Zona Franca" subtitle="Valores del régimen de Zona Franca (solo si aplica)">
          <div className="flex items-center gap-3 md:col-span-2 lg:col-span-3">
            <Switch checked={!!form.zf_aplica} onCheckedChange={(v) => set("zf_aplica", v)} disabled={!editable} />
            <Label>¿Aplica Zona Franca?</Label>
          </div>
          {form.zf_aplica && (
            <>
              <Field label="Valor CIF" type="number" value={form.zf_valor_cif} onChange={(v) => set("zf_valor_cif", v)} disabled={!editable} />
              <Field label="Valor de materiales" type="number" value={form.zf_valor_materiales} onChange={(v) => set("zf_valor_materiales", v)} disabled={!editable} />
              <Field label="Valor de salarios" type="number" value={form.zf_valor_salario} onChange={(v) => set("zf_valor_salario", v)} disabled={!editable} />
              <Field label="Valor de servicios" type="number" value={form.zf_valor_servicio} onChange={(v) => set("zf_valor_servicio", v)} disabled={!editable} />
              <Field label="Otros valores" type="number" value={form.zf_otros_valores} onChange={(v) => set("zf_otros_valores", v)} disabled={!editable} />
            </>
          )}
        </Section>
      )}

      <Section id="declaracion" title="3. Declaración" subtitle="Documentos oficiales ante DGA y VUCE">
          <div className={cn("grid gap-1.5", camposFaltantes.has("req-puerto_arribo") && "ring-2 ring-destructive rounded-md p-2 -m-2")} id="req-puerto_arribo">
            <Label><ReqMark />Puerto de arribo</Label>
            <DgaCombobox
              table="dga_puertos"
              value={form.puerto_arribo}
              codigo={form.puerto_arribo_codigo}
              onChange={(nombre, codigo) => {
                const area = codigo ? puertoAreaRef.current[codigo] : undefined;
                setForm((f) => ({ ...f, puerto_arribo: nombre, puerto_arribo_codigo: codigo, ...(area ? { area_aduanera: area.nombre, area_aduanera_codigo: area.codigo } : {}) }));
                limpiarFaltante("req-puerto_arribo");
                if (area) limpiarFaltante("req-area_aduanera");
              }}
              placeholder="Buscar puerto (catálogo DGA)"
              disabled={!editable}
            />
            {form.puerto_arribo && !form.puerto_arribo_codigo && (
              <span className="text-[11px] text-amber-700">Sin código DGA: selecciona el puerto del catálogo para el XML.</span>
            )}
          </div>
          <div className={cn("grid gap-1.5", camposFaltantes.has("req-area_aduanera") && "ring-2 ring-destructive rounded-md p-2 -m-2")} id="req-area_aduanera">
            <Label><ReqMark />Área / Administración aduanera</Label>
            <DgaCombobox
              table="dga_areas"
              value={form.area_aduanera}
              codigo={form.area_aduanera_codigo}
              onChange={(nombre, codigo) => { setForm((f) => ({ ...f, area_aduanera: nombre, area_aduanera_codigo: codigo })); limpiarFaltante("req-area_aduanera"); }}
              placeholder="Buscar área (catálogo DGA)"
              disabled={!editable}
            />
          </div>
          {form.tipo_carga.trim().toUpperCase() !== "FCL" && (
            <div className="grid gap-1.5">
              <Label>Depósito de Destino</Label>
              <DepositoDestinoField
                areaCodigo={form.area_aduanera_codigo}
                value={form.deposito_destino}
                codigo={form.deposito_destino_codigo}
                onChange={(nombre, codigo) => setForm((f) => ({ ...f, deposito_destino: nombre, deposito_destino_codigo: codigo }))}
                disabled={!editable}
              />
            </div>
          )}
          <div className={cn("grid gap-1.5", camposFaltantes.has("req-regimen_aduanero") && "ring-2 ring-destructive rounded-md p-2 -m-2")} id="req-regimen_aduanero">
            <Label><ReqMark />Régimen Aduanero</Label>
            <Select value={form.regimen_aduanero || undefined} onValueChange={(v) => { set("regimen_aduanero", v); limpiarFaltante("req-regimen_aduanero"); }} disabled={!editable}>
              <SelectTrigger><SelectValue placeholder="Selecciona régimen" /></SelectTrigger>
              <SelectContent>
                {[
                  "Admisión Temporal",
                  "Admisión Temporal sin Transformación",
                  "Depósito de Reexportación",
                  "Depósito Fiscal",
                  "Depósito Logístico",
                  "Depósito Particular",
                  "Despacho a Consumo",
                  "Reimportación",
                  "Zona Franca Comercial",
                  "Zonas Francas Industrial y Especiales",
                ].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <AutoField label="Declaración DUA" value={form.numero_dua} onChange={(v) => set("numero_dua", v)} suggestion={sug.numero_dua ?? []} disabled={!editable} req />
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1">
              Fecha de Presentación
              {!form.fecha_presentacion_real && estadoIndex(exp?.estado) >= estadoIndex("presentar") && (
                <span className="inline-flex items-center gap-1 text-warning" title="Falta capturar la fecha real de presentación" role="img" aria-label="Falta capturar la fecha real de presentación">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-normal">Falta capturar</span>
                </span>
              )}
            </Label>
            <Input type="date" value={form.fecha_presentacion_real ?? ""} disabled={!editable}
              onFocus={() => { if (!form.fecha_presentacion_real && !sugeridaPresentacion.current) { sugeridaPresentacion.current = true; set("fecha_presentacion_real", hoyRDISO()); } }}
              onChange={(e) => set("fecha_presentacion_real", e.target.value)} />
          </div>
          <AutoField label="Número de despacho" value={form.numero_igra} onChange={(v) => set("numero_igra", v)} suggestion={sug.numero_igra ?? []} disabled={!editable} req />
          <Field label="Fecha de Aprobación" value={form.fecha_aprobacion_despacho} onChange={(v) => set("fecha_aprobacion_despacho", v)} type="date" disabled={!editable} />
          <AutoField label="Número de permiso" value={form.numero_vuce} onChange={(v) => set("numero_vuce", v)} suggestion={sug.numero_vuce ?? []} disabled={!editable} />
          <div className="grid gap-1.5">
            <Label>Rectificación técnica</Label>
            <div className="h-9 flex items-center gap-3">
              <Switch
                checked={form.rectificacion_tecnica}
                onCheckedChange={(v) => set("rectificacion_tecnica", v)}
                disabled={!editable}
              />
              <span className="text-sm text-muted-foreground">
                {form.rectificacion_tecnica ? "Sí" : "No"}
              </span>
            </div>
          </div>
          {form.rectificacion_tecnica && (
            <div className="grid gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <Label>N° de Trámite</Label>
              <Input
                value={form.numero_tramite_rectificacion}
                onChange={(e) => set("numero_tramite_rectificacion", e.target.value)}
                placeholder="RT-2026-0456"
                disabled={!editable}
              />
            </div>
          )}
          {form.rectificacion_tecnica && (
            <div className="grid gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <Label>Producto correcto</Label>
              <Input
                value={form.producto_correcto_rectificacion}
                onChange={(e) => set("producto_correcto_rectificacion", e.target.value)}
                placeholder="Descripción real de la mercancía"
                disabled={!editable}
              />
            </div>
          )}
          <AutoField label="Preferencia comercial" value={form.preferencia_comercial} onChange={(v) => set("preferencia_comercial", v)} suggestion={sug.preferencia_comercial ?? []} disabled={!editable} />
          {(() => {
            const p = (form.preferencia_comercial || "").trim().toLowerCase();
            const showCert = p !== "" && p !== "ninguna" && p !== "no aplica" && p !== "n/a";
            return showCert ? (
              <div className="grid gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <Label>N° Certificado de Origen</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={form.numero_certificado_origen}
                    onChange={(e) => set("numero_certificado_origen", e.target.value)}
                    placeholder="CO-2026-00123"
                    disabled={!editable}
                  />
                  {!isNuevo && (
                    <AplicarCertificadoPartidas
                      expedienteId={exp.id}
                      numeroCertificado={form.numero_certificado_origen}
                      preferenciaComercial={form.preferencia_comercial || ""}
                      disabled={!editable || !(form.numero_certificado_origen || "").trim()}
                    />
                  )}
                </div>
              </div>

            ) : null;
          })()}
          <div className="grid gap-1.5">
            <Label>Canal de riesgo</Label>
            <Select value={form.canal_riesgo || undefined} onValueChange={(v) => set("canal_riesgo", v)} disabled={!editable}>
              <SelectTrigger><SelectValue placeholder="Selecciona canal" /></SelectTrigger>
              <SelectContent>
                {["Verde","Amarillo","Rojo"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
      </Section>

      <Section id="descripcion-mercancia" title="4. Descripción de mercancía" subtitle="Detalle físico y clasificación de la carga">
          <div className="grid gap-1.5 md:col-span-2 lg:col-span-3">
            <Label>Descripción</Label>
            <Textarea rows={3} value={form.descripcion_mercancia} onChange={(e) => set("descripcion_mercancia", e.target.value)} disabled={!editable} />
          </div>
          <div className="grid gap-4 content-start">
            <div className="grid gap-1.5">
              <Label><ReqMark />Peso neto (kg)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.peso_neto ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (v === "" || /^\d*\.?\d*$/.test(v)) set("peso_neto", v);
                }}
                placeholder="0.00"
                disabled={!editable}
              />
            </div>
            <div className="grid gap-1.5">
              <Label><ReqMark />Peso bruto (kg)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={form.peso_bruto ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (v === "" || /^\d*\.?\d*$/.test(v)) set("peso_bruto", v);
                }}
                placeholder="0.00"
                disabled={!editable}
              />
            </div>
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Contenedores / Furgones</Label>
              {editable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setContenedores((r) => [...r, { numero: "", sello1: "", sello2: "", tipo: "" }])}
                >
                  Agregar contenedor
                </Button>
              )}
            </div>
            {contenedores.length === 0 ? (
              form.numeros_contenedores ? (
                <div className="grid gap-1.5">
                  <Input
                    value={form.numeros_contenedores}
                    onChange={(e) => set("numeros_contenedores", e.target.value)}
                    disabled={!editable}
                    placeholder="MSKU1234567, TCLU7654321"
                  />
                  <p className="text-xs text-muted-foreground">
                    Contenedores registrados como texto (formato anterior). Puedes editarlos aquí o agregarlos a la lista estructurada con “Agregar contenedor”.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin contenedores registrados.</p>
              )
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-2 text-left w-10">#</th>
                      <th className="px-2 py-2 text-left">Número</th>
                      <th className="px-2 py-2 text-left">Sello 1</th>
                      <th className="px-2 py-2 text-left">Sello 2</th>
                      <th className="px-2 py-2 text-left">Tipo</th>
                      {editable && <th className="px-2 py-2 w-10"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {contenedores.map((c, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1"><Input value={c.numero} onChange={(e) => setCont(i, "numero", e.target.value)} disabled={!editable} placeholder="MSKU1234567" /></td>
                        <td className="px-2 py-1"><Input value={c.sello1} onChange={(e) => setCont(i, "sello1", e.target.value)} disabled={!editable} /></td>
                        <td className="px-2 py-1"><Input value={c.sello2} onChange={(e) => setCont(i, "sello2", e.target.value)} disabled={!editable} /></td>
                        <td className="px-2 py-1"><Input value={c.tipo} onChange={(e) => setCont(i, "tipo", e.target.value)} disabled={!editable} placeholder="40HC" /></td>
                        {editable && (
                          <td className="px-2 py-1 text-right">
                            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                              onClick={() => setContenedores((r) => r.filter((_, idx) => idx !== i))}>
                              ✕
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              El campo “Números de contenedores” se actualiza automáticamente con esta lista al guardar.
            </p>
          </div>
          <div className={cn("md:col-span-2 lg:col-span-3", camposFaltantes.has("req-mercancia") && "ring-2 ring-destructive rounded-md p-2 -m-2")} id="req-mercancia">
            {isNuevo && (
              <Label className="mb-1.5 block"><ReqMark />Detalle de mercancía (al menos 1 producto)</Label>
            )}
            <MercanciaItemsBlock
              expedienteId={exp.id}
              servicioAduaneroUsd={servicioAd.servicioUsd}
              seguro={Number(form.seguro) || 0}
              flete={Number(form.flete) || 0}
              otros={Number(form.otros) || 0}
              preferenciaComercial={form.preferencia_comercial || ""}
              tasaCambioUsada={exp.tasa_cambio_usada}
              paisOrigen={form.pais_origen || ""}
              paisOrigenCodigo={form.pais_origen_codigo || ""}
              disabled={!editable}
              esExportacion={esExportacion}
              {...(isNuevo ? { localItems: productosNuevos, onLocalItemsChange: setProductosNuevos } : {})}
            />
          </div>
          
          {(() => {
            const toN = (v: any) => (v === "" || v == null ? 0 : Number(v) || 0);
            const fob = isNuevo ? (productosNuevos.length ? sumFob : toN(form.total_fob)) : sumFob;
            const cif = fob + toN(form.seguro) + toN(form.flete) + toN(form.otros);
            const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const renderMoney = (label: string, k: "seguro" | "flete" | "otros" | "total_fob", helper?: string, req = false) => {
              const raw = (form as any)[k];
              const rawStr = raw === "" || raw == null ? "" : String(raw);
              const isFocused = focusedMoney === k;
              const display = isFocused
                ? rawStr
                : rawStr === "" || isNaN(Number(rawStr))
                  ? ""
                  : `$${Number(rawStr).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              const reqId = req ? `req-${k}` : undefined;
              return (
                <div className={cn("grid gap-1.5", reqId && camposFaltantes.has(reqId) && "ring-2 ring-destructive rounded-md p-2 -m-2")} key={k} id={reqId}>
                  <Label>{req && isNuevo && <ReqMark />}{label} (US$)</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={display}
                    onFocus={() => { if (!editable) return; setFocusedMoney(k); }}
                    onChange={(e) => {
                      if (!editable) return;
                      const v = e.target.value.replace(/[$,\s]/g, "");
                      if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) set(k, v);
                      if (reqId) limpiarFaltante(reqId);
                    }}
                    onBlur={(e) => {
                      if (!editable) return;
                      const v = e.target.value.replace(/[$,\s]/g, "");
                      if (v !== "" && !isNaN(Number(v))) set(k, Number(v).toFixed(2));
                      setFocusedMoney(null);
                    }}
                    placeholder="$0.00"
                    className="tabular-nums"
                    disabled={!editable}
                  />
                  {helper && <p className="text-[11px] text-muted-foreground leading-tight">{helper}</p>}
                </div>
              );
            };




            return (
              <div className="md:col-span-2 lg:col-span-3 grid gap-4 pt-2 border-t">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Valores CIF</div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {isNuevo && !productosNuevos.length ? (
                    renderMoney("Total FOB", "total_fob", "Se calcula automáticamente al agregar productos al Detalle de Mercancía.")
                  ) : (
                  <div className="grid gap-1.5">
                    <Label className="flex items-center gap-1.5">
                      Total FOB (US$)
                      <span className="text-xs text-muted-foreground font-normal">🔒 calculado</span>
                    </Label>
                    <div className="h-9 px-3 rounded-md border bg-muted/50 flex items-center text-sm font-semibold tabular-nums">
                      {fmt(fob)}
                    </div>
                  </div>
                  )}
                  {renderMoney("Seguro", "seguro", "Por defecto 2% del FOB (valor de referencia). Edítalo si tienes el monto real de la póliza.", true)}
                  {renderMoney("Flete", "flete", undefined, true)}
                  {renderMoney("Otros", "otros")}

                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label className="flex items-center gap-1.5">
                      Total CIF (US$)
                      <span className="text-xs text-muted-foreground font-normal">🔒 calculado</span>
                    </Label>
                    <div className="h-9 px-3 rounded-md border bg-muted/50 flex items-center text-sm font-semibold tabular-nums">
                      {fmt(cif)}
                    </div>
                  </div>
                  {esExportacion && (
                    <div className="grid gap-1.5 md:col-span-2">
                      <Label>Régimen (Exportación)</Label>
                      <Select
                        value={form.regimen_codigo_exportacion || undefined}
                        onValueChange={(v) => set("regimen_codigo_exportacion", v)}
                        disabled={!editable}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecciona régimen de exportación" /></SelectTrigger>
                        <SelectContent>
                          {(regimenesExportacion ?? []).map((r: any) => (
                            <SelectItem key={r.codigo} value={r.codigo}>{r.codigo} · {r.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid gap-1.5 md:col-span-2">
                    <Label>Acuerdo Comercial <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                     <Select
                       value={form.acuerdo_codigo || "__none__"}
                       onValueChange={(v) => {
                         if (v === "__none__") {
                           setForm((f) => ({ ...f, acuerdo_codigo: "", acuerdo_comercial: "" }));
                           return;
                         }
                         const a = (acuerdosComerciales ?? []).find((x: any) => x.codigo === v);
                         setForm((f) => ({ ...f, acuerdo_codigo: v, acuerdo_comercial: a?.nombre ?? "" }));
                       }}
                       disabled={!editable}
                     >
                       <SelectTrigger><SelectValue placeholder="N/A / Ninguno" /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="__none__">N/A / Ninguno</SelectItem>
                         {(acuerdosComerciales ?? []).map((a: any) => (
                           <SelectItem key={a.codigo} value={a.codigo}>{a.codigo} · {a.nombre}</SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                  </div>
                  {isNuevo && (
                    <div id="tasa-oficial-nuevo" className="grid gap-1.5">
                      <Label><ReqMark />Tasa Oficial DGA (RD$ por US$1)</Label>
                      {tasaCatalogoFecha != null && !tasaNuevaInput ? (
                        <>
                          <div className="h-9 px-3 rounded-md border bg-muted/50 flex items-center text-sm font-semibold tabular-nums">
                            {Number(tasaCatalogoFecha).toFixed(4)}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            Tomada del catálogo para {fechaTasaVigente}.{" "}
                            <button type="button" className="underline" onClick={() => setTasaNuevaInput(Number(tasaCatalogoFecha).toFixed(4))}>
                              Cambiarla
                            </button>
                          </p>
                        </>
                      ) : (
                        <>
                          <Input
                            inputMode="decimal"
                            placeholder="59.4100"
                            className="font-mono tabular-nums"
                            value={tasaNuevaInput}
                            disabled={!editable}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[$,\s]/g, "");
                              if (v === "" || /^\d*\.?\d{0,4}$/.test(v)) setTasaNuevaInput(v);
                            }}
                          />
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            No hay tasa en el catálogo para {fechaTasaVigente}. Ingrésala aquí; se guardará para todos los Expedientes de ese día.{" "}
                            <a href="https://www.aduanas.gob.do/tasa-de-cambio/" target="_blank" rel="noopener noreferrer" className="underline">
                              Ver tasa oficial
                            </a>
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  <ServicioAduaneroFields
                    filas={filasServicioAduanero}
                    onChange={setFilasServicioAduanero}
                    disabled={!editable}
                    extraAction={
                      <Button type="button" variant="outline" size="sm" onClick={autocompletarDesdeContenedores}>
                        Autocompletar desde Contenedores
                      </Button>
                    }
                  />
                  <div className="grid gap-1.5">
                    <Label className="flex items-center gap-1.5">
                      Servicio Aduanero (US$)
                      <span className="text-xs text-muted-foreground font-normal">🔒 calculado</span>
                    </Label>
                    <div className="h-9 px-3 rounded-md border bg-muted/50 flex items-center text-sm font-semibold tabular-nums">
                      {fmt(servicioAd.servicioUsd)}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Más Formulario DUA: RD$ {FORMULARIO_DUA_RD.toFixed(2)} (cargo fijo).
                    </p>
                  </div>

                </div>
              </div>
            );
          })()}

          {!isNuevo && (
            <>
              <div className="md:col-span-2 lg:col-span-3">
                <LiquidacionEstimadaBlock
                  exp={exp}
                  seguro={Number(form.seguro) || 0}
                  flete={Number(form.flete) || 0}
                  otros={Number(form.otros) || 0}
                  servicioAduaneroUsd={servicioAd.servicioUsd}
                  disabled={!editable}
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <ResultadoOficialBlock
                  exp={exp}
                  form={form}
                  set={set}
                  servicioAduaneroUsd={servicioAd.servicioUsd}
                  disabled={!editable}
                />
              </div>
            </>
          )}

          <div className="grid gap-1.5 md:col-span-2 lg:col-span-3">
            <Label>Observaciones</Label>
            <Textarea rows={3} value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} disabled={!editable} />
          </div>
      </Section>

    </div>
  );
}


function TabDocumentos({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editPath, setEditPath] = useState<string | null>(null);
  const [tipo, setTipo] = useState(TIPOS_DOC[0]);
  const [venc, setVenc] = useState("");
  const [obs, setObs] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmacion, setConfirmacion] = useState<{ titulo: string; mensaje: string; requiereCheck?: boolean; resolve: (v: boolean) => void } | null>(null);
  const [confirmAck, setConfirmAck] = useState(false);
  const cerrarConfirmacion = (v: boolean) => { confirmacion?.resolve(v); setConfirmacion(null); };

  const { data: docs } = useQuery({
    queryKey: ["documentos", expedienteId],
    queryFn: async () => (await supabase.from("documentos").select("*").eq("expediente_id", expedienteId).order("created_at", { ascending: false })).data ?? [],
  });

  const resetForm = () => { setEditId(null); setEditPath(null); setTipo(TIPOS_DOC[0]); setVenc(""); setObs(""); setFile(null); };

  const openNuevo = (tipoPre?: string) => { resetForm(); if (tipoPre) setTipo(tipoPre); setOpen(true); };

  const openEdit = (d: any) => {
    setEditId(d.id);
    setEditPath(d.storage_path ?? null);
    setTipo(d.tipo ?? TIPOS_DOC[0]);
    setVenc(d.fecha_vencimiento ?? "");
    setObs(d.observaciones ?? "");
    setFile(null);
    setOpen(true);
  };

  const pedirConfirmacion = (c: { titulo: string; mensaje: string; requiereCheck?: boolean }) =>
    new Promise<boolean>((resolve) => { setConfirmAck(false); setConfirmacion({ ...c, resolve }); });

  const upload = async () => {
    if (file && CHECKLIST_DOCUMENTOS_BASE.includes(tipo) && !(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      toast.error("Este documento del Checklist de Recepción solo acepta archivos PDF.");
      return;
    }
    if (file) {
      const v = validarNombreSiga(file.name, prefijoSiga(tipo));
      if (!v.ok) { toast.error(v.error, { duration: 8000 }); return; }
      if (v.advertencia) toast.warning(v.advertencia, { duration: 8000 });
    }
    setUploading(true);
    try {
      let fileHash: string | null = null;
      if (file) {
        fileHash = await sha256File(file);
        const dup = (docs ?? []).find((d: any) => d.file_hash === fileHash && d.id !== editId && d.tipo !== tipo);
        if (dup) {
          const ok = await pedirConfirmacion({
            titulo: "Archivo duplicado",
            mensaje: `Este archivo ya fue cargado como ${dup.tipo}${dup.codigo_siga ? ` (${dup.codigo_siga})` : ""}. ¿Seguro que también corresponde a ${tipo}?`,
            requiereCheck: true,
          });
          if (!ok) return;
        }
      }
      const docActual: any = editId ? (docs ?? []).find((d: any) => d.id === editId) : null;
      const codigo = file
        ? (docActual?.codigo_siga && prefijoSiga(docActual.tipo) === prefijoSiga(tipo)
            ? docActual.codigo_siga
            : await siguienteCodigoSiga(expedienteId, prefijoSiga(tipo)))
        : docActual?.codigo_siga ?? null;
      if (editId) {
        let path = editPath;
        if (file) {
          const newPath = `${expedienteId}/${Date.now()}_${file.name}`;
          const { error } = await supabase.storage.from("documentos").upload(newPath, file);
          if (error) throw error;
          if (editPath) await supabase.storage.from("documentos").remove([editPath]);
          path = newPath;
        }
        const { error: e2 } = await supabase.from("documentos").update({
          tipo, storage_path: path,
          ...(file ? { file_hash: fileHash, codigo_siga: codigo, estado: "recibido" as const, fecha_recepcion: docActual?.fecha_recepcion ?? new Date().toISOString().slice(0, 10) } : {}),
          fecha_vencimiento: venc || null, observaciones: obs || null,
        }).eq("id", editId);
        if (e2) throw e2;
        toast.success(codigo && file ? `Documento actualizado · ${codigo}` : "Documento actualizado");
      } else {
        let path: string | null = null;
        if (file) {
          path = `${expedienteId}/${Date.now()}_${file.name}`;
          const { error } = await supabase.storage.from("documentos").upload(path, file);
          if (error) throw error;
        }
        const { error: e2 } = await supabase.from("documentos").insert({
          expediente_id: expedienteId, tipo, storage_path: path,
          estado: file ? "recibido" : "pendiente",
          fecha_recepcion: file ? new Date().toISOString().slice(0, 10) : null,
          fecha_vencimiento: venc || null, observaciones: obs || null,
          file_hash: fileHash, codigo_siga: codigo,
        });
        if (e2) throw e2;
        toast.success(codigo ? `Documento agregado · ${codigo}` : "Documento agregado");
      }
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      setOpen(false); resetForm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const eliminar = async (d: any) => {
    if (!confirm("¿Eliminar este documento? Esta acción no se puede deshacer.")) return;
    try {
      if (d.storage_path) await supabase.storage.from("documentos").remove([d.storage_path]);
      const { error } = await supabase.from("documentos").delete().eq("id", d.id);
      if (error) throw error;
      toast.success("Documento eliminado");
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const cambiarEstado = async (docId: string, estado: string) => {
    await supabase.from("documentos").update({ estado: estado as any }).eq("id", docId);
    qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
  };

  const marcarRecibido = async (tipoDoc: string, d?: any) => {
    const hoy = new Date().toLocaleDateString("en-CA");
    try {
      if (d) {
        const { error } = await supabase.from("documentos").update({
          estado: "recibido",
          fecha_recepcion: d.fecha_recepcion ?? hoy,
        }).eq("id", d.id);
        if (error) throw error;
        toast.success("Documento marcado como recibido");
      } else {
        const { error } = await supabase.from("documentos").insert({
          expediente_id: expedienteId,
          tipo: tipoDoc,
          estado: "recibido",
          fecha_recepcion: hoy,
          storage_path: null,
        });
        if (error) throw error;
        toast.success("Documento marcado como recibido");
      }
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };


  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Documentos ({docs?.length ?? 0})</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <Button size="sm" onClick={() => openNuevo()}><Upload className="h-4 w-4 mr-1" />Subir documento</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Editar documento" : "Nuevo documento"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_DOC.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>{editId ? "Reemplazar archivo (opcional)" : "Archivo"}{CHECKLIST_DOCUMENTOS_BASE.includes(tipo) && <span className="text-xs text-muted-foreground ml-1">(solo PDF)</span>}</Label><Input type="file" accept={CHECKLIST_DOCUMENTOS_BASE.includes(tipo) ? "application/pdf,.pdf" : undefined} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
              <div className="grid gap-1.5"><Label>Fecha vencimiento</Label><Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Observaciones</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
            </div>
            <DialogFooter><Button onClick={upload} disabled={uploading}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent className="p-0">
        {(() => {
          const latestByTipo = new Map<string, any>();
          for (const d of (docs ?? []) as any[]) {
            const prev = latestByTipo.get(d.tipo);
            const t = (x: any) => new Date(x?.fecha_recepcion ?? x?.created_at ?? 0).getTime();
            if (!prev || t(d) >= t(prev)) latestByTipo.set(d.tipo, d);
          }
          const recibidos = CHECKLIST_DOCUMENTOS_BASE.filter((t) => {
            const d = latestByTipo.get(t);
            return d && ["recibido", "aprobado", "observado"].includes(d.estado);
          }).length;
          const pct = Math.round((recibidos / CHECKLIST_DOCUMENTOS_BASE.length) * 100);
          return (
            <div className="px-4 py-4 border-b bg-muted/20">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Checklist de Recepción</div>
                <div className="text-xs text-muted-foreground">{recibidos} de {CHECKLIST_DOCUMENTOS_BASE.length} documentos recibidos</div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-3">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="grid gap-1">
                {CHECKLIST_DOCUMENTOS_BASE.map((t) => {
                  const d = latestByTipo.get(t);
                  const st = DOC_ESTADO_STYLE[d?.estado ?? "pendiente"] ?? DOC_ESTADO_STYLE.pendiente;
                  return (
                    <div key={t} className="flex items-center gap-3 py-1.5 border-b last:border-0 border-border/50 text-sm">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${st.dot}`} />
                      <span className="flex-1 min-w-0 truncate">{(t === "Factura comercial" || t === "Bill of Lading") && <span className="text-destructive mr-0.5" title="Obligatorio para pasar a Presentado">*</span>}{t}{d?.storage_path && <span className="block text-[11px] text-muted-foreground truncate" title={nombreArchivo(d.storage_path)}>{nombreArchivo(d.storage_path)}</span>}</span>
                      <span className="w-16 shrink-0 font-mono text-xs text-primary">{d?.storage_path && d?.codigo_siga ? d.codigo_siga : ""}</span>
                      <span className={`text-xs w-24 shrink-0 ${st.text} inline-flex items-center gap-1`}>
                        {d ? st.label : "Pendiente"}
                        {d?.estado === "recibido" && !d?.storage_path && <span className="text-[10px] text-muted-foreground leading-none">(sin archivo)</span>}
                      </span>
                      <span className="text-xs text-muted-foreground w-24 shrink-0">{d?.fecha_recepcion ? fmtLocalDate(d.fecha_recepcion) : "—"}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {d?.storage_path && <DocumentoPreviewButton path={d.storage_path} variant="ghost" size="sm" label="Ver" />}
                        {d?.storage_path ? (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(d)}>
                            <Upload className="h-3.5 w-3.5 mr-1" />Reemplazar
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => d ? openEdit(d) : openNuevo(t)}>
                            <Upload className="h-3.5 w-3.5 mr-1" />Subir
                          </Button>
                        )}
                        {(!d || d.estado === "pendiente") && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => marcarRecibido(t, d)}>
                            <Check className="h-3.5 w-3.5 mr-1" />Marcar recibido
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const otros = ((docs ?? []) as any[]).filter((d) => d.tipo === "Otro" && d.storage_path);
                  return (
                    <div className="flex items-start gap-3 py-1.5 text-sm">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${otros.length ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                      <div className="flex-1 min-w-0">
                        <div>Otros <span className="text-[11px] text-muted-foreground">({otros.length} archivo{otros.length === 1 ? "" : "s"})</span></div>
                        {otros.map((o) => (
                          <div key={o.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span className="w-14 shrink-0 font-mono text-primary">{o.codigo_siga ?? ""}</span>
                            <span className="truncate flex-1 min-w-0" title={nombreArchivo(o.storage_path)}>{nombreArchivo(o.storage_path)}</span>
                            <DocumentoPreviewButton path={o.storage_path} variant="ghost" size="sm" label="Ver" />
                          </div>
                        ))}
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => openNuevo("Otro")}>
                        <Upload className="h-3.5 w-3.5 mr-1" />Agregar
                      </Button>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}
        <Dialog open={!!confirmacion} onOpenChange={(o) => { if (!o) cerrarConfirmacion(false); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{confirmacion?.titulo}</DialogTitle></DialogHeader>
            <p className="text-sm">{confirmacion?.mensaje}</p>
            {confirmacion?.requiereCheck && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={confirmAck} onChange={(e) => setConfirmAck(e.target.checked)} />
                Confirmo que es intencional: este archivo corresponde a ambas categorías.
              </label>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => cerrarConfirmacion(false)}>Cancelar</Button>
              <Button onClick={() => cerrarConfirmacion(true)} disabled={!!confirmacion?.requiereCheck && !confirmAck}>Continuar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b bg-muted/30">
            <tr><th className="text-left px-4 py-2">Tipo</th><th className="text-left">Estado</th><th className="text-left">Recepción</th><th className="text-left">Vencimiento</th><th /></tr>
          </thead>
          <tbody>
            {(docs ?? []).map((d: any) => {
              const vd = daysFromToday(d.fecha_vencimiento); const vencido = d.fecha_vencimiento && !isNaN(vd) && vd < 0;
              return (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium"><FileText className="h-4 w-4 inline mr-1 text-muted-foreground" />{d.tipo}{d.codigo_siga && <Badge variant="outline" className="ml-2 font-mono text-[10px]">{d.codigo_siga}</Badge>}</td>
                  <td>
                    <Select value={d.estado} onValueChange={(v) => cambiarEstado(d.id, v)}>
                      <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{["pendiente","recibido","observado","aprobado","vencido"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="text-xs">{fmtLocalDate(d.fecha_recepcion)}</td>
                  <td className={`text-xs ${vencido ? "text-destructive font-medium" : ""}`}>{fmtLocalDate(d.fecha_vencimiento)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {d.storage_path && <DocumentoPreviewButton path={d.storage_path} variant="ghost" size="sm" label="Ver" />}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => eliminar(d)} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>

                </tr>
              );
            })}
            {(!docs || docs.length === 0) && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin documentos.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TabIncidencias({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" });

  const { data: incs } = useQuery({
    queryKey: ["incidencias", expedienteId],
    queryFn: async () => (await supabase.from("incidencias").select("*").eq("expediente_id", expedienteId).order("fecha_apertura", { ascending: false })).data ?? [],
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("incidencias").insert({ expediente_id: expedienteId, ...f, severidad: f.severidad as any });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Incidencia registrada"); qc.invalidateQueries({ queryKey: ["incidencias", expedienteId] }); setOpen(false); setF({ tipo: TIPOS_INCIDENCIA[0], severidad: "media", descripcion: "" }); },
  });

  const resolver = async (incId: string) => {
    await supabase.from("incidencias").update({ estado: "resuelta", fecha_resolucion: new Date().toISOString() }).eq("id", incId);
    qc.invalidateQueries({ queryKey: ["incidencias", expedienteId] });
  };

  const sevColor: Record<string, string> = {
    baja: "bg-muted text-muted-foreground",
    media: "bg-[var(--info)]/15 text-[var(--info)]",
    alta: "bg-[var(--warning)]/25 text-[var(--warning-foreground)]",
    critica: "bg-destructive/15 text-destructive",
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Incidencias</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Nueva</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar incidencia</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Tipo</Label>
                <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_INCIDENCIA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Severidad</Label>
                <Select value={f.severidad} onValueChange={(v) => setF({ ...f, severidad: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["baja","media","alta","critica"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Descripción</Label><Textarea rows={3} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => add.mutate()} disabled={add.isPending}>Registrar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0 overflow-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30">
            <tr><th className="text-left px-4 py-2">Tipo</th><th className="text-left">Severidad</th><th className="text-left">Estado</th><th className="text-left">Apertura</th><th /></tr>
          </thead>
          <tbody>
            {(incs ?? []).map((i: any) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="px-4 py-2 font-medium">
                  <div>{i.tipo}</div>
                  {i.descripcion && <div className="text-xs text-muted-foreground">{i.descripcion}</div>}
                </td>
                <td><Badge className={`${sevColor[i.severidad]} border-transparent`}>{i.severidad}</Badge></td>
                <td><Badge variant="outline">{i.estado.replace("_"," ")}</Badge></td>
                <td className="text-xs">{new Date(i.fecha_apertura).toLocaleDateString("es-DO")}</td>
                <td className="px-4 py-2 text-right">
                  {i.estado !== "resuelta" && i.estado !== "cerrada" && (
                    <Button size="sm" variant="outline" onClick={() => resolver(i.id)}>Resolver</Button>
                  )}
                </td>
              </tr>
            ))}
            {(!incs || incs.length === 0) && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin incidencias.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function RentabilidadCard({ expedienteId }: { expedienteId: string }) {
  const { data: roles } = useMyRoles();
  const allowed = (roles ?? []).some((r) => r === "admin" || r === "finanzas");
  const { data } = useQuery({
    queryKey: ["rentabilidad", expedienteId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_rentabilidad_expediente" as any)
        .select("total_facturado,total_costos_reales,total_gastos,margen_real,margen_pct")
        .eq("expediente_id", expedienteId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  if (!allowed) return null;
  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);
  const fact = Number(data?.total_facturado ?? 0);
  const costos = Number(data?.total_costos_reales ?? 0);
  const gastos = Number(data?.total_gastos ?? 0);
  const margen = Number(data?.margen_real ?? 0);
  const pct = data?.margen_pct == null ? null : Number(data.margen_pct);
  const tone = margen < 0 ? "text-destructive" : pct != null && pct < 15 ? "text-amber-600" : "text-[var(--success)]";
  return (
    <Card className={margen < 0 ? "border-destructive/40" : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" />Rentabilidad
          {margen < 0 && <Badge variant="destructive" className="ml-2">Margen negativo</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div><div className="text-xs text-muted-foreground">Total facturado</div><div className="text-xl font-display font-bold mt-1">{fmt(fact)}</div></div>
        <div><div className="text-xs text-muted-foreground">Costos reales</div><div className="text-xl font-display font-bold mt-1">{fmt(costos)}</div></div>
        <div><div className="text-xs text-muted-foreground">Gastos</div><div className="text-xl font-display font-bold mt-1">{fmt(gastos)}</div></div>
        <div>
          <div className="text-xs text-muted-foreground">Margen real</div>
          <div className={`text-xl font-display font-bold mt-1 ${tone}`}>{fmt(margen)}</div>
          <div className={`text-xs mt-0.5 ${tone}`}>{pct == null ? "— sin facturación" : `${pct.toFixed(1)}%`}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TabCostos({ expedienteId, exp }: { expedienteId: string; exp: any }) {

  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { concepto: CONCEPTOS_COSTO[0], monto_estimado: 0, monto_real: 0 };
  const [f, setF] = useState<{ concepto: string; monto_estimado: number; monto_real: number }>(emptyForm);

  const { data: costos } = useQuery({
    queryKey: ["costos", expedienteId],
    queryFn: async () => (await supabase.from("costos").select("*").eq("expediente_id", expedienteId).order("created_at")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase.from("costos").update({ concepto: f.concepto, monto_estimado: f.monto_estimado, monto_real: f.monto_real }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("costos").insert({ expediente_id: expedienteId, ...f });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Costo actualizado" : "Costo registrado");
      qc.invalidateQueries({ queryKey: ["costos", expedienteId] });
      setOpen(false);
      setEditingId(null);
      setF(emptyForm);
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("costos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Costo eliminado"); qc.invalidateQueries({ queryKey: ["costos", expedienteId] }); },
  });

  const openNew = () => { setEditingId(null); setF(emptyForm); setOpen(true); };
  const openEdit = (c: any) => {
    setEditingId(c.id);
    setF({ concepto: c.concepto, monto_estimado: Number(c.monto_estimado ?? 0), monto_real: Number(c.monto_real ?? 0) });
    setOpen(true);
  };

  const totalEst = (costos ?? []).reduce((s: number, c: any) => s + Number(c.monto_estimado || 0), 0);
  const totalReal = (costos ?? []).reduce((s: number, c: any) => s + Number(c.monto_real || 0), 0);

  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

  return (
    <div className="space-y-4">
      {void totalEst}{void totalReal}


      <div className="flex justify-end" title="Genera una pre-factura desde este expediente y conviértela en la factura e-CF definitiva.">
        <CotizacionServiciosExpedienteButton exp={exp} />
      </div>

      <LiquidacionSection expedienteId={expedienteId} />


      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" />Costos del expediente</CardTitle>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(emptyForm); } }}>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Editar costo" : "Nuevo costo"}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5"><Label>Concepto</Label>
                  <Select value={f.concepto} onValueChange={(v) => setF({ ...f, concepto: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONCEPTOS_COSTO.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Monto estimado (DOP)</Label><Input type="number" step="0.01" value={f.monto_estimado} onChange={(e) => setF({ ...f, monto_estimado: Number(e.target.value) })} /></div>
                  <div className="grid gap-1.5"><Label>Monto real (DOP)</Label><Input type="number" step="0.01" value={f.monto_real} onChange={(e) => setF({ ...f, monto_real: Number(e.target.value) })} /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0 overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30">
              <tr><th className="text-left px-4 py-2">Concepto</th><th className="text-right">Estimado</th><th className="text-right">Real</th><th className="text-right">Δ</th><th className="text-right pr-4 w-24">Acciones</th></tr>
            </thead>
            <tbody>
              {(costos ?? []).map((c: any) => {
                const diff = Number(c.monto_real) - Number(c.monto_estimado);
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{c.concepto}</td>
                    <td className="text-right">{fmt(Number(c.monto_estimado))}</td>
                    <td className="text-right">{fmt(Number(c.monto_real))}</td>
                    <td className={`text-right ${diff > 0 ? "text-destructive" : "text-[var(--success)]"}`}>{fmt(diff)}</td>
                    <td className="text-right pr-4">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("¿Eliminar este costo?")) del.mutate(c.id); }} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!costos || costos.length === 0) && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin costos registrados.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function TabCostosProducto({ expedienteId }: { expedienteId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { concepto: CONCEPTOS_COSTO_ADICIONALES[0], monto_estimado: 0, monto_real: 0, observaciones: "" };
  const [f, setF] = useState<{ concepto: string; monto_estimado: number; monto_real: number; observaciones: string }>(emptyForm);

  const { data: costos } = useQuery({
    queryKey: ["costos_producto", expedienteId],
    queryFn: async () =>
      (await supabase.from("costos_producto").select("*").eq("expediente_id", expedienteId).order("created_at")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { concepto: f.concepto, monto_estimado: f.monto_estimado, monto_real: f.monto_real, observaciones: f.observaciones || null };
      if (editingId) {
        const { error } = await supabase.from("costos_producto").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("costos_producto").insert({ expediente_id: expedienteId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Costo actualizado" : "Costo registrado");
      qc.invalidateQueries({ queryKey: ["costos_producto", expedienteId] });
      qc.invalidateQueries({ queryKey: ["costos-producto-liq", expedienteId] });
      setOpen(false);
      setEditingId(null);
      setF(emptyForm);
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("costos_producto").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Costo eliminado");
      qc.invalidateQueries({ queryKey: ["costos_producto", expedienteId] });
      qc.invalidateQueries({ queryKey: ["costos-producto-liq", expedienteId] });
    },
  });

  const openNew = () => { setEditingId(null); setF(emptyForm); setOpen(true); };
  const openEdit = (c: any) => {
    setEditingId(c.id);
    setF({ concepto: c.concepto, monto_estimado: Number(c.monto_estimado ?? 0), monto_real: Number(c.monto_real ?? 0), observaciones: c.observaciones ?? "" });
    setOpen(true);
  };

  const totalEst = (costos ?? []).reduce((s: number, c: any) => s + Number(c.monto_estimado || 0), 0);
  const totalReal = (costos ?? []).reduce((s: number, c: any) => s + Number(c.monto_real || 0), 0);
  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
        Estos costos son del producto/mercancía, no del servicio de gestión aduanal — no afectan la rentabilidad del servicio en la Ficha de Finanzas.
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total estimado</div><div className="text-2xl font-display font-bold mt-1">{fmt(totalEst)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total real</div><div className="text-2xl font-display font-bold mt-1">{fmt(totalReal)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Diferencia</div><div className={`text-2xl font-display font-bold mt-1 ${totalReal - totalEst > 0 ? "text-destructive" : "text-[var(--success)]"}`}>{fmt(totalReal - totalEst)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" />Costos del producto</CardTitle>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(emptyForm); } }}>
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Editar costo de producto" : "Nuevo costo de producto"}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1.5"><Label>Concepto</Label>
                  <Select value={f.concepto} onValueChange={(v) => setF({ ...f, concepto: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONCEPTOS_COSTO_ADICIONALES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Monto estimado (DOP)</Label><Input type="number" step="0.01" value={f.monto_estimado} onChange={(e) => setF({ ...f, monto_estimado: Number(e.target.value) })} /></div>
                  <div className="grid gap-1.5"><Label>Monto real (DOP)</Label><Input type="number" step="0.01" value={f.monto_real} onChange={(e) => setF({ ...f, monto_real: Number(e.target.value) })} /></div>
                </div>
                <div className="grid gap-1.5"><Label>Observaciones</Label><Input value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0 overflow-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30">
              <tr><th className="text-left px-4 py-2">Concepto</th><th className="text-left">Observaciones</th><th className="text-right">Estimado</th><th className="text-right">Real</th><th className="text-right">Δ</th><th className="text-right pr-4 w-24">Acciones</th></tr>
            </thead>
            <tbody>
              {(costos ?? []).map((c: any) => {
                const diff = Number(c.monto_real) - Number(c.monto_estimado);
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{c.concepto}</td>
                    <td className="text-muted-foreground">{c.observaciones ?? "—"}</td>
                    <td className="text-right">{fmt(Number(c.monto_estimado))}</td>
                    <td className="text-right">{fmt(Number(c.monto_real))}</td>
                    <td className={`text-right ${diff > 0 ? "text-destructive" : "text-[var(--success)]"}`}>{fmt(diff)}</td>
                    <td className="text-right pr-4">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("¿Eliminar este costo?")) del.mutate(c.id); }} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!costos || costos.length === 0) && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin costos de producto registrados.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}



function fmtDOP(n: number) {
  return new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);
}

function LiquidacionSection({ expedienteId }: { expedienteId: string }) {
  const { data: facturas } = useQuery({
    queryKey: ["facturas", expedienteId],
    queryFn: async () => (await supabase.from("facturas").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("created_at")).data ?? [],
  });
  const { data: gastos } = useQuery({
    queryKey: ["gastos", expedienteId],
    queryFn: async () => (await supabase.from("gastos").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("created_at")).data ?? [],
  });

  const totalFact = (facturas ?? []).reduce((s: number, f: any) => s + Number(f.monto || 0), 0);
  const { data: costosLiq } = useQuery({
    queryKey: ["costos", expedienteId],
    queryFn: async () => (await supabase.from("costos").select("*").eq("expediente_id", expedienteId)).data ?? [],
  });
  const totalGastos = (gastos ?? []).reduce((s: number, g: any) => s + (g.es_reembolso ? -Number(g.monto || 0) : Number(g.monto || 0)), 0);
  const totalCostosReales = (costosLiq ?? []).reduce((s: number, c: any) => s + Number(c.monto_real || 0), 0);
  const utilidad = totalFact - totalCostosReales - totalGastos;
  const margen = totalFact > 0 ? (utilidad / totalFact) * 100 : 0;

  const marginColor = margen < 0 ? "text-destructive" : margen < 15 ? "text-amber-600" : "text-[var(--success)]";

  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="font-display font-semibold text-lg">Liquidación del expediente</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total facturado</div><div className="text-xl font-display font-bold mt-1">{fmtDOP(totalFact)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Costos reales</div><div className="text-xl font-display font-bold mt-1">{fmtDOP(totalCostosReales)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total gastos</div><div className="text-xl font-display font-bold mt-1">{fmtDOP(totalGastos)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Utilidad</div><div className={`text-xl font-display font-bold mt-1 ${marginColor}`}>{fmtDOP(utilidad)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Margen</div><div className={`text-xl font-display font-bold mt-1 ${marginColor}`}>{margen.toFixed(1)}%</div></CardContent></Card>
      </div>

      <GastosBlock expedienteId={expedienteId} gastos={gastos ?? []} />
      <FacturaEcfBlock expedienteId={expedienteId} totalFact={totalFact} />
      <FacturasBlock expedienteId={expedienteId} facturas={facturas ?? []} />
    </div>
  );
}

/** Crea o actualiza un renglón de "Facturación (cobros)" por cada línea de la e-CF vinculada.
 *  No sobrescribe renglones editados a mano; no duplica (empareja por línea e-CF). */
async function sincronizarCobroDesdeEcf(expedienteId: string, fid: string | null, prevFid: string | null): Promise<string | null> {
  if (!fid) return null;
  const { data: ecf } = await supabase.from("facturas_ecf").select("id,encf,fecha_emision,monto_total").eq("id", fid).maybeSingle();
  if (!ecf) return null;
  const { data: lineasDb } = await supabase.from("facturas_ecf_lineas").select("id,orden,descripcion,valor,itbis,gravado").eq("factura_id", fid).order("orden");
  const lineas: any[] = (lineasDb ?? []).length
    ? lineasDb!
    : [{ id: null, descripcion: "Gestión aduanal", valor: Number(ecf.monto_total || 0), itbis: 0, gravado: null }];
  const ids = [fid, prevFid].filter(Boolean) as string[];
  const { data: filasDb } = await supabase.from("facturas").select("id,editada_manual,factura_ecf_id,ecf_linea_id,referencia")
    .eq("expediente_id", expedienteId).is("deleted_at", null);
  const candidatas = (filasDb ?? []).filter((r: any) => (r.factura_ecf_id && ids.includes(r.factura_ecf_id)) || (!r.factura_ecf_id && ecf.encf && r.referencia === ecf.encf)) as any[];
  const usadas = new Set<string>();
  let creadas = 0, actualizadas = 0, conservadas = 0;
  for (const l of lineas) {
    let fila = l.id ? candidatas.find((r) => r.ecf_linea_id === l.id) : undefined;
    if (!fila) fila = candidatas.find((r) => !usadas.has(r.id) && !r.editada_manual && (!r.ecf_linea_id || r.factura_ecf_id !== fid));
    const datos = {
      concepto: l.descripcion?.trim() === "Servicios exentos" ? "Servicios de Transportes (exentos)" : (l.descripcion || "Gestión aduanal").trim(), referencia: ecf.encf ?? null, fecha_emision: ecf.fecha_emision ?? null,
      monto: Number(l.valor || 0), itbis: Number(l.itbis || 0), gravado: l.gravado, factura_ecf_id: ecf.id, ecf_linea_id: l.id,
    };
    if (fila) {
      usadas.add(fila.id);
      if (fila.editada_manual) { conservadas++; continue; }
      const { error } = await supabase.from("facturas").update(datos).eq("id", fila.id);
      if (error) throw error;
      actualizadas++;
    } else {
      const { error } = await supabase.from("facturas").insert({ expediente_id: expedienteId, estado: "pendiente", ...datos });
      if (error) throw error;
      creadas++;
    }
  }
  // Renglones automáticos sobrantes (de la e-CF anterior o de un total consolidado) que nadie editó.
  const sobrantes = candidatas.filter((r) => !usadas.has(r.id) && !r.editada_manual).map((r) => r.id);
  if (sobrantes.length) {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("facturas").update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id }).in("id", sobrantes);
  }
  if (!creadas && !sobrantes.length && !actualizadas) return conservadas ? "renglones editados a mano se conservaron" : null;
  const partes = [creadas && `${creadas} creados`, actualizadas && `${actualizadas} actualizados`, conservadas && `${conservadas} conservados`].filter(Boolean);
  return `renglones de cobro: ${partes.join(", ")}`;
}

function FacturaEcfBlock({ expedienteId, totalFact }: { expedienteId: string; totalFact: number }) {
  const qc = useQueryClient();
  const { data: exp } = useQuery({
    queryKey: ["expediente", expedienteId],
    queryFn: async () => (await supabase.from("expedientes").select("*").eq("id", expedienteId).maybeSingle()).data,
  });
  const link = useMutation({
    mutationFn: async (fid: string | null) => {
      const prevFid = (exp as any)?.factura_ecf_id ?? null;
      const { error } = await supabase.from("expedientes").update({ factura_ecf_id: fid }).eq("id", expedienteId);
      if (error) throw error;
      return await sincronizarCobroDesdeEcf(expedienteId, fid, prevFid);
    },
    onSuccess: (msg) => {
      toast.success(msg ? `Factura e-CF actualizada · ${msg}` : "Factura e-CF actualizada");
      qc.invalidateQueries({ queryKey: ["expediente", expedienteId] });
      qc.invalidateQueries({ queryKey: ["facturas", expedienteId] });
      qc.invalidateQueries({ queryKey: ["ecf-vinculada", expedienteId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">
          Factura e-CF (DGII) — requerida para Despachar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FacturaEcfSelector
          value={(exp as any)?.factura_ecf_id ?? null}
          onChange={(id: string | null) => link.mutate(id)}
          preload={{
            cliente_id: (exp as any)?.cliente_id ?? null,
            monto_total: totalFact,
          }}
        />
        {!(exp as any)?.factura_ecf_id && (
          <p className="text-xs text-amber-700 mt-2">
            Sin factura vinculada: el expediente no podrá pasar a estado "Despachado".
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FacturasBlock({ expedienteId, facturas }: { expedienteId: string; facturas: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const empty = { concepto: CONCEPTOS_FACTURA[0], monto: 0, fecha_emision: "", fecha_pago: "", estado: "pendiente", referencia: "", notas: "" };
  const [f, setF] = useState<any>(empty);
  const [prefillEcf, setPrefillEcf] = useState<any | null>(null);
  const { data: ecfVinculada } = useQuery({
    queryKey: ["ecf-vinculada", expedienteId],
    queryFn: async () => {
      const { data: exp } = await supabase.from("expedientes").select("factura_ecf_id").eq("id", expedienteId).maybeSingle();
      const fid = (exp as any)?.factura_ecf_id;
      if (!fid) return null;
      const { data: ecf } = await supabase.from("facturas_ecf").select("id,encf,fecha_emision,monto_total,estado").eq("id", fid).maybeSingle();
      return ecf ?? null;
    },
  });

  // Expedientes que ya tenían e-CF vinculada antes de esta función: crear su fila de cobro una vez.
  const autoSyncHecho = useRef(false);
  useEffect(() => {
    if (!ecfVinculada || autoSyncHecho.current) return;
    autoSyncHecho.current = true;
    sincronizarCobroDesdeEcf(expedienteId, ecfVinculada.id, null)
      .then((m) => { if (m) qc.invalidateQueries({ queryKey: ["facturas", expedienteId] }); })
      .catch((e) => toast.error(e.message));
  }, [ecfVinculada, facturas, expedienteId, qc]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        concepto: f.concepto, monto: Number(f.monto || 0),
        fecha_emision: f.fecha_emision || null, fecha_pago: f.fecha_pago || null,
        estado: f.estado, referencia: f.referencia || null, notas: f.notas || null,
      };
      if (editingId) {
        const { error } = await supabase.from("facturas").update({ ...payload, editada_manual: true }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("facturas").insert({ expediente_id: expedienteId, ...payload, factura_ecf_id: prefillEcf?.id ?? null, editada_manual: !!prefillEcf });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Factura actualizada" : "Factura registrada");
      qc.invalidateQueries({ queryKey: ["facturas", expedienteId] });
      setOpen(false); setEditingId(null); setF(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const softDel = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("facturas").update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enviada a papelera"); qc.invalidateQueries({ queryKey: ["facturas", expedienteId] }); },
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setF({ concepto: r.concepto, monto: Number(r.monto || 0), fecha_emision: r.fecha_emision ?? "", fecha_pago: r.fecha_pago ?? "", estado: r.estado ?? "pendiente", referencia: r.referencia ?? "", notas: r.notas ?? "" });
    setOpen(true);
  };
  const openNew = () => {
    setEditingId(null);
    const yaVinculada = ecfVinculada && facturas.some((r: any) => r.factura_ecf_id === ecfVinculada.id);
    if (ecfVinculada && !yaVinculada) {
      setPrefillEcf(ecfVinculada);
      setF({
        ...empty,
        referencia: ecfVinculada.encf ?? "",
        fecha_emision: ecfVinculada.fecha_emision ?? "",
        monto: Number(ecfVinculada.monto_total || 0),
      });
    } else {
      setPrefillEcf(null);
      setF(empty);
    }
    setOpen(true);
  };

  const subtotal = facturas.reduce((s, r) => s + Number(r.monto || 0), 0);
  const estadoBadge = (e: string) => e === "cobrada" ? "bg-[var(--success)]/15 text-[var(--success)]" : e === "anulada" ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-700";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Facturación (cobros)</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(empty); setPrefillEcf(null); } }}>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Agregar factura</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Editar factura" : "Nueva factura"}</DialogTitle></DialogHeader>
            {!editingId && prefillEcf && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                Datos prellenados desde la e-CF vinculada <span className="font-medium">{prefillEcf.encf}</span>. Puedes ajustarlos antes de guardar.
              </p>
            )}
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Concepto</Label>
                <Select value={f.concepto} onValueChange={(v) => setF({ ...f, concepto: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONCEPTOS_FACTURA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Monto (DOP)</Label><Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Estado</Label>
                  <Select value={f.estado} onValueChange={(v) => setF({ ...f, estado: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS_FACTURA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Fecha emisión</Label><Input type="date" value={f.fecha_emision} onChange={(e) => setF({ ...f, fecha_emision: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Fecha pago</Label><Input type="date" value={f.fecha_pago} onChange={(e) => setF({ ...f, fecha_pago: e.target.value })} /></div>
              </div>
              <div className="grid gap-1.5"><Label>Referencia / N° factura</Label><Input value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Notas</Label><Textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0 overflow-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2">Concepto</th>
              <th className="text-left">Referencia</th>
              <th className="text-left">Emisión</th>
              <th className="text-left">Pago</th>
              <th className="text-left">Estado</th>
              <th className="text-right">Monto</th>
              <th className="text-right pr-4 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2">{r.concepto}</td>
                <td className="text-xs text-muted-foreground">{r.referencia || "—"}</td>
                <td className="text-xs">{fmtLocalDate(r.fecha_emision)}</td>
                <td className="text-xs">{fmtLocalDate(r.fecha_pago)}</td>
                <td><Badge variant="outline" className={estadoBadge(r.estado)}>{r.estado}</Badge></td>
                <td className="text-right font-medium">{fmtDOP(Number(r.monto))}</td>
                <td className="text-right pr-4">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("¿Enviar esta factura a la papelera?")) softDel.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {facturas.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Sin facturas registradas.</td></tr>}
            {facturas.length > 0 && (
              <tr className="bg-muted/20 font-medium">
                <td colSpan={5} className="px-4 py-2 text-right">Subtotal</td>
                <td className="text-right">{fmtDOP(subtotal)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function GastosBlock({ expedienteId, gastos }: { expedienteId: string; gastos: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const empty = {
    concepto: "", monto: 0, fecha: "", proveedor: "", es_reembolso: false, notas: "",
    rnc_cedula_proveedor: "", tipo_id_proveedor: "", ncf_proveedor: "", tipo_ncf_proveedor: "",
    ncf_modificado: "", monto_facturado: 0, itbis_facturado: 0, itbis_retenido: 0, isr_retenido: 0,
    forma_pago: "",
    tipo_bienes_servicios: "" as string,
    monto_facturado_servicios: 0, monto_facturado_bienes: 0,
    tipo_retencion_isr: "" as string,
    itbis_proporcionalidad_349: 0, itbis_llevado_costo: 0,
    itbis_percibido_compras: 0, isr_percibido_compras: 0,
    impuesto_selectivo_consumo: 0, otros_impuestos_tasas: 0, monto_propina_legal: 0,
  };
  const [f, setF] = useState<any>(empty);
  const [file, setFile] = useState<File | null>(null);
  const [crearCxp, setCrearCxp] = useState(false);
  const [cxpVence, setCxpVence] = useState<string>("");
  const [conceptoOtro, setConceptoOtro] = useState(false);

  const { data: conceptosCatalogo } = useQuery({
    queryKey: ["catalogo_conceptos_gasto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_conceptos_gasto")
        .select("codigo,nombre")
        .order("nombre");
      if (error) throw error;
      return (data ?? []).map((r: any) => r.nombre as string);
    },
    staleTime: 5 * 60_000,
  });
  const conceptos = conceptosCatalogo ?? [];




  const save = useMutation({
    mutationFn: async () => {
      let adjunto_path: string | null | undefined = undefined;
      if (file) {
        const path = `expedientes/${expedienteId}/gastos/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("documentos").upload(path, file);
        if (upErr) throw upErr;
        adjunto_path = path;
      }
      // Validaciones opcionales de formato
      const rnc = (f.rnc_cedula_proveedor || "").trim();
      if (rnc && !/^\d{9}$|^\d{11}$/.test(rnc)) throw new Error("RNC/Cédula debe tener 9 u 11 dígitos numéricos");
      const ncf = (f.ncf_proveedor || "").trim().toUpperCase();
      if (ncf && !/^[A-Z0-9]{11}$|^[A-Z0-9]{13}$/.test(ncf)) throw new Error("NCF debe tener 11 o 13 caracteres alfanuméricos");
      const ncfMod = (f.ncf_modificado || "").trim().toUpperCase();
      if (ncfMod && !/^[A-Z0-9]{11}$|^[A-Z0-9]{13}$/.test(ncfMod)) throw new Error("NCF modificado debe tener 11 o 13 caracteres alfanuméricos");

      const mfServ = Number(f.monto_facturado_servicios || 0);
      const mfBien = Number(f.monto_facturado_bienes || 0);
      const payload: any = {
        concepto: f.concepto, monto: Number(f.monto || 0),
        fecha: f.fecha || null, proveedor: f.proveedor || null,
        es_reembolso: !!f.es_reembolso, notas: f.notas || null,
        rnc_cedula_proveedor: rnc || null,
        tipo_id_proveedor: f.tipo_id_proveedor || null,
        ncf_proveedor: ncf || null,
        tipo_ncf_proveedor: f.tipo_ncf_proveedor || null,
        ncf_modificado: ncfMod || null,
        monto_facturado: mfServ + mfBien,
        monto_facturado_servicios: mfServ,
        monto_facturado_bienes: mfBien,
        itbis_facturado: Number(f.itbis_facturado || 0),
        itbis_retenido: Number(f.itbis_retenido || 0),
        isr_retenido: Number(f.isr_retenido || 0),
        forma_pago: f.forma_pago || null,
        tipo_bienes_servicios: f.tipo_bienes_servicios ? Number(f.tipo_bienes_servicios) : null,
        tipo_retencion_isr: f.tipo_retencion_isr ? Number(f.tipo_retencion_isr) : null,
        itbis_proporcionalidad_349: Number(f.itbis_proporcionalidad_349 || 0),
        itbis_llevado_costo: Number(f.itbis_llevado_costo || 0),
        itbis_percibido_compras: Number(f.itbis_percibido_compras || 0),
        isr_percibido_compras: Number(f.isr_percibido_compras || 0),
        impuesto_selectivo_consumo: Number(f.impuesto_selectivo_consumo || 0),
        otros_impuestos_tasas: Number(f.otros_impuestos_tasas || 0),
        monto_propina_legal: Number(f.monto_propina_legal || 0),
      };
      if (adjunto_path !== undefined) payload.adjunto_path = adjunto_path;

      let gastoId = editingId;
      if (editingId) {
        const { error } = await supabase.from("gastos").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase.from("gastos").insert({ expediente_id: expedienteId, ...payload }).select("id").single();
        if (error) throw error;
        gastoId = ins.id;
      }

      let cxpCreada = false;
      if (crearCxp) {
        const proveedorNombre = (f.proveedor || "").trim() || (rnc || "").trim() || (f.concepto || "").trim();
        const montoCxp = (payload.monto_facturado && payload.monto_facturado > 0) ? payload.monto_facturado : Number(f.monto || 0);
        const { data: u } = await supabase.auth.getUser();
        const { error: cxpErr } = await supabase.from("cuentas_por_pagar").insert({
          gasto_id: gastoId,
          expediente_id: expedienteId,
          proveedor_nombre: proveedorNombre,
          proveedor_rnc: rnc || null,
          monto_total: montoCxp,
          moneda: "DOP",
          fecha_factura: f.fecha || null,
          fecha_vencimiento: cxpVence || null,
          estado: "pendiente",
          notas: "Generado automáticamente desde gasto",
          created_by: u.user?.id,
        });
        if (cxpErr) throw new Error(`Gasto guardado, pero falló la cuenta por pagar: ${cxpErr.message}`);
        cxpCreada = true;
      }
      return { cxpCreada };
    },
    onSuccess: (r) => {
      toast.success(
        r?.cxpCreada
          ? (editingId ? "Gasto actualizado y cuenta por pagar creada" : "Gasto registrado y cuenta por pagar creada")
          : (editingId ? "Gasto actualizado" : "Gasto registrado")
      );
      qc.invalidateQueries({ queryKey: ["gastos", expedienteId] });
      setOpen(false); setEditingId(null); setF(empty); setFile(null); setCrearCxp(false); setCxpVence("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const softDel = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("gastos").update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enviado a papelera"); qc.invalidateQueries({ queryKey: ["gastos", expedienteId] }); },
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setF({
      concepto: r.concepto, monto: Number(r.monto || 0), fecha: r.fecha ?? "",
      proveedor: r.proveedor ?? "", es_reembolso: !!r.es_reembolso, notas: r.notas ?? "",
      rnc_cedula_proveedor: r.rnc_cedula_proveedor ?? "",
      tipo_id_proveedor: r.tipo_id_proveedor ?? "",
      ncf_proveedor: r.ncf_proveedor ?? "",
      tipo_ncf_proveedor: r.tipo_ncf_proveedor ?? "",
      ncf_modificado: r.ncf_modificado ?? "",
      monto_facturado: Number(r.monto_facturado ?? 0),
      itbis_facturado: Number(r.itbis_facturado ?? 0),
      itbis_retenido: Number(r.itbis_retenido ?? 0),
      isr_retenido: Number(r.isr_retenido ?? 0),
      forma_pago: r.forma_pago ?? "",
      tipo_bienes_servicios: r.tipo_bienes_servicios != null ? String(r.tipo_bienes_servicios) : "",
      monto_facturado_servicios: Number(r.monto_facturado_servicios ?? 0),
      monto_facturado_bienes: Number(r.monto_facturado_bienes ?? 0),
      tipo_retencion_isr: r.tipo_retencion_isr != null ? String(r.tipo_retencion_isr) : "",
      itbis_proporcionalidad_349: Number(r.itbis_proporcionalidad_349 ?? 0),
      itbis_llevado_costo: Number(r.itbis_llevado_costo ?? 0),
      itbis_percibido_compras: Number(r.itbis_percibido_compras ?? 0),
      isr_percibido_compras: Number(r.isr_percibido_compras ?? 0),
      impuesto_selectivo_consumo: Number(r.impuesto_selectivo_consumo ?? 0),
      otros_impuestos_tasas: Number(r.otros_impuestos_tasas ?? 0),
      monto_propina_legal: Number(r.monto_propina_legal ?? 0),
    });
    setFile(null);
    setConceptoOtro(Boolean(r.concepto) && !conceptos.includes(r.concepto));
    setOpen(true);
  };
  const openNew = () => { setEditingId(null); setF(empty); setFile(null); setCrearCxp(false); setCxpVence(""); setConceptoOtro(false); setOpen(true); };

  const subtotal = gastos.reduce((s, r) => s + (r.es_reembolso ? -Number(r.monto || 0) : Number(r.monto || 0)), 0);


  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base">Gastos operativos</CardTitle>
        <ReembolsoEstadoControl expedienteId={expedienteId} />
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(empty); setFile(null); setCrearCxp(false); setCxpVence(""); } }}>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Agregar gasto</Button>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Editar gasto" : "Nuevo gasto"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Concepto</Label>
                <Select
                  value={(conceptoOtro || (!!f.concepto && conceptos.length > 0 && !conceptos.includes(f.concepto))) ? "__otro__" : (f.concepto || "")}
                  onValueChange={(v) => {
                    if (v === "__otro__") { setConceptoOtro(true); setF({ ...f, concepto: "" }); return; }
                    setConceptoOtro(false);
                    setF({ ...f, concepto: v, es_reembolso: v === "Reembolsos" ? true : f.es_reembolso });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccione un concepto" /></SelectTrigger>
                  <SelectContent>
                    {conceptos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value="__otro__">Otro (escribir)</SelectItem>
                  </SelectContent>
                </Select>
                {(conceptoOtro || (!!f.concepto && conceptos.length > 0 && !conceptos.includes(f.concepto))) && (
                  <Input
                    autoFocus
                    placeholder="Escriba el concepto"
                    value={f.concepto}
                    onChange={(e) => setF({ ...f, concepto: e.target.value })}
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Monto (DOP)</Label><Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
              </div>
              <div className="grid gap-1.5"><Label>Proveedor</Label><Input value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} /></div>

              <div className="border rounded-md p-3 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-semibold">Datos fiscales del proveedor <span className="text-xs font-normal text-muted-foreground">(opcional · Reporte 606)</span></div>
                  <EscanearFacturaButton onExtracted={(d) => setF((prev: any) => ({
                    ...prev,
                    proveedor: prev.proveedor || d.proveedor_nombre || "",
                    concepto: prev.concepto || d.concepto || "",
                    fecha: d.fecha || prev.fecha,
                    rnc_cedula_proveedor: d.rnc_cedula_proveedor ?? prev.rnc_cedula_proveedor,
                    tipo_id_proveedor: d.tipo_id_proveedor ?? prev.tipo_id_proveedor,
                    ncf_proveedor: d.ncf_proveedor ?? prev.ncf_proveedor,
                    ncf_modificado: d.ncf_modificado ?? prev.ncf_modificado,
                    monto_facturado_servicios: d.monto_facturado_servicios ?? prev.monto_facturado_servicios,
                    monto_facturado_bienes: d.monto_facturado_bienes ?? prev.monto_facturado_bienes,
                    itbis_facturado: d.itbis_facturado ?? prev.itbis_facturado,
                  }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Tipo ID</Label>
                    <Select value={f.tipo_id_proveedor || "__none"} onValueChange={(v) => setF({ ...f, tipo_id_proveedor: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        <SelectItem value="RNC">RNC</SelectItem>
                        <SelectItem value="CEDULA">Cédula</SelectItem>
                        <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>RNC / Cédula</Label>
                    <Input value={f.rnc_cedula_proveedor} onChange={(e) => setF({ ...f, rnc_cedula_proveedor: e.target.value.replace(/\D/g, "") })} placeholder="9 u 11 dígitos" maxLength={11} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>NCF</Label>
                    <Input value={f.ncf_proveedor} onChange={(e) => setF({ ...f, ncf_proveedor: e.target.value.toUpperCase() })} placeholder="11 o 13 caracteres" maxLength={13} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Tipo NCF</Label>
                    <Input value={f.tipo_ncf_proveedor} onChange={(e) => setF({ ...f, tipo_ncf_proveedor: e.target.value })} placeholder="Ej: 01, 02, 11…" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>NCF modificado (si aplica)</Label>
                  <Input value={f.ncf_modificado} onChange={(e) => setF({ ...f, ncf_modificado: e.target.value.toUpperCase() })} placeholder="NCF original modificado por nota crédito/débito" maxLength={13} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Tipo bienes / servicios (606)</Label>
                    <Select value={f.tipo_bienes_servicios || "__none"} onValueChange={(v) => setF({ ...f, tipo_bienes_servicios: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        {TIPOS_BIENES_SERVICIOS.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Tipo retención ISR</Label>
                    <Select value={f.tipo_retencion_isr || "__none"} onValueChange={(v) => setF({ ...f, tipo_retencion_isr: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        {TIPOS_RETENCION_ISR.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label>Monto facturado servicios</Label><Input type="number" step="0.01" value={f.monto_facturado_servicios} onChange={(e) => setF({ ...f, monto_facturado_servicios: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Monto facturado bienes</Label><Input type="number" step="0.01" value={f.monto_facturado_bienes} onChange={(e) => setF({ ...f, monto_facturado_bienes: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>ITBIS facturado</Label><Input type="number" step="0.01" value={f.itbis_facturado} onChange={(e) => setF({ ...f, itbis_facturado: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>ITBIS retenido</Label><Input type="number" step="0.01" value={f.itbis_retenido} onChange={(e) => setF({ ...f, itbis_retenido: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>ISR retenido</Label><Input type="number" step="0.01" value={f.isr_retenido} onChange={(e) => setF({ ...f, isr_retenido: e.target.value })} /></div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Monto facturado total: <b>{(Number(f.monto_facturado_servicios || 0) + Number(f.monto_facturado_bienes || 0)).toFixed(2)}</b>
                </div>
                <div className="grid gap-1.5">
                  <Label>Forma de pago</Label>
                  <Select value={f.forma_pago || "__none"} onValueChange={(v) => setF({ ...f, forma_pago: v === "__none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">—</SelectItem>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="cheque_transferencia">Cheque / Transferencia</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="credito">Crédito</SelectItem>
                      <SelectItem value="permuta">Permuta</SelectItem>
                      <SelectItem value="nota_credito">Nota de crédito</SelectItem>
                      <SelectItem value="mixto">Mixto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded border bg-background/60 p-3 space-y-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={crearCxp} onChange={(e) => setCrearCxp(e.target.checked)} />
                    <span>También crear cuenta por pagar vinculada a este proveedor</span>
                  </label>
                  {crearCxp && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Fecha de vencimiento del pago (opcional)</Label>
                      <Input type="date" value={cxpVence} onChange={(e) => setCxpVence(e.target.value)} />
                    </div>
                  )}
                </div>
                <details className="rounded border bg-background/60">
                  <summary className="cursor-pointer text-xs font-medium px-3 py-2 select-none">Detalles fiscales avanzados (opcional)</summary>
                  <div className="p-3 space-y-2 border-t">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5"><Label className="text-xs">ITBIS sujeto proporcionalidad (Art. 349)</Label><Input type="number" step="0.01" value={f.itbis_proporcionalidad_349} onChange={(e) => setF({ ...f, itbis_proporcionalidad_349: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">ITBIS llevado al costo</Label><Input type="number" step="0.01" value={f.itbis_llevado_costo} onChange={(e) => setF({ ...f, itbis_llevado_costo: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">ITBIS percibido en compras</Label><Input type="number" step="0.01" value={f.itbis_percibido_compras} onChange={(e) => setF({ ...f, itbis_percibido_compras: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">ISR percibido en compras</Label><Input type="number" step="0.01" value={f.isr_percibido_compras} onChange={(e) => setF({ ...f, isr_percibido_compras: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">Impuesto Selectivo al Consumo</Label><Input type="number" step="0.01" value={f.impuesto_selectivo_consumo} onChange={(e) => setF({ ...f, impuesto_selectivo_consumo: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">Otros impuestos / tasas</Label><Input type="number" step="0.01" value={f.otros_impuestos_tasas} onChange={(e) => setF({ ...f, otros_impuestos_tasas: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label className="text-xs">Monto propina legal</Label><Input type="number" step="0.01" value={f.monto_propina_legal} onChange={(e) => setF({ ...f, monto_propina_legal: e.target.value })} /></div>
                    </div>
                  </div>
                </details>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.es_reembolso} onChange={(e) => setF({ ...f, es_reembolso: e.target.checked })} />
                Es reembolso (resta del total)
              </label>
              <div className="grid gap-1.5"><Label>Adjunto</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
              <div className="grid gap-1.5"><Label>Notas</Label><Textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0 overflow-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2">Concepto</th>
              <th className="text-left">Notas</th>
              <th className="text-left">Proveedor</th>
              <th className="text-left">Fecha</th>
              <th className="text-left">Adjunto</th>
              <th className="text-right">Monto</th>
              <th className="text-right pr-4 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2">{r.concepto}{r.es_reembolso && <Badge variant="outline" className="ml-2 text-xs">reembolso</Badge>}</td>
                <td className="text-xs text-muted-foreground max-w-[220px]">
                  {r.notas ? <span className="block truncate" title={r.notas}>{r.notas}</span> : "—"}
                </td>
                <td className="text-xs text-muted-foreground">{r.proveedor || "—"}</td>
                <td className="text-xs">{fmtLocalDate(r.fecha)}</td>
                <td>{r.adjunto_path ? <DocumentoPreviewButton path={r.adjunto_path} variant="link" size="sm" className="h-auto p-0" icon={<FileText className="h-3.5 w-3.5 mr-1" />} label="Ver" /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className={`text-right font-medium ${r.es_reembolso ? "text-[var(--success)]" : ""}`}>{r.es_reembolso ? "−" : ""}{fmtDOP(Number(r.monto))}</td>
                <td className="text-right pr-4">
                  <div className="inline-flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("¿Enviar este gasto a la papelera?")) softDel.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {gastos.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Sin gastos registrados.</td></tr>}
            {gastos.length > 0 && (
              <tr className="bg-muted/20 font-medium">
                <td colSpan={5} className="px-4 py-2 text-right">Subtotal (neto)</td>
                <td className="text-right">{fmtDOP(subtotal)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}


function TabAuditoria({ expedienteId }: { expedienteId: string }) {
  const { data } = useQuery({
    queryKey: ["auditoria", expedienteId],
    queryFn: async () => (await supabase
      .from("auditoria")
      .select("*")
      .eq("entidad_id", expedienteId)
      .order("created_at", { ascending: false })
      .limit(100)).data ?? [],
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Bitácora</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky-table-header text-xs text-muted-foreground border-b bg-muted/30">
            <tr><th className="text-left px-4 py-2">Fecha</th><th className="text-left">Entidad</th><th className="text-left">Acción</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((a: any) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="px-4 py-2 text-xs">{new Date(a.created_at).toLocaleString("es-DO")}</td>
                <td className="text-xs text-muted-foreground">{a.entidad}</td>
                <td className="text-xs font-mono">{a.accion}</td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Sin registros aún.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TabPermisosExp({ expedienteId }: { expedienteId: string }) {
  const { data } = useQuery({
    queryKey: ["permisos-por-expediente", expedienteId],
    queryFn: async () => (await supabase.from("permisos").select("*").eq("expediente_id", expedienteId).is("eliminado_en", null).order("created_at", { ascending: false })).data ?? [],
  });
  const TIPOS: Record<string, string> = { sanitario:"Sanitario", fitosanitario:"Fitosanitario", zoosanitario:"Zoosanitario", indocal:"INDOCAL", ambiental:"Ambiental", agricola:"Agrícola", ministerio_salud:"Ministerio de Salud", otro:"Otro" };
  const ESTADOS: Record<string, string> = { solicitado:"Solicitado", en_tramite:"En trámite", aprobado:"Aprobado", rechazado:"Rechazado", vencido:"Vencido" };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Permisos VUCE vinculados ({data?.length ?? 0})</CardTitle>
        <Button asChild size="sm"><Link to="/permisos/nuevo" search={{ expediente: expedienteId }}><Plus className="h-4 w-4 mr-1" /> Agregar Permiso VUCE</Link></Button>
      </CardHeader>
      <CardContent className="p-0">
        {(!data || data.length === 0) ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin permisos VUCE vinculados.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/20">
              <tr>
                <th className="text-left px-4 py-2">N° Permiso VUCE</th>
                <th className="text-left">Tipo</th>
                <th className="text-left">Institución</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Aprobado</th>
                <th className="text-left">Emisión</th>
                <th className="text-left">Vence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">
                    <Link to="/permisos/$id" params={{ id: p.id }} className="text-primary hover:underline">{p.numero}</Link>
                  </td>
                  <td className="text-muted-foreground">{TIPOS[p.tipo] ?? "—"}</td>
                  <td className="text-muted-foreground">{p.institucion_emisora ?? "—"}</td>
                  <td><Badge variant="outline">{ESTADOS[p.estado] ?? p.estado}</Badge></td>
                  <td className="text-xs text-muted-foreground">{fmtLocalDate(p.fecha_aprobacion)}</td>
                  <td className="text-xs text-muted-foreground">{fmtLocalDate(p.fecha_emision)}</td>
                  <td className="text-xs text-muted-foreground">{fmtLocalDate(p.fecha_vencimiento)}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild><Link to="/permisos/$id" params={{ id: p.id }}>Editar</Link></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function TabTransportesExp({ expedienteId }: { expedienteId: string }) {
  const { data } = useQuery({
    queryKey: ["transportes-por-expediente", expedienteId],
    queryFn: async () => (await supabase.from("transportes").select("*").eq("expediente_id", expedienteId).is("eliminado_en", null).order("created_at", { ascending: false })).data ?? [],
  });
  const TIPOS: Record<string, string> = { maritimo:"Marítimo", aereo:"Aéreo", terrestre:"Terrestre" };
  const ESTADOS: Record<string, string> = { programado:"Programado", en_transito:"En tránsito", entregado:"Entregado", retrasado:"Retrasado" };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Transportes vinculados ({data?.length ?? 0})</CardTitle>
        <Button asChild size="sm"><Link to="/transportes/nuevo" search={{ expediente: expedienteId }}><Plus className="h-4 w-4 mr-1" /> Agregar Transporte</Link></Button>
      </CardHeader>
      <CardContent className="p-0">
        {(!data || data.length === 0) ? (
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sin transportes vinculados.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b bg-muted/20">
              <tr>
                <th className="text-left px-4 py-2">N° Viaje</th>
                <th className="text-left">Tipo</th>
                <th className="text-left">Transportista</th>
                <th className="text-left">Placa / Ctn</th>
                <th className="text-left">Salida</th>
                <th className="text-left">ETA</th>
                <th className="text-left">Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((t: any) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2 font-medium">
                    <Link to="/transportes/$id" params={{ id: t.id }} className="text-primary hover:underline">{t.numero_viaje}</Link>
                  </td>
                  <td className="text-muted-foreground">{TIPOS[t.tipo] ?? "—"}</td>
                  <td>{t.transportista ?? "—"}</td>
                  <td className="text-xs text-muted-foreground tabular-nums">{t.placa_contenedor ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">{fmtLocalDate(t.fecha_salida)}</td>
                  <td className="text-xs">{fmtLocalDate(t.eta)}</td>
                  <td><Badge variant="outline">{ESTADOS[t.estado] ?? t.estado}</Badge></td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild><Link to="/transportes/$id" params={{ id: t.id }}>Editar</Link></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

const UNIDADES_MEDIDA = ["Kilogramos", "Unidades", "Litros", "Toneladas", "Metros", "Cajas", "Sacos", "Otros"];


// Fuerza el % gravamen que corresponde según la preferencia comercial del expediente
function pickPctFromTasa(
  tasa: any | null | undefined,
  preferenciaComercial: string,
): { pct: number | null; usedPreferencial: boolean } {
  if (!tasa) return { pct: null, usedPreferencial: false };
  const hasPref = tasa.pct_gravamen_preferencial != null;
  const acuerdo = (tasa.acuerdo_preferencial || "").trim().toLowerCase();
  const prefExp = (preferenciaComercial || "").trim().toLowerCase();
  const match = hasPref && acuerdo && prefExp && (acuerdo === prefExp || prefExp.includes(acuerdo) || acuerdo.includes(prefExp));
  if (match) return { pct: Number(tasa.pct_gravamen_preferencial), usedPreferencial: true };
  if (tasa.pct_gravamen != null) return { pct: Number(tasa.pct_gravamen), usedPreferencial: false };
  return { pct: null, usedPreferencial: false };
}

function MercanciaItemsBlock({
  expedienteId,
  seguro,
  flete,
  otros,
  preferenciaComercial,
  tasaCambioUsada,
  paisOrigen,
  paisOrigenCodigo,
  servicioAduaneroUsd = 0,
  esExportacion = false,
  disabled = false,
  localItems,
  onLocalItemsChange,
}: {
  expedienteId: string;
  seguro: number;
  flete: number;
  otros: number;
  preferenciaComercial: string;
  tasaCambioUsada?: number | string | null;
  paisOrigen?: string;
  paisOrigenCodigo?: string;
  servicioAduaneroUsd?: number;
  /** Exportación: habilita los campos extra de producto para la Declaración de Exportación. */
  esExportacion?: boolean;
  disabled?: boolean;
  /** Modo creación: líneas en memoria (aún sin Expediente en la base). */
  localItems?: any[];
  onLocalItemsChange?: (items: any[]) => void;
}) {
  const susp = useImpuestosSusp();
  const qc = useQueryClient();
  const local = !!onLocalItemsChange;
  const { data: itemsDb } = useQuery({
    queryKey: ["mercancia-items", expedienteId],
    enabled: !local,
    queryFn: async () => (await supabase.from("mercancia_items").select("*").eq("expediente_id", expedienteId).is("deleted_at", null).order("item_no")).data ?? [],
  });
  const items: any[] = local ? (localItems ?? []) : (itemsDb ?? []);
  const renumerar = (arr: any[]) => arr.map((it, i) => ({ ...it, item_no: i + 1 }));

  const codigos = useMemo(() => Array.from(new Set(((items ?? []) as any[]).map((it) => (it.codigo_arancelario || "").trim()).filter(Boolean))), [items]);
  const { data: tasas } = useQuery({
    queryKey: ["tasas-por-codigos", codigos.join("|")],
    enabled: codigos.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("catalogo_tasas_arancelarias").select("*").in("codigo_arancelario", codigos);
      return data ?? [];
    },
  });
  const tasaByCodigo = useMemo(() => {
    const m = new Map<string, any>();
    (tasas ?? []).forEach((t: any) => m.set(t.codigo_arancelario, t));
    return m;
  }, [tasas]);

  const [open, setOpen] = useState(false);
  const [verExport, setVerExport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = {
    codigo_arancelario: "", detalle_producto: "", unidad_medida: "", unidad_codigo: "",
    cantidad: "", peso: "", valor_fob: "",
    pct_gravamen: "", aplica_isc: false as boolean, pct_isc: "", pct_itbis: "18", itbis_proindustria: false as boolean,
    product_code: "", cod_marca: "", marca: "", cod_modelo: "", modelo: "", especificaciones: "",
    estado_producto_codigo: "",
    product_year: "", tiene_certificado_origen: false as boolean, certificado_origen_numero: "",
    es_organico: false as boolean, grado_alcohol: "",
    pais_origen: "", pais_origen_codigo: "",
  };

  const [f, setF] = useState(emptyForm);
  const [tasaBloqueada, setTasaBloqueada] = useState(false);
  const [confirmarDesbloqueo, setConfirmarDesbloqueo] = useState(false);
  const [valorUnitario, setValorUnitario] = useState("");
  const valorUnitarioRef = useRef(valorUnitario);
  useEffect(() => { valorUnitarioRef.current = valorUnitario; }, [valorUnitario]);
  useEffect(() => {
    if (!open) return;
    if (f.valor_fob === "" && f.cantidad === "") return;
    const vu = unitFob(f.valor_fob, f.cantidad);
    const n = Number(vu);
    if (!isFinite(n)) return;
    const next = n.toFixed(4);
    if (next !== valorUnitarioRef.current) setValorUnitario(next);
  }, [open, f.valor_fob, f.cantidad]);


  const totalFob = (items ?? []).reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0);
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tasaCambioNum = Number(tasaCambioUsada) || 0;
  const rd = (n: number) => tasaCambioNum > 0 ? fmt(n * tasaCambioNum) : "—";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mercancia-items", expedienteId] });
    qc.invalidateQueries({ queryKey: ["tasas-por-codigos"] });
  };

  // Auto-alimenta el catálogo con lo que digitó el usuario (solo si no existe o no está verificado; RLS bloquea las verificadas)
  const autoLearnTasa = async (codigo: string, pctGravamen: number | null, aplicaIsc: boolean, pctIsc: number | null, pctItbis: number | null = null) => {
    if (!codigo) return;
    const existing = tasaByCodigo.get(codigo);
    if (existing?.verificado) return; // no tocar verificadas
    const prefExp = (preferenciaComercial || "").trim();
    const usePref = !!prefExp && prefExp.toLowerCase() !== "ninguna";
    const payload: any = {
      codigo_arancelario: codigo,
      aplica_isc: !!aplicaIsc,
      pct_isc: aplicaIsc ? pctIsc : null,
      pct_itbis: pctItbis,
      origen_expediente_id: expedienteId,
    };
    if (pctGravamen != null) {
      if (usePref) {
        payload.pct_gravamen_preferencial = pctGravamen;
        payload.acuerdo_preferencial = prefExp;
        if (existing?.pct_gravamen != null) payload.pct_gravamen = existing.pct_gravamen;
      } else {
        payload.pct_gravamen = pctGravamen;
      }
    }
    await supabase.from("catalogo_tasas_arancelarias").upsert(payload, { onConflict: "codigo_arancelario" });
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const codigo = (f.codigo_arancelario || "").trim();
      const payload: any = {
        codigo_arancelario: codigo || null,
        detalle_producto: f.detalle_producto || null,
        unidad_medida: f.unidad_medida || null,
        unidad_codigo: f.unidad_codigo || null,
        cantidad: f.cantidad === "" ? 0 : Number(f.cantidad),
        peso: f.peso === "" ? 0 : Number(f.peso),
        valor_fob: f.valor_fob === "" ? 0 : Math.round(Number(f.valor_fob) * 100) / 100,
        valor_fob_4d: f.valor_fob === "" ? 0 : Number(f.valor_fob),
        pct_gravamen: f.pct_gravamen === "" ? null : Number(f.pct_gravamen),
        aplica_isc: !!f.aplica_isc,
        pct_isc: f.aplica_isc && f.pct_isc !== "" ? Number(f.pct_isc) : null,
        pct_itbis: f.itbis_proindustria ? 9 : (f.pct_itbis === "" ? null : Number(f.pct_itbis)),
        itbis_proindustria: !!f.itbis_proindustria,
        product_code: f.product_code?.trim() || null,
        cod_marca: f.cod_marca?.trim() || null,
        marca: f.marca?.trim() || null,
        cod_modelo: f.cod_modelo?.trim() || null,
        modelo: f.modelo?.trim() || null,
        especificaciones: f.especificaciones?.trim() || null,
        estado_producto_codigo: f.estado_producto_codigo?.trim() || null,
        product_year: f.product_year === "" ? null : Number(f.product_year),
        tiene_certificado_origen: !!f.tiene_certificado_origen,
        certificado_origen_numero: f.certificado_origen_numero?.trim() || null,
        es_organico: !!f.es_organico,
        grado_alcohol: f.grado_alcohol === "" ? null : Number(f.grado_alcohol),
        pais_origen: f.pais_origen?.trim() || null,
        pais_origen_codigo: f.pais_origen_codigo?.trim() || null,
      };

      if (local) {
        const next = editingId
          ? items.map((it) => (it.id === editingId ? { ...it, ...payload } : it))
          : [...items, { ...payload, id: crypto.randomUUID() }];
        onLocalItemsChange!(renumerar(next));
        return;
      }
      if (editingId) {
        const { error } = await supabase.from("mercancia_items").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const nextNo = ((items ?? []).reduce((m: number, it: any) => Math.max(m, it.item_no || 0), 0)) + 1;
        const { error } = await supabase.from("mercancia_items").insert({ ...payload, expediente_id: expedienteId, item_no: nextNo });
        if (error) throw error;
      }
      await autoLearnTasa(codigo, payload.pct_gravamen, payload.aplica_isc, payload.pct_isc, f.itbis_proindustria ? null : (payload.pct_itbis ?? null));
    },
    onSuccess: () => { toast.success(editingId ? "Ítem actualizado" : "Ítem agregado"); setOpen(false); setEditingId(null); setF(emptyForm); setValorUnitario(""); if (!local) invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      if (local) {
        onLocalItemsChange!(renumerar(items.filter((it) => it.id !== id)));
        return;
      }
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("mercancia_items").update({ deleted_at: new Date().toISOString(), deleted_by: userRes.user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(local ? "Ítem eliminado" : "Ítem movido a papelera"); if (!local) invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const duplicar = useMutation({
    mutationFn: async (it: any) => {
      const nextNo = ((items ?? []).reduce((m: number, itm: any) => Math.max(m, itm.item_no || 0), 0)) + 1;
      const { deleted_at, deleted_by, created_at, updated_at, id, item_no, expediente_id, ...resto } = it;
      if (local) {
        onLocalItemsChange!(renumerar([...items, { ...resto, id: crypto.randomUUID() }]));
        return;
      }
      const { error } = await supabase.from("mercancia_items").insert({
        ...resto,
        expediente_id: expedienteId,
        item_no: nextNo,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Línea duplicada"); if (!local) invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const startNew = () => {
    setEditingId(null);
    // Precarga el país de origen del Expediente como valor por defecto (editable por línea).
    setF({ ...emptyForm, pais_origen: paisOrigen ?? "", pais_origen_codigo: paisOrigenCodigo ?? "" });
    setTasaBloqueada(false); setValorUnitario(""); setOpen(true);
  };
  const startEdit = (it: any) => {
    setEditingId(it.id);
    setF({
      codigo_arancelario: it.codigo_arancelario ?? "",
      detalle_producto: it.detalle_producto ?? "",
      unidad_medida: it.unidad_medida ?? "",
      unidad_codigo: it.unidad_codigo ?? "",
      cantidad: it.cantidad != null ? String(it.cantidad) : "",
      peso: it.peso != null ? String(it.peso) : "",
      valor_fob: (it.valor_fob_4d ?? it.valor_fob) != null ? Number(it.valor_fob_4d ?? it.valor_fob).toFixed(4) : "",
      pct_gravamen: it.pct_gravamen != null ? String(it.pct_gravamen) : "",
      aplica_isc: !!it.aplica_isc,
      pct_isc: it.pct_isc != null ? String(it.pct_isc) : "",
      pct_itbis: it.pct_itbis != null ? String(it.pct_itbis) : "18",
      itbis_proindustria: !!it.itbis_proindustria,
      product_code: it.product_code ?? "",
      cod_marca: it.cod_marca ?? "",
      marca: it.marca ?? "",
      cod_modelo: it.cod_modelo ?? "",
      modelo: it.modelo ?? "",
      especificaciones: it.especificaciones ?? "",
      estado_producto_codigo: it.estado_producto_codigo ?? "",
      pais_origen: it.pais_origen ?? "",
      pais_origen_codigo: it.pais_origen_codigo ?? "",
      product_year: it.product_year != null ? String(it.product_year) : "",
      tiene_certificado_origen: !!it.tiene_certificado_origen,
      certificado_origen_numero: it.certificado_origen_numero ?? "",
      es_organico: !!it.es_organico,
      grado_alcohol: it.grado_alcohol != null ? String(it.grado_alcohol) : "",
    });
    const vu = unitFob(it.valor_fob_4d ?? it.valor_fob, it.cantidad);
    setValorUnitario(isFinite(Number(vu)) ? Number(vu).toFixed(4) : "");
    setTasaBloqueada(false);
    setOpen(true);
  };


  // Cuando el usuario digita/pega un código en el diálogo y aún no tiene % gravamen, sugerir desde catálogo
  const onCodigoBlur = async (codigo: string) => {
    const c = (codigo || "").trim();
    if (!c || tasaBloqueada) return;
    // buscar en tasas ya cargadas
    let tasa = tasaByCodigo.get(c);
    if (!tasa) {
      const { data } = await supabase.from("catalogo_tasas_arancelarias").select("*").eq("codigo_arancelario", c).maybeSingle();
      tasa = data;
    }
    if (!tasa) return;
    const { pct } = pickPctFromTasa(tasa, preferenciaComercial);
    setF((prev) => ({
      ...prev,
      pct_gravamen: prev.pct_gravamen === "" && pct != null ? String(pct) : prev.pct_gravamen,
      aplica_isc: prev.aplica_isc || !!tasa.aplica_isc,
      pct_isc: prev.pct_isc === "" && tasa.aplica_isc && tasa.pct_isc != null ? String(tasa.pct_isc) : prev.pct_isc,
    }));
  };

  return (
    <div className="grid gap-3 pt-2 border-t">
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalle de mercancía</div>
        <Button size="sm" variant="outline" onClick={startNew} disabled={disabled}><Plus className="h-4 w-4 mr-1" />Agregar ítem</Button>
      </div>
      <AvisoRegimenSuspensivo expedienteId={expedienteId} />
      <div className="rounded-md border overflow-auto max-h-[70vh]">
        <table className="w-full text-sm min-w-[1400px]">
            <thead className="sticky-table-header bg-muted/50 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left w-10">#</th>
                <th className="px-2 py-2 text-left">Cód. Arancel</th>
                <th className="px-2 py-2 text-left">Detalle</th>
                <th className="px-2 py-2 text-left">Unidad</th>
                <th className="px-2 py-2 text-left">País de Origen</th>
                <th className="px-2 py-2 text-right">Cantidad</th>
                <th className="px-2 py-2 text-right">Peso</th>
                <th className="px-2 py-2 text-right">FOB (US$)</th>
                <th className="px-2 py-2 text-right">Valor Unit.</th>
                <th className="px-2 py-2 text-right bg-amber-50">% Grav.</th>
                <th className="px-2 py-2 text-center bg-amber-50">ISC?</th>
                <th className="px-2 py-2 text-right bg-amber-50">% ISC</th>
                  <th className="px-2 py-2 text-right bg-slate-50">CIF línea (RD$)</th>
                  <th className="px-2 py-2 text-right bg-slate-50">Gravamen (RD$)</th>
                  <th className="px-2 py-2 text-right bg-slate-50">Selectivo</th>
                  <th className="px-2 py-2 text-right bg-slate-50">ITBIS (RD$)</th>
                  <th className="px-2 py-2 text-right bg-emerald-50">Total imp. (RD$)</th>
                  <th className="px-2 py-2 text-right w-20"></th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).length === 0 ? (
                  <tr><td colSpan={18} className="px-3 py-6 text-center text-xs text-muted-foreground">Sin ítems. Agrega el primero.</td></tr>
                ) : (items ?? []).map((it: any) => {
                  const c = calcImpuestosLinea(
                    Number(it.valor_fob) || 0, totalFob, seguro, flete, otros,
                    it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis, susp.suspendido,
                  );
                  const tasa = tasaByCodigo.get((it.codigo_arancelario || "").trim());
                  const unverifiedHint = tasa && !tasa.verificado && it.pct_gravamen != null;
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-2 tabular-nums text-muted-foreground">{it.item_no}</td>
                      <td className="px-2 py-2 tabular-nums font-mono text-xs">
                        <div className="flex items-center gap-1">
                          <span>{it.codigo_arancelario || "—"}</span>
                          {unverifiedHint && (
                            <span title="Tasa sugerida por historial; aún no verificada por Administrador." className="inline-flex">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 max-w-[220px] truncate" title={it.detalle_producto || ""}>{it.detalle_producto || "—"}</td>
                      <td className="px-2 py-2 text-xs">{it.unidad_medida || "—"}</td>
                      <td className="px-2 py-2 text-xs">{it.pais_origen || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{Number(it.cantidad || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{Number(it.peso || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(Number(it.valor_fob || 0))}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-xs">{(() => {
                        const vu = Number(unitFob(it.valor_fob, it.cantidad));
                        return isFinite(vu) ? vu.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : "—";
                      })()}</td>
                      <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40">{susp.suspendido ? <span className="text-muted-foreground text-xs">N/A</span> : it.pct_gravamen != null ? `${Number(it.pct_gravamen)}%` : <span className="text-amber-600 text-xs">—</span>}</td>
                      <td className="px-2 py-2 text-center bg-amber-50/40 text-xs">{it.aplica_isc ? "Sí" : "No"}</td>
                      <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40">{susp.suspendido ? "N/A" : it.aplica_isc && it.pct_isc != null ? `${Number(it.pct_isc)}%` : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums bg-slate-50/50">{rd(c.cifLinea)}</td>
                      <td className="px-2 py-2 text-right tabular-nums bg-slate-50/50">{rd(c.gravamen)}</td>
                      <td className="px-2 py-2 text-right tabular-nums bg-slate-50/50">{fmt(c.selectivo)}</td>
                      <td className="px-2 py-2 text-right tabular-nums bg-slate-50/50">
                        <div className="flex items-center justify-end gap-1">
                          {it.itbis_proindustria && (
                            <span title={Number(it.pct_gravamen) > 0 ? "ITBIS Reducido PROINDUSTRIA (9%). Este beneficio requiere que la partida tenga 0% de Arancel según la Ley 242-20 — verificar elegibilidad antes de aplicar." : "ITBIS Reducido PROINDUSTRIA (9%)"} className={`rounded px-1 text-[9px] font-semibold ${Number(it.pct_gravamen) > 0 ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>9% PRO{Number(it.pct_gravamen) > 0 ? " ⚠" : ""}</span>
                          )}
                          {rd(c.itbis)}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/60 font-semibold">{rd(c.total)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(it)} disabled={disabled} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicar.mutate(it)} disabled={disabled} title="Duplicar línea"><Copy className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => eliminar.mutate(it.id)} disabled={disabled} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {(items ?? []).length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={5} className="px-2 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Totales</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">
                    {(items ?? []).reduce((s, it) => s + (Number(it.cantidad) || 0), 0).toLocaleString("en-US")}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">
                    {(items ?? []).reduce((s, it) => s + (Number(it.peso) || 0), 0).toLocaleString("en-US")}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">{fmt(totalFob)}</td>
                  <td colSpan={9}></td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold bg-emerald-50/60">
                  {(() => {
                    const tasaCambio = Number(tasaCambioUsada) || 0;
                    const totalImpuestosUSD =
                      (items ?? []).reduce((s: number, it: any) => s + calcImpuestosLinea(Number(it.valor_fob) || 0, totalFob, seguro, flete, otros, it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis, susp.suspendido).total, 0)
                      + (Number(servicioAduaneroUsd) || 0);
                    const totalImpuestosDOP = tasaCambio > 0 ? totalImpuestosUSD * tasaCambio + FORMULARIO_DUA_RD : null;
                    return totalImpuestosDOP != null
                      ? `RD$ ${totalImpuestosDOP.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : <span className="text-amber-600 text-xs">Sin tasa de cambio</span>;
                  })()}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Prorrateo: <b>CIF línea</b> = FOB línea + (Seguro+Flete+Otros) × (FOB línea / Total FOB). Ajusta % Gravamen / ISC al editar el ítem; el sistema guardará esa tasa en el catálogo para futuros expedientes.
        <span className="inline-flex items-center gap-1 ml-2"><AlertTriangle className="h-3 w-3 text-amber-500" /> = tasa aprendida, sin verificar por Admin.</span>
      </p>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setF(emptyForm); setTasaBloqueada(false); setValorUnitario(""); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Editar ítem" : "Nuevo ítem"}</DialogTitle></DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3">
            <DgaProductoSearch
              onSelect={(p, reusarCodigo) => {
                // Solo se bloquean las tasas cuando el producto del catálogo trae
                // gravamen o ISC propios. El ITBIS por sí solo (18% por defecto en
                // todo el catálogo) no constituye una tasa fija verificada.
                const tieneTasaFija =
                  p.pct_gravamen != null || (p.aplica_isc === true && p.pct_isc != null);
                setF((prev) => ({
                  ...prev,
                  product_code: reusarCodigo ? (p.codigo_producto ?? "") : "",
                  codigo_arancelario: prev.codigo_arancelario || (p.partida_arancelaria ?? ""),
                  detalle_producto: prev.detalle_producto || (p.nombre_producto ?? ""),
                  cod_marca: p.cod_marca ?? "",
                  marca: p.marca ?? "",
                  cod_modelo: p.cod_modelo ?? "",
                  modelo: p.modelo ?? "",
                  especificaciones: p.especificaciones ?? "",
                  unidad_medida: prev.unidad_medida || (p.unidad ?? ""),
                  ...(tieneTasaFija
                    ? {
                        pct_gravamen: p.pct_gravamen != null ? String(p.pct_gravamen) : prev.pct_gravamen,
                        aplica_isc: !!p.aplica_isc,
                        pct_isc: p.aplica_isc && p.pct_isc != null ? String(p.pct_isc) : "",
                        pct_itbis: prev.itbis_proindustria ? "9" : (p.pct_itbis != null ? String(p.pct_itbis) : prev.pct_itbis),
                      }
                    : {}),
                }));
                setTasaBloqueada(tieneTasaFija);
                // Si el histórico trae país, intenta mapearlo al catálogo DGA de países.
                // Sin coincidencia exacta se conserva el valor actual (por defecto, el del Expediente).
                const paisCatalogo = (p.pais ?? "").trim();
                if (paisCatalogo) {
                  void (async () => {
                    const patron = patronSinTildes(paisCatalogo);
                    if (!patron) return;
                    const { data } = await supabase.from("dga_paises").select("codigo, pais").ilike("pais", patron).limit(20);
                    const match = (data ?? []).find((r: any) => normalizarNombre(r.pais) === normalizarNombre(paisCatalogo));
                    if (match) setF((prev) => ({ ...prev, pais_origen: match.pais ?? "", pais_origen_codigo: match.codigo ?? "" }));
                  })();
                }
                toast.success(reusarCodigo ? "Producto copiado con su ProductCode" : "Datos copiados — SIGA asignará un ProductCode nuevo");
              }}
            />

          </div>
          <div className="grid gap-3 md:grid-cols-2">

            <div className="grid gap-1.5">
              <Label>Código Arancelario</Label>
              <Input
                value={f.codigo_arancelario}
                onChange={(e) => setF({ ...f, codigo_arancelario: e.target.value })}
                onBlur={(e) => onCodigoBlur(e.target.value)}
                placeholder="0402.10.90"
              />
              {(() => {
                const c = (f.codigo_arancelario || "").trim();
                const t = c ? tasaByCodigo.get(c) : null;
                if (!c) return null;
                if (!t) return <span className="text-[11px] text-slate-500">Código nuevo — se agregará al catálogo al guardar.</span>;
                return (
                  <span className={`text-[11px] flex items-center gap-1 ${t.verificado ? "text-emerald-700" : "text-amber-700"}`}>
                    {t.verificado ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {t.verificado ? "Tasa verificada por Admin." : "Tasa sugerida (sin verificar)."}
                  </span>
                );
              })()}
            </div>
            <div className="grid gap-1.5">
              <Label>Unidad de Medida</Label>
              <CatalogCombobox
                table="catalogo_unidades"
                value={f.unidad_medida}
                codigo={f.unidad_codigo}
                onChange={(nombre, codigo) => setF({ ...f, unidad_medida: nombre, unidad_codigo: codigo })}
                placeholder="Selecciona unidad (catálogo DGA)"
              />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>Detalle del Producto</Label>
              <Textarea rows={2} value={f.detalle_producto} onChange={(e) => setF({ ...f, detalle_producto: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Cantidad</Label>
              <Input type="text" inputMode="decimal" value={f.cantidad} onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, cantidad: v }); }} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Peso</Label>
              <Input type="text" inputMode="decimal" value={f.peso} onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, peso: v }); }} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Valor FOB (US$)</Label>
              <Input type="text" inputMode="decimal" value={f.valor_fob}
                onChange={(e) => { const v = e.target.value.replace(/,/g, ""); if (v === "" || /^\d*\.?\d{0,4}$/.test(v)) setF({ ...f, valor_fob: v }); }}
                onBlur={(e) => { const v = e.target.value; if (v !== "" && !isNaN(Number(v))) setF({ ...f, valor_fob: Number(v).toFixed(4) }); }}
                placeholder="0.0000" />
            </div>
            <div className="grid gap-1.5">
              <Label>Valor Unitario (US$)</Label>
              <Input type="text" inputMode="decimal" value={valorUnitario}
                onChange={(e) => { const v = e.target.value.replace(/,/g, ""); if (v === "" || /^\d*\.?\d{0,4}$/.test(v)) setValorUnitario(v); }}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (v !== "" && !isNaN(Number(v)) && Number(f.cantidad) > 0) {
                    const nuevoFobTotal = (Math.round(Number(v) * Number(f.cantidad) * 10000) / 10000).toFixed(4);
                    setF({ ...f, valor_fob: nuevoFobTotal });
                    setValorUnitario(Number(v).toFixed(4));
                  }
                }}
                placeholder="0.0000" />
              <p className="text-[11px] text-muted-foreground">
                El Valor FOB se ajusta automáticamente al editar el Valor Unitario (4 decimales).
              </p>
            </div>


            <div className="md:col-span-2 border-t pt-3 mt-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Impuestos de la línea</div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label>% Gravamen</Label>
                  <Input type="text" inputMode="decimal" value={f.pct_gravamen} disabled={tasaBloqueada}
                    onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, pct_gravamen: v }); }}
                    placeholder="0" />
                </div>
                <div className="grid gap-1.5">
                  <Label>¿Aplica ISC?</Label>
                  <div className="h-9 flex items-center gap-2">
                    <Switch checked={f.aplica_isc} disabled={tasaBloqueada} onCheckedChange={(v) => setF({ ...f, aplica_isc: v, pct_isc: v ? f.pct_isc : "" })} />
                    <span className="text-sm text-muted-foreground">{f.aplica_isc ? "Sí" : "No"}</span>
                  </div>
                </div>
                {f.aplica_isc && (
                  <div className="grid gap-1.5">
                    <Label>% Selectivo (ISC)</Label>
                    <Input type="text" inputMode="decimal" value={f.pct_isc} disabled={tasaBloqueada}
                      onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, pct_isc: v }); }}
                      placeholder="0" />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>% ITBIS</Label>
                  <Input type="text" inputMode="decimal" value={f.itbis_proindustria ? "9" : f.pct_itbis} disabled={tasaBloqueada || f.itbis_proindustria}
                    onChange={(e) => { const v = e.target.value.replace(",", "."); if (v === "" || /^\d*\.?\d*$/.test(v)) setF({ ...f, pct_itbis: v }); }}
                    placeholder="18" />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <Switch id="itbis-proindustria" checked={!!f.itbis_proindustria}
                      onCheckedChange={(v) => setF({ ...f, itbis_proindustria: v, pct_itbis: v ? "9" : "18" })} />
                    <Label htmlFor="itbis-proindustria" className="cursor-pointer">ITBIS Reducido — PROINDUSTRIA (9%)</Label>
                  </div>
                  {f.itbis_proindustria && Number(f.pct_gravamen || 0) > 0 && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                      Este beneficio requiere que la partida tenga 0% de Arancel según la Ley 242-20 — verificar elegibilidad antes de aplicar.
                    </p>
                  )}
                </div>
              </div>
              {tasaBloqueada ? (
                <p className="text-[11px] text-amber-700 mt-2 flex items-center gap-1 flex-wrap">
                  <ShieldCheck className="h-3 w-3" /> Tasa fija del catálogo DGA —
                  <button type="button" className="underline font-medium" onClick={() => setConfirmarDesbloqueo(true)}>
                    Editar manualmente
                  </button>
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-2">Por defecto 18%. Solo editar si aplica una excepción.</p>
              )}
              <AlertDialog open={confirmarDesbloqueo} onOpenChange={setConfirmarDesbloqueo}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cambiar la tasa fija?</AlertDialogTitle>
                    <AlertDialogDescription>
                      ¿Seguro que quieres cambiar la tasa fija de este producto? Esto no modifica el catálogo, solo esta línea.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { setTasaBloqueada(false); setConfirmarDesbloqueo(false); }}>Sí, editar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="md:col-span-2 border-t pt-3 mt-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Datos del producto (SIGA)</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>ProductCode</Label>
                  <Input value={f.product_code} onChange={(e) => setF({ ...f, product_code: e.target.value })} placeholder="Vacío = SIGA asigna uno nuevo" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Cód. Marca</Label>
                  <Input value={f.cod_marca} onChange={(e) => setF({ ...f, cod_marca: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Marca</Label>
                  <Input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Cód. Modelo</Label>
                  <Input value={f.cod_modelo} onChange={(e) => setF({ ...f, cod_modelo: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Modelo</Label>
                  <Input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Estado del Producto</Label>
                  <CatalogCombobox
                    table="catalogo_estados_producto"
                    codigo={f.estado_producto_codigo}
                    onChange={(_n, codigo) => setF({ ...f, estado_producto_codigo: codigo })}
                    placeholder="Selecciona estado (catálogo DGA)"
                  />
                </div>
                <div className="grid gap-1.5 md:col-span-2">
                  <Label>País de Origen (producto)</Label>
                  <DgaCombobox
                    table="dga_paises"
                    value={f.pais_origen}
                    codigo={f.pais_origen_codigo}
                    onChange={(nombre, codigo) => setF({ ...f, pais_origen: nombre, pais_origen_codigo: codigo })}
                    placeholder="País de origen del producto"
                  />
                  <p className="text-[11px] text-muted-foreground">Por defecto el país del Expediente; cámbialo si este producto viene de otro país.</p>
                </div>
                <div className="grid gap-1.5 md:col-span-2">
                  <Label>Especificaciones</Label>
                  <Textarea rows={2} value={f.especificaciones} onChange={(e) => setF({ ...f, especificaciones: e.target.value })} />
                </div>
              </div>
            </div>

            {esExportacion && (
              <div className="md:col-span-2 border-t pt-3 mt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setVerExport((v) => !v)}>
                  {verExport ? "Ocultar detalles de exportación" : "Más detalles de exportación"}
                </Button>
                {verExport && (
                  <div className="grid gap-3 md:grid-cols-2 mt-3">
                    <div className="grid gap-1.5">
                      <Label>Año del producto</Label>
                      <Input type="number" value={f.product_year} onChange={(e) => setF({ ...f, product_year: e.target.value })} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Grado de alcohol (%)</Label>
                      <Input type="number" step="0.01" value={f.grado_alcohol} onChange={(e) => setF({ ...f, grado_alcohol: e.target.value })} />
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={f.tiene_certificado_origen} onCheckedChange={(v) => setF({ ...f, tiene_certificado_origen: v, certificado_origen_numero: v ? f.certificado_origen_numero : "" })} />
                      <Label>¿Tiene certificado de origen?</Label>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>N° de certificado de origen</Label>
                      <Input value={f.certificado_origen_numero} onChange={(e) => setF({ ...f, certificado_origen_numero: e.target.value })} disabled={!f.tiene_certificado_origen} />
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={f.es_organico} onCheckedChange={(v) => setF({ ...f, es_organico: v })} />
                      <Label>¿Es orgánico?</Label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>{guardar.isPending ? "Guardando…" : (editingId ? "Actualizar" : "Agregar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LiquidacionEstimadaBlock({
  exp, seguro, flete, otros, servicioAduaneroUsd = 0, disabled = false,
}: { exp: any; seguro: number; flete: number; otros: number; servicioAduaneroUsd?: number; disabled?: boolean }) {
  const susp = useImpuestosSusp();
  const { data: items } = useQuery({
    queryKey: ["mercancia-items", exp.id],
    queryFn: async () => (await supabase.from("mercancia_items").select("*").eq("expediente_id", exp.id).is("deleted_at", null).order("item_no")).data ?? [],
  });
  const totalFob = (items ?? []).reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0);
  const totalCif = totalFob + seguro + flete + otros;
  const totals = (items ?? []).reduce((acc: any, it: any) => {
    const c = calcImpuestosLinea(Number(it.valor_fob) || 0, totalFob, seguro, flete, otros, it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis, susp.suspendido);
    acc.gravamen += c.gravamen; acc.selectivo += c.selectivo; acc.itbis += c.itbis; acc.total += c.total;
    return acc;
  }, { gravamen: 0, selectivo: 0, itbis: 0, total: 0 });
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const anyPct = (items ?? []).some((it: any) => it.pct_gravamen != null || it.aplica_isc);

  const tc = useTasaCambioForExpediente(exp);
  const [rateInput, setRateInput] = useState("");
  const [editandoTasa, setEditandoTasa] = useState(false);
  const qcTasa = useQueryClient();
  const tasa = tc.tasa;
  const rd = (n: number) => tasa != null ? fmt(n * tasa) : "—";
  const servicioUsd = Number(servicioAduaneroUsd) || 0;
  const duaUsd = tasa != null && tasa > 0 ? FORMULARIO_DUA_RD / tasa : 0;

  const mostrarCaptura = !tc.congelado && (tc.needsCapture || editandoTasa);

  return (
    <div className="grid gap-4 pt-4 border-t">
      {!tc.congelado && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Fecha de la operación (para la tasa)</Label>
            <Input
              type="date"
              className="w-44"
              value={tc.fecha}
              disabled={disabled}
              onChange={async (e) => {
                if (disabled) return;
                const v = e.target.value;
                if (!v) return;
                const { error } = await supabase.from("expedientes").update({ fecha_tasa_manual: v } as any).eq("id", exp.id);
                if (error) { toast.error(error.message); return; }
                toast.success("Fecha de tasa actualizada");
                qcTasa.invalidateQueries({ queryKey: ["expediente", exp.id] });
              }}
            />
          </div>
          {!mostrarCaptura && (
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => { if (disabled) return; setRateInput(tasa != null ? tasa.toFixed(4) : ""); setEditandoTasa(true); }}
            >
              Editar tasa
            </Button>
          )}
        </div>
      )}

      {mostrarCaptura && (
        <div id="tasa-oficial-captura" className="rounded-lg border border-amber-400 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <div className="font-semibold text-sm text-amber-900">
              {tc.needsCapture ? "Tasa de Cambio requerida" : "Editar Tasa de Cambio"}
            </div>
          </div>
          <p className="text-xs text-amber-900 mb-3">
            {tc.needsCapture ? (
              <>No existe una Tasa Oficial DGA para <b>{tc.fechaLabel}</b>. Ingrésala una sola vez y quedará
              guardada en el catálogo para todos los expedientes de ese día.</>
            ) : (
              <>Actualizarás la Tasa Oficial DGA de <b>{tc.fechaLabel}</b> en el catálogo y en este expediente.</>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">RD$ por US$ 1.00</Label>
              <Input
                className="w-40 font-mono tabular-nums"
                inputMode="decimal"
                placeholder="59.4100"
                value={rateInput}
                disabled={disabled}
                onChange={(e) => { if (disabled) return; const v = e.target.value.replace(/[$,\s]/g, ""); if (v === "" || /^\d*\.?\d{0,4}$/.test(v)) setRateInput(v); }}
              />
            </div>
            <a href="https://www.aduanas.gob.do/tasa-de-cambio/" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 underline flex items-center gap-1 pb-2.5">
              Ver tasa oficial en aduanas.gob.do <ExternalLink className="h-3 w-3" />
            </a>
            <div className="ml-auto flex items-center gap-2">
              {editandoTasa && (
                <Button variant="ghost" size="sm" onClick={() => { setEditandoTasa(false); setRateInput(""); }} disabled={disabled}>
                  Cancelar
                </Button>
              )}
              <Button
                size="sm"
                disabled={disabled || tc.guardar.isPending || !rateInput || Number(rateInput) <= 0}
                onClick={() => tc.guardar.mutate(Number(rateInput), {
                  onSuccess: () => { toast.success(`Tasa RD$ ${rateInput} guardada para ${tc.fechaLabel}`); setRateInput(""); setEditandoTasa(false); },
                  onError: (e: any) => toast.error(e.message),
                })}
              >
                {tc.guardar.isPending ? "Guardando…" : "Guardar tasa"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2 flex-wrap">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <div className="font-semibold text-amber-900 text-sm">Liquidación de Impuestos — <span className="uppercase">Estimada</span></div>
          <span className="ml-auto text-right text-[11px] leading-tight">
            {tasa != null ? (
              <>
                <div className="text-amber-900 font-semibold"><span className="text-destructive">*</span> Tasa Oficial: RD$ {tasa.toFixed(4)} / US$1</div>
                <div className="text-amber-800">
                  {tc.fechaLabel}
                  {tc.origen === "congelada" && <span className="ml-1 inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-3 w-3" />congelada</span>}
                </div>
              </>
            ) : (
              <span className="text-amber-800"><span className="text-destructive">*</span> Tasa Oficial DGA no capturada</span>
            )}
          </span>
        </div>
        {(() => {
          type Fila = { l: string; u: React.ReactNode; r: React.ReactNode; sub?: boolean };
          const grupos: { titulo: string; filas: Fila[] }[] = [
            { titulo: "CIF", filas: [
              { l: "Total FOB", u: fmt(totalFob), r: rd(totalFob) },
              { l: "Seguro", u: fmt(seguro), r: rd(seguro) },
              { l: "Flete", u: fmt(flete), r: rd(flete) },
              { l: "Otros", u: fmt(otros), r: rd(otros) },
              { l: "Total CIF", u: fmt(totalCif), r: rd(totalCif), sub: true },
            ]},
            { titulo: "Impuestos", filas: [
              { l: "Total Gravamen", u: fmt(totals.gravamen), r: rd(totals.gravamen) },
              { l: "Total Selectivo (ISC)", u: fmt(totals.selectivo), r: rd(totals.selectivo) },
              { l: "Total ITBIS", u: fmt(totals.itbis), r: rd(totals.itbis) },
              { l: "Total de Impuestos", u: fmt(totals.gravamen + totals.selectivo + totals.itbis), r: rd(totals.gravamen + totals.selectivo + totals.itbis), sub: true },
            ]},
            { titulo: "Servicio Aduanero / DUA", filas: [
              { l: "Servicio Aduanero", u: fmt(servicioUsd), r: rd(servicioUsd) },
              { l: "Formulario DUA (RD$258.26 fijo)", u: tasa != null ? fmt(duaUsd) : "—", r: fmt(FORMULARIO_DUA_RD) },
              { l: "Total Servicios DGA", u: fmt(servicioUsd + duaUsd), r: tasa != null ? fmt((servicioUsd + duaUsd) * tasa) : "—", sub: true },
            ]},
          ];
          return (
            <div className="text-sm tabular-nums">
              <div className="grid grid-cols-1 lg:grid-cols-3 lg:divide-x divide-amber-200">
                {grupos.map((g) => (
                  <table key={g.titulo} className="w-full border-t border-amber-200 lg:border-t-0">
                    <thead className="bg-amber-100/40 text-[11px] uppercase text-amber-900">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-semibold">{g.titulo}</th>
                        <th className="text-right px-2 py-1.5 font-medium">US$</th>
                        <th className="text-right px-3 py-1.5 font-medium">RD$</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.filas.map((f) => (
                        <tr key={f.l} className={f.sub ? "border-t border-amber-200 bg-amber-100/30 font-semibold" : "border-t border-amber-200/60"}>
                          <td className={`px-3 py-1.5 ${f.sub ? "" : "text-muted-foreground"}`}>{f.l}</td>
                          <td className="text-right px-2 whitespace-nowrap">{f.u}</td>
                          <td className="text-right px-3 whitespace-nowrap">{f.r}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-6 items-center border-t-2 border-primary bg-primary text-primary-foreground font-bold px-4 py-2.5">
                <span className="text-sm">TOTAL A PAGAR</span>
                <span className="text-right text-base whitespace-nowrap">US$ {fmt(totals.total + servicioUsd + duaUsd)}</span>
                <span className="text-right text-base whitespace-nowrap">RD$ {tasa != null ? fmt((totals.total + servicioUsd) * tasa + FORMULARIO_DUA_RD) : "—"}</span>
              </div>
            </div>
          );
        })()}
        {!anyPct && (
          <div className="px-4 py-2 text-[11px] text-amber-800 italic border-t border-amber-200">
            Aún no has capturado % Gravamen ni Selectivo en las líneas. Edita cada ítem para calcular impuestos.
          </div>
        )}
      </div>
    </div>
  );
}

function AvisoRegimenSuspensivo({ expedienteId }: { expedienteId: string }) {
  const susp = useImpuestosSusp();
  const qc = useQueryClient();
  const { data: roles } = useMyRoles();
  const { user } = useCurrentUser();
  const puede = (roles ?? []).some((r) => ["admin", "operaciones"].includes(r));
  const [busy, setBusy] = useState(false);
  if (!susp.suspensivo || !expedienteId) return null;
  const toggle = async () => {
    const activar = !susp.override;
    const msg = activar
      ? "¿Habilitar captura manual de impuestos en este expediente de régimen suspensivo? Úsalo solo si la DGA los exige."
      : "¿Desactivar el override? Los impuestos volverán a mostrarse en cero.";
    if (!window.confirm(msg)) return;
    setBusy(true);
    const { error } = await supabase.from("expedientes").update({
      impuestos_override_manual: activar,
      impuestos_override_at: activar ? new Date().toISOString() : null,
      impuestos_override_por: activar ? user?.id ?? null : null,
    }).eq("id", expedienteId);
    if (!error) {
      await supabase.from("auditoria").insert({ entidad: "expedientes", entidad_id: expedienteId, accion: activar ? "override_impuestos_on" : "override_impuestos_off" });
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(activar ? "Captura manual de impuestos habilitada" : "Override desactivado");
    refrescarExpediente(qc, expedienteId);
  };
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm", susp.override ? "border-primary/40 bg-primary/5" : "border-amber-300 bg-amber-50 text-amber-900")}>
      <span className="font-medium">
        {susp.override ? "Impuestos capturados manualmente (override) en régimen suspensivo" : "⚠ Régimen suspensivo de impuestos — Solo aplica Servicio Aduanero"}
      </span>
      {puede && (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={toggle}>
          {susp.override ? "Quitar override" : "Capturar impuestos manualmente (excepción DGA)"}
        </Button>
      )}
    </div>
  );
}

function ResultadoOficialBlock({ exp, form, set, servicioAduaneroUsd = 0, disabled = false }: { exp: any; form: any; set: (k: string, v: any) => void; servicioAduaneroUsd?: number; disabled?: boolean }) {
  const susp = useImpuestosSusp();
  const tc = useTasaCambioForExpediente(exp);
  // Estimado total en US$: recalculado a partir de items — para simplicidad, tomamos del form (mercancía se recalcula por línea).
  const { data: items } = useQuery({
    queryKey: ["mercancia-items", exp.id],
    queryFn: async () => (await supabase.from("mercancia_items").select("*").eq("expediente_id", exp.id).is("deleted_at", null)).data ?? [],
  });
  const seguro = Number(form.seguro) || 0;
  const flete = Number(form.flete) || 0;
  const otros = Number(form.otros) || 0;
  const totalFob = (items ?? []).reduce((s: number, it: any) => s + (Number(it.valor_fob) || 0), 0);
  const estimadoUsd = (items ?? []).reduce((acc: number, it: any) => {
    const c = calcImpuestosLinea(Number(it.valor_fob) || 0, totalFob, seguro, flete, otros, it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis, susp.suspendido);
    return acc + c.total;
  }, 0);
  const servicioUsd = Number(servicioAduaneroUsd) || 0;
  const estimadoRd = tc.tasa != null ? (estimadoUsd + servicioUsd) * tc.tasa + FORMULARIO_DUA_RD : null;
  const oficialRd = form.liq_oficial_total === "" || form.liq_oficial_total == null ? null : Number(form.liq_oficial_total);
  const dif = oficialRd != null && estimadoRd != null ? oficialRd - estimadoRd : null;
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border p-4 bg-muted/20">
      <div className="flex items-center gap-2 mb-3">
        <FileCheck className="h-4 w-4 text-primary" />
        <div className="font-semibold text-sm">Resultado oficial DGA</div>
        <Badge variant="outline" className="text-[10px] ml-auto">Opcional · al recibir la liquidación</Badge>
      </div>
      <div className="mb-3"><AvisoRegimenSuspensivo expedienteId={exp?.id} /></div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>N.º Liquidación SIGA</Label>
          <Input value={form.liq_siga_numero || ""} onChange={(e) => { set("liq_siga_numero", e.target.value); if (!form.liq_siga_estado) set("liq_siga_estado", "Registrada"); }} placeholder="LIQ-2026-000123" disabled={disabled} />
        </div>
        <div className="grid gap-1.5">
          <Label>Estado</Label>
          <Select value={form.liq_siga_estado || undefined} onValueChange={(v) => set("liq_siga_estado", v)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="Selecciona estado" /></SelectTrigger>
            <SelectContent>
              {["Registrada", "Inspeccionada", "Pagada", "Liberada", "Con observación", "Rectificada"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Total oficial (RD$)</Label>
          <Input type="text" inputMode="decimal" value={form.liq_oficial_total ?? ""}
            onChange={(e) => {
              if (disabled) return;
              // Limpia cualquier valor pegado (ej. "RD$ 38,532.98" o "2,169,442.46" desde SIGA)
              // dejando solo el número, detectando si la coma es miles o decimal.
              const raw = e.target.value.replace(/[^\d.,]/g, "");
              const lastComma = raw.lastIndexOf(",");
              const lastDot = raw.lastIndexOf(".");
              let v = raw;
              if (lastComma !== -1 && lastDot !== -1) {
                // Conviven ambos separadores: el que aparece más a la derecha es el decimal.
                const sepMiles = lastComma > lastDot ? "." : ",";
                v = raw.split(sepMiles).join("");
                if (lastComma > lastDot) v = v.replace(",", ".");
              } else if (lastComma !== -1) {
                // Solo comas: decimal si tras la última coma hay 1-2 dígitos ("38,5"); miles si 3 ("2,169").
                const digitos = raw.length - lastComma - 1;
                if (digitos === 1 || digitos === 2) v = raw.replace(",", ".");
                else v = raw.split(",").join("");
              } else if (lastDot !== -1) {
                // Solo puntos: varios grupos de exactamente 3 dígitos ("2.169.442") es formato de miles.
                const grupos = raw.split(".");
                if (grupos.length > 2 && grupos.slice(1).every((g) => g.length === 3)) v = raw.split(".").join("");
              }
              const dot = v.indexOf(".");
              if (dot !== -1) v = v.slice(0, dot) + "." + v.slice(dot + 1).replace(/\./g, "").slice(0, 2);
              if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) set("liq_oficial_total", v);
            }}
            placeholder="0.00" className="tabular-nums" disabled={disabled} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3 mt-3">
        <div className="grid gap-1.5">
          <Label>PIN pago DGA</Label>
          <Input value={form.liq_siga_pin_pago || ""} onChange={(e) => set("liq_siga_pin_pago", e.target.value)} placeholder="PIN de pago" disabled={disabled} />
        </div>
        <div className="grid gap-1.5">
          <Label>Fecha de registro</Label>
          <Input
            type="datetime-local"
            value={form.liq_siga_registro_at || ""}
            onChange={(e) => {
              const v = e.target.value;
              set("liq_siga_registro_at", v);
              // Autocompleta la vigencia (registro + 96 h) solo si está vacía.
              if (v && !form.liq_siga_termino_at) set("liq_siga_termino_at", terminoPin(v));
            }}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <Label>Fecha de Término (vigencia del PIN)</Label>
            <BadgeVigenciaPinDga terminoAt={localInputToIso(form.liq_siga_termino_at)} fechaPago={form.liq_siga_fecha_pago || null} />
          </div>
          <Input type="datetime-local" value={form.liq_siga_termino_at || ""} onChange={(e) => set("liq_siga_termino_at", e.target.value)} disabled={disabled} />
          <div className="text-[11px] text-muted-foreground">96 horas exactas desde la fecha de registro. Editable.</div>
        </div>
        <div className="grid gap-1.5">
          <Label>Fecha de pago</Label>
          <Input type="date" value={form.liq_siga_fecha_pago || ""} onChange={(e) => set("liq_siga_fecha_pago", e.target.value)} disabled={disabled} />
        </div>
      </div>

      {/* PIN pago Almacenaje */}
      <div className="grid gap-3 md:grid-cols-4 mt-3">
        <div className="grid gap-1.5">
          <Label>PIN pago Almacenaje</Label>
          <Select value={form.pin_almacenaje || undefined} onValueChange={(v) => set("pin_almacenaje", v)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>
              {OPCIONES_PIN_ALMACENAJE.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Monto a pagar (RD$)</Label>
          <Input type="text" inputMode="decimal" className="tabular-nums" placeholder="0.00" disabled={disabled}
            value={form.pin_almacenaje_monto ?? ""}
            onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) set("pin_almacenaje_monto", v); }} />
        </div>
        <div className="grid gap-1.5">
          <Label>Fecha de Registro</Label>
          <Input type="date" value={form.pin_almacenaje_fecha_registro || ""} onChange={(e) => set("pin_almacenaje_fecha_registro", e.target.value)} disabled={disabled} />
        </div>
        <div className="grid gap-1.5">
          <Label>Fecha de pago</Label>
          <Input type="date" value={form.pin_almacenaje_fecha_pago || ""} onChange={(e) => set("pin_almacenaje_fecha_pago", e.target.value)} disabled={disabled} />
        </div>
      </div>

      {/* PIN pago Contenedor */}
      <div className="grid gap-3 md:grid-cols-4 mt-3">
        <div className="grid gap-1.5">
          <Label>PIN pago Contenedor</Label>
          <Select value={form.pin_contenedor || undefined} onValueChange={(v) => set("pin_contenedor", v)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
            <SelectContent>
              {OPCIONES_PIN_CONTENEDOR.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Monto a pagar (RD$)</Label>
          <Input type="text" inputMode="decimal" className="tabular-nums" placeholder="0.00" disabled={disabled}
            value={form.pin_contenedor_monto ?? ""}
            onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) set("pin_contenedor_monto", v); }} />
        </div>
        <div className="grid gap-1.5">
          <Label>Fecha de Registro</Label>
          <Input type="date" value={form.pin_contenedor_fecha_registro || ""} onChange={(e) => set("pin_contenedor_fecha_registro", e.target.value)} disabled={disabled} />
        </div>
        <div className="grid gap-1.5">
          <Label>Fecha de pago</Label>
          <Input type="date" value={form.pin_contenedor_fecha_pago || ""} onChange={(e) => set("pin_contenedor_fecha_pago", e.target.value)} disabled={disabled} />
        </div>
      </div>

      {/* Cotejo de envío de valores */}
      <div className="flex items-center gap-3 mt-3">
        <Switch
          id="valores-enviados"
          checked={!!form.valores_enviados}
          disabled={disabled}
          onCheckedChange={(v) => {
            set("valores_enviados", v);
            set("valores_enviados_at", v ? new Date().toISOString() : null);
          }}
        />
        <Label htmlFor="valores-enviados" className="cursor-pointer">Valores enviados</Label>
        {form.valores_enviados && form.valores_enviados_at && (
          <span className="text-xs text-muted-foreground">
            {new Date(form.valores_enviados_at).toLocaleString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
        {estimadoRd != null && (
          <>
            <div>Estimado (RD$): <span className="font-mono tabular-nums text-foreground">{fmt(estimadoRd)}</span></div>
            <div>Incluye Servicio Aduanero: <span className="font-mono tabular-nums text-foreground">RD$ {fmt(servicioUsd * (tc.tasa ?? 0))}</span> y Formulario DUA (RD$258.26 fijo).</div>
          </>
        )}
        {dif != null && (
          <div>
            Diferencia vs. estimado:{" "}
            <span className={`font-semibold tabular-nums ${dif >= 0 ? "text-destructive" : "text-emerald-700"}`}>
              {dif >= 0 ? "+" : "−"} RD$ {fmt(Math.abs(dif))}
            </span>
          </div>
        )}
        {tc.congelado && (
          <div className="inline-flex items-center gap-1 text-emerald-700">
            <ShieldCheck className="h-3 w-3" /> Tasa RD$ {tc.tasa?.toFixed(4)} congelada para trazabilidad histórica.
          </div>
        )}
      </div>
    </div>
  );
}


function CotizacionServiciosExpedienteButton({ exp }: { exp: any }) {
  const { data: roles } = useMyRoles();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = (roles ?? []).some((r) =>
    ["admin", "finanzas", "operaciones", "agente_aduanal", "contabilidad"].includes(r),
  );

  const { data: cot } = useQuery({
    queryKey: ["cotserv-expediente", exp.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("cotizaciones_servicios")
        .select("id,numero,factura_id, facturas_ecf(id,encf)")
        .eq("expediente_id", exp.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const crear = useMutation({
    mutationFn: async () => {
      // Evita duplicados: si ya existe (creada desde otro punto de entrada), se reutiliza.
      const { data: existente } = await supabase
        .from("cotizaciones_servicios").select("id").eq("expediente_id", exp.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existente) return existente.id as string;
      const [{ count: nCostos }, { count: nGastos }] = await Promise.all([
        supabase.from("costos").select("id", { count: "exact", head: true }).eq("expediente_id", exp.id),
        supabase.from("gastos").select("id", { count: "exact", head: true }).eq("expediente_id", exp.id).is("deleted_at", null),
      ]);
      if (!nCostos && !nGastos &&
        !confirm("Este Expediente no tiene costos ni gastos registrados aún — la cotización puede salir incompleta. ¿Crearla de todos modos?")) {
        throw new Error("__cancelado__");
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("cotizaciones_servicios")
        .insert({
          expediente_id: exp.id,
          cliente_id: exp.cliente_id ?? null,
          notas: `Expediente ${exp.numero}`,
          estado: "borrador",
          creado_por: u.user?.id ?? null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (cotId) => {
      toast.success("Cotización de servicios creada — agrega las líneas");
      qc.invalidateQueries({ queryKey: ["cotserv-expediente", exp.id] });
      qc.invalidateQueries({ queryKey: ["cotizaciones-servicios"] });
      navigate({ to: "/admin/cotizaciones-servicios", search: { editar: cotId } });
    },
    onError: (e: any) => { if (e?.message !== "__cancelado__") toast.error(e.message ?? "No se pudo crear la cotización"); },
  });

  if (!canEdit) return null;

  if (cot?.factura_id) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate({ to: "/admin/facturacion", search: { editar: cot.factura_id! } })}
      >
        <ExternalLink className="h-4 w-4 mr-1" />
        Ver Factura {(cot as any).facturas_ecf?.encf || ""}
      </Button>
    );
  }

  if (cot) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate({ to: "/admin/cotizaciones-servicios", search: { editar: cot.id } })}
      >
        <ExternalLink className="h-4 w-4 mr-1" />
        Ver Cotización de Servicios {cot.numero}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" disabled={crear.isPending} onClick={() => crear.mutate()}>
      <FileText className="h-4 w-4 mr-1" />
      Crear Cotización de Servicios
    </Button>
  );
}

function PreLiquidacionPdfButton({ exp }: { exp: any }) {
  const { user } = useCurrentUser();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const docRef = useRef<any>(null);
  const fileNameRef = useRef<string>("PreLiquidacion.pdf");

  const cerrarPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl.split("#")[0]);
    setPreviewUrl(null);
    docRef.current = null;
  };

  const generar = async () => {
    // Siempre leer datos frescos de la base para que el PDF refleje los últimos cambios
    const [itemsRes, expRes, contRes] = await Promise.all([
      supabase
        .from("mercancia_items")
        .select("*")
        .eq("expediente_id", exp.id)
        .is("deleted_at", null)
        .order("item_no"),
      supabase.from("expedientes").select("*, clientes(nombre, rnc)").eq("id", exp.id).maybeSingle(),
      supabase.from("expediente_contenedores").select("*").eq("expediente_id", exp.id).order("item_no"),
    ]);

    const list = itemsRes.data ?? [];
    const expData: any = expRes.data ? { ...exp, ...expRes.data } : exp;
    const contenedoresList = (contRes.data ?? []).map((c: any) => ({
      item_no: c.item_no,
      numero: c.numero_contenedor,
      sello1: c.sello1,
      tipo: c.tipo_contenedor,
    }));
    if (list.length === 0) {
      toast.error("El expediente no tiene ítems de mercancía.");
      return;
    }

    const impuestosSuspendidos = (await esRegimenSuspensivo(expData.regimen_aduanero)) && !expData.impuestos_override_manual;
    const { doc } = await buildPreLiquidacionPdf({
      impuestosSuspendidos,
      infoCols: [
        [
          ["N° Expediente", expData.numero ?? "—"],
          ["BL/AWB", expData.bl_awb ?? "—"],
          ["Régimen", expData.regimen_aduanero ?? "—"],
          ["Estado", ESTADO_LABEL[expData.estado ?? ""] ?? (expData.estado ?? "—")],
        ],
        [
          ["Depósito/Puerto arribo", expData.puerto_arribo ?? "—"],
          ["País de procedencia", expData.pais_procedencia ?? expData.pais_procedencia_codigo ?? expData.pais_origen ?? "—"],
          ["Manifiesto / DUA", expData.numero_dua ?? "—"],
          ["Fecha de llegada", expData.fecha_compromiso ? fmtLocalDate(expData.fecha_compromiso) : "—"],
        ],
        [
          ["Importador", expData.clientes?.nombre ?? "—"],
          ["RNC/Documento", expData.clientes?.rnc ?? "—"],
          ["Agente Aduanero", "Francisco Enerio Lopez Martinez (072-08)"],
          ["Suplidor", expData.suplidor ?? "—"],
        ],
      ],
      items: (list as any[]).map((it) => ({ ...it, origen: it.pais_origen || expData.pais_origen || "—" })),
      seguro: Number(expData.seguro) || 0,
      flete: Number(expData.flete) || 0,
      otros: Number(expData.otros) || 0,
      tasaCambio: Number(expData.tasa_cambio_usada) || 0,
      usuarioEmail: user?.email ?? null,
      totalFobOverride: Number(expData.total_fob) || null,
      totalCifOverride: Number(expData.total_cif) || null,
      pesoBruto: expData.peso_bruto ?? null,
      pesoNeto: expData.peso_neto ?? null,
      contenedores: contenedoresList.length
        ? contenedoresList.map((c) => ({ item_no: c.item_no, numero: c.numero, sello1: c.sello1, tipo: c.tipo }))
        : (expData.numeros_contenedores ?? null),
      servicioAduaneroUsd: await servicioAduaneroDeExpediente(expData),
    });

    const fecha = new Date().toISOString().slice(0, 10);
    fileNameRef.current = `PRE-LIQUIDACION DE EXP. ${expData.numero ?? "expediente"}_${fecha}.pdf`;
    doc.setProperties({ title: fileNameRef.current.replace(/\.pdf$/, "") });
    docRef.current = doc;
    if (previewUrl) URL.revokeObjectURL(previewUrl.split("#")[0]);
    setPreviewUrl(`${doc.output("bloburl").toString()}#toolbar=0`);
  };


  return (
    <>
      <Button variant="outline" size="sm" onClick={generar}>
        <FileText className="h-4 w-4 mr-1" />
        Descargar Pre-Liquidación (PDF)
      </Button>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) cerrarPreview(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa — Pre-Liquidación</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="Pre-Liquidación" className="w-full h-full border-0" />}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => docRef.current?.save(fileNameRef.current)}
            >
              <FileText className="h-4 w-4 mr-1" /> Descargar
            </Button>
            <Button size="sm" onClick={cerrarPreview}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LiquidacionFinalPdfButton({
  exp,
  list,
  calcFila,
  gastosAdicionales,
  tasaCambio,
}: {
  exp: any;
  list: any[];
  calcFila: (it: any) => any;
  gastosAdicionales: number;
  tasaCambio: number;
}) {
  const { user } = useCurrentUser();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const docRef = useRef<any>(null);
  const fileNameRef = useRef<string>("LiquidacionFinal.pdf");

  const { data: costosProducto } = useQuery({
    queryKey: ["costos-producto-pdf", exp.id],
    queryFn: async () =>
      (await supabase
        .from("costos_producto")
        .select("concepto, monto_real")
        .eq("expediente_id", exp.id)
        .order("created_at")).data ?? [],
  });

  const cerrarPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl.split("#")[0]);
    setPreviewUrl(null);
    docRef.current = null;
  };

  const generar = async () => {
    if (list.length === 0) {
      toast.error("El expediente no tiene ítems de mercancía.");
      return;
    }
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const nf = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Convierte un valor en USD a RD$ usando la tasa de cambio del expediente.
    // Devuelve "—" si no hay tasa cargada (0/null) para evitar RD$0.00 engañosos.
    const rd = (usd: number | null | undefined) => {
      if (usd == null) return "—";
      if (!tasaCambio || tasaCambio <= 0) return "—";
      return nf(usd * tasaCambio);
    };

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 32;

    const finalizadaEn = list.find((it) => it.liquidacion_final_en)?.liquidacion_final_en ?? null;

    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("ADECOMEX SRL — Gestión y Logística", M, 40);
    doc.setFontSize(11);
    doc.text("LIQUIDACIÓN FINAL DE PRODUCTO", M, 58);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
    const expLabel = "N° Expediente: ";
    doc.text(expLabel, M, 70);
    doc.setFont("helvetica", "bold"); doc.setTextColor(190, 30, 44);
    const numeroExp = exp.numero ?? "—";
    doc.text(numeroExp, M + doc.getTextWidth(expLabel), 70);
    doc.setFont("helvetica", "normal"); doc.setTextColor(100);
    doc.text(`   |   Cliente: ${exp.clientes?.nombre ?? "—"}`, M + doc.getTextWidth(expLabel) + doc.getTextWidth(numeroExp), 70);
    doc.text(
      `Generado: ${new Date().toLocaleString("es-DO")}   |   Usuario: ${user?.email ?? "—"}`,
      M,
      82,
    );
    if (finalizadaEn) {
      doc.setTextColor(16, 122, 87); doc.setFont("helvetica", "bold");
      doc.text(`Finalizada el ${new Date(finalizadaEn).toLocaleString("es-DO")}`, M, 94);
    } else {
      doc.setTextColor(180, 40, 40); doc.setFont("helvetica", "bold");
      doc.text("BORRADOR — liquidación aún no finalizada", M, 94);
    }
    doc.setFont("helvetica", "normal"); doc.setTextColor(0);

    const t = { cant: 0, gEst: 0, gReal: 0, iEst: 0, iReal: 0, tEst: 0, tReal: 0, inv: 0, venta: 0 };
    const body = list.map((it) => {
      const c = calcFila(it);
      const cv = c.cv ?? 0;
      const margenUnit = cv - c.costoUnit;
      const pct = cv > 0 ? (margenUnit / cv) * 100 : 0;
      t.cant += c.cant;
      t.gEst += c.est.gravamen; t.gReal += c.gr ?? 0;
      t.iEst += c.est.selectivo; t.iReal += c.ir ?? 0;
      t.tEst += c.est.itbis; t.tReal += c.tr ?? 0;
      t.inv += c.costoUnit * c.cant;
      t.venta += cv * c.cant;
      return [
        it.detalle_producto ?? "—",
        (it as any).pais_origen || exp.pais_origen || "—",
        nf(c.cant),
        rd(c.est.gravamen), rd(c.gr),
        rd(c.est.selectivo), rd(c.ir),
        rd(c.est.itbis), rd(c.tr),
        nf(c.costoUnit),
        c.cv == null ? "—" : nf(c.cv),
        c.cv == null ? "—" : nf(margenUnit),
        c.cv == null ? "—" : `${pct.toFixed(1)}%`,
      ];
    });

    const margenTotal = t.venta - t.inv;
    const margenPct = t.venta > 0 ? (margenTotal / t.venta) * 100 : 0;

    autoTable(doc, {
      startY: 106,
      head: [[
        "Descripción", "País de Origen", "Cantidad", "Gravamen Est. (RD$)", "Gravamen Real (RD$)", "ISC Est. (RD$)", "ISC Real (RD$)",
        "ITBIS Est. (RD$)", "ITBIS Real (RD$)", "Costo Unit. Real", "Costo de Venta", "Margen Unit.", "% Margen",
      ]],
      body,
      foot: [[
        "TOTALES", "", nf(t.cant), rd(t.gEst), rd(t.gReal), rd(t.iEst), rd(t.iReal),
        rd(t.tEst), rd(t.tReal), "", "", nf(margenTotal), `${margenPct.toFixed(1)}%`,
      ]],
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], fontSize: 7 },
      bodyStyles: { fontSize: 6.8 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 130 }, 1: { cellWidth: 50 },
        2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
        5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
        8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" },
        11: { halign: "right" }, 12: { halign: "right" },
      },
      margin: { left: M, right: M },
    });

    // --- Desglose del Costo Unitario Real por componente ---
    const seguroExp = Number(exp.seguro) || 0;
    const fleteExp = Number(exp.flete) || 0;
    const otrosExp = Number(exp.otros) || 0;
    const totalFobExp = list.reduce((s, it) => s + (Number(it.valor_fob) || 0), 0);
    const gastosAdicionalesUSD = tasaCambio > 0 ? gastosAdicionales / tasaCambio : 0;
    const servicioAduaneroUsdPdf = await servicioAduaneroDeExpediente(exp);

    const td = { cant: 0, fob: 0, seg: 0, fle: 0, otr: 0, cif: 0, gr: 0, ir: 0, gp: 0, cu: 0 };
    const bodyDesglose = list.map((it) => {
      const c = calcFila(it);
      const cant = c.cant;
      const fob = c.fob;
      const share = totalFobExp > 0 ? fob / totalFobExp : 0;
      const segL = seguroExp * share;
      const fleL = fleteExp * share;
      const otrL = otrosExp * share;
      const gpL = gastosAdicionalesUSD * share;
      const u = (n: number) => (cant > 0 ? n / cant : 0);
      td.cant += cant; td.fob += fob; td.seg += segL; td.fle += fleL; td.otr += otrL;
      td.cif += c.est.cifLinea; td.gr += c.gr ?? 0; td.ir += c.ir ?? 0; td.gp += gpL;
      td.cu += c.costoUnit * cant;
      return [
        it.detalle_producto ?? "—",
        nf(cant),
        nf(u(fob)), nf(u(segL)), nf(u(fleL)), nf(u(otrL)),
        rd(u(c.est.cifLinea)),
        c.gr == null ? "—" : rd(u(c.gr)),
        c.ir == null ? "—" : rd(u(c.ir)),
        nf(u(gpL)),
        nf(c.costoUnit),
      ];
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 12,
      head: [[
        "Desglose del Costo Unitario Real por Producto", "Cantidad", "FOB Unit.", "Seguro Unit.",
        "Flete Unit.", "Otros Unit.", "CIF Unit. (RD$)", "Gravamen Real Unit. (RD$)", "ISC Real Unit. (RD$)",
        "Gastos Prod. Unit.", "Costo Unit. Real",
      ]],
      body: bodyDesglose,
      foot: [[
        "TOTALES", nf(td.cant), nf(td.fob), nf(td.seg), nf(td.fle), nf(td.otr),
        rd(td.cif), rd(td.gr), rd(td.ir), nf(td.gp), nf(td.cu),
      ]],
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], fontSize: 7 },
      bodyStyles: { fontSize: 6.8 },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 150 },
        1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" },
        4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
        7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
        10: { halign: "right" },
      },
      margin: { left: M, right: M },
    });

    const cp = (costosProducto ?? []) as any[];

    // --- Summary block: 3 tables side-by-side, always trying to fit on page 1 ---
    const COL_W = 250;
    const GAP = 14;
    let summaryStartY = (doc as any).lastAutoTable.finalY + 10;
    const availH = pageH - 40 - summaryStartY;
    // tallest block is the costos table: header + rows + footer
    const maxRows = Math.max(8, (cp.length || 1) + 1);
    // shrink typography progressively so the block fits in the remaining space
    let fs = 8;
    let cellPad = 3;
    const blockH = (f: number, p: number) => (maxRows + 1) * (f + p * 2 + 2) + 4;
    while (fs > 5.5 && blockH(fs, cellPad) > availH) {
      fs -= 0.5;
      if (cellPad > 1.2) cellPad -= 0.4;
    }
    if (blockH(fs, cellPad) > availH) {
      doc.addPage();
      summaryStartY = 50;
      fs = 8;
      cellPad = 3;
    }
    const sStyles = { fontSize: fs, cellPadding: cellPad } as any;
    const sHead = { fillColor: [30, 58, 138] as [number, number, number], fontSize: fs, cellPadding: cellPad };

    autoTable(doc, {
      startY: summaryStartY,
      pageBreak: "avoid",
      head: [["Componentes de la Inversión (US$)", ""]],
      body: [
        ["FOB Total", nf(Number(exp.total_fob) || totalFobExp)],
        ["Seguro Total", nf(seguroExp)],
        ["Flete Total", nf(fleteExp)],
        ["Otros Total", nf(otrosExp)],
        ["Gravamen Real Total", nf(t.gReal)],
        ["Servicio Aduanero", nf(servicioAduaneroUsdPdf)],
        ["Formulario DUA (RD$258.26 fijo)", tasaCambio > 0 ? nf(FORMULARIO_DUA_RD / tasaCambio) : "s/t"],
        ["ISC Real Total", nf(t.iReal)],
        ["Gastos del Producto (USD)", nf(gastosAdicionalesUSD)],
        ["INVERSIÓN TOTAL", nf(t.inv)],
      ],
      theme: "grid",
      headStyles: sHead,
      bodyStyles: sStyles,
      columnStyles: { 0: { fontStyle: "bold", textColor: 90, cellWidth: 140 }, 1: { halign: "right" } },
      margin: { left: M, right: M },
      tableWidth: COL_W,
    });
    const componentesFinalY = (doc as any).lastAutoTable.finalY;

    autoTable(doc, {
      startY: summaryStartY,
      pageBreak: "avoid",
      head: [["Costos del Producto", "DOP", "USD"]],
      body: cp.length
        ? cp.map((c) => [
            c.concepto ?? "—",
            nf(Number(c.monto_real) || 0),
            tasaCambio > 0 ? nf((Number(c.monto_real) || 0) / tasaCambio) : "s/t",
          ])
        : [["Sin costos registrados", "—", "—"]],
      foot: [[
        "TOTAL",
        nf(gastosAdicionales),
        tasaCambio > 0 ? nf(gastosAdicionales / tasaCambio) : "s/t",
      ]],
      theme: "grid",
      headStyles: sHead,
      bodyStyles: sStyles,
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", fontSize: fs, cellPadding: cellPad },
      columnStyles: { 0: { cellWidth: 110 }, 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: M + COL_W + GAP, right: M },
      tableWidth: COL_W,
    });
    const costosFinalY = (doc as any).lastAutoTable.finalY;

    autoTable(doc, {
      startY: summaryStartY,
      pageBreak: "avoid",
      head: [["Resumen final (US$)", ""]],
      body: [
        ["Inversión total", nf(t.inv)],
        ["Valor de venta esperado", nf(t.venta)],
        ["Margen esperado total", `${nf(margenTotal)} (${margenPct.toFixed(1)}%)`],
      ],
      theme: "grid",
      headStyles: sHead,
      bodyStyles: sStyles,
      columnStyles: { 0: { fontStyle: "bold", textColor: 90, cellWidth: 130 }, 1: { halign: "right" } },
      margin: { left: M + (COL_W + GAP) * 2, right: M },
      tableWidth: COL_W,
    });
    const resumenFinalY = (doc as any).lastAutoTable.finalY;
    (doc as any).lastAutoTable.finalY = Math.max(componentesFinalY, costosFinalY, resumenFinalY);


    const nota =
      "El ITBIS no se incluye en el Costo Unitario Real por ser crédito fiscal recuperable. " +
      "Los montos en DOP se convierten a USD con la tasa de cambio registrada en el Expediente (exp.tasa_cambio_usada).";
    let notaY = (doc as any).lastAutoTable.finalY + 36;
    doc.setFontSize(7.5); doc.setTextColor(110);
    const lines = doc.splitTextToSize(nota, pageW - M * 2);
    if (notaY + lines.length * 10 > pageH - 40) { doc.addPage(); notaY = 50; }
    doc.text(lines, M, notaY);
    doc.setTextColor(0);

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Página ${i} de ${pages}`, pageW - M, pageH - 20, { align: "right" });
    }

    const fecha = new Date().toISOString().slice(0, 10);
    fileNameRef.current = `LIQUIDACION FINAL DE EXP. ${exp.numero ?? "expediente"}_${fecha}.pdf`;
    doc.setProperties({ title: fileNameRef.current.replace(/\.pdf$/, "") });
    docRef.current = doc;
    if (previewUrl) URL.revokeObjectURL(previewUrl.split("#")[0]);
    setPreviewUrl(`${doc.output("bloburl").toString()}#toolbar=0`);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={generar}>
        <FileText className="h-4 w-4 mr-1" />
        Descargar Liquidación Final (PDF)
      </Button>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) cerrarPreview(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa — Liquidación Final</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="Liquidación Final" className="w-full h-full border-0" />}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => docRef.current?.save(fileNameRef.current)}>
              <Download className="h-4 w-4 mr-1" /> Descargar PDF
            </Button>
            <Button size="sm" onClick={cerrarPreview}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


// ---------------------------------------------------------------------------
// Liquidación Final por producto → entrada a Almacén
// ---------------------------------------------------------------------------
function LiquidacionFinalSection({ exp }: { exp: any }) {
  const susp = useImpuestosSusp();
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const { data: roles } = useMyRoles();
  const isAdmin = (roles ?? []).some((r) => r === "admin");
  const canEdit = (roles ?? []).some((r) => ["admin", "finanzas", "operaciones", "agente_aduanal", "contabilidad"].includes(r));

  const { data: items } = useQuery({
    queryKey: ["mercancia-items", exp.id],
    queryFn: async () =>
      (await supabase.from("mercancia_items").select("*").eq("expediente_id", exp.id).is("deleted_at", null).order("item_no")).data ?? [],
  });

  const { data: costosAdic } = useQuery({
    queryKey: ["costos-producto-liq", exp.id],
    queryFn: async () =>
      (await supabase
        .from("costos_producto")
        .select("monto_real")
        .eq("expediente_id", exp.id)).data ?? [],
  });
  const gastosAdicionales = (costosAdic ?? []).reduce((s: number, c: any) => s + (Number(c.monto_real) || 0), 0);
  const tasaCambio = Number(exp.tasa_cambio_usada) || 0;
  const faltaTasa = gastosAdicionales > 0 && tasaCambio <= 0;
  const gastosAdicionalesUSD = tasaCambio > 0 ? gastosAdicionales / tasaCambio : 0;

  const { data: almacenes } = useQuery({
    queryKey: ["almacenes-activos"],
    queryFn: async () =>
      (await (supabase.from("almacenes" as any) as any).select("id,nombre,ubicacion").eq("activo", true).order("nombre")).data ?? [],
  });
  const { data: stockExistente } = useQuery({
    queryKey: ["almacen-stock-exp", exp.id],
    queryFn: async () =>
      (await (supabase.from("almacen_stock" as any) as any).select("almacen_id").eq("expediente_id", exp.id).limit(1)).data ?? [],
  });
  const [almacenId, setAlmacenId] = useState<string>("");
  useEffect(() => {
    const prev = (stockExistente ?? [])[0]?.almacen_id;
    if (prev && !almacenId) setAlmacenId(prev);
  }, [stockExistente]);

  const list = (items ?? []) as any[];
  const seguro = Number(exp.seguro) || 0;
  const flete = Number(exp.flete) || 0;
  const otros = Number(exp.otros) || 0;
  const totalFob = list.reduce((s, it) => s + (Number(it.valor_fob) || 0), 0);


  const finalizado = list.length > 0 && list.every((it) => it.liquidacion_final_en);
  const [reabierto, setReabierto] = useState(false);
  const editable = canEdit && (!finalizado || reabierto);

  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});
  const val = (it: any, campo: string) => {
    const d = draft[it.id]?.[campo];
    if (d !== undefined) return d;
    const v = it[campo];
    return v == null ? "" : String(v);
  };
  const num = (it: any, campo: string) => {
    const v = val(it, campo);
    return v === "" ? null : Number(v);
  };
  const setVal = (id: string, campo: string, v: string) =>
    setDraft((p) => ({ ...p, [id]: { ...(p[id] ?? {}), [campo]: v } }));

  const nf = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const calcFila = (it: any) => {
    const fob = Number(it.valor_fob) || 0;
    const est = calcImpuestosLinea(fob, totalFob, seguro, flete, otros, it.pct_gravamen, it.aplica_isc, it.pct_isc, it.pct_itbis, susp.suspendido);
    const cant = Number(it.cantidad) || 0;
    const shareLinea = totalFob > 0 ? fob / totalFob : 0;
    const gastosAdicLinea = gastosAdicionalesUSD * shareLinea;
    const gr = num(it, "gravamen_real");
    const ir = num(it, "isc_real");
    const tr = num(it, "itbis_real");
    const cv = num(it, "costo_venta_unitario");
    const costoUnit = cant > 0 ? (est.cifLinea + (gr ?? 0) + (ir ?? 0) + gastosAdicLinea) / cant : 0;
    return { fob, est, cant, gr, ir, tr, cv, costoUnit, gastosAdicLinea };
  };

  const completo = !!almacenId && list.length > 0 && list.every((it) => {
    const c = calcFila(it);
    return c.gr != null && c.ir != null && c.tr != null && c.cv != null;
  });

  const Diff = ({ real, est }: { real: number | null; est: number }) => {
    if (real == null) return <span className="text-muted-foreground">—</span>;
    const d = real - est;
    const cls = d > 0 ? "text-destructive font-medium" : "text-emerald-600 font-medium";
    return <span className={cls}>{d > 0 ? "+" : ""}{nf(d)}</span>;
  };

  const finalizar = useMutation({
    mutationFn: async () => {
      const ahora = new Date().toISOString();
      for (const it of list) {
        const c = calcFila(it);
        const { error: e1 } = await supabase
          .from("mercancia_items")
          .update({
            gravamen_real: c.gr,
            isc_real: c.ir,
            itbis_real: c.tr,
            costo_venta_unitario: c.cv,
            liquidacion_final_en: ahora,
            liquidacion_final_por: user?.id ?? null,
          } as any)
          .eq("id", it.id);
        if (e1) throw e1;

        const { error: e2 } = await (supabase.from("almacen_stock" as any) as any).upsert(
          {
            expediente_id: exp.id,
            mercancia_item_id: it.id,
            producto: it.detalle_producto ?? "Producto",
            codigo_arancelario: it.codigo_arancelario ?? null,
            unidad: it.unidad_medida ?? null,
            pais_origen: (it as any).pais_origen ?? null,
            cantidad: c.cant,
            cantidad_disponible: c.cant,
            almacen_id: almacenId || null,
            costo_unitario_real: Number(c.costoUnit.toFixed(2)),
            costo_venta_unitario: c.cv,
            fecha_entrada: ahora,
            creado_por: user?.id ?? null,
          },
          { onConflict: "mercancia_item_id" },
        );
        if (e2) throw e2;
      }
      await supabase.from("auditoria").insert({
        entidad: "expedientes",
        entidad_id: exp.id,
        accion: `liquidacion_final:${exp.numero}`,
      });
    },
    onSuccess: () => {
      toast.success("Liquidación final registrada y enviada a Almacén");
      setDraft({});
      setReabierto(false);
      qc.invalidateQueries({ queryKey: ["mercancia-items", exp.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3 border-b flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">Liquidación Final</CardTitle>
          <p className="text-xs text-muted-foreground">
            Montos reales pagados a la DGA por producto, comparados contra el estimado. Da entrada formal a Almacén.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {finalizado && <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">Finalizada</Badge>}
          <LiquidacionFinalPdfButton
            exp={exp}
            list={list}
            calcFila={calcFila}
            gastosAdicionales={gastosAdicionales}
            tasaCambio={tasaCambio}
          />
          {finalizado && isAdmin && !reabierto && (
            <Button variant="outline" size="sm" onClick={() => setReabierto(true)}>Reabrir liquidación</Button>
          )}
          {editable && (
            <Button size="sm" disabled={!completo || finalizar.isPending} onClick={() => finalizar.mutate()}>
              <FileCheck className="h-4 w-4 mr-1" />
              Finalizar Liquidación y Enviar a Almacén
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 overflow-x-auto">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">El expediente no tiene ítems de mercancía.</p>
        ) : (
          <>
          <div className={`mb-3 rounded-md border px-3 py-2 flex items-start justify-between gap-3 flex-wrap ${faltaTasa ? "border-destructive/50 bg-destructive/10" : "bg-muted/40"}`}>
            <div>
              <div className="text-xs font-medium">Gastos adicionales prorrateados (Costos del Producto)</div>
              <div className="text-[11px] text-muted-foreground">
                Suma de los montos reales registrados en la ficha "Costos del Producto" ({CONCEPTOS_COSTO_ADICIONALES.join(", ")}). Se convierten a USD con la tasa del expediente y se prorratean por línea según su participación en el FOB total.
              </div>
              {faltaTasa && (
                <div className="text-[11px] font-medium text-destructive mt-1">
                  Falta la tasa de cambio del Expediente — estos gastos no se están sumando al Costo Unit. Real.
                </div>
              )}
            </div>
            <div className="text-sm font-semibold tabular-nums">
              DOP {nf(gastosAdicionales)}{" "}
              <span className="text-muted-foreground font-normal">
                ({faltaTasa ? "sin tasa" : `USD ${nf(gastosAdicionalesUSD)}`})
              </span>
            </div>
          </div>
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <Label className="text-xs">Almacén de destino *</Label>
            <Select value={almacenId} onValueChange={setAlmacenId} disabled={!editable}>
              <SelectTrigger className="h-8 w-64 text-xs"><SelectValue placeholder="Seleccionar almacén…" /></SelectTrigger>
              <SelectContent>
                {(almacenes ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.nombre}{a.ubicacion ? ` — ${a.ubicacion}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!almacenId && <span className="text-[11px] text-muted-foreground">Requerido para finalizar la liquidación.</span>}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-2">Descripción</th>
                <th className="py-2 px-2 text-right">Cantidad</th>
                <th className="py-2 px-2 text-right">Grav. Est.</th>
                <th className="py-2 px-2 text-right">Grav. Real</th>
                <th className="py-2 px-2 text-right">Dif.</th>
                <th className="py-2 px-2 text-right">ISC Est.</th>
                <th className="py-2 px-2 text-right">ISC Real</th>
                <th className="py-2 px-2 text-right">Dif.</th>
                <th className="py-2 px-2 text-right">ITBIS Est.</th>
                <th className="py-2 px-2 text-right">ITBIS Real</th>
                <th className="py-2 px-2 text-right">Dif.</th>
                <th className="py-2 px-2 text-right">Costo Unit. Real</th>
                <th className="py-2 pl-2 text-right">Costo de Venta</th>
              </tr>
            </thead>
            <tbody>
              {list.map((it) => {
                const c = calcFila(it);
                return (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 max-w-[220px]">
                      <div className="font-medium truncate">{it.detalle_producto ?? "—"}</div>
                      <div className="text-muted-foreground">{it.codigo_arancelario ?? "—"}</div>
                    </td>
                    <td className="py-2 px-2 text-right">{nf(c.cant)} {it.unidad_medida ?? ""}</td>
                    <td className="py-2 px-2 text-right text-muted-foreground">{nf(c.est.gravamen)}</td>
                    <td className="py-2 px-2 text-right">
                      {editable ? (
                        <Input className="h-8 w-24 text-right" type="number" step="0.01" value={val(it, "gravamen_real")}
                          onChange={(e) => setVal(it.id, "gravamen_real", e.target.value)} />
                      ) : nf(c.gr)}
                    </td>
                    <td className="py-2 px-2 text-right"><Diff real={c.gr} est={c.est.gravamen} /></td>
                    <td className="py-2 px-2 text-right text-muted-foreground">{nf(c.est.selectivo)}</td>
                    <td className="py-2 px-2 text-right">
                      {editable ? (
                        <Input className="h-8 w-24 text-right" type="number" step="0.01" value={val(it, "isc_real")}
                          onChange={(e) => setVal(it.id, "isc_real", e.target.value)} />
                      ) : nf(c.ir)}
                    </td>
                    <td className="py-2 px-2 text-right"><Diff real={c.ir} est={c.est.selectivo} /></td>
                    <td className="py-2 px-2 text-right text-muted-foreground">{nf(c.est.itbis)}</td>
                    <td className="py-2 px-2 text-right">
                      {editable ? (
                        <Input className="h-8 w-24 text-right" type="number" step="0.01" value={val(it, "itbis_real")}
                          onChange={(e) => setVal(it.id, "itbis_real", e.target.value)} />
                      ) : nf(c.tr)}
                    </td>
                    <td className="py-2 px-2 text-right"><Diff real={c.tr} est={c.est.itbis} /></td>
                    <td className="py-2 px-2 text-right font-medium">{nf(c.costoUnit)}</td>
                    <td className="py-2 pl-2 text-right">
                      {editable ? (
                        <Input className="h-8 w-24 text-right" type="number" step="0.01" value={val(it, "costo_venta_unitario")}
                          onChange={(e) => setVal(it.id, "costo_venta_unitario", e.target.value)} />
                      ) : nf(c.cv)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
        {editable && !completo && list.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Completa Gravamen Real, ISC Real, ITBIS Real y Costo de Venta en todos los productos para poder finalizar.
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          El Costo Unitario Real incluye FOB + prorrateo de flete, seguro y otros + Gravamen e ISC reales + prorrateo de
          gastos adicionales. El ITBIS no se incluye por ser crédito fiscal recuperable.
        </p>
      </CardContent>
    </Card>
  );
}

function ForzarRegresoEstadoDialog({
  estadoActual,
  pendiente,
  onConfirm,
}: {
  estadoActual: string;
  pendiente: boolean;
  onConfirm: (estado: string, motivo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [destino, setDestino] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const anteriores = ESTADO_ORDEN.filter((e) => estadoIndex(e) < estadoIndex(estadoActual));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setDestino(""); setMotivo(""); }
      }}
    >
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Corregir estado" className="h-8 w-8 shrink-0 text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>Corregir estado</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corregir estado del expediente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Acción excepcional: regresa el expediente a un estado anterior sin validar requisitos.
            Quedará registrada en la auditoría con tu usuario.
          </p>
          <div className="grid gap-1.5">
            <Label>Estado actual</Label>
            <div className="text-sm font-medium">{ESTADO_LABEL[estadoActual] ?? estadoActual}</div>
          </div>
          <div className="grid gap-1.5">
            <Label>Regresar a</Label>
            <Select value={destino || undefined} onValueChange={setDestino}>
              <SelectTrigger><SelectValue placeholder="Selecciona el estado" /></SelectTrigger>
              <SelectContent>
                {anteriores.map((e) => <SelectItem key={e} value={e}>{ESTADO_LABEL[e]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Motivo</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se avanzó por error de captura" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            disabled={!destino || !motivo.trim() || pendiente}
            onClick={() => { onConfirm(destino, motivo.trim()); setOpen(false); }}
          >
            Confirmar regreso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Campo del encabezado con etiqueta fija; valores largos se ven completos (envueltos o en una línea) al pasar el mouse o tocar. */
function CampoHeader({ etiqueta, valor, largo, className }: { etiqueta: string; valor: string | null | undefined; largo?: boolean; className?: string }) {
  const texto = valor && String(valor).trim() ? String(valor) : "—";
  return (
    <div className={cn("grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 text-xs md:text-sm", largo ? "min-h-8 py-0.5" : "h-8", className)}>
      <span className="whitespace-nowrap text-muted-foreground">{etiqueta}:</span>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={cn("text-left font-medium", largo ? "expediente-header-valor-largo" : "min-w-0 truncate")} title={`${etiqueta}: ${texto}`}>
            {texto}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[min(24rem,calc(100vw-2rem))] break-words p-2 text-xs" align="start">
          <span className="text-muted-foreground">{etiqueta}:</span> <span className="font-medium">{texto}</span>
        </PopoverContent>
      </Popover>
    </div>
  );
}
