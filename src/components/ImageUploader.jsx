import { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useToast } from '../app/ToastProvider.jsx';

export function ImageUploader({ patientId, onUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const { notify } = useToast();

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      notify({ tone: 'error', message: 'El archivo excede el limite de 10MB.' });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${patientId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('clinical_files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      notify({ tone: 'success', message: 'Archivo subido correctamente.' });
      onUploadComplete?.(filePath);
    } catch (error) {
      notify({ tone: 'error', message: error.message || 'Error al subir el archivo.' });
    } finally {
      setUploading(false);
      event.target.value = ''; // Reset input
    }
  };

  return (
    <div className="image-uploader">
      <label className="button secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
        {uploading ? 'Subiendo...' : 'Adjuntar o tomar foto'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
        Toma una foto con tu cámara o sube un archivo (Max 10MB)
      </p>
    </div>
  );
}
