import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function TitleHelp({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Ayuda del título" className="h-6 w-6 shrink-0 text-muted-foreground">
            <Info className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-normal" side="bottom">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}