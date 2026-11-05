export function datosOperativosOrden(orden: {
  origen: string | null; destino: string | null; incoterm: string | null;
  peso_kg: number | null; volumen_m3: number | null; tarifa_propuesta: number | null;
  moneda: string | null;
}) {
  return {
    origen: orden.origen ?? '', destino: orden.destino ?? '', incoterm: orden.incoterm ?? '',
    peso_kg: orden.peso_kg ?? '', volumen_m3: orden.volumen_m3 ?? '',
    tarifa_propuesta: orden.tarifa_propuesta ?? '', moneda: orden.moneda ?? 'USD',
  };
}

export function guardarOperativosOrden(form: ReturnType<typeof datosOperativosOrden>) {
  const numero = (value: string | number) => value === '' ? null : Number(value);
  const moneda: 'DOP' | 'EUR' | 'USD' = form.moneda === 'DOP' || form.moneda === 'EUR' ? form.moneda : 'USD';
  return {
    origen: form.origen.trim() || null, destino: form.destino.trim() || null,
    incoterm: form.incoterm.trim() || null,
    peso_kg: numero(form.peso_kg), volumen_m3: numero(form.volumen_m3),
    tarifa_propuesta: numero(form.tarifa_propuesta), moneda,
  };
}