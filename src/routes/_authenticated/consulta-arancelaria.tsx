import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Search, BookOpen, AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { arancelConsultaOptions } from "@/lib/catalogo-arancelario-queries";
import { SECCIONES_ARANCEL } from "@/lib/catalogo-arancelario";
import { useMyRoles } from "@/lib/auth-hooks";
import { ImportarArancelDialog } from "@/components/importar-arancel-dialog";
import { ImportarNotasCapituloDialog } from "@/components/importar-notas-capitulo-dialog";
import { NotasCapituloPanel } from "@/components/notas-capitulo-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { Database } from "@/integrations/supabase/types";

type Arancel = Database["public"]["Tables"]["catalogo_arancelario"]["Row"];
export const Route = createFileRoute("/_authenticated/consulta-arancelaria")({
  loader: ({ context }) => context.queryClient.ensureQueryData(arancelConsultaOptions()),
  component: ConsultaArancelaria,
  head: () => ({ meta: [
    { title: "Consulta Arancelaria | ADECOMEX Flow" },
    { name: "description", content: "Consulta el Arancel de Aduanas de República Dominicana, gravamen, exención ITBIS y notas legales." },
    { property: "og:title", content: "Consulta Arancelaria | ADECOMEX Flow" },
    { property: "og:description", content: "Arancel dominicano, 7ma Enmienda SA 2022: consulta por código, descripción, capítulo y sección." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

function ConsultaArancelaria() {
  const inicial = useSuspenseQuery(arancelConsultaOptions());
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [capitulo, setCapitulo] = useState("todos");
  const [seccion, setSeccion] = useState("todas");
  const [pagina, setPagina] = useState(0);
  const [detalle, setDetalle] = useState<Arancel | null>(null);
  const [notasCapitulo, setNotasCapitulo] = useState<number | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPagina(0); }, 250); return () => clearTimeout(t); }, [q]);
  const { data, isFetching, error, refetch } = useQuery(arancelConsultaOptions(debounced, capitulo, seccion, pagina));
  const { data: roles } = useMyRoles();
  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;
  return <div className="p-4 md:p-6 space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
      <h1 className="text-base font-semibold flex items-center gap-2"><BookOpen className="h-5 w-5" />Consulta Arancelaria</h1>
      {roles?.includes("admin") && <div className="flex flex-wrap gap-2"><ImportarArancelDialog /><ImportarNotasCapituloDialog /></div>}
    </header>
    <div className="text-xs text-muted-foreground">Arancel de Aduanas · República Dominicana · Ley 14-93 y modificaciones · 7ma Enmienda SA 2022</div>
    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative flex-1 min-w-56"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar código o descripción" placeholder="Código o descripción de mercancía…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" /></div>
      <Select value={capitulo} onValueChange={(v) => { setCapitulo(v); setPagina(0); }}><SelectTrigger aria-label="Filtrar capítulo" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los capítulos</SelectItem>{Array.from({ length: 97 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>Capítulo {String(i + 1).padStart(2, "0")}</SelectItem>)}</SelectContent></Select>
      {capitulo !== "todos" && <Button variant="outline" aria-label="Ver notas del Capítulo" onClick={() => setNotasCapitulo(Number(capitulo))}><BookOpen className="h-4 w-4 mr-2" />Ver notas del Capítulo</Button>}
      <Select value={seccion} onValueChange={(v) => { setSeccion(v); setPagina(0); }}><SelectTrigger aria-label="Filtrar sección" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas las secciones</SelectItem>{SECCIONES_ARANCEL.map((s) => <SelectItem key={s} value={s}>Sección {s}</SelectItem>)}</SelectContent></Select>
      {isFetching && <Loader2 aria-label="Buscando" className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">No se pudo consultar el catálogo. <Button variant="link" onClick={() => void refetch()}>Reintentar</Button></p>}
    <div className="overflow-x-auto border-y">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="bg-muted text-muted-foreground"><tr><th className="text-left px-3 py-2">Código</th><th className="text-left px-3 py-2">Descripción</th><th className="text-right px-3 py-2 whitespace-nowrap">Gravamen %</th><th className="text-center px-3 py-2 whitespace-nowrap">ITBIS</th><th className="text-center px-3 py-2">Capítulo</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-t hover:bg-accent/50 cursor-pointer" onClick={() => setDetalle(r)}>
          <td className="px-3 py-2 whitespace-nowrap"><Button variant="link" className="h-auto p-0 text-xs font-mono" onClick={(e) => { e.stopPropagation(); setDetalle(r); }}>{r.codigo}</Button></td>
          <td className="py-2 pr-3"><div className={`flex items-start gap-2 ${["pl-3", "pl-6", "pl-9", "pl-12", "pl-16"][Math.min(4, Math.max(0, r.nivel))]}`}><span className={r.es_hoja ? "" : "font-semibold"}>{r.descripcion}</span>{r.requiere_permiso && <AlertTriangle aria-label="Requiere permiso" className="h-4 w-4 shrink-0 text-destructive" />}</div></td>
          <td className="px-3 py-2 text-right tabular-nums">{r.gravamen_pct == null ? "—" : `${r.gravamen_pct}%`}</td><td className="px-3 py-2 text-center">{r.exento_itbis === true ? "Exento (0%)" : "18%"}</td><td className="px-3 py-2 text-center">{r.capitulo == null ? "—" : String(r.capitulo).padStart(2, "0")}</td>
        </tr>)}{!rows.length && !isFetching && <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">{inicial.data.count === 0 ? "Catálogo sin partidas cargadas." : "Sin resultados para estos filtros."}</td></tr>}</tbody>
      </table>
    </div>
    <footer className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{count} partidas · {count ? pagina * 100 + 1 : 0}–{Math.min((pagina + 1) * 100, count)}</span><div className="flex gap-1"><Button variant="outline" size="icon" aria-label="Página anterior" disabled={!pagina || isFetching} onClick={() => setPagina((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Página siguiente" disabled={(pagina + 1) * 100 >= count || isFetching} onClick={() => setPagina((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button></div></footer>
    {notasCapitulo !== null && <NotasCapituloPanel capitulo={notasCapitulo} onClose={() => setNotasCapitulo(null)} />}
    <Sheet open={Boolean(detalle)} onOpenChange={(v) => { if (!v) setDetalle(null); }}><SheetContent className="w-full sm:max-w-xl overflow-y-auto">
      {detalle && <><SheetHeader><SheetTitle className="text-base font-mono">{detalle.codigo}</SheetTitle><SheetDescription className="text-sm text-foreground">{detalle.descripcion}</SheetDescription></SheetHeader>
        {detalle.requiere_permiso && <Badge variant="destructive" className="mt-4"><AlertTriangle className="h-3.5 w-3.5 mr-1" />Requiere permiso</Badge>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mt-5">{[["Partida", detalle.codigo_partida], ["Sección", detalle.seccion], ["Capítulo", detalle.capitulo == null ? detalle.capitulo_titulo : `${detalle.capitulo} · ${detalle.capitulo_titulo}`], ["Gravamen", detalle.gravamen_pct == null ? "Sin tasa asignada" : `${detalle.gravamen_pct}%`], ["ITBIS", detalle.exento_itbis === true ? "Exento (0%)" : "18%"], ["Nivel", detalle.nivel], ["Código final", detalle.es_hoja ? "Sí" : "No"], ["Vigente desde", detalle.vigente_desde], ["Estado", detalle.activo ? "Activo" : "Inactivo"], ["Actualizado", detalle.updated_at.slice(0, 10)]].map(([k, v]) => <div key={k}><dt className="text-muted-foreground text-xs">{k}</dt><dd className="mt-1 break-words">{v}</dd></div>)}</dl>
        <section className="mt-6 border-t pt-4"><h2 className="text-sm font-semibold mb-2">Notas legales</h2><p className="text-sm whitespace-pre-wrap break-words">{detalle.notas_legales || "Sin notas legales registradas."}</p></section>
      </>}
    </SheetContent></Sheet>
  </div>;
}