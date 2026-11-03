import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

/** Selector con búsqueda del catálogo de gestores (Honorarios de terceros). */
export function GestorHonorariosSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: gestores = [] } = useQuery({
    queryKey: ["catalogo-gestores-honorarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogo_gestores_honorarios")
        .select("nombre")
        .eq("estado", "activo")
        .order("nombre");
      if (error) throw error;
      return (data ?? []).map((r) => r.nombre);
    },
  });
  const fueraDeCatalogo = !!value && !gestores.includes(value);

  return (
    <div className="grid gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal min-w-0">
            <span className="truncate" title={value || undefined}>{value || "Seleccione un gestor"}</span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
          <Command>
            <CommandInput placeholder="Buscar gestor…" />
            <CommandList>
              <CommandEmpty>Sin coincidencias. Agréguelo en Catálogos → Gestores de honorarios.</CommandEmpty>
              <CommandGroup>
                {gestores.map((g) => (
                  <CommandItem key={g} value={g} onSelect={() => { onChange(g); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", value === g ? "opacity-100" : "opacity-0")} />
                    {g}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {fueraDeCatalogo && (
        <p className="text-[11px] text-destructive">«{value}» no está en el catálogo; seleccione el gestor correcto.</p>
      )}
    </div>
  );
}
