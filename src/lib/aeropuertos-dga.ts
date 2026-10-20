/**
 * Aeropuertos de la República Dominicana dentro del catálogo maestro de puertos
 * de la DGA (`dga_puertos`). La tabla maestra los guarda con el mismo formato
 * que los puertos marítimos, así que esta lista es la única forma de saber si un
 * código DOxxx es un aeropuerto o un puerto de carga.
 *
 * Es solo información visual: no cambia códigos, nombres, ni la lógica de
 * selección o guardado del campo Puerto de arribo.
 *
 * DOJQB ("HIGUERO") existe en la tabla maestra pero la plataforma no lo usa:
 * el aeropuerto Joaquín Balaguer se declara con DOSNX, que es el que va aquí.
 */
export const AEROPUERTOS_DGA: Record<string, string> = {
  DOSDQ: "Aeropuerto Internacional Las Américas (JFPG/SDQ), Santo Domingo",
  DOPUJ: "Aeropuerto Internacional de Punta Cana (PUJ), La Altagracia",
  DOSTI: "Aeropuerto Internacional del Cibao (STI), Santiago de los Caballeros",
  DOPOP: "Aeropuerto Internacional Gregorio Luperón (POP), Puerto Plata",
  DOLRM: "Aeropuerto Internacional La Romana (LRM), La Romana",
  DOAZS: "Aeropuerto Internacional Presidente Juan Bosch - Samaná El Catey (AZS)",
  DOBRX: "Aeropuerto Internacional María Montez (BRX), Barahona",
  DOSNX: "Aeropuerto Internacional Dr. Joaquín Balaguer (El Higüero, JBQ), Santo Domingo Norte",
};

const normalizar = (codigo?: string | null) => (codigo ?? "").trim().toUpperCase();

/** Nombre completo del aeropuerto, o null si el código no es un aeropuerto. */
export function nombreAeropuertoDga(codigo?: string | null): string | null {
  return AEROPUERTOS_DGA[normalizar(codigo)] ?? null;
}

export function esAeropuertoDga(codigo?: string | null): boolean {
  return nombreAeropuertoDga(codigo) !== null;
}
