import { NumericFormat } from 'react-number-format';
import { Input } from '@/components/ui/input';

export function NumeroCompraInput({ value, label, readOnly, onValueChange }: {
  value: string | number; label: string; readOnly?: boolean; onValueChange: (value: string) => void;
}) {
  return <NumericFormat customInput={Input} type="text" inputMode="decimal"
    aria-label={label} value={String(value)} valueIsNumericString readOnly={readOnly}
    thousandSeparator="," decimalSeparator="." className="tabular-nums"
    onValueChange={(values, source) => { if (source.source === 'event') onValueChange(values.value); }} />;
}