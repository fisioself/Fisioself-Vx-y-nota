import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { useToast } from '../app/ToastProvider.jsx';

export function ClinicalFilesList({ patientId, refreshTrigger }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const { notify } = useToast();

  useEffect(() => {
    async function loadFiles() {
      if (!patientId) return;
      setLoading(true);
      const { data, error } = await supabase.storage
        .from('clinical_files')
        .list(patientId, { sortBy: { column: 'created_at', order: 'desc' } });

      if (error) {
        notify({ tone: 'error', message: 'Error cargando archivos' });
      } else {
        setFiles(data || []);
      }
      setLoading(false);
    }
    loadFiles();
  }, [patientId, refreshTrigger, notify]);

  const handleDownload = async (fileName) => {
    const { data, error } = await supabase.storage
      .from('clinical_files')
      .createSignedUrl(`${patientId}/${fileName}`, 3600); // 1 hour

    if (error) {
      notify({ tone: 'error', message: 'Error al descargar el archivo' });
      return;
    }
    
    // Open in new tab to download/view
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (fileName) => {
    if (!window.confirm('¿Seguro que quieres eliminar este archivo?')) return;

    const { error } = await supabase.storage
      .from('clinical_files')
      .remove([`${patientId}/${fileName}`]);

    if (error) {
      notify({ tone: 'error', message: 'Error al eliminar. Solo admins pueden borrar.' });
    } else {
      notify({ tone: 'success', message: 'Archivo eliminado' });
      setFiles((current) => current.filter(f => f.name !== fileName));
    }
  };

  if (loading) return <p className="muted">Cargando archivos...</p>;
  if (files.length === 0) return <p className="muted">No hay archivos adjuntos.</p>;

  return (
    <ul className="list-stack" style={{ listStyle: 'none', padding: 0 }}>
      {files.map((file) => (
        <li key={file.id} className="note-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{file.name.split('.').pop().toUpperCase()} - {(file.metadata?.size / 1024 / 1024).toFixed(2)}MB</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="secondary" onClick={() => handleDownload(file.name)}>
              Ver / Descargar
            </button>
            <button type="button" className="danger" onClick={() => handleDelete(file.name)}>
              Eliminar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
