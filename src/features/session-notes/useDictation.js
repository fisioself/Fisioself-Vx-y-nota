import { useEffect, useRef, useState } from 'react';

export const useDictation = (onText) => {
  const recognitionRef = useRef(null);
  const onTextRef = useRef(onText);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);

  onTextRef.current = onText;

  useEffect(() => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      setSupported(false);
      return undefined;
    }

    setSupported(true);
    const recognition = new Speech();
    recognition.lang = 'es-MX';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      let chunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) chunk += `${event.results[i][0].transcript} `;
      }
      if (chunk.trim()) onTextRef.current?.(chunk.trim());
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  const toggle = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (listening) {
      try {
        recognition.stop();
      } catch {
        /* noop */
      }
      setListening(false);
      return;
    }

    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return { supported, listening, toggle };
};
