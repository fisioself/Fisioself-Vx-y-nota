import { useEffect, useRef, useState } from 'react';
import { assertSupabase } from '../../lib/supabaseClient.js';

export const useDictation = (
  onText: (text: string) => void,
  onError?: (message: string) => void
) => {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const transcribeAudio = async (blob: Blob): Promise<void> => {
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');

      const { data, error } = await assertSupabase().functions.invoke('whisper-transcribe', {
        body: formData
      });

      if (error) throw error;
      if (data?.text) onText(data.text);
    } catch (error) {
      console.error('Transcription failed:', error);
      onError?.('Error al procesar el dictado con Whisper.');
    } finally {
      setProcessing(false);
    }
  };

  const startRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setListening(true);

      // Hallazgo #14: 5-minute limit
      const MAX_MS = 5 * 60 * 1000;
      timerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
          onError?.('Dictado detenido automaticamente tras 5 minutos.');
        }
      }, MAX_MS);
    } catch (error) {
      console.error('Error starting recording:', error);
      onError?.('No se pudo acceder al microfono.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && listening) {
      mediaRecorderRef.current.stop();
      setListening(false);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const toggle = () => {
    if (listening) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return { supported, listening, processing, toggle };
};
