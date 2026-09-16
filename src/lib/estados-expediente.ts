export const ESTADO_LABEL: Record<string, string> = {
  digitar: "Recibido",
  en_transito: "En Tránsito",
  manifestado: "Manifestado",
  presentar: "Presentado",
  verificar: "Verificado",
  despachado: "Despachado",
  entregado: "Entregado",
  facturar: "Facturado",
};

export const ESTADO_ORDEN = [
  "digitar",
  "en_transito",
  "manifestado",
  "presentar",
  "verificar",
  "despachado",
  "entregado",
  "facturar",
] as const;

export const estadoLabel = (e: string | null | undefined): string =>
  (e && ESTADO_LABEL[e]) || (e ?? "");
