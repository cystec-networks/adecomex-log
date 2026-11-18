import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Plus, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { analizarClienteCorreo, nombreComparable, nombreParaCatalogo, type ClienteCatalogo } from "@/lib/correo-cliente";

export const CLAVE_CLIENTES_CONVERSION = ["clientes-conversion-correo"] as const;

export function useClientesConversion(enabled: boolean) {
  return useQuery({
    queryKey: CLAVE_CLIENTES_CONVERSION,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("id,nombre,email,rnc,activo").order("nombre");
      if (error) throw error;
      return (data ?? []) as ClienteCatalogo[];
    },
  });
}

/** Valor inicial: el cliente identificado, salvo que remitente y documento sean empresas distintas (se elige). */
export function clienteInicialConversion(s: any, clientes: readonly ClienteCatalogo[]) {
  if (!s?.cliente_id) return null;
  return analizarClienteCorreo(s, clientes).empresasDistintas ? null : s.cliente_id as string;
}

export function ClienteConversionCorreo({ solicitud, clientes, value, onChange, puedeCrear, disabled }: {
  solicitud: any;
  clientes: readonly ClienteCatalogo[];
  value: string | null;
  onChange: (id: string | null) => void;
  puedeCrear: boolean;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const a = useMemo(() => analizarClienteCorreo(solicitud, clientes), [solicitud, clientes]);
  const activos = useMemo(() => clientes.filter((c) => c.activo !== false), [clientes]);
  const elegido = value ? clientes.find((c) => c.id === value) ?? null : null;
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", rnc: "" });
  const [guardando, setGuardando] = useState(false);
  const mostrarMotivo = !solicitud?.cliente_id || a.empresasDistintas;

  const abrirCrear = () => { setNuevo({ nombre: nombreParaCatalogo(a.documento.nombre), rnc: "" }); setCreando(true); };
  const crear = async () => {
    const nombre = nuevo.nombre.trim();
    if (!nombre) { toast.error("Escribe el nombre del cliente"); return; }
    const repetido = clientes.find((c) => nombreComparable(c.nombre) === nombreComparable(nombre));
    if (repetido) { toast.error(`Ya existe «${repetido.nombre}». Elígelo en la lista.`); return; }
    setGuardando(true);
    try {
      const { data, error } = await supabase.from("clientes").insert({ nombre, rnc: nuevo.rnc.trim() || null }).select("id,nombre,email,rnc,activo").single();
      if (error) throw error;
      qc.setQueryData(CLAVE_CLIENTES_CONVERSION, (prev: ClienteCatalogo[] | undefined) => [...(prev ?? []), data as ClienteCatalogo]);
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["clientes-lite"] });
      onChange(data.id);
      setCreando(false);
      toast.success(`Cliente «${data.nombre}» creado`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear el cliente");
    } finally {
      setGuardando(false);
    }
  };

  const comparado = (n: number) => `${n} cliente${n === 1 ? "" : "s"} registrado${n === 1 ? "" : "s"}`;

  return (
    <section className="space-y-2 min-w-0" aria-label="Cliente de la cotización">
      {mostrarMotivo && (
        <div className="rounded-md border border-warning/50 bg-warning/10 p-2 text-[12px] space-y-1">
          <p className="font-semibold text-warning-text">{solicitud?.cliente_id ? "El remitente y el documento son de empresas distintas" : "No se encontró un cliente registrado"}</p>
          <ul className="space-y-1 text-foreground">
            <li>
              <span className="font-medium">Documento:</span>{" "}
              {a.documento.nombre ? <>se leyó «{a.documento.nombre}»; </> : "no trae nombre de cliente; "}
              {a.documento.nombre && (a.documento.coincidencia
                ? <>coincide con <strong>{a.documento.coincidencia.nombre}</strong>.</>
                : a.documento.parecidos.length
                  ? <>no coincide exactamente con ninguno de los {comparado(activos.length)}; el más parecido es <strong>{a.documento.parecidos[0].cliente.nombre}</strong> ({Math.round(a.documento.parecidos[0].similitud * 100)} %).</>
                  : <>se comparó con los {comparado(activos.length)} y ninguno se parece.</>)}
            </li>
            <li>
              <span className="font-medium">Remitente:</span> {a.remitente.correo ?? "sin correo"}
              {a.remitente.clientes.length
                ? <>{a.remitente.clientes[0].por === "correo" ? " está registrado en la ficha de " : ` comparte el dominio @${a.remitente.dominio} con `}<strong>{a.remitente.clientes.map((r) => r.cliente.nombre).join(", ")}</strong>.</>
                : <> no está en la ficha de ningún cliente{a.remitente.empresa ? ` (empresa del correo: ${a.remitente.empresa})` : ""}.</>}
            </li>
            {(a.asunto.nombre || a.asunto.mencionados.length > 0 || a.asunto.mencionaDocumento) && (
              <li>
                <span className="font-medium">Asunto/cuerpo:</span>{" "}
                {a.asunto.nombre && <>sugería «{a.asunto.nombre}»{a.asunto.parecidos.length ? <>, parecido a <strong>{a.asunto.parecidos[0].cliente.nombre}</strong></> : ", que no coincide con ningún cliente"}. </>}
                {a.asunto.mencionados.length > 0 && <>Menciona a <strong>{a.asunto.mencionados.map((c) => c.nombre).join(", ")}</strong>.</>}
                {a.asunto.mencionaDocumento && a.documento.nombre && <> El asunto también nombra a la empresa del documento ({a.documento.nombre}).</>}
              </li>
            )}
          </ul>
          {a.empresasDistintas && <p className="text-warning-text">Elige cuál de las dos es el cliente de esta cotización.</p>}
        </div>
      )}

      {a.opciones.length > 0 && (
        <div className="space-y-1">
          <p className="text-[12px] font-medium text-muted-foreground">{mostrarMotivo ? "Elige el cliente con un clic" : "Cliente"}</p>
          <div className="grid gap-1">
            {a.opciones.map((o) => {
              const activo = !!o.cliente && o.cliente.id === value;
              return (
                <button
                  key={o.cliente?.id ?? "nuevo"} type="button" disabled={disabled || (!o.cliente && !puedeCrear)}
                  title={!o.cliente && !puedeCrear ? "Solo Administrador, Operaciones o Ejecutivo pueden crear clientes" : undefined}
                  onClick={() => (o.cliente ? onChange(o.cliente.id) : abrirCrear())}
                  className={`flex min-w-0 items-start gap-2 rounded-md border px-2 py-1.5 text-left text-[12px] transition-colors disabled:opacity-50 ${activo ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                >
                  {o.cliente ? <UserCheck className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${activo ? "text-primary" : "text-muted-foreground"}`} /> : <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0">
                    <span className="block font-medium break-words">{o.cliente ? o.nombre : `Crear «${nombreParaCatalogo(o.nombre)}»`}</span>
                    <span className="block text-[11px] text-muted-foreground break-words">{o.motivo}</span>
                  </span>
                  {activo && <Check className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" aria-expanded={abierto} aria-label="Buscar cliente registrado" disabled={disabled} className="w-full min-w-0 justify-between font-normal sm:w-auto sm:flex-1">
              <span className="truncate" title={elegido?.nombre}>{elegido ? elegido.nombre : "Buscar cliente registrado…"}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0" align="start">
            <Command filter={(v, q) => (nombreComparable(v).includes(nombreComparable(q)) || v.toLowerCase().includes(q.toLowerCase()) ? 1 : 0)}>
              <CommandInput placeholder="Nombre o RNC…" />
              <CommandList>
                <CommandEmpty>Ningún cliente coincide.</CommandEmpty>
                <CommandGroup>
                  {activos.map((c) => (
                    <CommandItem key={c.id} value={`${c.nombre} ${c.rnc ?? ""}`} onSelect={() => { onChange(c.id); setAbierto(false); }}>
                      <Check className={`mr-2 h-4 w-4 ${c.id === value ? "opacity-100" : "opacity-0"}`} />
                      <span className="truncate">{c.nombre}</span>
                      {c.rnc && <span className="ml-auto text-[11px] text-muted-foreground">{c.rnc}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={disabled || !puedeCrear} title={!puedeCrear ? "Solo Administrador, Operaciones o Ejecutivo pueden crear clientes" : undefined} onClick={abrirCrear}>
          <Plus className="mr-1 h-4 w-4" />Crear cliente nuevo
        </Button>
      </div>

      {creando && (
        <div className="space-y-2 rounded-md border p-2">
          <p className="text-[12px] font-medium">Nuevo cliente</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
            <div className="min-w-0 space-y-1"><Label htmlFor="nuevo-cliente-nombre" className="text-[12px]">Nombre</Label><Input id="nuevo-cliente-nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></div>
            <div className="min-w-0 space-y-1"><Label htmlFor="nuevo-cliente-rnc" className="text-[12px]">RNC (opcional)</Label><Input id="nuevo-cliente-rnc" value={nuevo.rnc} onChange={(e) => setNuevo({ ...nuevo, rnc: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreando(false)} disabled={guardando}>Cancelar</Button>
            <Button type="button" size="sm" onClick={crear} disabled={guardando}>{guardando ? "Creando…" : "Crear y elegir"}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
