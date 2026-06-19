import { useEffect, useRef, useState } from 'react';
import { assertSupabase } from '../../lib/supabaseClient';

export const useDictation = (
  onText: (text: string) => void,
  onError?: (message: string) => void
) => {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size > 9.5 * 1024 * 1024) {
          onError?.('Audio demasiado largo (límite ~10 MB). Graba segmentos más cortos.');
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
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
    // Guard sobre el estado REAL del recorder, no sobre `listening`: el timer de
    // auto-stop (5 min) captura un `listening` viejo (false) por cierre estático;
    // si dependiéramos de él, .stop() no correría y el micrófono no se liberaría.
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setListening(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // Libera el micrófono si el editor se cierra mientras graba: antes solo se
      // limpiaba el timer y el stream quedaba activo (indicador de micro encendido).
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
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
