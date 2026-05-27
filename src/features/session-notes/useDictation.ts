import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface DictationResult {
  supported: boolean;
  listening: boolean;
  processing: boolean;
  toggle: () => void;
}

export const useDictation = (onText: (text: string) => void): DictationResult => {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const transcribeAudio = async (blob: Blob): Promise<void> => {
    if (!supabase) {
      alert('Supabase no esta configurado para Whisper.');
      return;
    }
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');

      const { data, error } = await supabase.functions.invoke('whisper-transcribe', {
        body: formData
      });

      if (error) throw error;
      if (data?.text) onText(data.text);
    } catch (error) {
      console.error('Transcription failed:', error);
      alert('Error al procesar el dictado con Whisper.');
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
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('No se pudo acceder al microfono.');
    }
  };

  const stopRecording = (): void => {
    if (mediaRecorderRef.current && listening) {
      mediaRecorderRef.current.stop();
      setListening(false);
    }
  };

  const toggle = (): void => {
    if (listening) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return { supported, listening, processing, toggle };
};
