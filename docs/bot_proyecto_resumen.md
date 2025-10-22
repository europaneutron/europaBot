# 🧠 Proyecto de Bot Conversacional Inteligente sin IA

**Fecha:** 2025-10-21
**Última actualización:** 2025-10-21

## 🎯 Objetivo del Proyecto

Desarrollar un bot inteligente (sin usar IA) que pueda interactuar con usuarios vía **WhatsApp** para proporcionar información relevante sobre un desarrollo inmobiliario (precios, ubicación, modelos, agenda de citas, etc.), calificar el interés del usuario y derivar a un asesor cuando sea necesario. El sistema será **modular, escalable y mantenible**, con lógica basada en intenciones mediante un **motor de reglas inteligente con detección fuzzy y flujo no-lineal**.

---

## 🧰 Tecnologías a utilizar

| Herramienta / Servicio | Uso |
|------------------------|-----|
| **Vercel + Next.js** | Hosting y lógica backend + panel admin |
| **Supabase** | Base de datos, Auth y Storage |
| **API Oficial de WhatsApp Business** | Canal de comunicación |
| **Node.js / Typescript** | Lógica de backend modular |
| **Tailwind + Shadcn UI** | Panel administrativo visual |
| **Cron / Workers** | Tareas automatizadas (seguimiento, timeout, etc.) |

---

## 🗃️ Elementos en la base de datos (Supabase)

### Tablas principales:

- **users**: Información general del usuario (número, nombre, estado actual, fecha último mensaje, lead score).
- **conversations**: Historial de mensajes con timestamps e intenciones detectadas.
- **intents_log**: Registro de cada intención detectada por mensaje.
- **user_progress**: Temas completados por usuario (precio, ubicación, modelo, créditos, seguridad, brochure).
- **appointments**: Agendas confirmadas con día preferido, rango horario y status.
- **scheduled_followups**: Mensajes de seguimiento automático programados.
- **resources**: PDFs, videos, textos o links clasificados por tipo e intención.
- **bot_status**: Control de si el bot está activo o pausado por usuario.
- **sessions**: Control conversacional (intentos de fallback, último estado, contexto).

---

## ⚙️ Funcionalidades Principales

### Sistema Inteligente No-Lineal
- **Orden flexible de preguntas**: El usuario puede preguntar en cualquier orden sin seguir un flujo rígido.
- **Tracking de completitud**: Sistema de checkpoints que registra qué información ya recibió el usuario.
- **Oferta de cita condicional**: Solo cuando el usuario ha completado al menos 4 de 6 temas principales.

### Motor de Detección Inteligente
- **Fuzzy Matching**: Tolerancia a errores de escritura usando algoritmo de distancia Levenshtein (70% de similitud mínima).
- **Detección de sinónimos**: Diccionario extenso por cada intención (precio, cotización, presupuesto, costo, etc.).
- **Análisis contextual**: Considera mensajes previos para mejorar la comprensión.
- **Errores comunes mexicanos**: Detección específica de typos regionales (presio, ubicasion, kredito, etc.).

### Fallback Inteligente de 3 Niveles
1. **Intento 1**: Pregunta de clarificación con sugerencias específicas.
2. **Intento 2**: Menú visual de opciones principales.
3. **Intento 3**: Derivación a asesor humano con captura de datos.

### Sistema de Agendamiento Simplificado
- **Día preferido**: A partir del día siguiente a la consulta.
- **Rangos horarios**:
  - Temprano: 9:00 - 11:00
  - Media tarde: 12:00 - 15:00
  - Tarde: 16:00 - 19:00
- **Confirmación automática**: Envío de plantilla de WhatsApp con detalles de la cita.

### Re-engagement Automático
- **Seguimiento programado**: Mensajes automáticos si el usuario no responde (2h, 1 día, 3 días, 7 días).
- **Mensajes contextuales**: Basados en el último tema de interés del usuario.

### Dashboard Administrativo
- **Vista de conversaciones activas**: Historial completo por usuario.
- **Lead scoring**: Calificación automática basada en nivel de interés.
- **Métricas en tiempo real**: Tasa de respuesta, temas más consultados, conversiones a cita.
- **Control manual**: Pausar bot y tomar control de conversación cuando sea necesario.

---

## 🔁 Flujos Principales

### 1. Flujo de Conversación Inteligente No-Lineal

