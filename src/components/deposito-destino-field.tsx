import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

/**
 * Depósito de Destino encadenado a la Administración (área DGA) del expediente:
 * sugiere solo los depósitos de esa área; el texto sigue siendo editable a mano.
 */
export function DepositoDestinoField({
  areaCodigo, value, codigo, onChange, disabled,
}: {
  areaCodigo: string;
  value: string;
  codigo: string;
  onChange: (nombre: string, codigo: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const { data: depositos = [] } = useQuery({
    queryKey: ["dga_depositos_destino", areaCodigo],
    enabled: !!areaCodigo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dga_depositos_destino")
        .select("codigo, nombre, centro_logistico")
        .eq("area_codigo", areaCodigo)
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <Input
        list={listId}
        value={value ?? ""}
        disabled={disabled}
        placeholder={areaCodigo ? (depositos.length ? "Selecciona o escribe el depósito" : "Sin depósitos en catálogo: escribe a mano") : "Define primero la Administración"}
        onChange={(e) => {
          const v = e.target.value;
          const m = depositos.find((d) => d.nombre === v || d.codigo === v);
          onChange(m ? m.nombre : v, m ? m.codigo : "");
        }}
      />
      <datalist id={listId}>
        {depositos.map((d) => (
          <option key={d.codigo} value={d.nombre}>{[d.codigo, d.centro_logistico].filter(Boolean).join(" · ")}</option>
        ))}
      </datalist>
      {codigo && <span className="text-[11px] text-muted-foreground">Código: {codigo}</span>}
    </>
  );
}
