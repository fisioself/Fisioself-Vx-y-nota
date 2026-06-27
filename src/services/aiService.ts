import { assertSupabase } from '../lib/supabaseClient';
import { getErrorMessage } from '../shared/errors';

// El catálogo de IA vive en esta capa de servicio (es su dueña); las features lo
// consumen importando AiType desde aquí.
export interface AiType {
  id: string;
  label: string;
  traceable?: boolean;
  // Si true, la salida REEMPLAZA la nota completa (p. ej. formatear/corregir);
  // si no, se anexa bajo un encabezado con el nombre de la acción.
  replace?: boolean;
}

const proxyUrl = import.meta.env.VITE_AI_PROXY_URL as string | undefined;
const AI_TIMEOUT_MS = 30_000;

export const AI_TYPES: AiType[] = [
  { id: 'soap', label: 'Formatear SOAP', traceable: false, replace: true },
  {
    id: 'proofread',
    label: 'Corregir y estructurar',
    traceable: false,
    replace: true
  },
  { id: 'summary', label: 'Resumir nota', traceable: false },
  { id: 'exercises', label: 'Sugerir ejercicios', traceable: false },
  { id: 'clinical_analysis', label: 'Analisis clinico', traceable: true },
  { id: 'treatment_plan', label: 'Plan de tratamiento', traceable: true },
  { id: 'discharge_letter', label: 'Carta de alta', traceable: true },
  { id: 'informed_consent', label: 'Consentimiento informado', traceable: true },
  { id: 'evaluation_summary', label: 'Diagnóstico de valoración', traceable: false },
  { id: 'treatment_plan_evidence', label: 'Plan de intervención con evidencia', traceable: false },
  { id: 'treatment_objectives', label: 'Objetivos del tratamiento', traceable: false },
  { id: 'prognosis', label: 'Pronóstico fisioterapéutico', traceable: false },
  {
    id: 'medical_diagnosis_suggestion',
    label: 'Sugerencia de diagnóstico médico',
    traceable: false
  }
];

export const isAiConfigured = Boolean(proxyUrl);

const buildAiConfigError = (): Error & { code: string } => {
  const error = new Error(
    'IA no configurada. Define VITE_AI_PROXY_URL apuntando a la funcion segura clinical-ai.'
  ) as Error & { code: string };
  error.code = 'AI_NOT_CONFIGURED';
  return error;
};

interface TransformParams {
  text: string;
  type: string;
  onChunk?: (accumulated: string) => void;
  // Señal externa para cancelar (p. ej. al desmontar el editor o lanzar otra
  // consulta): aborta el fetch y la lectura del stream para no escribir en
  // estado viejo de un componente que ya cambió.
  signal?: AbortSignal;
}

export const aiService = {
  async transform({ text, type, onChunk, signal }: TransformParams): Promise<string> {
    if (!text?.trim()) throw new Error('Escribe una nota primero.');
    if (!AI_TYPES.some((item) => item.id === type)) throw new Error('Tipo de IA invalido.');
    if (!proxyUrl) throw buildAiConfigError();
    const db = assertSupabase();

    const { data: sessionData, error } = await db.auth.getSession();
    if (error) throw error;
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Inicia sesion antes de usar IA.');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    // Enlaza la señal externa con el controller interno (que también cubre el
    // timeout): si el caller aborta, se cancela igual que un timeout.
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    let response: Response;
    try {
      response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text, type }),
        signal: controller.signal
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error('La IA tardó demasiado (>30 s). Inténtalo de nuevo.');
      }
      throw new Error(`Error de red al conectar con IA: ${getErrorMessage(err, 'desconocido')}`);
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `IA respondio ${response.status}`);
    }

    if (!response.body) {
      clearTimeout(timeoutId);
      throw new Error('La IA no devolvio un stream.');
    }

    const reader = response.body.getReader();
    // Si el timeout dispara durante la lectura del stream, cancela el reader.
    const abortReader = () => reader.cancel().catch(() => {});
    controller.signal.addEventListener('abort', abortReader, { once: true });

    const decoder = new TextDecoder('utf-8');
    let output = '';
    // Buffer entre lecturas: `reader.read()` devuelve trozos arbitrarios y una
    // línea SSE `data: {...}` puede quedar partida entre dos reads. Sin acumular,
    // la línea incompleta falla el JSON.parse y se perdería texto de la IA.
    let buffer = '';

    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return;
      const dataStr = line.slice(6);
      if (dataStr === '[DONE]') return;
      try {
        const data = JSON.parse(dataStr) as {
          type?: string;
          delta?: { text?: string };
        };
        if (data.type === 'content_block_delta' && data.delta?.text) {
          output += data.delta.text;
          onChunk?.(output);
        }
      } catch {
        // Ignore parse errors for incomplete chunks.
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Conserva el último segmento (posiblemente incompleto) para el próximo read.
        buffer = lines.pop() ?? '';
        for (const line of lines) processLine(line);
      }
      // Procesa cualquier resto que no terminara en salto de línea.
      if (buffer) processLine(buffer);
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        throw new Error('La IA tardó demasiado (>30 s). Inténtalo de nuevo.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      controller.signal.removeEventListener('abort', abortReader);
    }

    if (!output.trim()) throw new Error('La IA no devolvio contenido.');
    return output;
  }
};