```
Usuario envía mensaje
    ↓
Webhook captura mensaje
    ↓
Motor de Fuzzy Matching analiza intención
    ↓
¿Intent detectado? ──NO──→ Fallback (intento 1, 2 o 3)
    ↓ SÍ
¿Ya completó este tema? ──SÍ──→ "Ya te di esa info, ¿algo más?"
    ↓ NO
Entrega información del tema
    ↓
Marca tema como completado
    ↓
¿Completó 4+ de 6 temas? ──SÍ──→ Ofrece agendar cita
    ↓ NO
Espera siguiente mensaje del usuario
```

### 2. Flujo de Agendamiento

```
Usuario acepta agendar cita
    ↓
Bot: "¿Qué día prefieres? (desde mañana)"
    ↓
Usuario: "Mañana" / "Lunes" / "15 de octubre"
    ↓
Bot: "¿Qué horario? 1) Temprano 2) Media tarde 3) Tarde"
    ↓
Usuario: "1" / "Temprano" / "En la mañana"
    ↓
Guarda cita en BD
    ↓
Envía plantilla de confirmación WhatsApp
    ↓
Programa recordatorio (1 día antes)
```

### 3. Flujo de Fallback Inteligente

```
Mensaje no entendido
    ↓
¿Intento fallback?
    │
    ├─ Intento 1: "No estoy seguro si preguntas por X, Y o Z..."
    │              [Botones: Precio | Ubicación | Modelos]
    │
    ├─ Intento 2: "Te muestro el menú principal:"
    │              [Menú completo de opciones]
    │
    └─ Intento 3: "Te conectaré con un asesor"
                   → Captura nombre y horario preferido
                   → Notifica a asesor
                   → Pausa bot para ese usuario
```

### 4. Flujo de Re-engagement

```
Usuario no responde
    ↓
Espera 2 horas → Mensaje: "¿Sigues interesado en [último tema]?"
    ↓ Sin respuesta
Espera 1 día → Mensaje: "Tengo más info sobre [proyecto]"
    ↓ Sin respuesta
Espera 3 días → Mensaje: "¿Te gustaría agendar una visita?"
    ↓ Sin respuesta
Espera 7 días → Mensaje final: "Cuando gustes, aquí estoy"
    ↓
Marca lead como frío (score bajo)
```

---

## 🧩 Motor Inteligente de Detección de Intenciones

### Estructura de Intenciones con Fuzzy Matching

```ts
import { distance as levenshtein } from 'fastest-levenshtein';

const intentPatterns = {
  precio: {
    keywords: ['precio', 'costo', 'vale', 'cuanto', 'dinero', 'pagar', 'inversión'],
    synonyms: ['cotización', 'presupuesto', 'valor', 'sale'],
    typos: ['presio', 'precyo', 'quanto', 'cuánto'],
    phrases: ['cuánto cuesta', 'qué precio tiene', 'me sale en', 'cuál es el costo'],
    confidence: 0.85
  },
  ubicacion: {
    keywords: ['ubicación', 'donde', 'dirección', 'lugar', 'zona'],
    synonyms: ['localización', 'dónde está', 'sector', 'área', 'colonia'],
    typos: ['ubicasion', 'hubicacion', 'adonde'],
    phrases: ['dónde está', 'cómo llegar', 'en qué parte', 'donde queda'],
    confidence: 0.85
  },
  modelo: {
    keywords: ['modelo', 'tipo', 'plano', 'distribución', 'casa'],
    synonyms: ['diseño', 'prototipo', 'estilo', 'construcción'],
    typos: ['modelos', 'tipos'],
    phrases: ['cómo son', 'qué modelos hay', 'tipos de casa'],
    confidence: 0.80
  },
  creditos: {
    keywords: ['crédito', 'financiamiento', 'banco', 'infonavit', 'fovissste'],
    synonyms: ['préstamo', 'hipoteca', 'mensualidad', 'enganche'],
    typos: ['creditto', 'kredito', 'finaciamiento'],
    phrases: ['aceptan crédito', 'qué bancos', 'puedo financiar'],
    confidence: 0.85
  },
  seguridad: {
    keywords: ['seguridad', 'seguro', 'zona', 'privada', 'caseta'],
    synonyms: ['vigilancia', 'protección', 'fraccionamiento'],
    typos: ['seguirdad', 'seguros'],
    phrases: ['es seguro', 'hay caseta', 'zona segura', 'vigilancia'],
    confidence: 0.80
  },
  brochure: {
    keywords: ['información', 'brochure', 'folleto', 'catálogo', 'pdf'],
    synonyms: ['material', 'documentos', 'detalles', 'datos'],
    typos: ['imformacion', 'brosure'],
    phrases: ['envía información', 'tienes folleto', 'más detalles'],
    confidence: 0.75
  }
};

const fuzzyMatcher = {
  findBestIntent: (message: string) => {
    const normalizedMessage = message.toLowerCase().trim();
    const scores = [];
    
    for (const [intentName, intent] of Object.entries(intentPatterns)) {
      let score = 0;
      
      // 1. Match exacto de keywords
      const keywordMatch = intent.keywords.some(k => normalizedMessage.includes(k));
      if (keywordMatch) score += 40;
      
      // 2. Match de sinónimos
      const synonymMatch = intent.synonyms.some(s => normalizedMessage.includes(s));
      if (synonymMatch) score += 35;
      
      // 3. Match de frases completas
      const phraseMatch = intent.phrases.some(p => normalizedMessage.includes(p));
      if (phraseMatch) score += 45;
      
      // 4. Fuzzy matching con typos conocidos
      const fuzzyMatch = intent.typos.some(typo => {
        const similarity = 1 - (levenshtein(normalizedMessage, typo) / Math.max(normalizedMessage.length, typo.length));
        return similarity > 0.7;
      });
      if (fuzzyMatch) score += 30;
      
      // 5. Fuzzy matching con keywords
      const fuzzyKeywordMatch = intent.keywords.some(keyword => {
        const words = normalizedMessage.split(' ');
        return words.some(word => {
          const similarity = 1 - (levenshtein(word, keyword) / Math.max(word.length, keyword.length));
          return similarity > 0.75;
        });
      });
      if (fuzzyKeywordMatch) score += 25;
      
      scores.push({ intent: intentName, score, confidence: intent.confidence });
    }
    
    // Ordenar por score y retornar el mejor match
    scores.sort((a, b) => b.score - a.score);
    
    // Retornar null si el score más alto es muy bajo
    return scores[0].score > 20 ? scores[0] : null;
  }
};
```

