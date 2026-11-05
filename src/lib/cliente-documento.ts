type Cliente = { id: string; nombre: string };
const limpiar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
export function nombreBaseCliente(s: string): string {
  return limpiar(s).replace(/\b(?:S A S|S A|S R L|S A R L|L L C|SAS|SA|SRL|LLC|INCORPORATED|INC|LTD|LIMITED|CORP|CORPORATION)\b/g, ' ')
    .replace(/\bINTERNATIONAL\b/g, 'INTERNACIONAL').replace(/\b(?:COMPANY|COMPANIA|CO)\b/g, 'COMPANIA')
    .trim().replace(/\s+/g, ' ');
}
export function coincidenciasClienteDocumento<T extends Cliente>(nombre: string, clientes: T[]): { cliente: T; exacta: boolean }[] {
  const normal = limpiar(nombre), base = nombreBaseCliente(nombre);
  if (!base) return [];
  const exactas = clientes.filter(c => limpiar(c.nombre) === normal);
  if (exactas.length) return exactas.map(cliente => ({ cliente, exacta: true }));
  const distintivos = (s: string) => nombreBaseCliente(s).split(' ').filter(t => !['INTERNACIONAL', 'COMPANIA', 'DE', 'DEL', 'LA', 'EL', 'THE', 'AND', 'Y'].includes(t));
  const tokens = distintivos(nombre);
  if (!tokens.length) return [];
  return clientes.filter(c => {
    const otros = distintivos(c.nombre);
    return nombreBaseCliente(c.nombre) === base || (otros.length === tokens.length && tokens.every(t => otros.includes(t)));
  }).map(cliente => ({ cliente, exacta: false }));
}