# Plan de Implementación: Mensajes Fragmentados Multimedia

**Fecha:** 22 de octubre de 2025  
**Estado:** Planificación  
**Prioridad:** Alta (MVP)  
**Tiempo estimado:** 2-3 horas

---

## 🎯 Objetivo

Implementar sistema de mensajes fragmentados que simule conversación humana natural, con soporte para múltiples tipos de contenido multimedia (texto, imágenes, documentos, ubicaciones, videos).

---

## 📋 Fases de Implementación

### **FASE 1: Base de Datos** (30 min)

#### 1.1 Migración de Schema
**Archivo:** `supabase/migrations/003_fragmented_messages.sql`

**Cambios:**
- Modificar `bot_responses.message_text` de `TEXT` a `JSONB`
- Agregar columna `bot_responses.response_type` ENUM: `'simple' | 'fragmented'`
- Mantener retrocompatibilidad (strings simples siguen funcionando)

**Estructura JSONB:**
```json
{
  "fragments": [
    {
      "type": "text|image|video|document|location|audio|contact",
      "content": "texto del mensaje",
      "url": "https://...",
      "caption": "descripción",
      "latitude": 19.432608,
      "longitude": -99.133209,
      "name": "nombre del lugar",
      "address": "dirección",
      "filename": "archivo.pdf",
      "delay": 1500
    }
  ]
}
```

**SQL Preview:**
```sql
-- Agregar columna para tipo de respuesta
ALTER TABLE bot_responses 
ADD COLUMN response_type VARCHAR(20) DEFAULT 'simple' CHECK (response_type IN ('simple', 'fragmented'));

-- Convertir message_text a JSONB (mantiene strings actuales)
ALTER TABLE bot_responses 
ALTER COLUMN message_text TYPE JSONB USING message_text::jsonb;

-- Índice para búsquedas en JSONB
CREATE INDEX idx_bot_responses_type ON bot_responses(response_type);
```

---

### **FASE 2: Tipos TypeScript** (15 min)

#### 2.1 Crear tipos para fragmentos
**Archivo:** `src/types/message-fragments.types.ts`

```typescript
export type FragmentType = 
  | 'text' 
  | 'image' 
  | 'video' 
  | 'document' 
  | 'location' 
  | 'audio' 
  | 'contact';

export interface BaseFragment {
  type: FragmentType;
  delay: number; // milisegundos
}

export interface TextFragment extends BaseFragment {
  type: 'text';
  content: string;
}

export interface ImageFragment extends BaseFragment {
  type: 'image';
  url: string;
  caption?: string;
}

export interface VideoFragment extends BaseFragment {
  type: 'video';
  url: string;
  caption?: string;
}

export interface DocumentFragment extends BaseFragment {
  type: 'document';
  url: string;
  filename: string;
  caption?: string;
}

export interface LocationFragment extends BaseFragment {
  type: 'location';
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}

export interface AudioFragment extends BaseFragment {
  type: 'audio';
  url: string;
}

export interface ContactFragment extends BaseFragment {
  type: 'contact';
  name: string;
  phone: string;
  organization?: string;
}

export type MessageFragment = 
  | TextFragment 
  | ImageFragment 
  | VideoFragment 
  | DocumentFragment 
  | LocationFragment 
  | AudioFragment 
  | ContactFragment;

export interface FragmentedResponse {
  fragments: MessageFragment[];
}

export type BotResponse = string | FragmentedResponse;
```

---

### **FASE 3: WhatsApp Message Sender** (45 min)

#### 3.1 Agregar nuevos métodos de envío
**Archivo:** `src/services/whatsapp/message-sender.ts`

**Nuevos métodos a implementar:**

```typescript
// ✅ Ya existe: sendTextMessage()
// ✅ Ya existe: sendDocument()

// 🆕 Agregar:
async sendImage(to: string, imageUrl: string, caption?: string)
async sendVideo(to: string, videoUrl: string, caption?: string)
async sendLocation(to: string, latitude: number, longitude: number, name: string, address: string)
async sendAudio(to: string, audioUrl: string)
async sendContact(to: string, name: string, phone: string, organization?: string)
```

#### 3.2 Implementar envío fragmentado con delays
**Nuevo método principal:**

