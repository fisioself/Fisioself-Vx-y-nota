import type { SupabaseClient } from '@supabase/supabase-js';
import { assertSupabase } from '../lib/supabaseClient';

const BUCKET = 'patient-files';

// Tipos permitidos para documentos clínicos: EXACTAMENTE los mismos que acepta
// el bucket patient-files y el selector de archivos (PatientDocuments.tsx). Las
// tres listas deben coincidir; si no, un archivo pasa la validación del cliente
// y el bucket lo rechaza después ("subió pero falló"). Solo imágenes y PDF.
export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB (igual que el límite del bucket)
export const ALLOWED_MIME_PREFIXES: string[] = [];
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf'
];

const prettyMB = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`;

// Valida tamaño y tipo antes de tocar la red. Lanza un Error con mensaje claro
// (en español) listo para mostrarse al usuario. Exportada para poder testearla
// y reutilizar la misma regla en la UI.
export const validateUploadFile = (file: { name: string; type: string; size: number }): void => {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `El archivo pesa demasiado (máximo ${prettyMB(MAX_FILE_BYTES)}). Comprime o divide el documento.`
    );
  }
  const type = file.type || '';
  // Los SVG son "imágenes" (pasarían el prefijo image/) pero pueden contener
  // <script> ejecutable. Si se abren desde su URL firmada, se ejecutaría JS.
  // Se rechazan por MIME y por extensión (el type del navegador puede venir vacío).
  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (type === 'image/svg+xml' || ext === 'svg') {
    throw new Error('Por seguridad no se permiten archivos SVG. Sube PNG, JPG o PDF.');
  }
  const ok =
    ALLOWED_MIME_TYPES.includes(type) || ALLOWED_MIME_PREFIXES.some((p) => type.startsWith(p));
  if (!ok) {
    throw new Error(
      'Tipo de archivo no permitido. Sube una imagen (JPG, PNG, WEBP, HEIC) o un PDF.'
    );
  }
};

// La tabla patient_documents se creó por migración después de generar
// types/supabase.ts, así que el cliente tipado no la conoce todavía. Igual que
// se hace con db.rpc en clinicalApi, usamos un cliente sin tipar SOLO para esta
// tabla; los resultados se castean a PatientDocument vía unwrap<T>.
const docsTable = () => (assertSupabase() as unknown as SupabaseClient).from('patient_documents');

// Fila de metadatos de un documento clínico (la tabla patient_documents).
// Se define aquí (y no en types/supabase.ts) para no depender de regenerar los
// tipos; el esquema lo respalda la migración 20260603000000.
export interface PatientDocument {
  id: string;
  patient_id: string;
  clinic_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
}

const unwrap = <T>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

// Extensión en minúsculas a partir del nombre del archivo (sin el punto).
const extOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : 'bin';
};

export const documentsApi = {
  // Documentos de un paciente, más recientes primero.
  async list(patientId: string): Promise<PatientDocument[]> {
    return unwrap(
      await docsTable()
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
    );
  },

  // Sube el archivo al bucket privado y registra sus metadatos. La ruta empieza
  // con el patient_id (primera carpeta) para que las policies de storage puedan
  // resolver la clínica del paciente. El nombre real se guarda en file_name.
  async upload(input: {
    patientId: string;
    file: File;
    description?: string;
  }): Promise<PatientDocument> {
    const db = assertSupabase();
    const { patientId, file, description } = input;
    // Validación local (tamaño + tipo) antes de subir nada a la red.
    validateUploadFile(file);
    const path = `${patientId}/${crypto.randomUUID()}.${extOf(file.name)}`;

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false
    });
    if (upErr) throw upErr;

    try {
      return unwrap(
        await docsTable()
          .insert({
            patient_id: patientId,
            storage_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            description: description?.trim() || null
          })
          .select('*')
          .single()
      );
    } catch (err) {
      // Si falla el registro de metadatos, no dejamos el archivo huérfano.
      await db.storage
        .from(BUCKET)
        .remove([path])
        .catch((cleanupErr) => {
          console.error('[documentsApi] orphan cleanup failed after DB error:', cleanupErr);
        });
      throw err;
    }
  },

  // URL firmada temporal para ver/descargar un archivo del bucket privado.
  async signedUrl(storagePath: string, expiresInSeconds = 300): Promise<string> {
    const db = assertSupabase();
    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  },

  // Borra el archivo del bucket y su fila de metadatos.
  async remove(doc: Pick<PatientDocument, 'id' | 'storage_path'>): Promise<void> {
    const db = assertSupabase();
    const { error: rmErr } = await db.storage.from(BUCKET).remove([doc.storage_path]);
    if (rmErr) throw rmErr;
    const { error } = await docsTable().delete().eq('id', doc.id);
    if (error) throw error;
  }
};
