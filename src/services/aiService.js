import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';

const proxyUrl = import.meta.env.VITE_CLAUDE_PROXY_URL;

export const AI_TYPES = [
  { id: 'soap', label: 'Formatear SOAP', traceable: false },
  { id: 'exercises', label: 'Sugerir ejercicios', traceable: false },
  { id: 'clinical_analysis', label: 'Analisis clinico', traceable: true },
  { id: 'treatment_plan', label: 'Plan de tratamiento', traceable: true }
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
  async transform({ text, type }) {
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

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Respuesta invalida del servidor de IA (Status: ${response.status})`);
    }

    if (!response.ok) throw new Error(data.error || `IA respondio ${response.status}`);

    const output = data.text || data.output || '';
    if (!output.trim()) throw new Error('La IA no devolvio contenido.');
    return output;
  }
};
