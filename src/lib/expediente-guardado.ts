export type EditorExpediente = {
  hayCambios: boolean;
  pendiente: boolean;
  guardar: () => Promise<unknown>;
  /** Solo los formularios de ventana (borradores) se pueden descartar desde el encabezado. */
  descartar?: () => void;
};

/** Los editores se consultan justo antes de guardar, no al cambiar de ficha. */
export class GuardadoExpediente {
  private editores = new Map<string, EditorExpediente>();
  private listeners = new Set<() => void>();
  private guardando: Promise<void> | null = null;
  estado: "ok" | "error" | null = null;
  revision = 0;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emitir() { this.revision++; this.listeners.forEach((l) => l()); }
  registrar(id: string, editor: EditorExpediente) { this.editores.set(id, editor); if (editor.hayCambios) this.estado = null; this.emitir(); }
  retirar(id: string) { this.editores.delete(id); this.emitir(); }
  get hayCambios() { return [...this.editores.values()].some((e) => e.hayCambios); }
  get hayDescartables() { return [...this.editores.values()].some((e) => e.hayCambios && e.descartar); }
  get pendiente() { return this.guardando !== null || [...this.editores.values()].some((e) => e.pendiente); }
  /** Abandona los borradores de ventanas sin tocar las fichas editadas directamente. */
  descartar = () => {
    if (this.pendiente) return;
    for (const editor of [...this.editores.values()]) if (editor.hayCambios && editor.descartar) editor.descartar();
    this.estado = null;
    this.emitir();
  };
  guardar = (): Promise<void> => {
    if (this.guardando) return this.guardando;
    const tareas = [...this.editores.values()].filter((e) => e.hayCambios);
    const trabajo = async () => {
      try {
        // No reejecutar los editores ya guardados si otra ficha falla.
        for (const editor of tareas) await editor.guardar();
        this.estado = "ok";
      } catch (error) { this.estado = "error"; throw error; }
      finally { this.guardando = null; this.emitir(); }
    };
    this.guardando = Promise.resolve().then(trabajo);
    this.emitir();
    return this.guardando;
  };
}