```typescript
async sendFragmentedMessage(to: string, fragments: MessageFragment[]): Promise<string[]> {
  const messageIds: string[] = [];
  
  for (const fragment of fragments) {
    // Delay antes de enviar (simular escritura)
    if (fragment.delay > 0) {
      await this.sleep(fragment.delay);
    }
    
    // Enviar según tipo
    let messageId: string;
    
    switch (fragment.type) {
      case 'text':
        messageId = await this.sendTextMessage({ to, message: fragment.content });
        break;
      case 'image':
        messageId = await this.sendImage(to, fragment.url, fragment.caption);
        break;
      case 'video':
        messageId = await this.sendVideo(to, fragment.url, fragment.caption);
        break;
      case 'document':
        messageId = await this.sendDocument(to, fragment.url, fragment.caption);
        break;
      case 'location':
        messageId = await this.sendLocation(to, fragment.latitude, fragment.longitude, fragment.name, fragment.address);
        break;
      case 'audio':
        messageId = await this.sendAudio(to, fragment.url);
        break;
      case 'contact':
        messageId = await this.sendContact(to, fragment.name, fragment.phone, fragment.organization);
        break;
    }
    
    messageIds.push(messageId);
  }
  
  return messageIds;
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

### **FASE 4: Repository Layer** (20 min)

#### 4.1 Actualizar ConversationRepository
**Archivo:** `src/data/repositories/conversation.repository.ts`

**Modificar método `getBotResponses()`:**

```typescript
async getBotResponses(intentName: string): Promise<BotResponse[]> {
  const { data, error } = await this.supabase
    .from('bot_responses')
    .select('message_text, response_type')
    .eq('intent_name', intentName)
    .eq('is_active', true)
    .order('order_priority', { ascending: true });

  if (error) throw error;

  return data.map(row => {
    if (row.response_type === 'fragmented') {
      // Es un objeto JSON con fragments
      return row.message_text as FragmentedResponse;
    } else {
      // Es un string simple (retrocompatibilidad)
      return typeof row.message_text === 'string' 
        ? row.message_text 
        : JSON.stringify(row.message_text);
    }
  });
}
```

---

### **FASE 5: Message Processor** (30 min)

#### 5.1 Actualizar lógica de envío
**Archivo:** `src/core/conversation/message-processor.ts`

**Modificar `handleIntent()` y `sendResponse()`:**

```typescript
private async sendResponse(
  phoneNumber: string, 
  response: BotResponse
): Promise<void> {
  if (typeof response === 'string') {
    // Respuesta simple (actual)
    await whatsappSender.sendTextMessage({
      to: phoneNumber,
      message: response
    });
  } else {
    // Respuesta fragmentada (nueva)
    await whatsappSender.sendFragmentedMessage(
      phoneNumber, 
      response.fragments
    );
  }
}
```

---

### **FASE 6: Testing** (30 min)

#### 6.1 Crear script de pruebas
**Archivo:** `scripts/test-fragmented-messages.ts`

```typescript
// Probar diferentes tipos de fragmentos
const testCases = [
  {
    name: "Solo texto fragmentado",
    fragments: [
      { type: "text", content: "Hola", delay: 800 },
      { type: "text", content: "¿Cómo estás?", delay: 1000 }
    ]
  },
  {
    name: "Texto + Imagen + Ubicación",
    fragments: [
      { type: "text", content: "Europa está aquí:", delay: 1000 },
      { type: "location", latitude: 19.432608, longitude: -99.133209, delay: 1500 },
      { type: "image", url: "...", caption: "Fachada", delay: 2000 }
    ]
  }
];
```

#### 6.2 Actualizar interfaz de testing
**Archivo:** `src/app/test/page.tsx`

Agregar selector para probar respuestas fragmentadas vs simples.

---

## 🎨 Ejemplos de Uso Real

### Ejemplo 1: Intent "ubicacion"
```json
{
  "fragments": [
    {
      "type": "text",
      "content": "¡Excelente pregunta! 📍 Europa se encuentra en una ubicación privilegiada",
      "delay": 800
    },
    {
      "type": "location",
      "latitude": 19.432608,
      "longitude": -99.133209,
      "name": "Residencial Europa",
      "address": "Av. Masaryk 123, Polanco, CDMX",
      "delay": 1500
    },
    {
      "type": "image",
      "url": "https://storage.supabase.co/v1/object/public/europa/fachada.jpg",
      "caption": "Vista desde la entrada principal",
      "delay": 2000
    },
    {
      "type": "text",
      "content": "Estamos a 5 minutos de:\n• Parque Lincoln\n• Antara Polanco\n• Museo Soumaya\n\n¿Te gustaría agendar una visita?",
      "delay": 1500
    }
  ]
}
```

### Ejemplo 2: Intent "brochure"
```json
{
  "fragments": [
    {
      "type": "text",
      "content": "¡Con gusto! 📄 Te envío toda la información",
      "delay": 800
    },
    {
      "type": "document",
      "url": "https://storage.supabase.co/v1/object/public/europa/brochure_2025.pdf",
      "filename": "Europa_Brochure_2025.pdf",
      "caption": "Aquí está el brochure completo con planos, amenidades y precios",
      "delay": 2000
    },
    {
      "type": "text",
      "content": "¿Tienes alguna pregunta sobre lo que viste en el documento?",
      "delay": 1500
    }
  ]
}
```

### Ejemplo 3: Intent "precio" (simple al inicio)
```json
{
  "fragments": [
    {
      "type": "text",
      "content": "¡Excelente pregunta! 💰",
      "delay": 800
    },
    {
      "type": "text",
      "content": "Los departamentos en Europa inician desde $2,500,000 MXN",
      "delay": 1500
    },
    {
      "type": "text",
      "content": "Tenemos diferentes modelos:\n• 1 recámara: desde $2.5M\n• 2 recámaras: desde $3.8M\n• 3 recámaras: desde $5.2M",
      "delay": 2000
    },
    {
      "type": "text",
      "content": "¿Te interesa conocer algún modelo en particular?",
      "delay": 1200
    }
  ]
}
```

---

## ⚙️ Configuración Recomendada

### Delays sugeridos por tipo:
- **Texto corto** (<50 chars): 800-1200ms
- **Texto medio** (50-150 chars): 1500-2000ms
- **Texto largo** (>150 chars): 2000-2500ms
- **Media** (imagen/video/doc): 1500-2000ms
- **Ubicación**: 1000-1500ms

### Límites de seguridad:
- Máximo 5 fragmentos por respuesta (evitar spam)
- Delay mínimo: 500ms
- Delay máximo: 3000ms
- Timeout total: 15 segundos

---

## 🚀 Prioridad de Implementación MVP

### ✅ Alta prioridad (implementar YA):
1. **Texto fragmentado** - Base conversacional
2. **Imágenes** - Visual impact
3. **Documentos** - Ya existe, solo integrar
4. **Ubicaciones** - Clave para real estate

### ⏳ Media prioridad (v1.1):
5. **Videos** - Mejor como links de YouTube/Vimeo
6. **Audio** - Notas de voz del asesor

### 🔮 Baja prioridad (futuro):
7. **Contactos** - Cuando haya asignación de agentes

---

## 📊 Retrocompatibilidad

**Importante:** El sistema debe soportar AMBOS formatos:

```typescript
// Formato antiguo (sigue funcionando)
"Hola, ¿en qué puedo ayudarte?"

