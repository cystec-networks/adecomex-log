import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Table as TableIcon, Undo2, Redo2, Braces, FileCode,
} from "lucide-react";
import { CAMPOS_PLANTILLA } from "@/lib/plantillas-campos";

export function PlantillaEditor({

  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TableKit.configure({ table: { resizable: true } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value || "<p></p>",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[420px] p-4 focus:outline-none [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-1 [&_th]:border [&_th]:border-border [&_th]:p-1 [&_th]:bg-muted",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [htmlImport, setHtmlImport] = useState("");

  if (!editor) return <div className="text-sm text-muted-foreground p-4">Cargando editor…</div>;

  const Btn = ({
    onClick, active, title, children,
  }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="sm"
      className="h-8 w-8 p-0"
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );

  return (
    <div className="border rounded-md overflow-hidden bg-background">

      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1 bg-muted/40">
        <Btn title="Negrita" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
        <Btn title="Cursiva" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
        <Btn title="Subrayado" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></Btn>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn title="Alinear izquierda" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></Btn>
        <Btn title="Centrar" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></Btn>
        <Btn title="Alinear derecha" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></Btn>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn title="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Btn>
        <Btn title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Btn>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn title="Insertar tabla" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="h-4 w-4" /></Btn>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Fila</Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Col</Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => editor.chain().focus().deleteRow().run()}>− Fila</Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn title="Deshacer" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></Btn>
        <Btn title="Rehacer" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></Btn>
        <div className="w-px h-5 bg-border mx-1" />
        <Btn title="Importar HTML" onClick={() => { setHtmlImport(""); setImportDialogOpen(true); }}><FileCode className="h-4 w-4" /></Btn>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8">
              <Braces className="h-4 w-4 mr-1" /> Insertar campo
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto w-72">
            {CAMPOS_PLANTILLA.map((g, gi) => (
              <div key={g.grupo}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {g.grupo}
                </DropdownMenuLabel>
                {g.campos.map((c) => (
                  <DropdownMenuItem
                    key={c.campo}
                    onSelect={() => editor.chain().focus().insertContent(c.campo).run()}
                    className="text-xs flex justify-between gap-3"
                  >
                    <span>{c.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.campo}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <EditorContent editor={editor} />

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Importar HTML</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-destructive">
              Esto reemplaza todo el contenido actual de la plantilla.
            </p>
            <Textarea
              value={htmlImport}
              onChange={(e) => setHtmlImport(e.target.value)}
              placeholder="Pega aquí el código HTML crudo..."
              className="min-h-[320px] font-mono text-xs"
              rows={15}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                editor.commands.setContent(htmlImport, { emitUpdate: true });
                setImportDialogOpen(false);
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PlantillaEditor;

