/** Decimal file sizes match the KB/MB displayed by common document tools. */
export function formatoTamanoArchivo(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1000) return `${bytes} B`;
  const unidad = bytes < 1_000_000 ? "KB" : bytes < 1_000_000_000 ? "MB" : "GB";
  const divisor = unidad === "KB" ? 1000 : unidad === "MB" ? 1_000_000 : 1_000_000_000;
  return `${Number((bytes / divisor).toFixed(1))} ${unidad}`;
}