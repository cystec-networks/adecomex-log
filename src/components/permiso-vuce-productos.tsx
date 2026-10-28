import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { ProductoVuce } from "@/lib/permiso-vuce-productos";

const columnas: { key: keyof ProductoVuce; label: string; ancho: string }[] = [
  { key: "secuencia", label: "Secuencia", ancho: "w-20" },
  { key: "arancel", label: "Arancel", ancho: "w-28" },
  { key: "codigo", label: "Código", ancho: "w-56" },
  { key: "producto", label: "Producto", ancho: "w-56" },
  { key: "pais_origen", label: "País de Origen", ancho: "w-32" },
  { key: "unidad", label: "Unidad", ancho: "w-28" },
  { key: "cantidad", label: "Cantidad", ancho: "w-32" },
  { key: "valor_fob", label: "Valor FOB (US$)", ancho: "w-36" },
  { key: "peso", label: "Peso", ancho: "w-28" },
  { key: "descripcion", label: "Descripción", ancho: "w-64" },
];

export function PermisoVuceProductos({ productos, onChange, disabled }: {
  productos: ProductoVuce[]; onChange: (value: ProductoVuce[]) => void; disabled: boolean;
}) {
  const actualizar = (index: number, key: keyof ProductoVuce, value: string) =>
    onChange(productos.map((p, i) => i === index ? { ...p, [key]: value } : p));
  return <section className="min-w-0 space-y-3" aria-label="Datos de la mercancía">
    <div className="flex items-center justify-between gap-3 border-b pb-3">
      <h2 className="text-sm font-semibold text-primary">Datos de la mercancía <span className="text-muted-foreground">({productos.length})</span></h2>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...productos,
        { secuencia: String(productos.length + 1), arancel: "", codigo: "", producto: "", pais_origen: "", unidad: "", cantidad: "", valor_fob: "", peso: "", descripcion: "" },
      ])}><Plus className="mr-1 h-4 w-4" />Agregar producto</Button>
    </div>
    <div className="max-w-full overflow-x-auto border rounded-md">
      <table className="w-full min-w-[1700px] table-fixed text-xs">
        <thead className="bg-muted"><tr>{columnas.map((c) => <th key={c.key} scope="col" className={`${c.ancho} p-2 text-left font-medium`}>{c.label}</th>)}<th className="w-12"><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{productos.map((p, i) => <tr key={i} className="border-t align-top">
          {columnas.map((c) => <td key={c.key} className="p-1.5">
            {c.key === "producto" || c.key === "descripcion"
              ? <Textarea rows={3} className="min-h-20 text-[13px]" aria-label={`${c.label} producto ${i + 1}`} value={p[c.key]} disabled={disabled} onChange={(e) => actualizar(i, c.key, e.target.value)} />
              : <Input className="text-[13px]" inputMode={["cantidad", "valor_fob", "peso"].includes(c.key) ? "decimal" : undefined} aria-label={`${c.label} producto ${i + 1}`} value={p[c.key]} disabled={disabled} onChange={(e) => actualizar(i, c.key, e.target.value)} />}
          </td>)}
          <td className="p-1.5"><Button type="button" variant="ghost" size="icon" title="Eliminar producto" aria-label={`Eliminar producto ${i + 1}`} disabled={disabled} onClick={() => onChange(productos.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></td>
        </tr>)}
        {!productos.length && <tr><td colSpan={11} className="p-4 text-center text-muted-foreground">Sin productos</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}