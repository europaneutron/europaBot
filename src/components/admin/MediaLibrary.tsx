/**
 * Media Library Component
 * Biblioteca de medios tipo WordPress para gestionar archivos multimedia
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Upload,
  X,
  Check,
  Eye,
  Copy,
  Trash2,
  Loader2,
  FileText,
  ImageIcon,
  Video,
  Paperclip,
  FolderOpen,
  AlertCircle,
} from 'lucide-react';

interface MediaFile {
  name: string;
  path: string;
  url: string;
  size: number;
  created_at: string;
  type: 'image' | 'document' | 'video' | 'other';
}

interface MediaLibraryProps {
  onSelect: (url: string) => void;
  onClose: () => void;
  /** Habilita selección de varios archivos a la vez. Por defecto: selección única. */
  multiple?: boolean;
  /** Se invoca al confirmar en modo múltiple, con las URLs en orden de selección. */
  onSelectMultiple?: (urls: string[]) => void;
  /** Restringe el listado a un tipo de archivo, sin importar la carpeta activa. */
  typeFilter?: 'image' | 'document' | 'video';
}

const FOLDERS = {
  all: '',
  images: 'images/',
  documents: 'documents/',
  videos: 'videos/',
  brochures: 'brochures/'
};

const TYPE_FOLDERS: Record<NonNullable<MediaLibraryProps['typeFilter']>, string[]> = {
  image: [FOLDERS.images],
  document: [FOLDERS.documents, FOLDERS.brochures],
  video: [FOLDERS.videos],
};

