import { afterEach, describe, expect, it, vi } from 'vitest';

// Mockeamos supabaseClient para probar documentsApi sin red real. El cliente
// expone `.from()` (tabla patient_documents) y `.storage.from()` (bucket).
const loadApi = async ({ from, storage }) => {
  vi.resetModules();
  const client = { from, storage };
  vi.doMock('../lib/supabaseClient.js', () => ({
    isSupabaseConfigured: true,
    supabase: client,
    assertSupabase: () => client
  }));
  return import('./documentsApi');
};

afterEach(() => {
  vi.doUnmock('../lib/supabaseClient.js');
  vi.restoreAllMocks();
});

const fakeFile = (name, type = 'application/pdf', size = 1234) => ({
  name,
  type,
  size
});

describe('documentsApi.list', () => {
  it('lee los documentos de un paciente, más recientes primero', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'doc-1' }], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const { documentsApi } = await loadApi({ from, storage: {} });

    const docs = await documentsApi.list('patient-1');

    expect(docs).toEqual([{ id: 'doc-1' }]);
    expect(from).toHaveBeenCalledWith('patient_documents');
    expect(eq).toHaveBeenCalledWith('patient_id', 'patient-1');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('propaga el error de Supabase', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error('rls') });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const { documentsApi } = await loadApi({ from, storage: {} });

    await expect(documentsApi.list('p1')).rejects.toThrow('rls');
  });
});

