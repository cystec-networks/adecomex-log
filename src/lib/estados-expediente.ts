export const ESTADO_LABEL: Record<string, string> = {
  digitar: "Recibido",
  presentar: "Presentado",
  verificar: "Verificado",
  facturar: "Facturado",
  despachado: "Despachado",
};

export const estadoLabel = (e: string | null | undefined): string =>
  (e && ESTADO_LABEL[e]) || (e ?? "");
