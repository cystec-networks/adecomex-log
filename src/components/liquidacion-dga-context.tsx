import { createContext, useContext, useRef, type ReactNode } from "react";
import type { CambiosLiquidacion } from "@/lib/liquidacion-dga-documento";
type Editor = { leer: () => Record<string, unknown>; aplicar: (cambios: CambiosLiquidacion) => void };
const Context = createContext<{ current: Editor | null } | null>(null);
export function LiquidacionDgaProvider({ children }: { children: ReactNode }) {
  const editor = useRef<Editor | null>(null);
  return <Context.Provider value={editor}>{children}</Context.Provider>;
}
export const useLiquidacionDga = () => useContext(Context);