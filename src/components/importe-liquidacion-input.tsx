import { NumericFormat } from "react-number-format";
import { Input } from "@/components/ui/input";

type ImporteLiquidacionInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  "aria-label": string;
};

/** Formato solo de edición: el borrador recibe dígitos y punto, nunca comas. */
export function ImporteLiquidacionInput({ value, onValueChange, onBlur, "aria-label": label }: ImporteLiquidacionInputProps) {
  return (
    <NumericFormat
      customInput={Input}
      type="text"
      inputMode="decimal"
      className="h-8 w-32 text-right tabular-nums"
      aria-label={label}
      value={value}
      valueIsNumericString
      thousandSeparator=","
      decimalSeparator="."
      decimalScale={2}
      fixedDecimalScale
      onValueChange={(values, source) => {
        if (source.source === "event") onValueChange(values.value);
      }}
      onBlur={onBlur}
    />
  );
}