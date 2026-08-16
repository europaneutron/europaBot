import { createHash } from 'node:crypto';
import { documentCompilerRepository } from '@/data/repositories/document-compiler.repository';
import { scopeRepository } from '@/data/repositories/scope.repository';
import {
  removeCompilerMaterial,
  uploadCompilerMaterial,
} from '@/services/storage/compiler-material-storage';

const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
const MIME_KINDS = new Map<string, 'text' | 'pdf' | 'document'>([
  ['text/plain', 'text'],
  ['application/pdf', 'pdf'],
  ['application/msword', 'document'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
]);

export class MaterialIngestionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export class MaterialIngestionService {
  async ingestText(input: {
    scopeId: string;
    text: string;
    filename: string;
    adminId: string;
  }) {
    const text = input.text.trim();
    if (!text || text.length > 500_000) {
      throw new MaterialIngestionError('El texto debe tener entre 1 y 500,000 caracteres', 400);
    }
    return this.persist({
      scopeId: input.scopeId,
      adminId: input.adminId,
      filename: input.filename.trim() || 'material.txt',
      mimeType: 'text/plain',
      kind: 'text',
      bytes: new TextEncoder().encode(text),
      plainText: text,
      storagePath: null,
    });
  }

  async ingestFile(input: { scopeId: string; file: File; adminId: string }) {
    const { file } = input;
    if (file.size === 0 || file.size > MAX_MATERIAL_BYTES) {
      throw new MaterialIngestionError('El archivo debe pesar entre 1 byte y 25 MB', 400);
    }
    const kind = MIME_KINDS.get(file.type);
    if (!kind) {
      throw new MaterialIngestionError(`Formato no admitido: ${file.type || 'desconocido'}`, 415);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (kind === 'text') {
      return this.persist({
        scopeId: input.scopeId,
        adminId: input.adminId,
        filename: file.name,
        mimeType: file.type,
        kind,
        bytes,
        plainText: new TextDecoder().decode(bytes),
        storagePath: null,
      });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${input.scopeId}/${crypto.randomUUID()}_${safeName}`;
    await uploadCompilerMaterial(storagePath, bytes, file.type);
    return this.persist({
      scopeId: input.scopeId,
      adminId: input.adminId,
      filename: file.name,
      mimeType: file.type,
      kind,
      bytes,
      plainText: null,
      storagePath,
    });
  }

  private async persist(input: {
    scopeId: string;
    adminId: string;
    filename: string;
    mimeType: string;
    kind: 'text' | 'pdf' | 'document';
    bytes: Uint8Array;
    plainText: string | null;
    storagePath: string | null;
  }) {
    if (!(await scopeRepository.isActiveScope(input.scopeId))) {
      if (input.storagePath) await removeCompilerMaterial(input.storagePath);
      throw new MaterialIngestionError('El proyecto no existe o esta inactivo', 400);
    }

    try {
      const material = await documentCompilerRepository.createMaterial({
        scopeId: input.scopeId,
        kind: input.kind,
        filename: input.filename,
        storagePath: input.storagePath,
        mimeType: input.mimeType,
        plainText: input.plainText,
        checksum: createHash('sha256').update(input.bytes).digest('hex'),
        adminId: input.adminId,
      });
      const run = await documentCompilerRepository.createRun(
        input.scopeId,
        material.id,
        input.adminId
      );
      return { material, run };
    } catch (error) {
      if (input.storagePath) await removeCompilerMaterial(input.storagePath);
      throw error;
    }
  }
}

export const materialIngestionService = new MaterialIngestionService();
