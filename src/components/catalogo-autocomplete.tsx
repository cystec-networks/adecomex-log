import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { Label } from "@/components/ui/label";

type Props = {
  tabla: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  id?: string;
};

export function CatalogoAutocomplete({ tabla, value, onChange, label, placeholder, id }: Props) {
  const qc = useQueryClient();

  const { data: sugerencias = [] } = useQuery({
    queryKey: ["catalogo-autocomplete", tabla],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tabla as any)
        .select("nombre")
        .eq("activo", true)
        .order("nombre", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => r.nombre as string).filter(Boolean);
    },
  });

  const handleBlur = async () => {
    const v = (value ?? "").trim();
    if (!v) return;
    const exists = sugerencias.some((s) => s.toLowerCase() === v.toLowerCase());
    if (exists) return;
    // catalogo_paises tiene "codigo" como PK obligatoria; no auto-insertar allí.
    if (tabla === "catalogo_paises") return;
    const { error } = await supabase
      .from(tabla as any)
      .upsert({ nombre: v } as any, { onConflict: "nombre", ignoreDuplicates: true });
    if (!error) {
      qc.invalidateQueries({ queryKey: ["catalogo-autocomplete", tabla] });
    }
  };

  return (
    <div className="grid gap-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <div onBlur={handleBlur}>
        <AutocompleteInput
          id={id}
          value={value ?? ""}
          onChange={onChange}
          suggestions={sugerencias}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
