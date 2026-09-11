export const ETAPAS_LOGISTICA = [
  { codigo: "proveedor_confirmado", nombre: "Proveedor confirmado" },
  { codigo: "recogida_origen", nombre: "Recogida en origen" },
  { codigo: "transporte_interno_origen", nombre: "Transporte interno en origen" },
  { codigo: "embarque", nombre: "Embarque" },
  { codigo: "transito_internacional", nombre: "Tránsito internacional" },
  { codigo: "arribo", nombre: "Arribo a República Dominicana" },
] as const;

export const ESTADO_LOGISTICA_LABEL: Record<string, string> = {
  ...Object.fromEntries(ETAPAS_LOGISTICA.map((etapa) => [etapa.codigo, etapa.nombre])),
  completada: "Completadas",
  cancelada: "Canceladas",
};

export const estadoLogisticaClass = (estado: string) => {
  if (estado === "completada") return "bg-success/15 text-success border-success/30";
  if (estado === "cancelada") return "bg-destructive/15 text-destructive border-destructive/30";
  if (estado === "arribo") return "bg-info/15 text-info border-info/30";
  if (estado === "transito_internacional") return "bg-primary/10 text-primary border-primary/20";
  return "bg-warning/15 text-warning-foreground border-warning/30";
};

export const money = (value: number | null | undefined, currency = "USD") =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency }).format(Number(value ?? 0));
