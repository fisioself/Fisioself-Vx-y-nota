import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/cors.ts';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB limit

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const token = getBearerToken(req);

    if (!supabaseUrl || !serviceRoleKey || !apiKey) {
      return new Response(JSON.stringify({ error: 'Servidor no configurado correctamente' }), {
        status: 500,
        headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Falta autorizacion' }), {
        status: 401,
        headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Sesion invalida' }), {
        status: 401,
        headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Verify clinical profile and clinic membership (Hallazgo #1 recommendation)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .single();

    if (!profile?.active || !['admin', 'therapist', 'assistant'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Usuario no autorizado' }), {
        status: 403,
        headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const formData = await req.formData();
    const audioFile = formData.get('file');

    if (!audioFile || !(audioFile instanceof File)) {
      return new Response(JSON.stringify({ error: 'No se recibio ningun archivo de audio' }), {
        status: 400,
        headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Hallazgo #8: Size limit
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return new Response(JSON.stringify({ error: 'Audio demasiado largo (max 10MB)' }), {
        status: 400,
        headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Hallazgo #3: Fix FormData bug
    const openaiFormData = new FormData();
    openaiFormData.append('file', audioFile, 'recording.webm');
    openaiFormData.append('model', 'whisper-1');
    openaiFormData.append('language', 'es');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: openaiFormData,
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
      status: response.status,
    });
  } catch (error) {
    console.error('whisper_failed', error);
    return new Response(JSON.stringify({ error: 'Error procesando audio' }), {
      status: 500,
      headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
