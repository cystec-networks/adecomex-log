import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calculator, FileText } from "lucide-react";
import { toast } from "sonner";
import { calcImpuestosLinea } from "@/lib/impuestos";
import { buildPreLiquidacionPdf } from "@/lib/pdf-preliquidacion";
import { useCurrentUser } from "@/lib/auth-hooks";
import { fmtLocalDate } from "@/lib/dates";

const AVISO_REFERENCIAL =
  "Estimación referencial — sujeta a la liquidación oficial de la Dirección General de Aduanas (DGA). " +
  "Este documento no constituye una declaración ni liquidación oficial.";

const nf = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useCotizacionEstimadoData(cotizacionId: string) {
  const { data: cot } = useQuery({
    queryKey: ["cotizacion-estimado", cotizacionId],
    queryFn: async () =>
      (await supabase.from("cotizaciones").select("*, clientes(nombre, rnc)").eq("id", cotizacionId).maybeSingle()).data,
  });
  const { data: productos } = useQuery({
    queryKey: ["cotizacion-productos-estimado", cotizacionId],
    queryFn: async () =>
      (await supabase
        .from("cotizacion_productos")
        .select("*")
        .eq("cotizacion_id", cotizacionId)
        .is("deleted_at", null)
        .order("item_no")).data ?? [],
  });
  return { cot: cot as any, productos: (productos ?? []) as any[] };
}

function infoColsCotizacion(cot: any): [string, string][][] {
  return [
    [
      ["N° Cotización", cot?.numero ?? "—"],
      ["Tipo de mercancía", cot?.tipo_mercancia ?? "—"],
      ["Incoterm", cot?.incoterm ?? "—"],
      ["Estado", cot?.estado ?? "—"],
    ],
    [
      ["Origen", cot?.origen ?? "—"],
      ["Destino", cot?.destino ?? "—"],
      ["Fecha de emisión", cot?.fecha_emision ? fmtLocalDate(cot.fecha_emision) : "—"],
      ["Fecha de vigencia", cot?.fecha_vigencia ? fmtLocalDate(cot.fecha_vigencia) : "—"],
    ],
    [
      ["Cliente", cot?.clientes?.nombre ?? "—"],
      ["RNC/Documento", cot?.clientes?.rnc ?? "—"],
      ["Agente Aduanero", "Francisco Enerio Lopez Martinez (072-08)"],
      ["Moneda", cot?.moneda ?? "USD"],
    ],
  ];
}

