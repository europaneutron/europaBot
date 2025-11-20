/**
 * Página de diagnóstico de upload
 * Prueba permisos y configuración de Supabase Storage
 */

'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function TestUploadPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${message}`]);
  };

  const runDiagnostics = async () => {
    setTesting(true);
    setLogs([]);
    addLog('🔍 Iniciando diagnósticos...');

    try {
      // 1. Verificar sesión
      addLog('📋 Test 1: Verificar sesión de usuario');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        addLog(`❌ Error obteniendo sesión: ${sessionError.message}`);
      } else if (!session) {
        addLog('❌ No hay sesión activa - usuario no autenticado');
        addLog('💡 Solución: Inicia sesión primero en /login');
        setTesting(false);
        return;
      } else {
        addLog(`✅ Sesión activa: ${session.user.email}`);
        addLog(`   - User ID: ${session.user.id}`);
        addLog(`   - Role: ${session.user.role}`);
        addLog(`   - Token expira: ${new Date(session.expires_at! * 1000).toLocaleString()}`);
      }

      // 2. Verificar bucket
      addLog('\n📋 Test 2: Verificar bucket bot-media');
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) {
        addLog(`❌ Error listando buckets: ${bucketsError.message}`);
      } else {
        const botMediaBucket = buckets?.find(b => b.id === 'bot-media');
        if (botMediaBucket) {
          addLog(`✅ Bucket 'bot-media' existe`);
          addLog(`   - Público: ${botMediaBucket.public}`);
          addLog(`   - Límite de tamaño: ${(botMediaBucket.file_size_limit || 0) / 1024 / 1024}MB`);
        } else {
          addLog('❌ Bucket bot-media NO existe');
          addLog('💡 Solución: Ejecutar migración 016_media_storage_bucket.sql');
        }
      }

      // 3. Listar archivos (test de permisos de lectura)
      addLog('\n📋 Test 3: Listar archivos en bot-media');
      const { data: files, error: listError } = await supabase.storage
        .from('bot-media')
        .list('', { limit: 5 });
      
      if (listError) {
        addLog(`❌ Error listando archivos: ${listError.message}`);
      } else {
        addLog(`✅ Permiso de lectura OK (${files?.length || 0} archivos encontrados)`);
      }

      // 4. Test de upload con archivo tiny
      addLog('\n📋 Test 4: Test de upload (archivo de prueba)');
      const testFileName = `test-upload-${Date.now()}.txt`;
      const testFile = new File(['Test content from diagnostic'], testFileName, { type: 'text/plain' });
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('bot-media')
        .upload(`documents/${testFileName}`, testFile, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) {
        addLog(`❌ Error en upload: ${uploadError.message}`);
        addLog(`   - Código: ${(uploadError as any).statusCode || 'N/A'}`);
        
        if (uploadError.message.includes('row-level security')) {
          addLog('\n🔍 DIAGNÓSTICO: Problema de RLS (Row Level Security)');
          addLog('   Causas posibles:');
          addLog('   1. Token de sesión no tiene rol "authenticated"');
          addLog('   2. Políticas RLS mal configuradas');
          addLog('   3. Usuario no está realmente autenticado en Supabase');
          addLog('\n💡 Soluciones:');
          addLog('   - Cierra sesión y vuelve a iniciar sesión');
          addLog('   - Verifica políticas en Dashboard > Storage > Policies');
          addLog('   - Ejecuta migración 017_fix_storage_policies.sql');
        }
      } else {
        addLog(`✅ Upload exitoso!`);
        addLog(`   - Path: ${uploadData.path}`);
        addLog(`   - ID: ${uploadData.id}`);
        
        // 5. Test de delete
        addLog('\n📋 Test 5: Test de delete');
        const { error: deleteError } = await supabase.storage
          .from('bot-media')
          .remove([`documents/${testFileName}`]);
        
        if (deleteError) {
          addLog(`⚠️ No se pudo eliminar archivo de prueba: ${deleteError.message}`);
        } else {
          addLog('✅ Delete exitoso - archivo de prueba eliminado');
        }
      }

      addLog('\n✅ Diagnósticos completados');

    } catch (error: any) {
      addLog(`❌ Error general: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🔧 Diagnóstico de Upload - Supabase Storage</h1>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="font-semibold text-blue-900 mb-2">ℹ️ Instrucciones</h2>
        <p className="text-sm text-blue-800">
          Esta página verifica permisos y configuración de Supabase Storage.
          <br />
          Ejecuta los diagnósticos para identificar problemas de upload.
        </p>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={runDiagnostics}
          disabled={testing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {testing ? '🔄 Ejecutando...' : '▶️ Ejecutar Diagnósticos'}
        </button>
        
        <button
          onClick={clearLogs}
          disabled={testing}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
        >
          🗑️ Limpiar
        </button>
      </div>

      <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm overflow-auto max-h-[600px]">
        {logs.length === 0 ? (
          <p className="text-gray-500">Presiona "Ejecutar Diagnósticos" para comenzar...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="mb-1 whitespace-pre-wrap">
              {log}
            </div>
          ))
        )}
      </div>

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-900 mb-2">📚 Referencias</h3>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• Bucket: <code className="bg-yellow-100 px-1 rounded">bot-media</code></li>
          <li>• Carpetas: images/, documents/, videos/, brochures/</li>
          <li>• Políticas RLS: 4 (SELECT public, INSERT/UPDATE/DELETE authenticated)</li>
          <li>• Migración: 017_fix_storage_policies.sql</li>
        </ul>
      </div>
    </div>
  );
}