describe('documentsApi.upload validación de archivo', () => {
  it('rechaza archivos que superan el límite de tamaño sin tocar la red', async () => {
    const upload = vi.fn();
    const storageFrom = vi.fn(() => ({ upload }));
    const from = vi.fn();
    const { documentsApi, MAX_FILE_BYTES } = await loadApi({
      from,
      storage: { from: storageFrom }
    });

    await expect(
      documentsApi.upload({
        patientId: 'p1',
        file: fakeFile('enorme.pdf', 'application/pdf', MAX_FILE_BYTES + 1)
      })
    ).rejects.toThrow(/pesa demasiado/i);
    // No debe intentar subir ni registrar nada.
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('rechaza tipos de archivo no permitidos (p. ej. ejecutables)', async () => {
    const upload = vi.fn();
    const storageFrom = vi.fn(() => ({ upload }));
    const { documentsApi } = await loadApi({ from: vi.fn(), storage: { from: storageFrom } });

    await expect(
      documentsApi.upload({
        patientId: 'p1',
        file: fakeFile('virus.exe', 'application/x-msdownload', 100)
      })
    ).rejects.toThrow(/no permitido/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rechaza SVG por MIME (image/svg+xml) por riesgo de XSS', async () => {
    const upload = vi.fn();
    const storageFrom = vi.fn(() => ({ upload }));
    const { documentsApi } = await loadApi({ from: vi.fn(), storage: { from: storageFrom } });

    await expect(
      documentsApi.upload({
        patientId: 'p1',
        file: fakeFile('logo.svg', 'image/svg+xml', 100)
      })
    ).rejects.toThrow(/SVG/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rechaza SVG por extensión aunque el type venga vacío', async () => {
    const upload = vi.fn();
    const storageFrom = vi.fn(() => ({ upload }));
    const { documentsApi } = await loadApi({ from: vi.fn(), storage: { from: storageFrom } });

    await expect(
      documentsApi.upload({
        patientId: 'p1',
        file: fakeFile('disfrazado.SVG', '', 100)
      })
    ).rejects.toThrow(/SVG/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rechaza documentos de Word (solo imágenes y PDF permitidos)', async () => {
    const upload = vi.fn();
    const storageFrom = vi.fn(() => ({ upload }));
    const { documentsApi } = await loadApi({ from: vi.fn(), storage: { from: storageFrom } });

    await expect(
      documentsApi.upload({
        patientId: 'p1',
        file: fakeFile(
          'informe.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          5000
        )
      })
    ).rejects.toThrow(/no permitido/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it('acepta imágenes de los tipos permitidos (image/png)', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('img-1');
    const upload = vi.fn().mockResolvedValue({ error: null });
    const storageFrom = vi.fn(() => ({ upload }));
    const single = vi.fn().mockResolvedValue({ data: { id: 'd1' }, error: null });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const from = vi.fn(() => ({ insert }));
    const { documentsApi } = await loadApi({ from, storage: { from: storageFrom } });

    await expect(
      documentsApi.upload({ patientId: 'p1', file: fakeFile('rx.png', 'image/png', 2048) })
    ).resolves.toMatchObject({ id: 'd1' });
    expect(upload).toHaveBeenCalled();
  });
});

describe('documentsApi.upload', () => {
  it('sube al bucket con una ruta que empieza por el patient_id y registra metadatos', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-123');
    const upload = vi.fn().mockResolvedValue({ error: null });
    const storageFrom = vi.fn(() => ({ upload }));

    const single = vi
      .fn()
      .mockResolvedValue({ data: { id: 'doc-9', file_name: 'estudio.pdf' }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));

    const { documentsApi } = await loadApi({ from, storage: { from: storageFrom } });

    const result = await documentsApi.upload({
      patientId: 'patient-7',
      file: fakeFile('estudio.pdf'),
      description: '  Radiografía  '
    });

    expect(result).toMatchObject({ id: 'doc-9' });
    expect(storageFrom).toHaveBeenCalledWith('patient-files');
    // Ruta: patientId/uuid.ext — la primera carpeta es el patient_id (clave para
    // que las policies de storage resuelvan la clínica).
    expect(upload).toHaveBeenCalledWith(
      'patient-7/uuid-123.pdf',
      expect.anything(),
      expect.objectContaining({ contentType: 'application/pdf', upsert: false })
    );
    // La descripción se recorta; los metadatos referencian la misma ruta.
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: 'patient-7',
        storage_path: 'patient-7/uuid-123.pdf',
        file_name: 'estudio.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1234,
        description: 'Radiografía'
      })
    );
  });

  it('usa extensión "bin" cuando el archivo no tiene extensión', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-xyz');
    const upload = vi.fn().mockResolvedValue({ error: null });
    const storageFrom = vi.fn(() => ({ upload }));
    const single = vi.fn().mockResolvedValue({ data: { id: 'd1' }, error: null });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const from = vi.fn(() => ({ insert }));
    const { documentsApi } = await loadApi({ from, storage: { from: storageFrom } });

    // Nombre sin extensión pero con un tipo permitido: el path cae a ".bin".
    await documentsApi.upload({
      patientId: 'p1',
      file: fakeFile('sinextension', 'application/pdf')
    });

    expect(upload).toHaveBeenCalledWith(
      'p1/uuid-xyz.bin',
      expect.anything(),
      expect.objectContaining({ contentType: 'application/pdf' })
    );
  });

  it('no registra metadatos si la subida al bucket falla', async () => {
    const upload = vi.fn().mockResolvedValue({ error: new Error('storage full') });
    const storageFrom = vi.fn(() => ({ upload }));
    const from = vi.fn();
    const { documentsApi } = await loadApi({ from, storage: { from: storageFrom } });

    await expect(documentsApi.upload({ patientId: 'p1', file: fakeFile('x.pdf') })).rejects.toThrow(
      'storage full'
    );
    // No debe intentar insertar metadatos si el archivo no se subió.
    expect(from).not.toHaveBeenCalled();
  });

  it('borra el archivo huérfano si el registro de metadatos falla', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-orphan');
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const storageFrom = vi.fn(() => ({ upload, remove }));

    // El insert de metadatos falla → debe limpiarse el archivo subido.
    const single = vi.fn().mockResolvedValue({ data: null, error: new Error('insert denied') });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const from = vi.fn(() => ({ insert }));

    const { documentsApi } = await loadApi({ from, storage: { from: storageFrom } });

    await expect(
      documentsApi.upload({ patientId: 'p2', file: fakeFile('nota.pdf') })
    ).rejects.toThrow('insert denied');

    // El archivo huérfano se eliminó del bucket con la misma ruta.
    expect(remove).toHaveBeenCalledWith(['p2/uuid-orphan.pdf']);
  });
});

describe('documentsApi.signedUrl', () => {
  it('genera una URL firmada con la expiración indicada', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null });
    const storageFrom = vi.fn(() => ({ createSignedUrl }));
    const { documentsApi } = await loadApi({ from: vi.fn(), storage: { from: storageFrom } });

    const url = await documentsApi.signedUrl('p1/file.pdf', 600);

    expect(url).toBe('https://signed/x');
    expect(createSignedUrl).toHaveBeenCalledWith('p1/file.pdf', 600);
  });

  it('usa 300s de expiración por defecto', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'u' }, error: null });
    const storageFrom = vi.fn(() => ({ createSignedUrl }));
    const { documentsApi } = await loadApi({ from: vi.fn(), storage: { from: storageFrom } });

    await documentsApi.signedUrl('p1/file.pdf');

    expect(createSignedUrl).toHaveBeenCalledWith('p1/file.pdf', 300);
  });
});

describe('documentsApi.remove', () => {
  it('borra el archivo del bucket y luego su fila de metadatos', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const storageFrom = vi.fn(() => ({ remove }));
    const eq = vi.fn().mockResolvedValue({ error: null });
    const deleteFn = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: deleteFn }));

    const { documentsApi } = await loadApi({ from, storage: { from: storageFrom } });

    await expect(
      documentsApi.remove({ id: 'doc-1', storage_path: 'p1/file.pdf' })
    ).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledWith(['p1/file.pdf']);
    expect(eq).toHaveBeenCalledWith('id', 'doc-1');
  });

  it('no borra los metadatos si falla el borrado del archivo', async () => {
    const remove = vi.fn().mockResolvedValue({ error: new Error('storage err') });
    const storageFrom = vi.fn(() => ({ remove }));
    const from = vi.fn();
    const { documentsApi } = await loadApi({ from, storage: { from: storageFrom } });

    await expect(documentsApi.remove({ id: 'doc-1', storage_path: 'p1/file.pdf' })).rejects.toThrow(
      'storage err'
    );
    expect(from).not.toHaveBeenCalled();
  });
});
