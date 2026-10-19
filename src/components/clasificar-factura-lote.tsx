import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TablaClasificacionFactura } from "@/components/tabla-clasificacion-factura";
import { guardarClasificacion } from "@/lib/copiloto-facturas-queries";
import { type FilaClasificacion } from "@/lib/copiloto-facturas";
import { extractLineasFactura } from "@/lib/ai-ocr.functions";
import { classifyArancelLote } from "@/lib/ai-arancel.functions";
import { tasasSugeridasArancel } from "@/lib/catalogo-arancelario";

type Fila = FilaClasificacion;

const MIN_DESC = 4;

async function aBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Canal de entrada por factura para el Copiloto: botón + tabla de resultados. */
export function useClasificarFactura() {
  const qc = useQueryClient();
  const extraer = useServerFn(extractLineasFactura);
  const clasificar = useServerFn(classifyArancelLote);
  const inputRef = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [archivo, setArchivo] = useState("");
  const [guardado, setGuardado] = useState(false);

  const run = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 15 * 1024 * 1024) throw new Error("Archivo demasiado grande (máx 15MB).");
      const { lineas } = await extraer({
        data: { filename: file.name, mime: file.type || "application/pdf", base64: await aBase64(file) },
      });
      if (!lineas.length) throw new Error("No se encontraron líneas de producto en la factura.");
      const validas = lineas.map((l, i) => ({ l, i })).filter(({ l }) => l.descripcion.length >= MIN_DESC);
      const resultados: Awaited<ReturnType<typeof clasificar>>["resultados"] = [];
      for (let k = 0; k < validas.length; k += 50) {
        const lote = validas.slice(k, k + 50);
        const res = await clasificar({ data: { descripciones: lote.map(({ l }) => l.descripcion) } });
        lote.forEach(({ i }, j) => { const r = res.resultados[j]; if (r) resultados[i] = r; });
      }
      return lineas.map<Fila>((l, i) => {
        const r = resultados[i];
        const a = r?.arancel ?? null;
        const p = a?.codigo ?? null;
        const t = a ? tasasSugeridasArancel(a) : null;
        return {
          ...l,
          partida: p,
          gravamen: t?.gravamen ?? null,
          itbis: t?.itbis ?? null,
          enArancel: Boolean(a),
          insuficiente: l.descripcion.length < MIN_DESC,
          noProducto: r?.producto === false,
        };
      });
    },
    onSuccess: (f) => {
      setFilas(f);
      setGuardado(false);
      toast.success(`${f.length} líneas procesadas`);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al procesar la factura"),
  });

  const boton = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) { setArchivo(f.name); setFilas(null); setGuardado(false); run.mutate(f); }
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={run.isPending} onClick={() => inputRef.current?.click()} className="gap-1.5 whitespace-nowrap">
        {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        Subir factura (PDF/imagen)
      </Button>
    </>
  );

  const tabla = (run.isPending || filas) && (
    <TablaClasificacionFactura archivo={archivo} filas={filas ?? []} pendiente={run.isPending} guardado={guardado}
      onGuardar={async () => {
        if (!filas) return;
        await guardarClasificacion(archivo, filas);
        setGuardado(true);
        await qc.invalidateQueries({ queryKey: ["copiloto-historial"] });
        toast.success("Clasificación guardada");
      }} />
  );

  return { boton, tabla };
}
