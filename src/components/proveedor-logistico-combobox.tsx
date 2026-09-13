import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export type ProveedorLogistico = {
  id: string;
  nombre: string;
  tipo: string | null;
  tax_id: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
};

const TABLE = "catalogo_proveedores_logisticos";

/** Combobox del catálogo de proveedores logísticos, con alta inline si no existe. */
export function ProveedorLogisticoCombobox({
  value,
  onChange,
  onSelect,
  label = "Agente de Carga / Consolidadora",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (p: ProveedorLogistico) => void;
  label?: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const [creando, setCreando] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: ["catalogo-proveedores-logisticos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select("id,nombre,tipo,tax_id,contacto,telefono,email")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as unknown as ProveedorLogistico[];
    },
  });

  const crear = useMutation({
    mutationFn: async (nombre: string) => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .insert({ nombre } as any)
        .select("id,nombre,tipo,tax_id,contacto,telefono,email")
        .single();
      if (error) throw error;
      return data as unknown as ProveedorLogistico;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["catalogo-proveedores-logisticos"] });
      toast.success("Proveedor agregado al catálogo");
      onChange(p.nombre);
      onSelect?.(p);
      setCreando(false);
    },
    onError: (e: any) => {
      setCreando(false);
      toast.error(e.message);
    },
  });

  const actual = (value ?? "").trim();
  const existe = rows.some((r) => r.nombre.toLowerCase() === actual.toLowerCase());

  const handleChange = (v: string) => {
    onChange(v);
    const match = rows.find((r) => r.nombre.toLowerCase() === v.trim().toLowerCase());
    if (match) onSelect?.(match);
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <AutocompleteInput
        value={value ?? ""}
        onChange={handleChange}
        suggestions={rows.map((r) => r.nombre)}
        placeholder="Nombre del proveedor"
        disabled={disabled}
      />
      {!disabled && actual && !existe && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={creando || crear.isPending}
          onClick={() => {
            setCreando(true);
            crear.mutate(actual);
          }}
        >
          <Plus className="h-3 w-3 mr-1" /> Agregar "{actual}" al catálogo
        </Button>
      )}
    </div>
  );
}
