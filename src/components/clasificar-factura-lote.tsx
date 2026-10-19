import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { extractLineasFactura } from "@/lib/ai-ocr.functions";
import { classifyArancelLote } from "@/lib/ai-arancel.functions";
import { arancelPorCodigosOptions } from "@/lib/catalogo-arancelario-queries";
import { tasasSugeridasArancel } from "@/lib/catalogo-arancelario";

type Fila = {
  descripcion: string;
  cantidad: number | null;
  unidad: string | null;
  partida: string | null;
  gravamen: number | null;
  itbis: number | null;
  enArancel: boolean;
  insuficiente: boolean;
};

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

  const run = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 15 * 1024 * 1024) throw new Error("Archivo demasiado grande (máx 15MB).");
      const { lineas } = await extraer({
        data: { filename: file.name, mime: file.type || "application/pdf", base64: await aBase64(file) },
      });
      if (!lineas.length) throw new Error("No se encontraron líneas de producto en la factura.");
      const validas = lineas.map((l, i) => ({ l, i })).filter(({ l }) => l.descripcion.length >= MIN_DESC);
      const partidas: (string | null)[] = lineas.map(() => null);
      for (let k = 0; k < validas.length; k += 50) {
        const lote = validas.slice(k, k + 50);
        const res = await clasificar({ data: { descripciones: lote.map(({ l }) => l.descripcion) } });
        lote.forEach(({ i }, j) => (partidas[i] = res.partidas[j] ?? null));
      }
      const mapa = await qc.fetchQuery(arancelPorCodigosOptions(partidas.filter(Boolean) as string[]));
      return lineas.map<Fila>((l, i) => {
        const p = partidas[i];
        const a = p ? mapa?.[p.replace(/\./g, "")] : undefined;
        const t = a ? tasasSugeridasArancel(a) : null;
        return {
          ...l,
          partida: p,
          gravamen: t?.gravamen ?? null,
          itbis: t?.itbis ?? null,
          enArancel: Boolean(a),
          insuficiente: l.descripcion.length < MIN_DESC,
        };
      });
    },
    onSuccess: (f) => {
      setFilas(f);
      toast.success(`${f.length} líneas procesadas`);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al procesar la factura"),
  });

  const copiar = async (p: string) => {
    await navigator.clipboard.writeText(p);
    toast.success(`Partida ${p} copiada`);
  };

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
          if (f) { setArchivo(f.name); run.mutate(f); }
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={run.isPending} onClick={() => inputRef.current?.click()} className="gap-1.5 whitespace-nowrap">
        {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        Subir factura (PDF/imagen)
      </Button>
    </>
  );

  const pct = (v: number | null) => (v == null ? <span className="text-muted-foreground">—</span> : `${v}%`);

  const tabla = (run.isPending || filas) && (
    <Card>
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm text-muted-foreground">
          Clasificación de factura{archivo ? ` · ${archivo}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 overflow-auto">
        {run.isPending ? (
          <div className="p-4 text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo y clasificando líneas…</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left p-2">Descripción</th>
                <th className="text-left p-2">Partida sugerida</th>
                <th className="text-right p-2">Gravamen (%)</th>
                <th className="text-right p-2">ITBIS (%)</th>
                <th className="p-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {filas!.map((f, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="p-2">
                    {f.descripcion || <span className="text-muted-foreground">(sin descripción)</span>}
                    {(f.cantidad != null || f.unidad) && (
                      <div className="text-[11px] text-muted-foreground">{[f.cantidad, f.unidad].filter((x) => x != null).join(" ")}</div>
                    )}
                  </td>
                  <td className="p-2 font-mono whitespace-nowrap">
                    {f.insuficiente ? (
                      <span className="font-sans text-muted-foreground">Descripción insuficiente — clasifica manualmente abajo</span>
                    ) : f.partida ? (
                      <>
                        {f.partida}
                        {!f.enArancel && <div className="font-sans text-[11px] text-muted-foreground">No encontrada en el Arancel</div>}
                      </>
                    ) : (
                      <span className="font-sans text-muted-foreground">Sin sugerencia</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{pct(f.gravamen)}</td>
                  <td className="p-2 text-right tabular-nums">{pct(f.itbis)}</td>
                  <td className="p-2">
                    {f.partida && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Copiar partida ${f.partida}`} onClick={() => copiar(f.partida!)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );

  return { boton, tabla };
}
