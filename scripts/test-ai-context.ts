import { config } from 'dotenv';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import type { AiContextData } from '../src/data/repositories/ai-context.repository';
import type { Scope } from '../src/data/models/scope.model';
import type { CatalogValue } from '../src/data/models/catalog-value.model';
import { assertLocalSupabase, buildFymsaContextData, withFymsaFixture } from './helpers/fymsa-fixture';
import { interpolateMessage, toMessageVariables } from '../src/lib/interpolate-message';
import type { ContextResponseRow } from '../src/data/repositories/conversation.repository';

config({ quiet: true, path: resolve(process.cwd(), '.env.development.local') });
config({ quiet: true, path: resolve(process.cwd(), '.env.local') });

function faqBlocks(prompt: string): Map<string, string> {
  const faq = prompt.split('# Preguntas frecuentes\n')[1] || '';
  return new Map(faq.split(/^## /m).filter(Boolean).map(block => {
    const [path, ...lines] = block.trimEnd().split('\n');
    return [path, '\n' + lines.join('\n') + '\n'];
  }));
}

/** Cada texto puede aparecer en varias rutas solo cuando tiene autoría propia en ellas. */
function assertFaqAuthorship(data: AiContextData, prompt: string) {
  const pathFor = (scope: Scope): string => {
    const names: string[] = [];
    let current: Scope | undefined = scope;
    while (current?.parent_id) {
      names.unshift(current.name);
      current = data.scopes.find(candidate => candidate.id === current!.parent_id);
    }
    return names.join(' > ') || data.brand.business_name?.trim() || 'Negocio';
  };
  const authors = new Map<string, Set<string>>();
  for (const content of data.contents) {
    for (const response of content.responses.filter(row => row.scope_id === content.scope.id)) {
      const raw = response.message_text;
      let text = typeof raw === 'string' ? raw : '';
      if (raw && typeof raw === 'object') {
        const object = raw as { text?: string; fragments?: Array<{ type: string; content?: string; caption?: string }> };
        text = object.fragments
          ? object.fragments.map(item => item.type === 'text' ? item.content : item.caption).filter(Boolean).join('\n')
          : object.text || '';
      }
      const rendered = interpolateMessage(text, {
        ...toMessageVariables(response.variables), ...data.qualifiedVariables, ...content.variables,
      });
      if (!rendered.complete || !rendered.value.trim()) continue;
      const entry = response.intent_name + ': ' + rendered.value.trim();
      const paths = authors.get(entry) || new Set<string>();
      paths.add(pathFor(content.scope));
      authors.set(entry, paths);
    }
  }
  for (const [entry, paths] of Array.from(authors)) {
    for (const [path, body] of Array.from(faqBlocks(prompt))) {
      if (body.includes('\n' + entry + '\n')) {
        assert(paths.has(path), `FAQ heredada repetida en ${path}: ${entry}`);
      }
    }
  }
}

