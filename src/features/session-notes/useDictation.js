import { useEffect, useRef, useState } from 'react';
import { consent, CONSENT_KEYS } from '../../shared/consent.js';

export const useDictation = (onText) => {
  const recognitionRef = useRef(null);
  const onTextRef = useRef(onText);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);

  onTextRef.current = onText;

  useEffect(() => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      setSupported(false);
      return undefined;
    }

    setSupported(true);
    const recognition = new Speech();
    // Use device language or fallback to es-MX
    recognition.lang = navigator.language || 'es-MX';
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

  const startRecognition = () => {
    const recognition = recognitionRef.current;
    if (!recognition || listening) return;
    try {
      recognition.start();
      setListening(true);
    } catch (err) {
      if (err.name === 'InvalidStateError') {
        // Ya esta activo, simplemente actualizamos el estado visual
        setListening(true);
      } else {
        setListening(false);
      }
    }
  };

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

    // First-time gate. The Web Speech API in Chromium streams audio to Google
    // for transcription; before we open that pipe with potential patient data
    // in the audio, the fisio must acknowledge it once per device.
    if (!consent.has(CONSENT_KEYS.DICTATION)) {
      setNeedsConsent(true);
      return;
    }

    startRecognition();
  };

  const grantConsent = () => {
    consent.grant(CONSENT_KEYS.DICTATION);
    setNeedsConsent(false);
    startRecognition();
  };

  const cancelConsent = () => {
    setNeedsConsent(false);
  };

  return { supported, listening, toggle, needsConsent, grantConsent, cancelConsent };
};
