const proxyUrl = import.meta.env.VITE_CLAUDE_PROXY_URL;

export const AI_TYPES = [
  { id: 'soap', label: 'Formatear SOAP', traceable: false },
  { id: 'summary', label: 'Resumir', traceable: false },
  { id: 'exercises', label: 'Sugerir ejercicios', traceable: false },
  { id: 'clinical_analysis', label: 'Analisis clinico', traceable: true },
  { id: 'treatment_plan', label: 'Plan de tratamiento', traceable: true },
  { id: 'discharge_letter', label: 'Carta de alta', traceable: true }
];

export const aiService = {
  async transform({ text, type }) {
    if (!text?.trim()) throw new Error('Escribe una nota primero.');

    if (!proxyUrl) {
      return `## Borrador IA (${type})\n\nConfigura VITE_CLAUDE_PROXY_URL para conectar Claude.\n\nTexto base:\n${text}`;
    }

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, type })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `IA respondio ${response.status}`);
    return data.text || data.output || '';
  }
};
