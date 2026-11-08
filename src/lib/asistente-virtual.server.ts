// Servidor del asistente virtual interno: autentica al usuario de staff y
// transmite la respuesta de Lovable AI. No tiene herramientas ni acceso a datos
// del negocio: solo recibe el texto de la conversación.
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, convertToModelMessages, streamText } from "ai";
import { createClient } from "@supabase/supabase-js";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./ai-sdk/run-id.server.ts";
import { ASISTENTE_NOMBRE, historialParaModelo } from "./asistente-virtual";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODELO = "openai/gpt-6-astra";

const INSTRUCCIONES = `Eres el ${ASISTENTE_NOMBRE}, asistente virtual de uso interno del personal de ADECOMEX SRL, agencia de aduanas y comercio exterior en República Dominicana. Respondes siempre en español, con tono profesional, claro y breve (usa listas cuando ayuden).

ALCANCE — solo orientación GENERAL sobre:
1. Procedimientos aduaneros en República Dominicana (DGA, SIGA, regímenes, declaraciones DUA, aforo/canales de inspección, liquidación de impuestos, gravamen, ITBIS, selectivo, plazos de presentación).
2. Comercio exterior: Incoterms, FCL/LCL, BL/AWB, valor CIF (FOB + flete + seguro), clasificación arancelaria (Sistema Armonizado), certificados de origen y acuerdos (DR-CAFTA, etc.).
3. Documentación de importación/exportación: factura comercial, lista de empaque, BL, permisos VUCE y de instituciones (Pro Consumidor, Salud Pública, Agricultura, etc.), certificados.
4. Uso de la plataforma ADECOMEX Flow: navegación y qué hace cada módulo.

MÓDULOS DE LA PLATAFORMA (menú lateral):
- Inicio y Panel de Control: resumen operativo, tarjetas de indicadores y «Atención requerida» con alertas por categoría; las tarjetas y bloques se pueden reordenar arrastrándolos.
- COMERCIAL: Cotizaciones de Compras, Órdenes de Compras (con su Portada en PDF), Permisos VUCE, Calculadora Rápida, Copiloto IA (sugerencias de partida arancelaria), Consulta Arancelaria.
- LOGÍSTICA: Nueva Operación y Operaciones (cotizaciones y reservas de flete).
- EMBARQUES: Nuevo Expediente (se puede autocompletar escaneando BL y facturas comerciales), Expedientes (listado con alertas y estados; ficha con Generales, Mercancía, Declaración, Documentos, Liquidación, Costos, Checklist de Despacho), Importaciones, Exportaciones y Dashboard de importaciones.
- TRANSPORTES: Solicitudes de Pago a transportistas, Transportes (viajes, flete, ganancia, descuento CxC) y su Dashboard.
- ADMINISTRACIÓN: Usuarios y roles, Accesos de clientes, Clientes, Empleados, Documentos Legales, Catálogos DGA, Catálogo de Viajes, Productos DGA, Plantillas de Documentos, Reportes, Configuración, Respaldo de Datos, Papelera.
- FINANZAS: Dashboard Financiero, Cotizaciones de Servicios, Facturación (e-CF), Pendientes de vincular, Pagos por Transferencia, Registro de Diario, Gastos Operativos, Reembolsos de Gastos, Honorarios de Terceros, Cuentas por Pagar, Cuentas por Cobrar, Reportes Fiscales DGII, Conciliación Bancaria, Préstamos.
- ALMACÉN: Existencias y Almacenes.
- ACADEMIA: Programas, Estudiantes, Inscripciones y Accesos de estudiantes.
- Buscador global en la barra superior y campana de notificaciones.
Algunas pantallas solo aparecen según el rol del usuario; si alguien no ve un módulo, indícale que lo consulte con un administrador.

RESTRICCIONES ESTRICTAS:
- NO tienes acceso a la base de datos ni a ningún dato real de la plataforma (Expedientes, clientes, facturas, pagos, transportes, permisos, usuarios, etc.). Nunca inventes, supongas ni "simules" números de Expediente, estados, montos, fechas, nombres de clientes ni ningún dato real.
- Si te preguntan por el estado o los datos de un Expediente, cliente, factura u otro registro concreto, responde que no puedes consultar datos del sistema y indica la pantalla donde revisarlo (por ejemplo: «Embarques → Expedientes», buscar el número y abrir la ficha; o el buscador global de la barra superior).
- No pidas ni proceses datos personales o confidenciales.
- Las tasas, aranceles, plazos y requisitos pueden cambiar: cuando cites cifras normativas, aclara que son referenciales y recomienda confirmar con la fuente oficial (DGA, VUCE, DGII o la institución correspondiente) o con el supervisor.
- Si la pregunta no tiene relación con aduanas, comercio exterior o el uso de la plataforma, indícalo amablemente y reconduce la conversación.`;

function respuestaError(status: number, mensaje: string) {
  return Response.json({ error: mensaje }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Verifica que la petición venga de un usuario autenticado con rol de staff. */
async function verificarStaff(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return false;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data: claims, error } = await supabase.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (error || !userId) return false;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId).limit(1);
  return !!roles && roles.length > 0;
}

function mensajeErrorIa(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  if (status === 402) return "Se agotaron los créditos de IA del espacio de trabajo. Un administrador puede recargarlos en Configuración → Planes y créditos.";
  if (status === 429) return "El asistente está recibiendo muchas consultas. Espera unos segundos e inténtalo de nuevo.";
  if (status === 403) return "El servicio de IA no está disponible para esta consulta en este momento.";
  if (status === 401) return "El asistente no está configurado correctamente. Avisa a un administrador.";
  console.error("[asistente] error de IA", status, error instanceof Error ? error.message : error);
  return "No se pudo obtener respuesta del asistente. Inténtalo de nuevo.";
}

export async function manejarAsistente(request: Request): Promise<Response> {
  if (!(await verificarStaff(request))) return respuestaError(401, "Inicia sesión para usar el asistente.");

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return respuestaError(400, "Solicitud inválida.");
  }
  const historial = historialParaModelo((cuerpo as { messages?: unknown })?.messages);
  if (!historial) return respuestaError(400, "Escribe una pregunta para el asistente.");

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return respuestaError(500, "El asistente no está configurado correctamente. Avisa a un administrador.");

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODELO),
    instructions: INSTRUCCIONES,
    messages: await convertToModelMessages(historial),
    abortSignal: request.signal,
    maxRetries: 1,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  return withLovableAiGatewayRunIdHeader(
    result.toUIMessageStreamResponse({
      originalMessages: historial,
      sendReasoning: true,
      onError: mensajeErrorIa,
      headers: { "Cache-Control": "no-cache, no-transform" },
    }),
    runIdFetch,
  );
}
