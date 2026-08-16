import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  id?: string;
  type?: string;
};

export function AutocompleteInput({ value, onChange, suggestions, placeholder, className, id, type = "text" }: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const filtered = suggestions.slice(0, 8);

  const getContainer = () =>
    inputRef.current?.closest<HTMLElement>("[role='dialog']") ?? null;

  const updatePos = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    // If we portal into a transformed ancestor (Radix dialog), position:fixed
    // resolves against that ancestor, so subtract its offset.
    const container = getContainer();
    const base = container?.getBoundingClientRect();
    setPos({
      top: rect.bottom - (base?.top ?? 0),
      left: rect.left - (base?.left ?? 0),
      width: rect.width,
    });
  };


  useEffect(() => {
    if (open) updatePos();
  }, [open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (open) updatePos();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);


  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };

  const dropdown = open && filtered.length > 0 && pos && (
    <ul
      ref={dropdownRef}
      style={{ top: pos.top, left: pos.left, width: pos.width, position: "fixed" }}
      className="pointer-events-auto z-[9999] mt-1 max-h-60 overflow-auto rounded-md border bg-popover shadow-lg text-sm"
    >
      {filtered.map((s, i) => (
        <li
          key={s}
          onMouseDown={(e) => { e.preventDefault(); pick(s); }}
          onMouseEnter={() => setHighlight(i)}
          className={cn(
            "px-3 py-2 cursor-pointer",
            i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
          )}
        >
          {s}
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Input
        ref={inputRef}
        id={id}
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); updatePos(); }}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(0); updatePos(); }}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % filtered.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + filtered.length) % filtered.length); }
          else if (e.key === "Enter") { e.preventDefault(); pick(filtered[highlight]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        autoComplete="off"
      />
      {dropdown && typeof document !== "undefined" && createPortal(
        dropdown,
        getContainer() ?? document.body,
      )}

    </div>
  );
}
