import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { notasCapituloOptions } from "@/lib/capitulo-notas-queries";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export function NotasCapituloPanel({ capitulo, onClose }: { capitulo: number; onClose: () => void }) {
  const { data, isPending, error, refetch } = useQuery(notasCapituloOptions(capitulo));
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
      <SheetHeader>
        <SheetTitle>Capítulo {String(capitulo).padStart(2, "0")}{data?.titulo ? ` · ${data.titulo}` : ""}</SheetTitle>
        <SheetDescription>Notas legales y notas adicionales</SheetDescription>
      </SheetHeader>
      {isPending && <Loader2 aria-label="Cargando notas" className="h-4 w-4 animate-spin mt-5" />}
      {error && <div role="alert" className="mt-5 text-sm text-destructive">No se pudieron consultar las notas. <Button variant="link" onClick={() => void refetch()}>Reintentar</Button></div>}
      {data && <p className="mt-5 text-sm leading-relaxed whitespace-pre-wrap break-words">{data.nota?.notas_texto ?? "Aún no se han cargado notas legales para este capítulo."}</p>}
    </SheetContent>
  </Sheet>;
}