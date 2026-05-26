import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

const proxyUrl = import.meta.env.VITE_CLAUDE_PROXY_URL;

export const AI_TYPES = [
  { id: 'soap', label: 'Formatear SOAP', traceable: false },
  { id: 'summary', label: 'Resumir nota', traceable: false },
  { id: 'exercises', label: 'Sugerir ejercicios', traceable: false },
  { id: 'clinical_analysis', label: 'Analisis clinico', traceable: true },
  { id: 'treatment_plan', label: 'Plan de tratamiento', traceable: true },
  { id: 'discharge_letter', label: 'Carta de alta', traceable: true },
  { id: 'informed_consent', label: 'Consentimiento informado', traceable: true }
];

export const isAiConfigured = Boolean(proxyUrl);

const buildAiConfigError = () => {
  const error = new Error(
    'IA no configurada. Define VITE_CLAUDE_PROXY_URL apuntando a la funcion segura clinical-ai.'
  );
  error.code = 'AI_NOT_CONFIGURED';
  return error;
};

export const aiService = {
  async transform({ text, type, onChunk }) {
    if (!text?.trim()) throw new Error('Escribe una nota primero.');
    if (!AI_TYPES.some((item) => item.id === type)) throw new Error('Tipo de IA invalido.');
    if (!proxyUrl) throw buildAiConfigError();
    if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado.');

    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Inicia sesion antes de usar IA.');

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, type })
    }).catch((err) => {
      throw new Error(`Error de red al conectar con IA: ${err.message}`);
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `IA respondio ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let output = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;
          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'content_block_delta' && data.delta?.text) {
              output += data.delta.text;
              if (onChunk) onChunk(output);
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }

    if (!output.trim()) throw new Error('La IA no devolvio contenido.');
    return output;
  }
};
