import { useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  documentsApi,
  validateUploadFile,
  type PatientDocument
} from '../../services/documentsApi';
import { useToast } from '../../app/ToastProvider';
import { getErrorMessage } from '../../shared/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SkeletonList } from '../../components/Skeleton';

interface PatientDocumentsProps {
  patientId: string;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

const prettySize = (bytes: number | null): string => {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const prettyDate = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(iso));
  } catch {
    return '';
  }
};

export function PatientDocuments({ patientId }: PatientDocumentsProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Documento pendiente de confirmar su eliminación (null = sin diálogo abierto).
  const [confirmDoc, setConfirmDoc] = useState<PatientDocument | null>(null);

  const { data: docs = [], isLoading } = useQuery<PatientDocument[], Error>({
    queryKey: ['patient-documents', patientId],
    queryFn: () => documentsApi.list(patientId),
    enabled: !!patientId
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['patient-documents', patientId] });

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    // Validación local (tamaño + tipo) con la misma regla que usa el servicio,
    // para dar feedback inmediato antes de intentar subir.
    try {
      validateUploadFile(file);
    } catch (error) {
      notify({ tone: 'error', message: getErrorMessage(error, 'Archivo no válido.') });
      return;
    }
    setUploading(true);
    try {
      await documentsApi.upload({ patientId, file });
      await refresh();
      notify({ tone: 'success', message: 'Archivo subido correctamente.' });
    } catch (error) {
      notify({ tone: 'error', message: getErrorMessage(error, 'No se pudo subir el archivo.') });
    } finally {
      setUploading(false);
    }
  };

  // Genera una URL firmada temporal y abre el archivo en una pestaña nueva.
  const view = async (doc: PatientDocument) => {
    setOpening(doc.id);
    try {
      const url = await documentsApi.signedUrl(doc.storage_path, 300);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notify({ tone: 'error', message: getErrorMessage(error, 'No se pudo abrir el archivo.') });
    } finally {
      setOpening(null);
    }
  };

  const remove = async (doc: PatientDocument) => {
    setConfirmDoc(null);
    setDeletingId(doc.id);
    try {
      await documentsApi.remove(doc);
      await refresh();
      notify({ tone: 'success', message: 'Archivo eliminado.' });
    } catch (error) {
      notify({ tone: 'error', message: getErrorMessage(error, 'No se pudo eliminar el archivo.') });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="patient-documents">
      <div className="patient-documents-upload">
        <label className="button secondary" style={{ cursor: 'pointer', display: 'inline-block' }}>
          {uploading ? 'Subiendo…' : '📎 Adjuntar o tomar foto'}
          <input
            type="file"
            accept={ACCEPT}
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
        <p className="muted" style={{ fontSize: '0.8rem', margin: '6px 2px 0' }}>
          Fotos de evaluación, estudios o PDFs. Privado y cifrado (máx. 15 MB).
        </p>
      </div>

      {isLoading ? (
        <SkeletonList rows={2} label="Cargando archivos…" />
      ) : docs.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          No hay archivos adjuntos todavía.
        </p>
      ) : (
        <ul className="list-stack" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="note-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10
              }}
            >
              <div style={{ minWidth: 0 }}>
                <strong
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {doc.file_name}
                </strong>
                <small className="muted">
                  {prettyDate(doc.created_at)}
                  {doc.size_bytes ? ` · ${prettySize(doc.size_bytes)}` : ''}
                </small>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => view(doc)}
                  disabled={opening === doc.id}
                >
                  {opening === doc.id ? 'Abriendo…' : 'Ver'}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => setConfirmDoc(doc)}
                  disabled={deletingId === doc.id}
                >
                  {deletingId === doc.id ? '…' : 'Eliminar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmDoc && (
        <ConfirmDialog
          title="Eliminar archivo"
          message={
            <>
              ¿Eliminar «<strong>{confirmDoc.file_name}</strong>»? No se puede deshacer.
            </>
          }
          confirmLabel="Eliminar"
          busy={deletingId === confirmDoc.id}
          onConfirm={() => remove(confirmDoc)}
          onCancel={() => setConfirmDoc(null)}
        />
      )}
    </div>
  );
}
