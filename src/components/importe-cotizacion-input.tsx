import { NumericFormat } from 'react-number-format';
import { Input } from '@/components/ui/input';

export function ImporteCotizacionInput({ value, readOnly, onValueChange }: {
  value: string | number; readOnly?: boolean; onValueChange: (value: string) => void;
}) {
  return <NumericFormat customInput={Input} type="text" inputMode="decimal"
    aria-label="Tarifa propuesta" value={String(value)} valueIsNumericString
    readOnly={readOnly} thousandSeparator="," decimalSeparator="."
    decimalScale={2} fixedDecimalScale className="tabular-nums"
    onValueChange={(values, source) => { if (source.source === 'event') onValueChange(values.value); }} />;
}