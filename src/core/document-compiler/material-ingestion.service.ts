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
    replacementMode?: 'replace' | 'add';
  }) {
    const text = input.text.trim();
    if (!text || text.length > 500_000) {
      throw new MaterialIngestionError('El texto debe tener entre 1 y 500,000 caracteres', 400);
    }
    const materialInput = {
      scopeId: input.scopeId,
      adminId: input.adminId,
      filename: input.filename.trim() || 'material.txt',
      mimeType: 'text/plain',
      kind: 'text' as const,
      bytes: new TextEncoder().encode(text),
      plainText: text,
      storagePath: null,
    };
    return this.persistRun(
      [materialInput],
      input.scopeId,
      input.adminId,
      input.replacementMode || 'replace'
    );
  }

  async ingestFile(input: { scopeId: string; file: File; adminId: string }) {
    return this.ingestFiles({ ...input, files: [input.file], replacementMode: 'replace' });
  }

  async ingestFiles(input: {
    scopeId: string;
    files: File[];
    adminId: string;
    replacementMode: 'replace' | 'add';
  }) {
    if (input.files.length === 0) {
      throw new MaterialIngestionError('Agrega al menos un archivo', 400);
    }
    if (!(await scopeRepository.isActiveScope(input.scopeId))) {
      throw new MaterialIngestionError('El proyecto no existe o esta inactivo', 400);
    }

    for (const file of input.files) {
      if (file.size === 0 || file.size > MAX_MATERIAL_BYTES) {
        throw new MaterialIngestionError(
          `${file.name}: el archivo debe pesar entre 1 byte y 25 MB`,
          400
        );
      }
      if (!MIME_KINDS.has(file.type)) {
        throw new MaterialIngestionError(
          `${file.name}: formato no admitido (${file.type || 'desconocido'})`,
          415
        );
      }
    }

    const prepared: Awaited<ReturnType<MaterialIngestionService['prepareFile']>>[] = [];
    try {
      for (const file of input.files) {
        prepared.push(await this.prepareFile(input.scopeId, input.adminId, file));
      }
    } catch (error) {
      await Promise.all(prepared.flatMap(item => item.storagePath
        ? [removeCompilerMaterial(item.storagePath)]
        : []));
      throw error;
    }

    return this.persistRun(
      prepared,
      input.scopeId,
      input.adminId,
      input.replacementMode
    );
  }

  private async prepareFile(scopeId: string, adminId: string, file: File) {
    if (file.size === 0 || file.size > MAX_MATERIAL_BYTES) {
      throw new MaterialIngestionError(
        `${file.name}: el archivo debe pesar entre 1 byte y 25 MB`,
        400
      );
    }
    const kind = MIME_KINDS.get(file.type);
    if (!kind) {
      throw new MaterialIngestionError(
        `${file.name}: formato no admitido (${file.type || 'desconocido'})`,
        415
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (kind === 'text') {
      return {
        scopeId,
        adminId,
        filename: file.name,
        mimeType: file.type,
        kind,
        bytes,
        plainText: new TextDecoder().decode(bytes),
        storagePath: null,
      };
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${scopeId}/${crypto.randomUUID()}_${safeName}`;
    await uploadCompilerMaterial(storagePath, bytes, file.type);
    return {
      scopeId,
      adminId,
      filename: file.name,
      mimeType: file.type,
      kind,
      bytes,
      plainText: null,
      storagePath,
    };
  }

  private async persistRun(inputs: Array<{
    scopeId: string;
    adminId: string;
    filename: string;
    mimeType: string;
    kind: 'text' | 'pdf' | 'document';
    bytes: Uint8Array;
    plainText: string | null;
    storagePath: string | null;
  }>, scopeId: string, adminId: string, replacementMode: 'replace' | 'add') {
    if (!(await scopeRepository.isActiveScope(scopeId))) {
      await Promise.all(inputs.flatMap(item => item.storagePath
        ? [removeCompilerMaterial(item.storagePath)]
        : []));
      throw new MaterialIngestionError('El proyecto no existe o esta inactivo', 400);
    }

    const materials = [];
    try {
      for (const item of inputs) {
        materials.push(await documentCompilerRepository.createMaterial({
          scopeId: item.scopeId,
          kind: item.kind,
          filename: item.filename,
          storagePath: item.storagePath,
          mimeType: item.mimeType,
          plainText: item.plainText,
          checksum: createHash('sha256').update(item.bytes).digest('hex'),
          adminId: item.adminId,
        }));
      }
      const run = await documentCompilerRepository.createRun(
        scopeId,
        materials.map(material => material.id),
        adminId,
        replacementMode
      );
      return { material: materials[0], materials, run };
    } catch (error) {
      await documentCompilerRepository.deleteMaterials(materials.map(material => material.id));
      await Promise.all(inputs.flatMap(item => item.storagePath
        ? [removeCompilerMaterial(item.storagePath)]
        : []));
      throw error;
    }
  }
}

export const materialIngestionService = new MaterialIngestionService();
