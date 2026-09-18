import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useState } from "react";
import { Download, DatabaseBackup, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/respaldo-datos")({
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
  component: AdminRespaldoDatos,
  head: () => ({
    meta: [
      { title: "Respaldo de Datos | ADECOMEX FLOW" },
      { name: "description", content: "Descarga una copia completa de los datos operativos de ADECOMEX en formato ZIP." },
      { property: "og:title", content: "Respaldo de Datos | ADECOMEX FLOW" },
      { property: "og:description", content: "Descarga una copia completa de los datos operativos de ADECOMEX en formato ZIP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

// Tablas de negocio (se excluyen tablas puramente técnicas como
// preferencias_usuario, recordatorios_descartados o system_settings).
const TABLAS: string[] = [
  // Embarques / expedientes
  "expedientes",
  "expediente_contenedores",
  "expediente_servicio_aduanero",
  "expediente_hitos",
  "mercancia_items",
  "documentos",
  "documentos_generados",
  "etapas",
  "incidencias",
  "permisos",
  "calculos_pre_liquidacion",
  "costos",
  "costos_producto",
  // Logística
  "operaciones_logistica",
  "operacion_logistica_etapas",
  "logistica_contenedores",
  "logistica_documentos",
  // Comercial
  "cotizaciones",
  "cotizacion_productos",
  "cotizaciones_servicios",
  "cotizaciones_servicios_lineas",
  "ordenes",
  "orden_productos",
  "solicitudes",
  "solicitud_productos",
  // Transporte y pagos
  "transportes",
  "solicitudes_pago_transporte",
  "solicitudes_pago_transferencia",
  // Clientes
  "clientes",
  "cliente_usuarios",
  // Almacén
  "almacenes",
  "almacen_stock",
  "almacen_movimientos",
  "recepciones",
  "recepcion_lineas",
  // Finanzas y fiscal
  "facturas",
  "facturas_ecf",
  "facturas_ecf_lineas",
  "cuentas_por_pagar",
  "cxc_pagos",
  "gastos",
  "gastos_operativos",
  "itbis_declaraciones",
  "itbis_retenciones_recibidas",
  "envios_dgii",
  "banco_movimientos",
  "banco_config",
  "prestamos_terceros",
  // RRHH
  "empleados",
  "empleado_documentos",
  "empleado_prestamos",
  "empleado_vacaciones",
  "recibos_pago",
  // Academia
  "programas_academia",
  "estudiantes",
  "estudiante_usuarios",
  "inscripciones",
  "inscripcion_cuotas",
  // Legal y plantillas
  "documentos_legales_empresa",
  "plantillas_documentos",
  // Catálogos clave
  "catalogo_proveedores_logisticos",
  "catalogo_tasas_cambio",
  "catalogo_tasas_arancelarias",
  "catalogo_viajes_transporte",
  "catalogo_tarifas_servicios",
  "catalogo_terceros_extranjeros",
  "dga_productos_historico",
  // Trazabilidad
  "auditoria",
  "profiles",
  "user_roles",
];

const PAGE = 1000;

async function descargarTabla(tabla: string): Promise<unknown[]> {
  const filas: unknown[] = [];
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await (supabase as any)
      .from(tabla)
      .select("*")
      .range(desde, desde + PAGE - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const lote = (data ?? []) as unknown[];
    filas.push(...lote);
    if (lote.length < PAGE) break;
  }
  return filas;
}

function formatoTamano(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AdminRespaldoDatos() {
  const [corriendo, setCorriendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [actual, setActual] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [fallidas, setFallidas] = useState<string[]>([]);

  const exportar = async () => {
    setCorriendo(true);
    setProgreso(0);
    setResultado(null);
    setFallidas([]);
    const errores: string[] = [];
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let totalFilas = 0;

      for (let i = 0; i < TABLAS.length; i++) {
        const tabla = TABLAS[i];
        setActual(tabla);
        try {
          const filas = await descargarTabla(tabla);
          totalFilas += filas.length;
          zip.file(`${tabla}.json`, JSON.stringify(filas, null, 2));
        } catch (e: any) {
          errores.push(tabla);
        }
        setProgreso(Math.round(((i + 1) / TABLAS.length) * 100));
      }

      const fecha = new Date().toISOString().slice(0, 10);
      zip.file(
        "_resumen.json",
        JSON.stringify(
          { generado_en: new Date().toISOString(), tablas: TABLAS.length, total_filas: totalFilas, tablas_no_exportadas: errores },
          null,
          2,
        ),
      );

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `respaldo-adecomex-${fecha}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setFallidas(errores);
      setResultado(
        `Respaldo generado: ${TABLAS.length - errores.length} tablas, ${totalFilas.toLocaleString("es-DO")} registros · ${formatoTamano(blob.size)}`,
      );
      toast.success("Respaldo descargado correctamente");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo generar el respaldo");
    } finally {
      setActual(null);
      setCorriendo(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <DatabaseBackup className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-display font-bold">Respaldo de Datos</h1>
          <p className="text-sm text-muted-foreground">Descarga una copia completa de la información en tu computadora.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Copia de seguridad para consulta
          </CardTitle>
          <CardDescription>
            Se genera un archivo ZIP con un documento por cada tabla del sistema ({TABLAS.length} en total).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={exportar} disabled={corriendo} size="lg">
            <Download className="h-4 w-4 mr-2" />
            {corriendo ? "Generando respaldo…" : "Descargar Respaldo Completo"}
          </Button>

          {corriendo && (
            <div className="space-y-2">
              <Progress value={progreso} />
              <p className="text-xs text-muted-foreground">
                {progreso}% · {actual ? `Leyendo ${actual}…` : "Preparando archivo…"}
              </p>
            </div>
          )}

          {resultado && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
              {resultado}
              {fallidas.length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  No se pudieron incluir: {fallidas.join(", ")}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed border-t pt-3">
            Este archivo es solo para consulta y respaldo — no se puede usar para restaurar datos directamente desde
            aquí. Para restaurar la base de datos, usa los backups automáticos de la nube (Cloud → Database → Backups).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
