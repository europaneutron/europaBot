-- ============================================
-- SEED INICIAL - INTENCIONES Y RESPUESTAS
-- ============================================

-- ============================================
-- 1. INTENT: PRECIO
-- ============================================
INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  priority,
  response_type,
  is_active,
  is_checkpoint
) VALUES (
  'precio',
  'Precio y Costos',
  ARRAY['precio', 'precios', 'costo', 'costos', 'valor', 'cuanto', 'cuánto', 'vale'],
  ARRAY['cotización', 'cotizacion', 'presupuesto', 'monto', 'importe', 'tarifa', 'cantidad'],
  ARRAY['presio', 'preci', 'csto', 'balor', 'cuato', 'bale'],
  ARRAY[
    'cuanto cuesta',
    'cuánto cuesta',
    'cual es el precio',
    'cuál es el precio',
    'que precio tiene',
    'qué precio tiene',
    'cuanto sale',
    'cuánto vale',
    'precio de',
    'costo de'
  ],
  0.75,
  10,
  'text',
  true,
  true
);

INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES 
  ('precio', 'main', '¡Excelente pregunta! 💰 Los departamentos en Europa inician desde $XXX,XXX MXN.

Tenemos diferentes modelos con precios que varían según:
• Tamaño (desde 50m² hasta 120m²)
• Piso y vista
• Acabados

¿Te gustaría conocer el precio de algún modelo en específico?', 1, true),
  
  ('precio', 'followup', 'También ofrecemos opciones de financiamiento flexibles. ¿Te interesa conocer las opciones de crédito disponibles? 🏦', 2, true);

-- ============================================
-- 2. INTENT: UBICACION
-- ============================================
INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  priority,
  response_type,
  is_active,
  is_checkpoint
) VALUES (
  'ubicacion',
  'Ubicación y Dirección',
  ARRAY['ubicacion', 'ubicación', 'donde', 'dónde', 'dirección', 'direccion', 'lugar', 'zona'],
  ARRAY['localización', 'localizacion', 'situado', 'encuentra', 'queda', 'está', 'esta'],
  ARRAY['ubicasion', 'ubication', 'dond', 'direcion', 'dirrección'],
  ARRAY[
    'donde esta',
    'dónde está',
    'donde se encuentra',
    'cual es la dirección',
    'cuál es la dirección',
    'en que zona',
    'en qué zona',
    'como llegar',
    'cómo llegar'
  ],
  0.75,
  9,
  'text',
  true,
  true
);

INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES 
  ('ubicacion', 'main', '📍 Europa está ubicado en [DIRECCIÓN EXACTA], [COLONIA/ZONA], [CIUDAD].

Ventajas de la ubicación:
• A X minutos de [PUNTO DE REFERENCIA]
• Cerca de [CENTROS COMERCIALES/ESCUELAS]
• Acceso rápido a [VIALIDADES PRINCIPALES]
• Zona residencial segura y en crecimiento

¿Te gustaría que te enviara la ubicación exacta en Google Maps?', 1, true),
  
  ('ubicacion', 'maps', 'Te comparto el link directo: [URL DE GOOGLE MAPS]

También puedo programar una visita para que conozcas personalmente el desarrollo. ¿Te interesa?', 2, true);

-- ============================================
-- 3. INTENT: MODELO
-- ============================================
INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  priority,
  response_type,
  is_active,
  is_checkpoint
) VALUES (
  'modelo',
  'Modelos y Tipos',
  ARRAY['modelo', 'modelos', 'tipo', 'tipos', 'departamento', 'departamentos', 'recámara', 'recamara', 'recámaras'],
  ARRAY['unidad', 'unidades', 'opciones', 'variantes', 'plantas', 'diseños', 'habitaciones', 'cuartos'],
  ARRAY['modlo', 'modelo', 'tpo', 'departo', 'recamra'],
  ARRAY[
    'que modelos hay',
    'qué modelos hay',
    'cuantos modelos',
    'cuántos modelos',
    'tipos de departamento',
    'cuantas recamaras',
    'cuántas recámaras',
    'plantas disponibles'
  ],
  0.75,
  8,
  'text',
  true,
  true
);

INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES 
  ('modelo', 'main', '🏠 Contamos con [X] modelos diferentes:

📐 **Modelo A** - [XX]m²
• [X] recámaras, [X] baños
• Desde $XXX,XXX MXN

📐 **Modelo B** - [XX]m²
• [X] recámaras, [X] baños
• Desde $XXX,XXX MXN

📐 **Modelo C** - [XX]m²
• [X] recámaras, [X] baños
• Desde $XXX,XXX MXN

Todos incluyen:
✓ Cocina integral
✓ Closets
✓ Área de lavado
✓ [AMENIDADES INCLUIDAS]

¿Cuál te llama más la atención?', 1, true),
  
  ('modelo', 'followup', 'Puedo enviarte los planos arquitectónicos del modelo que prefieras. ¿Te interesa?', 2, true);

-- ============================================
-- 4. INTENT: CREDITOS
-- ============================================
INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  priority,
  response_type,
  is_active,
  is_checkpoint
) VALUES (
  'creditos',
  'Créditos y Financiamiento',
  ARRAY['credito', 'crédito', 'creditos', 'créditos', 'financiamiento', 'infonavit', 'fovissste', 'banco', 'hipoteca'],
  ARRAY['prestamo', 'préstamo', 'mensualidad', 'mensualidades', 'enganche', 'pagos', 'financiar'],
  ARRAY['credto', 'credito', 'finaciamiento', 'ifonavit', 'ipoteca'],
  ARRAY[
    'acepta credito',
    'acepta crédito',
    'puedo usar infonavit',
    'con que banco',
    'con qué banco',
    'opciones de pago',
    'cuanto de enganche',
    'cuánto de enganche'
  ],
  0.75,
  9,
  'text',
  true,
  true
);

INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES 
  ('creditos', 'main', '💳 ¡Sí! Aceptamos múltiples opciones de financiamiento:

**Créditos Aceptados:**
✅ INFONAVIT
✅ FOVISSSTE
✅ Bancos comerciales (BBVA, Santander, Scotiabank, etc.)
✅ Crédito conyugal (INFONAVIT + FOVISSSTE)

**Opciones de Pago:**
• Enganche desde [X]%
• Financiamiento hasta [X] años
• Mensualidades desde $X,XXX MXN

Contamos con asesores hipotecarios que pueden ayudarte con:
📋 Pre-calificación
📊 Simulador de crédito
📝 Trámites

¿Tienes ya un crédito pre-aprobado o quieres que te ayudemos a gestionarlo?', 1, true),
  
  ('creditos', 'simulator', 'Puedo conectarte con un asesor hipotecario para hacer una simulación personalizada. ¿Te gustaría agendar una llamada?', 2, true);

-- ============================================
-- 5. INTENT: SEGURIDAD
-- ============================================
INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  priority,
  response_type,
  is_active,
  is_checkpoint
) VALUES (
  'seguridad',
  'Seguridad y Vigilancia',
  ARRAY['seguridad', 'vigilancia', 'caseta', 'guardia', 'seguro', 'protección', 'proteccion'],
  ARRAY['resguardo', 'custodia', 'control', 'acceso', 'cámaras', 'camaras', 'privado'],
  ARRAY['seguirdad', 'bigilancia', 'gaurdia', 'proteccion'],
  ARRAY[
    'es seguro',
    'tiene seguridad',
    'hay vigilancia',
    'control de acceso',
    'caseta de vigilancia',
    'camaras de seguridad',
    'cámaras de seguridad'
  ],
  0.75,
  7,
  'text',
  true,
  true
);

INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES 
  ('seguridad', 'main', '🛡️ ¡Tu seguridad es nuestra prioridad!

**Sistemas de Seguridad:**
✓ Caseta de vigilancia 24/7
✓ Circuito cerrado de cámaras (CCTV)
✓ Control de acceso vehicular y peatonal
✓ Bardeo perimetral completo
✓ [SISTEMAS ADICIONALES: Intercomunicador, app, etc.]

**Adicional:**
• Personal de seguridad capacitado
• Registro de visitas
• Iluminación LED en áreas comunes
• [OTROS ELEMENTOS DE SEGURIDAD]

¿Te gustaría conocer más detalles sobre nuestros protocolos de seguridad?', 1, true);

-- ============================================
-- 6. INTENT: BROCHURE
-- ============================================
INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  priority,
  response_type,
  is_active,
  is_checkpoint
) VALUES (
  'brochure',
  'Brochure e Información',
  ARRAY['brochure', 'catalogo', 'catálogo', 'información', 'informacion', 'info', 'folleto', 'pdf', 'documento'],
  ARRAY['detalles', 'ficha', 'prospecto', 'material', 'archivo'],
  ARRAY['broshure', 'brosure', 'catalgo', 'imformacion', 'foleto', 'imfo'],
  ARRAY[
    'tienes brochure',
    'tienes catálogo',
    'enviame información',
    'envíame información',
    'mandame el catalogo',
    'mándame el catálogo',
    'quiero información',
    'mas informacion',
    'más información'
  ],
  0.75,
  6,
  'document',
  true,
  true
);

INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES 
  ('brochure', 'main', '📄 ¡Claro! Te envío la información completa de Europa.

El brochure incluye:
📐 Plantas arquitectónicas
🏗️ Amenidades del desarrollo
📍 Ubicación y accesos
💰 Listado de precios
🏦 Opciones de financiamiento
📸 Galería de imágenes

*Enviando archivo...*', 1, true),
  
  ('brochure', 'followup', '¿Te gustaría agendar una visita al desarrollo para conocerlo personalmente? Puedo mostrarte las unidades disponibles. 🏡', 2, true);

-- ============================================
-- INTENTS ESPECIALES: SALUDOS Y DESPEDIDAS
-- ============================================
INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  priority,
  response_type,
  is_active,
  is_checkpoint
) VALUES (
  'saludo',
  'Saludo Inicial',
  ARRAY['hola', 'buenas', 'buenos', 'saludos', 'hey'],
  ARRAY['buenos dias', 'buenas tardes', 'buenas noches', 'buen dia', 'que tal', 'qué tal'],
  ARRAY['ola', 'benas', 'buens'],
  ARRAY[
    'hola',
    'buenas',
    'buenos dias',
    'buenas tardes',
    'que tal',
    'qué tal'
  ],
  0.70,
  15,
  'text',
  true,
  false
);

INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES 
  ('saludo', 'main', '¡Hola! 👋 Bienvenid@ a **Europa**, tu nuevo hogar.

Soy tu asistente virtual y estoy aquí para ayudarte con:
• Precios y modelos disponibles
• Ubicación y amenidades
• Opciones de financiamiento
• Agendar visitas

¿En qué puedo ayudarte hoy?', 1, true);

INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  priority,
  response_type,
  is_active,
  is_checkpoint
) VALUES (
  'despedida',
  'Despedida',
  ARRAY['gracias', 'adios', 'adiós', 'bye', 'chao', 'nos vemos'],
  ARRAY['muchas gracias', 'ok gracias', 'perfecto', 'listo', 'hasta luego'],
  ARRAY['grasias', 'adio', 'bay'],
  ARRAY[
    'gracias',
    'muchas gracias',
    'ok gracias',
    'adios',
    'adiós',
    'nos vemos'
  ],
  0.70,
  5,
  'text',
  true,
  false
);

INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES 
  ('despedida', 'main', '¡Gracias a ti! 😊

Recuerda que estoy disponible 24/7 para resolver tus dudas sobre Europa.

Si necesitas algo más, solo escríbeme.

¡Que tengas excelente día! 🏡✨', 1, true);

-- ============================================
-- INTENT: CITA/VISITA
-- ============================================
INSERT INTO intent_configurations (
  intent_name,
  display_name,
  keywords,
  synonyms,
  typos,
  phrases,
  min_confidence,
  priority,
  response_type,
  is_active,
  is_checkpoint
) VALUES (
  'cita',
  'Agendar Visita',
  ARRAY['cita', 'visita', 'agendar', 'visitar', 'conocer', 'ver'],
  ARRAY['programar', 'reservar', 'apartado', 'recorrido', 'tour', 'mostrar'],
  ARRAY['sita', 'bisita', 'agendr', 'conoser'],
  ARRAY[
    'quiero agendar',
    'agendar cita',
    'agendar visita',
    'visitar el desarrollo',
    'conocer el lugar',
    'ver departamentos',
    'hacer recorrido'
  ],
  0.75,
  12,
  'text',
  true,
  false
);

INSERT INTO bot_responses (intent_name, response_key, message_text, order_priority, is_active)
VALUES 
  ('cita', 'main', '¡Excelente! 🎉 Me encantaría mostrarte Europa.

Nuestro horario de atención es:
📅 Lunes a Viernes: 9:00 AM - 6:00 PM
📅 Sábados: 10:00 AM - 2:00 PM

¿Qué día te vendría mejor para la visita?

Ejemplos:
• Mañana
• Este sábado
• La próxima semana
• [Fecha específica]', 1, true);

-- ============================================
-- VERIFICACIÓN
-- ============================================
-- Contar intenciones creadas
DO $$
DECLARE
  intent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO intent_count FROM intent_configurations;
  RAISE NOTICE 'Total de intenciones configuradas: %', intent_count;
END $$;
