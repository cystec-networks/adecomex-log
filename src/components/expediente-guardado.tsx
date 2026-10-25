import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { GuardadoExpediente } from "@/lib/expediente-guardado";

const Context = createContext<GuardadoExpediente | null>(null);
export function ExpedienteGuardadoProvider({ children }: { children: ReactNode }) {
  const [registro] = useState(() => new GuardadoExpediente());
  return <Context.Provider value={registro}>{children}</Context.Provider>;
}
export function useGuardadoExpediente() {
  const registro = useContext(Context);
  useSyncExternalStore(registro?.subscribe ?? (() => () => {}), () => registro?.revision ?? 0, () => 0);
  return registro;
}
export function useEditorExpediente(hayCambios: boolean, pendiente: boolean, guardar: () => Promise<unknown>) {
  const registro = useContext(Context);
  const id = useId();
  const callback = useRef(guardar);
  callback.current = guardar;
  useEffect(() => {
    registro?.registrar(id, { hayCambios, pendiente, guardar: () => callback.current() });
  }, [registro, id, hayCambios, pendiente]);
  useEffect(() => () => registro?.retirar(id), [registro, id]);
}

/** Una ventana cerrada conserva su borrador hasta guardarlo o abrir otro registro. */
export function useBorradorExpediente(valor: unknown, abierto: boolean, pendiente: boolean, guardar: () => Promise<unknown>) {
  const snapshot = JSON.stringify(valor);
  const [base, setBase] = useState<string | null>(null);
  const anterior = useRef(false);
  useEffect(() => {
    if (abierto && !anterior.current) setBase(snapshot);
    anterior.current = abierto;
  }, [abierto, snapshot]);
  const dirty = base !== null && base !== snapshot;
  useEditorExpediente(dirty, pendiente, async () => { await guardar(); setBase(null); });
  return { hayCambios: dirty, descartar: () => setBase(null) };
}