async function main() {
  assertLocalSupabase();
  const { buildAiContext, buildContextFromData, buildPersona } = await import('../src/core/ai-conversation/context-builder');
  const { buildTurnMessage } = await import('../src/core/ai-conversation/turn-message-builder');
  const { loadAiContextData } = await import('../src/data/repositories/ai-context.repository');
  const { ROOT_SCOPE_ID } = await import('../src/data/repositories/scope.repository');
  const { formatCatalogValueForProse } = await import('../src/data/repositories/catalog-value.repository');

  const scope = (id: string, name: string, parentId: string | null): Scope => ({
    id, name, parent_id: parentId, slug: name, scope_type: 'development',
    is_active: true, metadata: {}, created_at: '', updated_at: '',
  });
  const scopes = [
    scope(ROOT_SCOPE_ID, 'Negocio', null),
    scope('europa', 'Europa', ROOT_SCOPE_ID),
    scope('solara', 'Solara', 'europa'),
    scope('altabrisa', 'Altabrisa', ROOT_SCOPE_ID),
  ];
  const value = (id: string, scopeId: string, key: string, amount: string | number): CatalogValue => ({
    id, scope_id: scopeId, value_key: key, value: amount,
    value_type: typeof amount === 'number' ? 'money' : 'text', unit: null,
    edited_by_human: false, edited_by: null, edited_at: null, created_at: '', updated_at: '',
  });
  const row = (id: string, message: unknown, navigation = false): ContextResponseRow => ({
    id, intent_id: 'ubicacion', intent_name: 'ubicacion', scope_id: 'solara',
    message_text: message, variables: {}, is_navigation: navigation, order_priority: 0,
  });
  const responses = [
    row('valid', 'Está en {direccion}. Precio: {precio}.'),
    row('missing', 'Dato {faltante}'),
    row('marker-x', '[X] modelos'), row('marker-xx', '[XX] metros'),
    row('marker-money', '$XXX,XXX'), row('marker-money-short', '$XXX'),
    row('marker-upper', '[DIRECCIÓN DEL DESARROLLO]'),
    row('marker-lower', '• [Fecha específica]'), row('marker-name', 'Hola [nombre], bienvenido'),
    row('marker-long', '[Dirección sucursal en Tabasco]'),
    row('link-ok', 'Mira el mapa en [ver ubicación](https://maps.example.test/x)'),
    row('empty', '  '), row('navigation', 'Opciones', true),
    row('buttons', { fragments: [{ type: 'text', content: 'Información válida' }], buttons: [{ label: '{boton_faltante}' }] }),
  ];
  const fixture: AiContextData = {
    scopes,
    appointmentScopeIds: [],
    catalog: [value('address', 'europa', 'direccion', 'Calle del Parque'), value('price', 'solara', 'precio', 2350000)],
    qualifiedVariables: {},
    contents: scopes.map((item): AiContextData['contents'][number] => ({
      scope: item,
      variables: item.id === 'solara' ? { direccion: 'Calle del Parque', precio: '$2,350,000' } : {},
      responses: item.id === 'solara' ? responses : [],
      resources: [],
    })),
    persona: {},
    brand: {
      root_scope_id: ROOT_SCOPE_ID, business_name: 'Inmobiliaria de prueba',
      project_singular: 'desarrollo', project_plural: 'desarrollos', tone: 'friendly',
      is_configured: true, use_composed_greeting: true, created_at: '', updated_at: '',
    },
  };
  const built = buildContextFromData(fixture);
  assert(built.systemPrompt.startsWith('# Persona'));
  const capabilities = (prompt: string) => prompt.split('# Capacidades\n')[1].split('# Catálogo')[0];
  assert(!capabilities(built.systemPrompt).includes('flujo de visita'));
  assert(!capabilities(built.systemPrompt).includes('adjuntar los recursos'));
  const withSlots = buildContextFromData({ ...fixture, appointmentScopeIds: ['europa'] });
  assert(capabilities(withSlots.systemPrompt).includes('flujo de visita en Europa'));
  assert(!capabilities(withSlots.systemPrompt).includes('flujo de visita en Altabrisa'));
  const brochure = {
    id: 'pdf', scope_id: 'altabrisa', title: 'Catálogo', resource_type: 'document',
    file_url: 'https://example.test/catalogo.pdf', external_url: null, file_path: null,
    description: null, intent_category: null, file_size: null, mime_type: 'application/pdf',
    is_active: true, usage_count: 0, created_at: '', updated_at: '',
  };
  const withResources = buildContextFromData({ ...fixture,
    contents: fixture.contents.map(content => ({ ...content,
      resources: content.scope.id === 'altabrisa' ? [brochure] : [],
    })),
  });
  assert(capabilities(withResources.systemPrompt).includes('Puedes enviar el brochure de Altabrisa (archivo: Catálogo);'));
  assert(!capabilities(withResources.systemPrompt).includes('Puedes enviar el brochure de Europa'));
  assert(!capabilities(withResources.systemPrompt).includes('brochure de Europa'));

  // En datos reales el PDF solo existe como fragmento document dentro de una respuesta.
  const brochureRow = (id: string, scopeId: string, intent: string, fragments: unknown[]): ContextResponseRow => ({
    id, intent_id: id, intent_name: intent, scope_id: scopeId, variables: {}, is_navigation: false,
    order_priority: 0, message_text: { fragments },
  });
  const text = (content: string) => ({ type: 'text', delay: 0, content });
  const pdf = (name: string) => ({ type: 'document', delay: 0, url: `https://example.test/files/17_${name}`, filename: name });
  const withDocument = (rows: ContextResponseRow[]) => buildContextFromData({ ...fixture,
    contents: fixture.contents.map(content => ({ ...content,
      responses: content.scope.id === 'europa' ? rows : content.responses,
    })),
  });
  const documentOnly = withDocument([
    brochureRow('b1', 'europa', 'ubicacion', [text('Estamos en la Avenida'), pdf('plano.pdf')]),
    brochureRow('b2', 'europa', 'brochure', [text('Te comparto el brochure de Europa'), pdf('europa.pdf'), text('¿Algo más?')]),
  ]);
  assert(capabilities(documentOnly.systemPrompt).includes('Puedes enviar el brochure de Europa (archivo: europa.pdf);'));
  assert(!capabilities(documentOnly.systemPrompt).includes('plano.pdf'));
  assert(!capabilities(documentOnly.systemPrompt).includes('brochure de Altabrisa'));
  assert.deepEqual(documentOnly.developments.map(item => [item.name, item.hasResources]), [['Altabrisa', false], ['Europa', true]]);
  assert(documentOnly.systemPrompt.includes('brochure: Te comparto el brochure de Europa\n¿Algo más?'));
  assert(!documentOnly.systemPrompt.includes('europa.pdf', documentOnly.systemPrompt.indexOf('# Preguntas frecuentes')));
  assert(!documentOnly.systemPrompt.includes('https://example.test/files'));
  // Sin intención brochure, cualquier respuesta activa del alcance con documento cuenta.
  const otherIntent = withDocument([brochureRow('b3', 'europa', 'ubicacion', [text('Mapa'), pdf('plano.pdf')])]);
  assert(otherIntent.developments.find(item => item.name === 'Europa')!.hasResources);
  assert(capabilities(otherIntent.systemPrompt).includes('(archivo: plano.pdf)'));
  // Un fragmento document sin url o sin filename no es un brochure utilizable.
  const broken = withDocument([brochureRow('b4', 'europa', 'brochure', [{ type: 'document', delay: 0, url: '', filename: 'x.pdf' }, { type: 'document', delay: 0, url: 'https://example.test/x.pdf' }])]);
  assert(!broken.developments.find(item => item.name === 'Europa')!.hasResources);
  const { resolveBrochureDocuments, documentResponse, attachmentNames } = await import('../src/core/ai-conversation/brochure');
  const sourceRows = (scopeId: string) => scopeId === 'solara'
    ? [brochureRow('s', 'solara', 'brochure', [pdf('solara.pdf')])] : [brochureRow('e', 'europa', 'brochure', [pdf('europa.pdf')])];
  assert.deepEqual(resolveBrochureDocuments(['solara', 'europa'], sourceRows).map(item => item.filename), ['solara.pdf']);
  assert.deepEqual(resolveBrochureDocuments(['altabrisa', 'europa'], sourceRows).map(item => item.filename), ['europa.pdf']);
  const sent = documentResponse(resolveBrochureDocuments(['europa'], sourceRows));
  assert.deepEqual(sent, [{ fragments: [{ type: 'document', url: 'https://example.test/files/17_europa.pdf', filename: 'europa.pdf', delay: 0 }] }]);
  assert.deepEqual(attachmentNames(sent), ['europa.pdf']);
  assert.deepEqual(attachmentNames([{ text: 'Catálogo', media_url: 'https://example.test/9_catalogo.pdf', media_type: 'document' }]), ['catalogo.pdf']);
  const { executeAiTool } = await import('../src/core/ai-conversation/tools');
  const europaOnly = [{ id: 'europa', name: 'Europa', hasResources: true, hasAppointments: false }];
  const toolResult = await executeAiTool({ name: 'enviar_brochure', input: {} }, europaOnly, {
    loadDevelopments: async () => europaOnly, appointment: async () => { throw new Error('no'); },
    advisor: async () => { throw new Error('no'); }, brochure: async () => sent,
  });
  assert(!toolResult.isError && toolResult.fact.includes('archivo: europa.pdf'), toolResult.fact);

  assert(built.systemPrompt.includes('Europa > Solara > precio: $2,350,000'));
  assert(built.systemPrompt.includes('Europa > direccion: Calle del Parque'));
  assert(!built.systemPrompt.includes('Europa > Solara > direccion:'));
  assert(built.systemPrompt.includes('Está en Calle del Parque. Precio: $2,350,000.'));
  assert(built.systemPrompt.includes('Información válida'));
  assert(!built.systemPrompt.includes('boton_faltante'));
  assert.equal(built.excluded.length, 11);
  assert(built.systemPrompt.includes('[ver ubicación](https://maps.example.test/x)'));
  assert.deepEqual(new Set(built.excluded.map(item => item.reason)),
    new Set(['unresolved_variables', 'template_marker', 'empty', 'navigation']));
  assert.deepEqual(built.developmentNames, ['Altabrisa', 'Europa']);
  assert.equal(built.catalogBlocks.find(block => block.developmentName === 'Altabrisa')?.text, '## Altabrisa');
  assert.equal(built.contextSizeChars, built.systemPrompt.length);
  const reordered = buildContextFromData({
    ...fixture, scopes: [...scopes].reverse(), catalog: [...fixture.catalog].reverse(),
    contents: [...fixture.contents].reverse().map(content => ({ ...content, responses: [...content.responses].reverse() })),
  });
  assert(Buffer.from(built.systemPrompt).equals(Buffer.from(reordered.systemPrompt)));
  assert(buildPersona({ ai_persona_register: 'usted', ai_persona_emojis: 'no' }, 'Marca').includes('Hablas de usted.'));
  assert(buildPersona({ ai_persona_name: 'Ana', ai_persona_length: 'corta' }, 'Marca').includes('como máximo una pregunta'));
  const turn = {
    now: new Date('2026-10-20T18:30:00Z'), adOrigin: 'Europa',
    hasActiveAppointment: true, shouldOfferAppointment: true,
  };
  const turnMessage = buildTurnMessage(turn);
  assert.equal(turnMessage.role, 'system');
  assert(turnMessage.content.includes('martes, 20 de octubre de 2026'));
  assert(!turnMessage.content.includes('12:30'));
  assert(turnMessage.content.includes('America/Mexico_City'));
  assert(turnMessage.content.includes('anuncio de Europa'));
  assert(turnMessage.content.includes('Visita agendada de la persona'));
  assert(turnMessage.content.includes('se le confirmó al agendarla'), 'la cita lleva la razón por la que no hace falta repetirla');
  assert(!turnMessage.content.includes('propones la visita'), 'con visita agendada no se propone otra');
  const withoutAppointment = { ...turn, hasActiveAppointment: false };
  assert(buildTurnMessage(withoutAppointment).content.includes('propones la visita'));
  assert(!buildTurnMessage({ ...withoutAppointment, shouldOfferAppointment: false }).content.includes('propones la visita'));
  const detailed = buildTurnMessage({ ...turn, appointment: { date: 'jueves 22 de octubre', hours: 'de 12:00 a 15:00 h', development: 'Europa Residencial' } }).content;
  assert(detailed.includes('jueves 22 de octubre, de 12:00 a 15:00 h, en Europa Residencial'));
  assert(buildTurnMessage({ ...turn, now: new Date('2026-10-21T03:00:00Z') }).content.includes('martes, 20 de octubre'));
  assert(buildTurnMessage({ ...turn, now: new Date('2026-10-21T03:00:00Z'), timeZone: 'UTC' }).content.includes('miércoles, 21 de octubre'));

  const fymsaData = await buildFymsaContextData();
  const fymsa = buildContextFromData(fymsaData);
  assertFaqAuthorship(fymsaData, fymsa.systemPrompt);
  const blocks = faqBlocks(fymsa.systemPrompt);
  assert.equal(Array.from(blocks.values()).filter(text => text.includes('Europa esta en Avenida')).length, 1);
  assert.equal(Array.from(blocks.values()).filter(text => text.includes('Europa tiene caseta')).length, 1);
  assert(!blocks.get('Europa > Modelo Solara')!.includes('ubicacion:'));
  assert(!/agendar_visita|hablar_con_asesor|enviar_brochure/.test(fymsa.systemPrompt));

  // Simula un consumidor antiguo que entrega respuestas resueltas por herencia.
  const europa = fymsaData.contents.find(item => item.scope.name === 'Europa')!;
  const solara = fymsaData.contents.find(item => item.scope.name === 'Modelo Solara')!;
  const withInherited: AiContextData = {
    ...fymsaData,
    contents: fymsaData.contents.map(item => item === solara
      ? { ...item, responses: [...item.responses, ...europa.responses] } : item),
  };
  const inheritedPrompt = buildContextFromData(withInherited).systemPrompt;
  assert.equal(inheritedPrompt, fymsa.systemPrompt);
  assertFaqAuthorship(withInherited, inheritedPrompt);
  const security = europa.responses.find(row => row.intent_name === 'seguridad')!;
  const withAuthoredCopy: AiContextData = {
    ...fymsaData,
    contents: fymsaData.contents.map(item => item === solara ? {
      ...item,
      responses: [...item.responses, { ...security, id: 'authored-copy', scope_id: item.scope.id }],
    } : item),
  };
  const authoredPrompt = buildContextFromData(withAuthoredCopy).systemPrompt;
  assertFaqAuthorship(withAuthoredCopy, authoredPrompt);
  assert.equal(Array.from(faqBlocks(authoredPrompt).values()).filter(text => text.includes('Europa tiene caseta')).length, 2);
  assert.throws(() => assertFaqAuthorship(fymsaData, authoredPrompt), /FAQ heredada repetida/);
  assert.deepEqual(fymsa.developmentNames, ['Altabrisa', 'Europa']);
  assert(fymsa.systemPrompt.includes('Europa > Modelo Solara > precio: $2,980,000'));
  assert(fymsa.systemPrompt.includes('Modelo Aura: desde $1,850,000, 3 recamaras y 2 banos.'));
  assert.deepEqual(fymsa.moneyValues, [780000, 1420000, 1780000, 1850000, 2340000, 2980000]);

  // La opción pura permite revisar formato y exclusiones sin abrir conexiones.
  if (process.argv.includes('--pure')) {
    if (process.argv.includes('--print-prompt')) console.log(fymsa.systemPrompt);
    console.log('Contexto y mensaje de turno: verificaciones puras correctas.');
    return;
  }
  await withFymsaFixture(async () => {
    const data = await loadAiContextData();
    const first = buildContextFromData(data);
    const second = await buildAiContext();
    assertFaqAuthorship(data, first.systemPrompt);
    assert.deepEqual(first.developmentNames, ['Altabrisa', 'Europa']);
    assert(first.moneyValues.includes(1850000));
    if (process.argv.includes('--print-prompt')) console.log(first.systemPrompt);
    assert(Buffer.from(first.systemPrompt).equals(Buffer.from(second.systemPrompt)),
      'Dos cargas consecutivas deben producir exactamente los mismos bytes.');
    for (const entry of data.catalog) {
      const names: string[] = [];
      let current = data.scopes.find(item => item.id === entry.scope_id);
      while (current && current.id !== ROOT_SCOPE_ID) {
        names.unshift(current.name);
        current = data.scopes.find(item => item.id === current!.parent_id);
      }
      const scopePath = names.join(' > ') || data.brand.business_name?.trim() || 'Negocio';
      assert(first.systemPrompt.includes(`${scopePath} > ${entry.value_key}: ${formatCatalogValueForProse(entry)}`));
    }
    let inherited = 0;
    for (const content of data.contents) {
      const parent = data.scopes.find(item => item.id === content.scope.parent_id);
      if (!parent || parent.id === ROOT_SCOPE_ID) continue;
      for (const entry of data.catalog.filter(item => item.scope_id === parent.id)) {
        if (data.catalog.some(item => item.scope_id === content.scope.id && item.value_key === entry.value_key)) continue;
        assert.equal(content.variables[entry.value_key], formatCatalogValueForProse(entry));
        inherited++;
      }
    }
    assert(inherited > 0, 'El catálogo local debe incluir datos de desarrollo heredados por sus modelos.');
    console.log(`Contexto local: ${first.contextSizeChars} caracteres, ${first.excluded.length} exclusiones, ${inherited} valores heredados verificados.`);
  });
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
