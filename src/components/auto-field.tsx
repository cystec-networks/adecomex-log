import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { AutocompleteInput } from "@/components/autocomplete-input";

/** Asterisco rojo para campos obligatorios. */
function ReqMark() {
  return <span className="text-destructive mr-0.5">*</span>;
}

/** Campo de texto con sugerencias históricas (autocompletado). */
export function AutoField({ label, value, onChange, suggestion, className = "", disabled = false, req = false, fieldId, highlight = false }: { label: string; value: any; onChange: (v: string) => void; suggestion: string[]; className?: string; disabled?: boolean; req?: boolean; fieldId?: string; highlight?: boolean }) {
  return (
    <div className={cn("grid gap-1.5", highlight && "ring-2 ring-destructive rounded-md p-2 -m-2", className)} id={fieldId}>
      <Label>{req && <ReqMark />}{label}</Label>
      <AutocompleteInput
        value={value ?? ""}
        onChange={onChange}
        suggestions={suggestion ?? []}
        placeholder={`Escribe para buscar ${label.toLowerCase()}…`}
        disabled={disabled}
      />
    </div>
  );
}
