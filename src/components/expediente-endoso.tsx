import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronRight, FileText, Plus, Repeat2 } from "lucide-react";
import { toast } from "sonner";

export type EndosoActivo = {
  id: string;
  expediente_id: string;
  consignatario_original_id: string | null;
  consignatario_endosado_id: string;
  fecha_endoso: string | null;
  documento_id: string | null;
  observaciones: string | null;
  endosado: { id: string; nombre: string; rnc: string | null } | null;
  original: { id: string; nombre: string } | null;
  documento: { id: string; storage_path: string | null; tipo: string } | null;
};

export function useEndosoActivo(expedienteId: string | undefined) {
  return useQuery({
    queryKey: ["endoso-activo", expedienteId],
    enabled: !!expedienteId && expedienteId !== "nuevo",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expediente_endosos")
        .select("*, endosado:clientes!expediente_endosos_consignatario_endosado_id_fkey(id,nombre,rnc), original:clientes!expediente_endosos_consignatario_original_id_fkey(id,nombre), documento:documentos(id,storage_path,tipo)")
        .eq("expediente_id", expedienteId!)
        .eq("activo", true)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as EndosoActivo) ?? null;
    },
  });
}

/** Badge para el encabezado del expediente. */
export function EndosoBadge({ expedienteId, originalNombre }: { expedienteId: string; originalNombre?: string | null }) {
  const { data: endoso } = useEndosoActivo(expedienteId);
  if (!endoso?.endosado) return null;
  const orig = endoso.original?.nombre ?? originalNombre ?? "—";
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="max-w-full cursor-help truncate border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <Repeat2 className="mr-1 h-3 w-3 shrink-0" />
            <span className="truncate">Endosado a: {endoso.endosado.nombre}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Consignatario original: {orig}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function EndosoSection({ expedienteId, clienteOriginal, editable }: {
  expedienteId: string;
  clienteOriginal: { id: string; nombre: string } | null;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const { data: endoso } = useEndosoActivo(expedienteId);
  const [abierto, setAbierto] = useState(false);
  const [endosadoId, setEndosadoId] = useState("");
  const [fecha, setFecha] = useState("");
  const [obs, setObs] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [nuevoCli, setNuevoCli] = useState<{ nombre: string; rnc: string } | null>(null);

  useEffect(() => {
    setEndosadoId(endoso?.consignatario_endosado_id ?? "");
    setFecha(endoso?.fecha_endoso ?? "");
    setObs(endoso?.observaciones ?? "");
    setFile(null);
    if (endoso) setAbierto(true);
  }, [endoso?.id, endoso?.consignatario_endosado_id, endoso?.fecha_endoso, endoso?.observaciones]);

  const { data: clientes } = useQuery({
    queryKey: ["clientes-endoso"],
    enabled: abierto,
    queryFn: async () => (await supabase.from("clientes").select("id,nombre,rnc").is("deleted_at" as any, null).order("nombre")).data ?? [],
  });

  const crearCliente = useMutation({
    mutationFn: async () => {
      if (!nuevoCli?.nombre.trim()) throw new Error("Escribe el nombre del cliente");
      const { data, error } = await supabase.from("clientes")
        .insert({ nombre: nuevoCli.nombre.trim(), rnc: nuevoCli.rnc.trim() || null } as any)
        .select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["clientes-endoso"] });
      setEndosadoId(id); setNuevoCli(null);
      toast.success("Cliente creado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const guardar = useMutation({
    mutationFn: async () => {
      if (!endosadoId) throw new Error("Selecciona el consignatario endosado");
      if (endosadoId === clienteOriginal?.id) throw new Error("El endosado no puede ser el mismo consignatario original");
      let documento_id = endoso?.documento_id ?? null;
      if (file) {
        const path = `${expedienteId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("documentos").upload(path, file);
        if (upErr) throw upErr;
        const { data: doc, error: dErr } = await supabase.from("documentos").insert({
          expediente_id: expedienteId, tipo: "Endoso (BL endosado / carta de cesión)", storage_path: path,
          estado: "recibido", fecha_recepcion: new Date().toISOString().slice(0, 10),
        }).select("id").single();
        if (dErr) throw dErr;
        documento_id = doc.id;
      }
      const payload = {
        expediente_id: expedienteId,
        consignatario_original_id: clienteOriginal?.id ?? null,
        consignatario_endosado_id: endosadoId,
        fecha_endoso: fecha || null,
        observaciones: obs.trim() || null,
        documento_id,
      };
      const { error } = endoso
        ? await supabase.from("expediente_endosos").update(payload).eq("id", endoso.id)
        : await supabase.from("expediente_endosos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["endoso-activo", expedienteId] });
      qc.invalidateQueries({ queryKey: ["documentos", expedienteId] });
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      toast.success("Endoso guardado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const anular = useMutation({
    mutationFn: async () => {
      if (!endoso) return;
      const { error } = await supabase.from("expediente_endosos").update({ activo: false }).eq("id", endoso.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["endoso-activo", expedienteId] });
      qc.invalidateQueries({ queryKey: ["expedientes"] });
      setAbierto(false);
      toast.success("Endoso anulado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const verDoc = async () => {
    const p = endoso?.documento?.storage_path;
    if (!p) return;
    const { data } = await supabase.storage.from("documentos").createSignedUrl(p, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (!abierto && !endoso) {
    if (!editable) return null;
    return (
      <div className="mt-4">
        <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)}>
          <Plus className="mr-1 h-4 w-4" /> Agregar endoso
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-card">
      <button type="button" className="flex w-full items-center gap-2 px-4 py-2.5 text-left" onClick={() => setAbierto((v) => !v)}>
        {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Repeat2 className="h-4 w-4 text-amber-600" />
        <span className="font-semibold">Endoso</span>
        {endoso?.endosado && <span className="truncate text-sm text-muted-foreground">— endosado a {endoso.endosado.nombre}</span>}
      </button>
      {abierto && (
        <div className="grid gap-4 border-t px-4 py-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Consignatario original</Label>
            <Input value={endoso?.original?.nombre ?? clienteOriginal?.nombre ?? "—"} readOnly disabled />
          </div>
          <div className="grid gap-1.5">
            <Label>Consignatario endosado</Label>
            <Select value={endosadoId || undefined} onValueChange={setEndosadoId} disabled={!editable}>
              <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
              <SelectContent>
                {(clientes ?? []).filter((c: any) => c.id !== clienteOriginal?.id).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}{c.rnc ? ` · ${c.rnc}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editable && !nuevoCli && (
              <button type="button" className="justify-self-start text-xs text-primary underline" onClick={() => setNuevoCli({ nombre: "", rnc: "" })}>
                + Crear cliente nuevo
              </button>
            )}
            {nuevoCli && (
              <div className="grid gap-2 rounded-md border bg-muted/30 p-2">
                <Input placeholder="Nombre o razón social" value={nuevoCli.nombre} onChange={(e) => setNuevoCli({ ...nuevoCli, nombre: e.target.value })} />
                <Input placeholder="RNC / Cédula" value={nuevoCli.rnc} onChange={(e) => setNuevoCli({ ...nuevoCli, rnc: e.target.value })} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => crearCliente.mutate()} disabled={crearCliente.isPending}>Crear</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setNuevoCli(null)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>Fecha del endoso</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!editable} />
          </div>
          <div className="grid gap-1.5">
            <Label>Documento del endoso (BL endosado o carta de cesión)</Label>
            {endoso?.documento?.storage_path && (
              <button type="button" onClick={verDoc} className="inline-flex items-center gap-1 justify-self-start text-xs text-primary underline">
                <FileText className="h-3.5 w-3.5" /> Ver documento cargado
              </button>
            )}
            {editable && <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label>Observaciones</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} disabled={!editable} />
          </div>
          {editable && (
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="button" size="sm" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
                {guardar.isPending ? "Guardando…" : endoso ? "Guardar endoso" : "Registrar endoso"}
              </Button>
              {endoso ? (
                <Button type="button" size="sm" variant="outline" className="text-destructive"
                  onClick={() => { if (confirm("¿Anular este endoso? El expediente vuelve a declararse a nombre del consignatario original.")) anular.mutate(); }}>
                  Anular endoso
                </Button>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
