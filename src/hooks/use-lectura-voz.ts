import { useCallback, useEffect, useRef, useState } from "react";

import { elegirVozEspanol, fragmentosParaVoz, textoParaVoz } from "@/lib/asistente-voz";

/**
 * Lectura en voz alta con SpeechSynthesis del navegador. Solo una lectura a la
 * vez: leer otra cosa o llamar a `detener` cancela la anterior. Se detiene sola
 * al desmontar el componente.
 */
export function useLecturaVoz() {
  const [soportado, setSoportado] = useState(false);
  const [hablandoId, setHablandoId] = useState<string | null>(null);
  const vozRef = useRef<SpeechSynthesisVoice | null>(null);
  // Cada lectura tiene su turno: los eventos de lecturas canceladas se ignoran.
  const turnoRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    setSoportado(true);
    const cargar = () => {
      vozRef.current = elegirVozEspanol(synth.getVoices());
    };
    cargar();
    synth.addEventListener?.("voiceschanged", cargar);
    return () => {
      synth.removeEventListener?.("voiceschanged", cargar);
      turnoRef.current++;
      synth.cancel();
    };
  }, []);

  const detener = useCallback(() => {
    turnoRef.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setHablandoId(null);
  }, []);

  const leer = useCallback((id: string, texto: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const turno = ++turnoRef.current;
    synth.cancel();
    const fragmentos = fragmentosParaVoz(textoParaVoz(texto));
    if (fragmentos.length === 0) {
      setHablandoId(null);
      return;
    }
    setHablandoId(id);
    const voz = vozRef.current;
    fragmentos.forEach((fragmento, i) => {
      const u = new SpeechSynthesisUtterance(fragmento);
      u.lang = voz?.lang ?? "es-ES";
      if (voz) u.voice = voz;
      u.rate = 1;
      u.pitch = 1;
      const terminar = () => {
        if (turnoRef.current === turno) setHablandoId(null);
      };
      if (i === fragmentos.length - 1) u.onend = terminar;
      u.onerror = terminar;
      synth.speak(u);
    });
    // Chrome a veces deja la cola en pausa tras cancel().
    synth.resume();
  }, []);

  return { soportado, hablandoId, leer, detener };
}
