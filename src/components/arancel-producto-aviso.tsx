import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { arancelCodigoOptions } from "@/lib/catalogo-arancelario-queries";

export function ArancelProductoAviso({ codigo }: { codigo: string }) {
  const { data } = useQuery(arancelCodigoOptions(codigo));
  if (!data?.requiere_permiso) return null;
  return <div role="status" className="text-sm text-destructive border-l-2 border-destructive pl-3 py-2 space-y-1"><p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 shrink-0" />Requiere permiso · {data.codigo}</p>{data.notas_legales && <p className="whitespace-pre-wrap break-words">{data.notas_legales}</p>}</div>;
}