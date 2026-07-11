import { useEffect, useRef, useState } from "react";
import { Search, Loader2, FolderKanban, Inbox, FileCheck2, Truck, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Result = {
  id: string;
  kind: "expediente" | "solicitud" | "permiso" | "transporte" | "cliente";
  primary: string;
  secondary?: string;
  href: string;
};

const KIND_META = {
  expediente: { label: "Expedientes", icon: FolderKanban },
  solicitud: { label: "Solicitudes", icon: Inbox },
  permiso: { label: "Permisos", icon: FileCheck2 },
  transporte: { label: "Transportes", icon: Truck },
  cliente: { label: "Clientes", icon: Users },
} as const;

function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query.trim(), 250);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async (): Promise<Result[]> => {
      const q = `%${debounced}%`;
      const [exp, sol, per, tra, cli] = await Promise.all([
        supabase
          .from("expedientes")
          .select("id,numero,bl_awb,numero_dua,numero_vuce, cliente:clientes(nombre_comercial)")
          .is("eliminado_en", null)
          .or(`numero.ilike.${q},bl_awb.ilike.${q},numero_dua.ilike.${q},numero_vuce.ilike.${q}`)
          .limit(5),
        supabase
          .from("solicitudes")
          .select("id,numero,origen,puerto_llegada, cliente:clientes(nombre_comercial)")
          .is("eliminado_en", null)
          .or(`numero.ilike.${q},origen.ilike.${q},puerto_llegada.ilike.${q}`)
          .limit(5),
        supabase
          .from("permisos")
          .select("id,numero,numero_resolucion,institucion_emisora")
          .is("eliminado_en", null)
          .or(`numero.ilike.${q},numero_resolucion.ilike.${q},institucion_emisora.ilike.${q}`)
          .limit(5),
        supabase
          .from("transportes")
          .select("id,numero_viaje,placa_contenedor,transportista")
          .is("eliminado_en", null)
          .or(`numero_viaje.ilike.${q},placa_contenedor.ilike.${q},transportista.ilike.${q}`)
          .limit(5),
        supabase
          .from("clientes")
          .select("id,nombre_comercial,rnc")
          .or(`nombre_comercial.ilike.${q},rnc.ilike.${q}`)
          .limit(5),
      ]);

      const out: Result[] = [];
      for (const e of exp.data ?? []) {
        out.push({
          id: e.id,
          kind: "expediente",
          primary: e.numero,
          secondary: [(e as any).cliente?.nombre_comercial, e.bl_awb, e.numero_dua].filter(Boolean).join(" · "),
          href: `/expedientes/${e.id}`,
        });
      }
      for (const s of sol.data ?? []) {
        out.push({
          id: s.id,
          kind: "solicitud",
          primary: s.numero,
          secondary: [(s as any).cliente?.nombre_comercial, s.origen, s.puerto_llegada].filter(Boolean).join(" · "),
          href: `/solicitudes/${s.id}`,
        });
      }
      for (const p of per.data ?? []) {
        out.push({
          id: p.id,
          kind: "permiso",
          primary: p.numero,
          secondary: [p.numero_resolucion, p.institucion_emisora].filter(Boolean).join(" · "),
          href: `/permisos/${p.id}`,
        });
      }
      for (const t of tra.data ?? []) {
        out.push({
          id: t.id,
          kind: "transporte",
          primary: t.numero_viaje,
          secondary: [t.transportista, t.placa_contenedor].filter(Boolean).join(" · "),
          href: `/transportes/${t.id}`,
        });
      }
      for (const c of cli.data ?? []) {
        out.push({
          id: c.id,
          kind: "cliente",
          primary: c.nombre_comercial,
          secondary: c.rnc ?? undefined,
          href: `/clientes`,
        });
      }
      return out;
    },
  });

  const grouped = groupBy(data ?? [], (r) => r.kind);
  const showPanel = open && debounced.length >= 2;

  return (
    <div ref={boxRef} className="relative flex-1 max-w-md">
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar expediente, BL/AWB, solicitud, cliente…"
        className="pl-9 h-9 bg-background"
      />
      {isFetching && debounced.length >= 2 && (
        <Loader2 className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
      )}
      {showPanel && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-lg z-50 max-h-[70vh] overflow-auto">
          {(!data || data.length === 0) && !isFetching && (
            <div className="p-4 text-sm text-muted-foreground text-center">Sin resultados para "{debounced}"</div>
          )}
          {(Object.keys(grouped) as Array<Result["kind"]>).map((kind) => {
            const Icon = KIND_META[kind].icon;
            return (
              <div key={kind} className="border-b last:border-0">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 flex items-center gap-1.5">
                  <Icon className="h-3 w-3" />
                  {KIND_META[kind].label}
                </div>
                <ul>
                  {grouped[kind].map((r) => (
                    <li key={`${r.kind}-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setQuery("");
                          navigate({ to: r.href });
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 flex flex-col"
                      >
                        <span className="text-sm font-medium truncate">{r.primary}</span>
                        {r.secondary && <span className="text-xs text-muted-foreground truncate">{r.secondary}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function groupBy<T, K extends string>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
}
