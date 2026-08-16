/**
 * Lee dos PDFs representativos y contrasta los hechos extraidos contra la
 * lista real. Es la comprobacion que justifica la estrategia de entrada
 * nativa: si la tabla o los precios dentro de una imagen no salen, no sirve.
 *
 * Ejecutar con: npx tsx scripts/benchmark-pdf-fixtures.ts <dir-con-los-pdf>
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

config({ path: resolve(process.cwd(), '.env.development.local') });
config({ path: resolve(process.cwd(), '.env.local') });

const HECHOS_REALES = ['1,950,000', '2,350,000', '2,780,000', 'Toscana', 'Milano', 'Verona'];

async function main() {
  const dir = process.argv[2] || resolve(process.cwd(), 'scripts/fixtures/compiler');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error('Solo contra Supabase local');

  const { supabaseServer } = await import('../src/services/supabase/server-client');
  const { documentCompilerService } = await import('../src/core/document-compiler/document-compiler.service');
  const { documentCompilerRepository } = await import('../src/data/repositories/document-compiler.repository');
  const ROOT = '00000000-0000-4000-8000-000000000001';

  for (const [archivo, etiqueta] of [
    ['brochure-tabla.pdf', 'PDF con tabla de precios como texto'],
    ['brochure-imagen.pdf', 'PDF con precios SOLO dentro de una imagen'],
  ] as const) {
    const bytes = readFileSync(resolve(dir, archivo));
    const storagePath = `benchmark/${randomUUID()}.pdf`;
    const up = await supabaseServer.storage.from('compiler-materials')
      .upload(storagePath, bytes, { contentType: 'application/pdf' });
    if (up.error) throw up.error;

    const { data: material, error: matError } = await supabaseServer.from('compiler_materials').insert({
      scope_id: ROOT, material_kind: 'pdf', original_filename: archivo,
      storage_path: storagePath, mime_type: 'application/pdf',
      reading_status: 'ready', checksum: createHash('sha256').update(bytes).digest('hex'),
    }).select('id').single();
    if (matError) throw matError;

    const { data: run, error: runError } = await supabaseServer.from('compiler_runs').insert({
      scope_id: ROOT, material_ids: [material.id], status: 'running', current_stage: 'extract_facts',
    }).select('id').single();
    if (runError) throw runError;

    const inicio = Date.now();
    await documentCompilerService.runNextStage(run.id);
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
    await supabaseServer.from('compiler_runs').update({ current_stage: 'consolidate_facts' }).eq('id', run.id);
    await documentCompilerService.runNextStage(run.id);

    const hechos = await documentCompilerRepository.getFacts(run.id);
    const texto = JSON.stringify(hechos);
    const encontrados = HECHOS_REALES.filter(h => texto.includes(h));

    console.log(`\n=== ${etiqueta} ===`);
    console.log(`  ${hechos.length} hechos en ${segundos}s`);
    console.log(`  de los 6 datos reales encontro: ${encontrados.length} -> ${encontrados.join(', ') || 'ninguno'}`);
    const sinPagina = hechos.filter((h: any) => !h.page_number);
    console.log(`  hechos sin pagina: ${sinPagina.length}`);
    console.log(`  sujetos distintos: ${new Set(hechos.map((h: any) => h.subject).filter(Boolean)).size}`);
    const contradictorios = hechos.filter((h: any) => h.is_contradictory);
    console.log(`  marcados como contradiccion: ${contradictorios.length}`);
    for (const h of contradictorios) {
      console.log(`    ${(h as any).fact_key} [${(h as any).subject ?? '-'}] tipo=${(h as any).fact_type} = ${JSON.stringify((h as any).fact_value)}`);
    }

    await supabaseServer.from('compiler_runs').delete().eq('id', run.id);
    await supabaseServer.from('compiler_materials').delete().eq('id', material.id);
    await supabaseServer.storage.from('compiler-materials').remove([storagePath]);
  }
}

main().catch(e => { console.error('Fallo:', e.message || e); process.exit(1); });
