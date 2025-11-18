/**
 * Media Library Component
 * Biblioteca de medios tipo WordPress para gestionar archivos multimedia
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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
}

const FOLDERS = {
  all: '',
  images: 'images/',
  documents: 'documents/',
  videos: 'videos/',
  brochures: 'brochures/'
};

export default function MediaLibrary({ onSelect, onClose }: MediaLibraryProps) {
  const supabase = createClientComponentClient();
  
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<keyof typeof FOLDERS>('all');
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar archivos al montar el componente
  useEffect(() => {
    loadFiles();
  }, [selectedFolder]);

  // Filtrar archivos por búsqueda
  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      setFilteredFiles(files.filter(f => f.name.toLowerCase().includes(query)));
    } else {
      setFilteredFiles(files);
    }
  }, [searchQuery, files]);

  // Cerrar con tecla ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  async function loadFiles() {
    try {
      setLoading(true);
      setError(null);

      const folder = FOLDERS[selectedFolder];
      const { data, error: listError } = await supabase.storage
        .from('bot-media')
        .list(folder, {
          limit: 100,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (listError) throw listError;

      const filesWithUrls: MediaFile[] = (data || [])
        .filter(item => !item.name.includes('.emptyFolderPlaceholder'))
        .map(item => {
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

      setFiles(filesWithUrls);
      setFilteredFiles(filesWithUrls);

    } catch (err: any) {
      console.error('Error loading files:', err);
      setError(err.message || 'Error al cargar archivos');
    } finally {
      setLoading(false);
    }
  }

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

      setSelectedFile(newFile);

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

    } catch (err: any) {
      console.error('Error deleting file:', err);
      setError(err.message || 'Error al eliminar archivo');
    }
  }

  function handleCopyURL(url: string) {
    navigator.clipboard.writeText(url);
    alert('✅ URL copiada al portapapeles');
  }

  function handleConfirmSelection() {
    if (selectedFile) {
      onSelect(selectedFile.url);
    }
  }

  const getFileIcon = (type: MediaFile['type']) => {
    switch (type) {
      case 'image': return '🖼️';
      case 'document': return '📄';
      case 'video': return '📹';
      default: return '📎';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">📚 Biblioteca de Medios</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex gap-4 mb-3">
            <input
              type="text"
              placeholder="🔍 Buscar archivos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {uploading ? '⏳ Subiendo...' : '📤 Subir Archivo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,video/mp4"
            />
          </div>

          {/* Filtros por carpeta */}
          <div className="flex gap-2">
            {Object.keys(FOLDERS).map((folder) => (
              <button
                key={folder}
                onClick={() => setSelectedFolder(folder as keyof typeof FOLDERS)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedFolder === folder
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                {folder === 'all' && '🗂️ Todos'}
                {folder === 'images' && '🖼️ Imágenes'}
                {folder === 'documents' && '📄 Documentos'}
                {folder === 'videos' && '📹 Videos'}
                {folder === 'brochures' && '📋 Brochures'}
              </button>
            ))}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            ❌ {error}
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-blue-700">Subiendo archivo...</span>
              <span className="text-sm font-medium text-blue-700">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Files Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <span className="text-6xl mb-4">📁</span>
              <p className="text-lg">No hay archivos</p>
              <p className="text-sm">Sube tu primer archivo para comenzar</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredFiles.map((file) => (
                <div
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`relative group cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
                    selectedFile?.path === file.path
                      ? 'border-blue-600 shadow-lg'
                      : 'border-gray-200 hover:border-blue-400'
                  }`}
                >
                  {/* Preview */}
                  <div className="aspect-square bg-gray-100 flex items-center justify-center">
                    {file.type === 'image' ? (
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-5xl">{getFileIcon(file.type)}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2 bg-white">
                    <p className="text-xs font-medium text-gray-900 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>

                  {/* Hover Actions */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(file.url, '_blank');
                      }}
                      className="px-3 py-1 bg-white rounded text-sm hover:bg-gray-100"
                      title="Ver archivo"
                    >
                      👁️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyURL(file.url);
                      }}
                      className="px-3 py-1 bg-white rounded text-sm hover:bg-gray-100"
                      title="Copiar URL"
                    >
                      📋
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(file);
                      }}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                      title="Eliminar"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* Selection indicator */}
                  {selectedFile?.path === file.path && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm">
                      ✓
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedFile ? (
              <span className="font-medium">
                ✓ {selectedFile.name} seleccionado
              </span>
            ) : (
              <span>{filteredFiles.length} archivo(s)</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmSelection}
              disabled={!selectedFile}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              Seleccionar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
