import { useCallback, useEffect, useRef, useState } from "react";

import {
  elegirVozEspanol,
  esErrorVozEsperado,
  fragmentosParaVoz,
  mensajeFalloVoz,
  textoParaVoz,
} from "@/lib/asistente-voz";

/** Chrome descarta en silencio un speak() lanzado justo después de cancel(). */
const PAUSA_TRAS_CANCELAR_MS = 150;
/** Si la voz no empieza en este tiempo se reintenta o se avisa al usuario. */
const ESPERA_INICIO_MS = 6000;
/** Tiempo máximo esperando a que el navegador publique sus voces. */
const ESPERA_VOCES_MS = 2000;

function sintesis(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

/** Chrome entrega la lista de voces vacía al principio: se espera a 'voiceschanged'. */
function esperarVoces(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const ya = synth.getVoices();
  if (ya.length) return Promise.resolve(ya);
  return new Promise((resolve) => {
    let hecho = false;
    const fin = () => {
      if (hecho) return;
      hecho = true;
      clearInterval(sondeo);
      clearTimeout(limite);
      synth.removeEventListener?.("voiceschanged", alCambiar);
      resolve(synth.getVoices());
    };
    const alCambiar = () => {
      if (synth.getVoices().length) fin();
    };
    synth.addEventListener?.("voiceschanged", alCambiar);
    // Safari no siempre emite el evento: se consulta también periódicamente.
    const sondeo = setInterval(alCambiar, 100);
    const limite = setTimeout(fin, ESPERA_VOCES_MS);
  });
}

/**
 * Lectura en voz alta con SpeechSynthesis del navegador. Solo una lectura a la
 * vez: leer otra cosa o llamar a `detener` cancela la anterior. Se detiene sola
 * al desmontar el componente.
 */
export function useLecturaVoz(opciones: { onFallo?: (mensaje: string) => void } = {}) {
  const [soportado, setSoportado] = useState(false);
  const [hablandoId, setHablandoId] = useState<string | null>(null);
  // Cada lectura tiene su turno: los eventos de lecturas canceladas se ignoran.
  const turnoRef = useRef(0);
  // Chrome deja de emitir eventos si las locuciones se recolectan como basura.
  const locucionesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const onFalloRef = useRef(opciones.onFallo);
  onFalloRef.current = opciones.onFallo;

  useEffect(() => {
    const synth = sintesis();
    if (!synth) return;
    setSoportado(true);
    // Pide la lista desde el inicio para que esté lista al primer clic.
    void esperarVoces(synth);
    return () => {
      turnoRef.current++;
      locucionesRef.current = [];
      synth.cancel();
    };
  }, []);

  const detener = useCallback(() => {
    turnoRef.current++;
    locucionesRef.current = [];
    const synth = sintesis();
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
    setHablandoId(null);
  }, []);

  const hablar = useCallback(
    (turno: number, fragmentos: string[], voz: SpeechSynthesisVoice | null, reintento = false) => {
      const synth = sintesis();
      if (!synth || turnoRef.current !== turno) return;
      let empezo = false;
      let reintentando = false;

      const fallar = (codigo: string) => {
        if (turnoRef.current !== turno) return;
        console.warn("[Asistente voz] no se pudo leer:", codigo, voz ? `${voz.name} (${voz.lang})` : "voz por defecto");
        turnoRef.current++;
        locucionesRef.current = [];
        synth.cancel();
        setHablandoId(null);
        onFalloRef.current?.(mensajeFalloVoz(codigo));
      };

      // La voz elegida puede fallar (p. ej. voces de red): se reintenta una vez con la del sistema.
      const reintentarODetener = (codigo: string) => {
        if (turnoRef.current !== turno || reintentando) return;
        if (!reintento && voz && !empezo && codigo !== "not-allowed") {
          reintentando = true;
          console.warn("[Asistente voz] reintento con la voz del sistema tras:", codigo, voz.name);
          synth.cancel();
          setTimeout(() => hablar(turno, fragmentos, null, true), PAUSA_TRAS_CANCELAR_MS);
          return;
        }
        fallar(codigo);
      };

      const locuciones = fragmentos.map((texto, i) => {
        const u = new SpeechSynthesisUtterance(texto);
        u.lang = voz?.lang ?? "es-ES";
        if (voz) u.voice = voz;
        u.rate = 1;
        u.pitch = 1;
        u.volume = 1;
        u.onstart = () => {
          empezo = true;
        };
        if (i === fragmentos.length - 1) {
          u.onend = () => {
            if (turnoRef.current !== turno) return;
            locucionesRef.current = [];
            setHablandoId(null);
          };
        }
        u.onerror = (e) => {
          if (turnoRef.current !== turno || reintentando) return;
          if (esErrorVozEsperado(e.error)) {
            setHablandoId(null);
            return;
          }
          reintentarODetener(e.error);
        };
        return u;
      });

      locucionesRef.current = locuciones;
      if (synth.paused) synth.resume();
      for (const u of locuciones) synth.speak(u);

      setTimeout(() => {
        if (turnoRef.current !== turno || empezo || reintentando || synth.speaking) return;
        reintentarODetener("no-start");
      }, ESPERA_INICIO_MS);
    },
    [],
  );

  const leer = useCallback(
    (id: string, texto: string) => {
      const synth = sintesis();
      if (!synth) return;
      const turno = ++turnoRef.current;
      const fragmentos = fragmentosParaVoz(textoParaVoz(texto));
      const ocupado = synth.speaking || synth.pending;
      if (ocupado) synth.cancel();
      locucionesRef.current = [];
      if (fragmentos.length === 0) {
        setHablandoId(null);
        return;
      }
      setHablandoId(id);
      const voces = synth.getVoices();
      // Camino directo dentro del clic: algunos navegadores exigen que speak()
      // ocurra durante el gesto del usuario.
      if (!ocupado && voces.length) {
        hablar(turno, fragmentos, elegirVozEspanol(voces));
        return;
      }
      void (async () => {
        const lista = voces.length ? voces : await esperarVoces(synth);
        if (ocupado) await new Promise((r) => setTimeout(r, PAUSA_TRAS_CANCELAR_MS));
        hablar(turno, fragmentos, elegirVozEspanol(lista));
      })();
    },
    [hablar],
  );

  return { soportado, hablandoId, leer, detener };
}
