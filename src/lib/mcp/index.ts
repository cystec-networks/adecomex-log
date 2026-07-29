import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listarExpedientes from "./tools/listar-expedientes";
import detalleExpediente from "./tools/detalle-expediente";
import listarSolicitudes from "./tools/listar-solicitudes";
import listarTransportes from "./tools/listar-transportes";
import buscarClientes from "./tools/buscar-clientes";

// El issuer OAuth debe ser el host directo de Supabase (el proxy no coincide con RFC 8414).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "adecomex-mcp",
  title: "ADECOMEX Gestión y Logística",
  version: "0.1.0",
  instructions:
    "Herramientas de consulta del sistema de ADECOMEX SRL (importaciones y gestiones aduanales en RD). Usa `listar_expedientes` y `detalle_expediente` para expedientes aduanales, `listar_solicitudes` para solicitudes recibidas, `listar_transportes` para viajes y fletes, y `buscar_clientes` para datos de clientes. Todas las consultas se ejecutan con los permisos del usuario autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listarExpedientes, detalleExpediente, listarSolicitudes, listarTransportes, buscarClientes],
});