function MediaLibrary({ onSelect, onClose, multiple = false, onSelectMultiple, typeFilter }: MediaLibraryProps) {
  const supabase = useMemo(
    () => createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ),
    []
  );
  
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<keyof typeof FOLDERS>('all');
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  // Archivos elegidos en modo múltiple, en orden de selección. Se guardan los
  // objetos completos (no solo el path) porque `files` se reemplaza al
  // cambiar de carpeta, y resolver contra esa lista perdía la selección.
  const [selectedFiles, setSelectedFiles] = useState<MediaFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Ruta del archivo cuya URL se acaba de copiar, para confirmarlo en su tarjeta. */
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const foldersToLoad = useMemo(
    () => typeFilter ? TYPE_FOLDERS[typeFilter] : [FOLDERS[selectedFolder]],
    [selectedFolder, typeFilter]
  );

  // Archivos visibles: derivados de `files`, `typeFilter` y la búsqueda, sin
  // estado paralelo que mantener sincronizado a mano (eso era lo que producía
  // el parpadeo de un frame con la lista vieja antes de aplicar el filtro).
  const filteredFiles = useMemo(() => {
    let result = files;

    if (typeFilter) {
      result = result.filter(f => f.type === typeFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(query));
    }

    return result;
  }, [files, typeFilter, searchQuery]);

  // Cerrar con tecla ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const listings = await Promise.all(
        foldersToLoad.map(async (folder) => {
          const { data, error: listError } = await supabase.storage
            .from('bot-media')
            .list(folder, {
              limit: 100,
              sortBy: { column: 'created_at', order: 'desc' }
            });

          if (listError) throw listError;
          return (data || []).map((item) => ({ item, folder }));
        })
      );

      const filesWithUrls: MediaFile[] = listings
        .flat()
        .filter(({ item }) => {
          if (item.name.includes('.emptyFolderPlaceholder')) return false;
          if (item.id === null) return false;
          return item.name.includes('.');
        })
        .map(({ item, folder }) => {
          const fullPath = folder + item.name;
          const { data: urlData } = supabase.storage
            .from('bot-media')
            .getPublicUrl(fullPath);

          return {
            name: item.name,
            path: fullPath,
            url: urlData.publicUrl,
            size: item.metadata?.size || 0,
            created_at: item.created_at,
            type: getFileType(item.name)
          };
        });

      setFiles(filesWithUrls.sort((a, b) => b.created_at.localeCompare(a.created_at)));

    } catch (err: any) {
      console.error('Error loading files:', err);
      setError(err.message || 'Error al cargar archivos');
    } finally {
      setLoading(false);
    }
  }, [foldersToLoad, supabase]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  function getFileType(filename: string): MediaFile['type'] {
    const ext = filename.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) return 'image';
    if (['pdf', 'doc', 'docx'].includes(ext || '')) return 'document';
    if (['mp4', 'mov', 'avi'].includes(ext || '')) return 'video';
    
    return 'other';
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    const validTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'video/mp4', 'video/quicktime'
    ];

    if (!validTypes.includes(file.type)) {
      setError('Tipo de archivo no permitido. Solo se aceptan imágenes, PDFs, documentos y videos.');
      return;
    }

    // Validar tamaño (100MB máximo)
    if (file.size > 100 * 1024 * 1024) {
      setError('El archivo es demasiado grande. Máximo 100MB.');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      setError(null);

      // Determinar carpeta según tipo de archivo
      let targetFolder = 'documents/';
      const fileType = getFileType(file.name);
      if (fileType === 'image') targetFolder = 'images/';
      if (fileType === 'video') targetFolder = 'videos/';
      if (file.name.toLowerCase().includes('brochure')) targetFolder = 'brochures/';

      // Generar nombre único
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedName}`;
      const filePath = targetFolder + fileName;

      // Subir archivo
      const { error: uploadError } = await supabase.storage
        .from('bot-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      setUploadProgress(100);
      
      // Recargar lista
      await loadFiles();

      // Seleccionar archivo recién subido
      const { data: urlData } = supabase.storage
        .from('bot-media')
        .getPublicUrl(filePath);

      const newFile: MediaFile = {
        name: fileName,
        path: filePath,
        url: urlData.publicUrl,
        size: file.size,
        created_at: new Date().toISOString(),
        type: fileType
      };

      const matchesType = !typeFilter || newFile.type === typeFilter;
      const matchesFolder = typeFilter || foldersToLoad.includes(targetFolder);
      const matchesSearch = !searchQuery.trim() || newFile.name.toLowerCase().includes(searchQuery.toLowerCase());

      if (matchesType && matchesFolder && matchesSearch) {
        setSelectedFile(newFile);
        if (multiple) {
          setSelectedFiles((current) => [...current, newFile]);
        }
      }

    } catch (err: any) {
      console.error('Error uploading file:', err);
      setError(err.message || 'Error al subir archivo');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteFile(file: MediaFile) {
    if (!confirm(`¿Eliminar "${file.name}"?`)) return;

    try {
      const { error: deleteError } = await supabase.storage
        .from('bot-media')
        .remove([file.path]);

      if (deleteError) throw deleteError;

      await loadFiles();
      if (selectedFile?.path === file.path) setSelectedFile(null);
      setSelectedFiles((current) => current.filter((f) => f.path !== file.path));

    } catch (err: any) {
      console.error('Error deleting file:', err);
      setError(err.message || 'Error al eliminar archivo');
    }
  }

  function handleCopyURL(file: MediaFile) {
    navigator.clipboard.writeText(file.url);
    // Confirmacion en la propia tarjeta en lugar de un alert que interrumpe el flujo.
    setCopiedPath(file.path);
    window.setTimeout(() => {
      setCopiedPath((current) => current === file.path ? null : current);
    }, 2000);
  }

  function toggleFileSelection(file: MediaFile) {
    if (!multiple) {
      setSelectedFile(file);
      return;
    }

    setSelectedFiles((current) =>
      current.some((f) => f.path === file.path)
        ? current.filter((f) => f.path !== file.path)
        : [...current, file]
    );
  }

  function handleConfirmSelection() {
    if (multiple) {
      if (selectedFiles.length > 0) {
        onSelectMultiple?.(selectedFiles.map((f) => f.url));
      }
      return;
    }

    if (selectedFile) {
      onSelect(selectedFile.url);
    }
  }

  const FILE_TYPE_ICON = {
    image: ImageIcon,
    document: FileText,
    video: Video,
    other: Paperclip,
  } as const;

  const FOLDER_LABEL: Record<keyof typeof FOLDERS, string> = {
    all: 'Todos',
    images: 'Imágenes',
    documents: 'Documentos',
    videos: 'Videos',
    brochures: 'Brochures',
  };


  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Biblioteca de medios"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg border bg-background shadow-lg">

        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Biblioteca de medios</h2>
            <p className="text-sm text-muted-foreground">
              {typeFilter
                ? 'Elige uno o varios archivos para agregarlos a la respuesta'
                : 'Gestiona los archivos que el bot puede enviar'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar biblioteca"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3 border-b p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar archivos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
                aria-label="Buscar archivos"
              />
            </div>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploading ? 'Subiendo...' : 'Subir archivo'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,video/mp4"
            />
          </div>

          {/* El selector de carpeta se oculta cuando el compositor ya pidio un
              tipo: el filtrado debe resolverse como un solo criterio. */}
          {!typeFilter && (
            <div className="flex flex-wrap gap-1">
              {(Object.keys(FOLDERS) as Array<keyof typeof FOLDERS>).map((folder) => (
                <Button
                  type="button"
                  key={folder}
                  size="sm"
                  variant={selectedFolder === folder ? 'default' : 'outline'}
                  onClick={() => setSelectedFolder(folder)}
                >
                  {FOLDER_LABEL[folder]}
                </Button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <FolderOpen className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No hay archivos</p>
              <p className="text-sm text-muted-foreground">
                Sube uno para comenzar
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filteredFiles.map((file) => {
                const selectionOrder = selectedFiles.findIndex((f) => f.path === file.path);
                const isSelected = multiple ? selectionOrder !== -1 : selectedFile?.path === file.path;
                const FileIcon = FILE_TYPE_ICON[file.type];

                return (
                  <div
                    key={file.path}
                    onClick={() => toggleFileSelection(file)}
                    className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-colors ${
                      isSelected ? 'border-primary' : 'border-border hover:border-foreground/30'
                    }`}
                  >
                    <div className="flex aspect-square items-center justify-center bg-muted">
                      {file.type === 'image' ? (
                        <img
                          src={file.url}
                          alt={file.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FileIcon className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>

                    <div className="border-t p-2">
                      <p className="truncate text-xs font-medium" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>

                    <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-1 bg-black/60 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(file.url, '_blank');
                        }}
                        title="Ver archivo"
                        aria-label={`Ver ${file.name}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyURL(file);
                        }}
                        title="Copiar URL"
                        aria-label={`Copiar URL de ${file.name}`}
                      >
                        {copiedPath === file.path ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(file);
                        }}
                        title="Eliminar"
                        aria-label={`Eliminar ${file.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {isSelected && (
                      <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium tabular-nums text-primary-foreground shadow">
                        {multiple ? selectionOrder + 1 : <Check className="h-3.5 w-3.5" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <p className="text-sm text-muted-foreground">
            {multiple && selectedFiles.length > 0
              ? `${selectedFiles.length} archivo(s) seleccionado(s)`
              : !multiple && selectedFile
                ? `${selectedFile.name} seleccionado`
                : `${filteredFiles.length} archivo(s)`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSelection}
              disabled={multiple ? selectedFiles.length === 0 : !selectedFile}
            >
              Seleccionar
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default MediaLibrary;
