import { createContext, useContext, useRef, type ReactNode } from "react";
import type { DeclaracionOrigen } from "@/lib/certificado-origen-dga";
type Editor = { leer: () => DeclaracionOrigen; aplicar: (cambios: DeclaracionOrigen) => void };
const Context = createContext<{ current: Editor | null } | null>(null);
export function DeclaracionOrigenProvider({ children }: { children: ReactNode }) {
  const editor = useRef<Editor | null>(null);
  return <Context.Provider value={editor}>{children}</Context.Provider>;
}
export const useDeclaracionOrigen = () => useContext(Context);