import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  Container,
  FileCheck,
  FileText,
  Globe,
  LayoutGrid,
  Scale,
  Search,
  ShieldCheck,
  Ship,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const DGA_VUCE_TOOLS = [
  { label: "Buscador de Productos", url: "https://www.aduanas.gob.do/consultas/buscador-de-productos/", icon: Search },
  { label: "Consulta Aranceles VUCE", url: "https://sirevuce.aduanas.gob.do/", icon: FileText },
  { label: "Arancel de Aduanas 7ma Enmienda 2022", url: "https://www.aduanas.gob.do/consultas/arancel-de-aduanas-7ma-enmienda-2022/", icon: Scale },
  { label: "Portal VUCE-RD", url: "https://vucerd.gob.do/", icon: ShieldCheck },
  { label: "Portal SIGA", url: "https://siga.aduanas.gob.do/", icon: LayoutGrid },
  { label: "VUCE - Gestión de Trámites", url: "https://app.vucerd.gob.do/auth", icon: FileCheck },
  { label: "DPH", url: "https://www.dph.net.do/Account/Login?ReturnUrl=%2F", icon: Globe },
  { label: "DPW - Caucedo", url: "https://webapp.caucedo.com/#/home", icon: Ship },
  { label: "HIT - Estatus de Contenedores", url: "https://hit.com.do/estatus-de-contenedores/", icon: Container },
];

export const RASTREO_ENVIO_TOOLS = {
  maritimos: [
    { label: "CMA-CGM", url: "http://www.cma-cgm.com/eBusiness/Tracking/Default.aspx" },
    { label: "COSCO SHIPPING", url: "https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=BILLOFLADING&number" },
    { label: "EVERGREEN", url: "http://www.shipmentlink.com/servlet/TDB1_CargoTracking.do" },
    { label: "HAPAG LLOYD", url: "https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html" },
    { label: "MAERSK S (Hamburg Süd)", url: "https://www.hamburgsud.com/tracking/" },
    { label: "MAERSK L", url: "http://www.maerskline.com/appmanager/maerskline/public?_nfpb=true&_nfls=false&_pageLabel=page_tracking3_trackSimple" },
    { label: "MSC", url: "https://www.msc.com/es/track-a-shipment" },
    { label: "OOCL", url: "https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx" },
    { label: "ONE", url: "https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking" },
    { label: "ZIM", url: "https://www.zim.com/es/tools/track-a-shipment" },
  ],
  aereos: [
    { label: "DHL", url: "https://www.dhl.com/do-es/home/rastreo.html" },
    { label: "FEDEX", url: "http://www.fedex.com/us_espanol/" },
    { label: "UPS", url: "http://www.ups.com/WebTracking/track?loc=es_ES&WT.svl=PriNav" },
  ],
};

export function HerramientasDgaVuceItems() {
  return (
    <>
      {DGA_VUCE_TOOLS.map((t) => {
        const Icon = t.icon;
        return (
          <DropdownMenuItem key={t.url} asChild>
            <a href={t.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
              <Icon className="h-4 w-4 shrink-0 text-accent" />
              <span>{t.label}</span>
            </a>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export function RastreosEnvioItems() {
  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">Marítimos</DropdownMenuLabel>
      {RASTREO_ENVIO_TOOLS.maritimos.map((t) => (
        <DropdownMenuItem key={t.url} asChild>
          <a href={t.url} target="_blank" rel="noopener noreferrer" className="cursor-pointer">{t.label}</a>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">Aéreos</DropdownMenuLabel>
      {RASTREO_ENVIO_TOOLS.aereos.map((t) => (
        <DropdownMenuItem key={t.url} asChild>
          <a href={t.url} target="_blank" rel="noopener noreferrer" className="cursor-pointer">{t.label}</a>
        </DropdownMenuItem>
      ))}
    </>
  );
}

type Variant = "button" | "icon";

export function HerramientasDgaVuceMenu({ variant = "button", className }: { variant?: Variant; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8 text-muted-foreground hover:text-primary", className)}
            title="Herramientas DGA/VUCE"
            aria-label="Herramientas DGA/VUCE"
            onClick={(e) => e.stopPropagation()}
          >
            <ShieldCheck className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={className}>
            <ShieldCheck className="h-4 w-4 mr-1" /> Herramientas DGA/VUCE
            <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1" onClick={(e) => e.stopPropagation()}>
        <HerramientasDgaVuceItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RastreosEnvioMenu({ variant = "button", className }: { variant?: Variant; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8 text-muted-foreground hover:text-primary", className)}
            title="Rastreos de Envío"
            aria-label="Rastreos de Envío"
            onClick={(e) => e.stopPropagation()}
          >
            <Ship className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={className}>
            <Ship className="h-4 w-4 mr-1" /> Rastreos de Envío
            <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-1 max-h-96 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <RastreosEnvioItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
