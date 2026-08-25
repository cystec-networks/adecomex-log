import { useState } from "react";
import { ChevronRight } from "lucide-react";

/**
 * Colapso de grupos por estado, persistido en localStorage por pantalla.
 * `cerradosPorDefecto` define qué grupos arrancan colapsados (el resto, expandido).
 */
export function useGruposColapsados(storageKey: string, cerradosPorDefecto: string[] = []) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null;
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const esColapsado = (key: string) =>
    Object.prototype.hasOwnProperty.call(overrides, key)
      ? !!overrides[key]
      : cerradosPorDefecto.includes(key);

  const toggleGrupo = (key: string) => {
    setOverrides((prev) => {
      const actual = Object.prototype.hasOwnProperty.call(prev, key)
        ? !!prev[key]
        : cerradosPorDefecto.includes(key);
      const next = { ...prev, [key]: !actual };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  return { esColapsado, toggleGrupo };
}

export function EstadoDivider({
  label, count, colapsado, onToggle, colSpan,
}: {
  label: React.ReactNode;
  count: number;
  colapsado: boolean;
  onToggle: () => void;
  colSpan: number;
}) {
  return (
    <tr className="bg-muted/40 cursor-pointer hover:bg-muted/60 border-b" onClick={onToggle}>
      <td colSpan={colSpan} className="py-2 px-4">
        <div className="flex items-center gap-3">
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${colapsado ? "" : "rotate-90"}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap flex items-center gap-2">
            {label} <span className="text-muted-foreground/70">({count})</span>
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>
      </td>
    </tr>
  );
}