### Flujo de Procesamiento No-Lineal

```ts
const processMessage = async (userId: string, message: string) => {
  // 1. Obtener progreso del usuario
  const userProgress = await getUserProgress(userId);
  const session = await getSession(userId);
  
  // 2. Detectar intención con fuzzy matching
  const detectedIntent = fuzzyMatcher.findBestIntent(message);
  
  // 3. Si no se detecta intención → fallback
  if (!detectedIntent) {
    return handleFallback(userId, session.fallbackAttempts);
  }
  
  // 4. Resetear contador de fallback si hubo match exitoso
  await resetFallbackCounter(userId);
  
  // 5. Verificar si ya completó este tema
  if (userProgress.completedTopics[detectedIntent.intent]) {
    return {
      message: "Ya te compartí esa información anteriormente. ¿Hay algo más que te gustaría saber?",
      showMenu: true
    };
  }
  
  // 6. Entregar información del tema
  const response = await deliverTopicInfo(detectedIntent.intent);
  
  // 7. Marcar como completado
  await markTopicAsCompleted(userId, detectedIntent.intent);
  
  // 8. Verificar si está listo para cita (4 de 6 temas)
  const completedCount = Object.values(userProgress.completedTopics).filter(Boolean).length;
  if (completedCount >= 4 && !userProgress.appointmentOffered) {
    response.message += "\n\n¿Te gustaría agendar una cita para conocer el proyecto personalmente?";
    await markAppointmentOffered(userId);
  }
  
  return response;
};
```

### Sistema de Agendamiento

```ts
const appointmentFlow = {
  timeSlots: {
    temprano: { start: '09:00', end: '11:00', label: 'Temprano (9:00 - 11:00)' },
    mediaTarde: { start: '12:00', end: '15:00', label: 'Media tarde (12:00 - 15:00)' },
    tarde: { start: '16:00', end: '19:00', label: 'Tarde (16:00 - 19:00)' }
  },
  
  requestAppointment: async (userId: string) => {
    return {
      message: "Perfecto, ¿qué día prefieres para tu cita? (a partir de mañana)",
      nextStep: 'waiting_day'
    };
  },
  
  processDay: async (userId: string, dayMessage: string) => {
    const preferredDay = parseDay(dayMessage); // "mañana", "lunes", "15 de octubre", etc.
    
    return {
      message: `Excelente, ¿en qué horario te acomoda mejor?\n\n` +
               `1️⃣ Temprano (9:00 - 11:00)\n` +
               `2️⃣ Media tarde (12:00 - 15:00)\n` +
               `3️⃣ Tarde (16:00 - 19:00)`,
      nextStep: 'waiting_time'
    };
  },
  
  confirmAppointment: async (userId: string, day: string, timeSlot: string) => {
    // Guardar en BD
    await saveAppointment(userId, day, timeSlot);
    
    // Enviar plantilla de WhatsApp
    await sendWhatsAppTemplate(userId, 'appointment_confirmation', {
      day,
      timeSlot: appointmentFlow.timeSlots[timeSlot].label,
      location: 'Fraccionamiento Europa'
    });
    
    return {
      message: `¡Listo! Tu cita está confirmada para el ${day} en horario ${appointmentFlow.timeSlots[timeSlot].label}. Te enviaré un recordatorio un día antes.`,
      completed: true
    };
  }
};
```

