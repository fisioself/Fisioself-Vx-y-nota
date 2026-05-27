import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

export const useDictation = (onText) => {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const supported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setListening(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('No se pudo acceder al microfono.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && listening) {
      mediaRecorderRef.current.stop();
      setListening(false);
    }
  };

  const transcribeAudio = async (blob) => {
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');

      const { data, error } = await supabase.functions.invoke('whisper-transcribe', {
        body: formData,
      });

      if (error) throw error;
      if (data?.text) {
        onText(data.text);
      }
    } catch (error) {
      console.error('Transcription failed:', error);
      alert('Error al procesar el dictado con Whisper.');
    } finally {
      setProcessing(false);
    }
  };

  const toggle = () => {
    if (listening) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Compatibility with old API structure to avoid breaking UI
  return { 
    supported, 
    listening, 
    processing, // New state
    toggle, 
    needsConsent: false, // Whisper uses browser permission dialog
    grantConsent: () => {}, 
    cancelConsent: () => {} 
  };
};
