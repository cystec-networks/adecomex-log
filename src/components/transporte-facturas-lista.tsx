import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FacturaEcfSelector } from "./factura-ecf-selector";
import { Button } from "./ui/button";
import { X } from "lucide-react";
import { DocumentoPreviewButton } from "./documento-preview-dialog";
import { fmtRD } from "@/lib/facturas-ecf";

export function TransporteFacturasLista({ ids, onChange, clienteId }: {
  ids: string[]; onChange: (ids: string[]) => void; clienteId: string | null;
}) {
  const { data: facturas = [] } = useQuery({
    queryKey: ["transporte-facturas-detalle", ids], enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("facturas_ecf").select("id,encf,monto_total,fecha_emision,pdf_url,eliminado_en").in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
  return <div className="space-y-2 min-w-0">
    {ids.map(id => {
      const f = facturas.find(f => f.id === id);
      return <div key={id} className="flex flex-wrap items-center gap-2 border-b py-2 text-xs">
        <span className="min-w-0 flex-1 break-words font-medium">{f?.encf ?? "Factura vinculada"}</span>
        <span className="tabular-nums">{f ? fmtRD(f.monto_total) : "—"}</span>
        {f?.pdf_url && <DocumentoPreviewButton path={f.pdf_url} />}
        <Button type="button" variant="ghost" size="icon" aria-label={`Desvincular ${f?.encf ?? "factura"}`} title="Desvincular factura" onClick={() => onChange(ids.filter(v => v !== id))}><X className="h-4 w-4" /></Button>
      </div>;
    })}
    <FacturaEcfSelector value={null} preload={{ cliente_id: clienteId }} onChange={id => { if (id && !ids.includes(id)) onChange([...ids, id]); }} />
  </div>;
}