---

## 🔗 Servicios Sugeridos

| Servicio | Función |
|----------|---------|
| **Meta Cloud API / 360Dialog / Gupshup** | Conexión a WhatsApp Business |
| **Supabase Auth + RLS** | Seguridad y permisos por rol (asesores) |
| **Vercel Serverless Functions** | Webhooks, procesamiento modular |
| **Cron Jobs (Vercel o Supabase Edge Functions)** | Recordatorios y seguimiento automático |
| **Supabase Storage** | PDFs, imágenes, videos para respuestas |

---

## ✅ Roadmap de Desarrollo

### Fase 1: Core del Bot (Semanas 1-3)
1. **Configuración inicial**
   - Crear proyecto Next.js + Vercel
   - Configurar Supabase (DB + Auth + Storage)
   - Conectar WhatsApp Business API

2. **Motor de intenciones**
   - Implementar fuzzy matching con Levenshtein
   - Crear diccionarios de intenciones (6 temas principales)
   - Sistema de detección de errores comunes mexicanos

3. **Base de datos**
   - Crear tablas: users, conversations, user_progress, sessions
   - Implementar RLS (Row Level Security)
   - Seeders con datos de prueba

### Fase 2: Lógica Conversacional (Semanas 4-5)
4. **Flujo no-lineal**
   - Sistema de checkpoints por tema
   - Tracking de progreso del usuario
   - Lógica de oferta de cita (4 de 6 temas)

5. **Sistema de fallback**
   - 3 niveles de fallback progresivo
   - Derivación a asesor humano
   - Pausar/reactivar bot por usuario

6. **Agendamiento simplificado**
   - Selección de día (desde mañana)
   - Selección de horario (3 rangos)
   - Plantilla de confirmación WhatsApp

### Fase 3: Automatización (Semana 6)
7. **Re-engagement**
   - Cron jobs con Vercel o Supabase Edge Functions
   - Mensajes programados (2h, 1d, 3d, 7d)
   - Lógica de mensajes contextuales

8. **Recursos y contenido**
   - Upload de PDFs, videos a Supabase Storage
   - Sistema de envío por intención
   - Links de ubicación GPS

### Fase 4: Dashboard Administrativo (Semanas 7-8)
9. **Panel básico**
   - Login con Supabase Auth
   - Vista de conversaciones activas
   - Historial por usuario

10. **Métricas y control**
    - Lead scoring automático
    - Tasa de conversión a cita
    - Temas más consultados
    - Control manual: pausar bot, tomar conversación

### Fase 5: Testing y Deployment (Semanas 9-10)
11. **Pruebas**
    - Tests de intenciones con variaciones
    - Simulación de conversaciones completas
    - Validación de agendamiento

12. **Optimización**
    - Ajuste de diccionarios según datos reales
    - Mejora de respuestas
    - Documentación técnica

---

## 📊 Métricas de Éxito Esperadas

| Métrica | Objetivo |
|---------|----------|
| Comprensión de intenciones | 90-95% |
| Automatización de consultas | 75-85% |
| Conversión a cita | 25-35% |
| Recuperación con re-engagement | 15-25% |
| Satisfacción del usuario | >4/5 |

---

## 🎯 Temas de Información (6 Checkpoints)

1. **Precio**: Costo de lotes y casas, formas de pago
2. **Ubicación**: Dirección, GPS, cómo llegar
3. **Modelo**: Distribución de casas, tamaño de lotes
4. **Créditos**: Bancos aceptados, Infonavit, Fovissste
5. **Seguridad**: Fraccionamiento privado, vigilancia, caseta
6. **Brochure**: PDF completo con toda la información

---

© 2025 - Neutrón Digital / Leonardo Gordillo