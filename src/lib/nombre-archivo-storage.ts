/**
 * El almacén de archivos no admite «#» en el nombre: sin codificar corta la ruta
 * en ese carácter (y la subida responde bien) y codificado la rechaza. Toda clave
 * de subida pasa por aquí: «LIQ #9532» se guarda como «LIQ No.9532».
 */
export function nombreArchivoStorage(nombre: string): string {
  return nombre.replace(/\s*#+\s*/g, (m) => `${/^\s/.test(m) ? " " : ""}No.`);
}
