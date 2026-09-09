import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function OcrContextualHelp({ children }: { children: React.ReactNode }) {
  return (
    <Alert className="bg-info/10 border-info/20 text-info-foreground py-3">
      <Info className="h-4 w-4 text-info" />
      <AlertDescription className="text-sm leading-relaxed">
        {children}
      </AlertDescription>
    </Alert>
  );
}
