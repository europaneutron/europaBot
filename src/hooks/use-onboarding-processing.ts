'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ProcessingState {
  session?: {
    status: string;
    answers: { tone?: string };
  };
  run?: {
    status: string;
    current_stage: string;
  } | null;
}

/**
 * Etapas que terminan solas. El resto espera una decision humana: `tree` la
 * confirmacion de la estructura, `content` el tono, `review` la aprobacion del
 * contenido.
 */
function needsAnotherStage(state: ProcessingState | undefined): boolean {
  const run = state?.run;
  if (!run) return false;
  if (state?.session?.status !== 'in_progress') return false;
  if (run.status === 'failed') return false;
  if (['tree', 'review', 'completed'].includes(run.current_stage)) return false;
  if (run.current_stage === 'content' && !state?.session?.answers?.tone) return false;
  return true;
}

/**
 * Empuja la compilacion hasta la siguiente decision humana.
 *
 * El bucle vive dentro de una sola pasada del efecto y decide si continua
 * leyendo la respuesta del servidor, no re-renderizando. La version anterior
 * pedia una etapa por cada vez que el efecto corriera, con un `useRef` como
 * candado: cualquier render que cayera mientras la peticion estaba en vuelo
 * salia por el candado, y bajarlo despues no provoca render, asi que esa era la
 * ultima oportunidad de programar la etapa siguiente. Una sola coincidencia
 * dejaba la compilacion detenida para siempre, sin error y con la barra a
 * medias, exactamente una etapa despues de la primera.
 *
 * `extract_facts` tarda cerca de veinte segundos contra el proveedor: es una
 * ventana amplia para que caiga un render.
 *
 * El bucle tampoco se cancela al desmontar. Abandonar la pantalla no debe
 * varar una compilacion a medio camino, y la peticion en vuelo es justo la
 * cara. El candado solo se suelta cuando el bucle termina de verdad, lo que
 * ademas evita que el doble montaje de StrictMode lance dos veces la misma
 * etapa.
 */
export function useOnboardingProcessing(
  state: ProcessingState | undefined,
  updateState: (data?: unknown, shouldRevalidate?: boolean) => Promise<unknown>
) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const handledAttempt = useRef(0);
  const latest = useRef(state);
  latest.current = state;

  const shouldAdvance = needsAnotherStage(state);

  useEffect(() => {
    const forced = attempt > handledAttempt.current;
    if (active.current) return;
    if (!shouldAdvance && !forced) return;
    handledAttempt.current = attempt;

    active.current = true;
    setProcessing(true);
    setError(null);

    (async () => {
      let current = latest.current;
      try {
        do {
          const previousStage = current?.run?.current_stage;
          const response = await fetch('/api/onboarding/process', { method: 'POST' });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);

          current = body as ProcessingState;
          await updateState(body, false);

          // Si la etapa no cambio, el servidor no tiene mas que hacer aqui.
          // Sin esta salida el bucle pediria lo mismo indefinidamente.
          if (current?.run?.current_stage === previousStage) return;
        } while (needsAnotherStage(current));
      } catch (processingError) {
        setError(processingError instanceof Error
          ? processingError.message
          : 'No fue posible preparar el contenido');
        await updateState();
      } finally {
        active.current = false;
        setProcessing(false);
      }
    })();
  }, [attempt, shouldAdvance, updateState]);

  /**
   * Vuelve a intentar aunque la corrida haya quedado marcada como fallida, que
   * es justo cuando `shouldAdvance` es falso y el efecto no arrancaria solo.
   */
  const retry = useCallback(() => {
    if (active.current) return;
    setError(null);
    setAttempt(value => value + 1);
  }, []);

  return {
    // `shouldAdvance` cubre el hueco entre el render y la primera pasada del
    // efecto, para que la barra no aparezca detenida antes de arrancar.
    processing: (processing || shouldAdvance) && !error,
    processingError: error,
    retryProcessing: retry,
  };
}