export function CalcularEstimadoButton({ cotizacionId, readOnly }: { cotizacionId: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const { cot, productos } = useCotizacionEstimadoData(cotizacionId);
  const [open, setOpen] = useState(false);
  const [seguro, setSeguro] = useState("");
  const [flete, setFlete] = useState("");
  const [otros, setOtros] = useState("");
  const [tasa, setTasa] = useState("");
  const [guardando, setGuardando] = useState(false);

  const totalFob = useMemo(
    () => productos.reduce((s, p) => s + (Number(p.valor_fob) || 0), 0),
    [productos],
  );

  useEffect(() => {
    if (!open || !cot) return;
    setSeguro(cot.seguro != null ? String(cot.seguro) : totalFob > 0 ? (totalFob * 0.02).toFixed(2) : "");
    setFlete(cot.flete != null ? String(cot.flete) : "");
    setOtros(cot.otros != null ? String(cot.otros) : "");
    setTasa(cot.tasa_cambio_usada != null ? String(cot.tasa_cambio_usada) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nSeguro = Number(seguro) || 0;
  const nFlete = Number(flete) || 0;
  const nOtros = Number(otros) || 0;
  const nTasa = Number(tasa) || 0;

  const filas = productos.map((p) => {
    const fob = Number(p.valor_fob) || 0;
    const c = calcImpuestosLinea(fob, totalFob, nSeguro, nFlete, nOtros, p.pct_gravamen, p.aplica_isc, p.pct_isc, p.pct_itbis);
    return { p, fob, c };
  });
  const tot = filas.reduce(
    (a, f) => ({
      cif: a.cif + f.c.cifLinea,
      grav: a.grav + f.c.gravamen,
      isc: a.isc + f.c.selectivo,
      itbis: a.itbis + f.c.itbis,
      total: a.total + f.c.total,
    }),
    { cif: 0, grav: 0, isc: 0, itbis: 0, total: 0 },
  );

  const rd = (n: number) => (nTasa > 0 ? `RD$ ${nf(n * nTasa)}` : "—");

  const guardar = async () => {
    setGuardando(true);
    const { error } = await supabase
      .from("cotizaciones")
      .update({
        seguro: seguro === "" ? null : Number(seguro),
        flete: flete === "" ? null : Number(flete),
        otros: otros === "" ? null : Number(otros),
        tasa_cambio_usada: tasa === "" ? null : Number(tasa),
      })
      .eq("id", cotizacionId);
    setGuardando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Valores del estimado guardados");
    qc.invalidateQueries({ queryKey: ["cotizacion-estimado", cotizacionId] });
    qc.invalidateQueries({ queryKey: ["cotizacion", cotizacionId] });
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Calculator className="h-4 w-4 mr-1" />
        Calcular estimado
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Pre-Liquidación estimada de impuestos</DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">{AVISO_REFERENCIAL}</p>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="grid gap-1.5">
              <Label>Seguro (US$)</Label>
              <Input type="number" step="0.01" value={seguro} onChange={(e) => setSeguro(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Flete (US$)</Label>
              <Input type="number" step="0.01" value={flete} onChange={(e) => setFlete(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Otros (US$)</Label>
              <Input type="number" step="0.01" value={otros} onChange={(e) => setOtros(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tasa de cambio (RD$/US$)</Label>
              <Input type="number" step="0.0001" value={tasa} onChange={(e) => setTasa(e.target.value)} />
            </div>
          </div>

          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
                  <th>Item</th><th>Arancel</th><th>Descripción</th>
                  <th className="text-right">FOB US$</th>
                  <th className="text-right">CIF US$</th>
                  <th className="text-right">Gravamen</th>
                  <th className="text-right">ISC</th>
                  <th className="text-right">ITBIS</th>
                  <th className="text-right">Total imp. US$</th>
                  <th className="text-right">Total imp. RD$</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ p, fob, c }) => (
                  <tr key={p.id} className="border-t [&>td]:px-2 [&>td]:py-1.5">
                    <td>{p.item_no ?? ""}</td>
                    <td>{p.codigo_arancelario ?? "—"}</td>
                    <td className="max-w-[220px] truncate">{p.detalle_producto ?? "—"}</td>
                    <td className="text-right">{nf(fob)}</td>
                    <td className="text-right">{nf(c.cifLinea)}</td>
                    <td className="text-right">{nf(c.gravamen)}</td>
                    <td className="text-right">{nf(c.selectivo)}</td>
                    <td className="text-right">{nf(c.itbis)}</td>
                    <td className="text-right font-medium">{nf(c.total)}</td>
                    <td className="text-right">{rd(c.total)}</td>
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr><td colSpan={10} className="px-2 py-4 text-center text-muted-foreground">La cotización no tiene productos.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="border rounded-md p-3 space-y-1">
              {[
                ["Total FOB", totalFob],
                ["Seguro", nSeguro],
                ["Flete", nFlete],
                ["Otros", nOtros],
                ["Total CIF", tot.cif],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{k as string}</span>
                  <span>US$ {nf(v as number)} <span className="text-muted-foreground">/ {rd(v as number)}</span></span>
                </div>
              ))}
            </div>
            <div className="border rounded-md p-3 space-y-1">
              {[
                ["Gravamen", tot.grav],
                ["Selectivo (ISC)", tot.isc],
                ["ITBIS", tot.itbis],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{k as string}</span>
                  <span>US$ {nf(v as number)} <span className="text-muted-foreground">/ {rd(v as number)}</span></span>
                </div>
              ))}
              <div className="flex justify-between gap-4 font-semibold border-t pt-1">
                <span>Total Impuestos Estimados</span>
                <span>US$ {nf(tot.total)} <span className="text-muted-foreground">/ {rd(tot.total)}</span></span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cerrar</Button>
            {!readOnly && (
              <Button size="sm" onClick={guardar} disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar valores"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PreLiquidacionPdfButtonCotizacion({ cotizacionId }: { cotizacionId: string }) {
  const { user } = useCurrentUser();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const docRef = useRef<any>(null);
  const fileNameRef = useRef<string>("EstimadoImpuestos.pdf");

  const cerrarPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    docRef.current = null;
  };

  const generar = async () => {
    const [prodRes, cotRes] = await Promise.all([
      supabase.from("cotizacion_productos").select("*").eq("cotizacion_id", cotizacionId).is("deleted_at", null).order("item_no"),
      supabase.from("cotizaciones").select("*, clientes(nombre, rnc)").eq("id", cotizacionId).maybeSingle(),
    ]);
    const list = (prodRes.data ?? []) as any[];
    const cot: any = cotRes.data;
    if (list.length === 0) {
      toast.error("La cotización no tiene productos.");
      return;
    }

    const pesoTotal = list.reduce((s, p) => s + (Number(p.peso) || 0), 0);

    const { doc } = await buildPreLiquidacionPdf({
      infoCols: infoColsCotizacion(cot),
      items: list.map((p) => ({ ...p, origen: p.pais_origen || cot?.origen || "—" })),
      seguro: Number(cot?.seguro) || 0,
      flete: Number(cot?.flete) || 0,
      otros: Number(cot?.otros) || 0,
      tasaCambio: Number(cot?.tasa_cambio_usada) || 0,
      usuarioEmail: user?.email ?? null,
      pesoBruto: pesoTotal > 0 ? pesoTotal : null,
      pesoNeto: null,
      avisoReferencial: AVISO_REFERENCIAL,
    });

    const fecha = new Date().toISOString().slice(0, 10);
    fileNameRef.current = `Estimado_${cot?.numero ?? "cotizacion"}_${fecha}.pdf`;
    docRef.current = doc;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(doc.output("bloburl").toString());
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={generar}>
        <FileText className="h-4 w-4 mr-1" />
        Descargar Estimado (PDF)
      </Button>

      <Dialog open={!!previewUrl} onOpenChange={(o) => { if (!o) cerrarPreview(); }}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="text-base">Vista previa — Estimado de Impuestos</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 bg-muted/30">
            {previewUrl && <iframe src={previewUrl} title="Estimado de Impuestos" className="w-full h-full border-0" />}
          </div>
          <DialogFooter className="px-5 py-3 border-t gap-2 sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => docRef.current?.save(fileNameRef.current)}>
              <FileText className="h-4 w-4 mr-1" /> Descargar
            </Button>
            <Button size="sm" onClick={cerrarPreview}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