// Formato nuevo
{
  "fragments": [
    { "type": "text", "content": "Hola", "delay": 800 },
    { "type": "text", "content": "¿En qué puedo ayudarte?", "delay": 1000 }
  ]
}
```

---

## ✅ Checklist de Implementación

- [ ] Migración SQL aplicada
- [ ] Tipos TypeScript creados
- [ ] Métodos de WhatsApp agregados (image, video, location)
- [ ] `sendFragmentedMessage()` implementado
- [ ] Repository actualizado
- [ ] Message Processor modificado
- [ ] Script de testing creado
- [ ] Pruebas locales exitosas
- [ ] Documentación actualizada
- [ ] Respuestas de ejemplo creadas en BD
- [ ] Testing en WhatsApp real
- [ ] Deploy a producción

---

## 🎯 Resultado Esperado

**Antes:**
```
Usuario: "donde esta"
Bot: [mensaje largo de 200 palabras] 💬
```

**Después:**
```
Usuario: "donde esta"
Bot: "¡Excelente pregunta! 📍"
[typing... 1s]
Bot: "Europa se encuentra en Polanco"
[typing... 1.5s]
Bot: 📍 [pin de ubicación en mapa]
[typing... 2s]
Bot: 🖼️ [foto de fachada]
[typing... 1.5s]
Bot: "¿Te gustaría agendar una visita?"
```

**Impacto:** Conversación 10x más natural y engagement significativamente mayor.

---

**Última actualización:** 22 de octubre de 2025  
**Próximo paso:** Implementar Fase 1 (Migración SQL)
