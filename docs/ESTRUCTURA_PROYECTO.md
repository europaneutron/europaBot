# Estructura del Proyecto - Bot Conversacional Europa

**Última actualización:** 2025-10-21

## 1. Principios de Arquitectura

Este proyecto sigue los principios definidos en `AGENTS.md`:

- **Modularidad**: Cada módulo tiene una única responsabilidad (SRP)
- **Separación de responsabilidades**: Lógica de negocio, datos y presentación claramente separadas
- **Escalabilidad**: Fácil agregar nuevas intenciones, canales o funcionalidades
- **Mantenibilidad**: Código claro, sin duplicación (DRY)
- **Nomenclatura consistente**: camelCase en código, snake_case en base de datos

---

## 2. Stack Tecnológico

```
Frontend/Admin:  Next.js 14 + TypeScript + Tailwind + Shadcn UI
Backend:         Next.js API Routes (Serverless)
Base de datos:   Supabase (PostgreSQL)
Autenticación:   Supabase Auth
Storage:         Supabase Storage
Messaging:       WhatsApp Business API
Hosting:         Vercel
Cron Jobs:       Vercel Cron o Supabase Edge Functions
```

---

## 3. Estructura de Carpetas

```
europabot/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Rutas de autenticación
│   │   │   ├── login/
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/              # Panel administrativo
│   │   │   ├── conversations/
│   │   │   ├── analytics/
│   │   │   ├── settings/
│   │   │   └── layout.tsx
│   │   ├── api/                      # API Routes
│   │   │   ├── webhook/              # Webhook de WhatsApp
│   │   │   │   └── route.ts
│   │   │   ├── cron/                 # Tareas programadas
│   │   │   │   └── followup/
│   │   │   │       └── route.ts
│   │   │   └── internal/             # APIs internas
│   │   │       ├── users/
│   │   │       └── appointments/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── core/                         # Lógica de negocio central
│   │   ├── intent-engine/            # Motor de detección de intenciones
│   │   │   ├── fuzzy-matcher.ts      # Fuzzy matching con Levenshtein
│   │   │   ├── intent-detector.ts    # Detector principal de intenciones
│   │   │   ├── intent-patterns.ts    # Diccionarios de intenciones
│   │   │   └── index.ts
│   │   │
│   │   ├── conversation/             # Gestión de conversaciones
│   │   │   ├── message-processor.ts  # Procesador principal de mensajes
│   │   │   ├── context-manager.ts    # Manejo de contexto conversacional
│   │   │   ├── progress-tracker.ts   # Tracking de checkpoints
│   │   │   └── index.ts
│   │   │
│   │   ├── fallback/                 # Sistema de fallback
│   │   │   ├── fallback-handler.ts   # Manejador de 3 niveles
│   │   │   ├── fallback-messages.ts  # Mensajes por nivel
│   │   │   └── index.ts
│   │   │
│   │   ├── appointment/              # Sistema de agendamiento
│   │   │   ├── appointment-manager.ts
│   │   │   ├── time-slot-parser.ts   # Parseo de días y horarios
│   │   │   └── index.ts
│   │   │
│   │   └── scoring/                  # Lead scoring
│   │       ├── lead-scorer.ts
│   │       └── index.ts
│   │
│   ├── services/                     # Servicios externos e infraestructura
│   │   ├── whatsapp/                 # WhatsApp Business API
│   │   │   ├── client.ts             # Cliente API
│   │   │   ├── message-sender.ts     # Envío de mensajes
│   │   │   ├── template-sender.ts    # Envío de templates
│   │   │   └── webhook-validator.ts  # Validación de webhooks
│   │   │
│   │   ├── supabase/                 # Cliente Supabase
│   │   │   ├── client.ts
│   │   │   ├── server-client.ts
│   │   │   └── types.ts              # Tipos generados
│   │   │
│   │   └── storage/                  # Manejo de archivos
│   │       ├── resource-manager.ts   # PDFs, videos, etc.
│   │       └── index.ts
│   │
│   ├── data/                         # Capa de acceso a datos
│   │   ├── repositories/             # Patrón Repository
│   │   │   ├── user.repository.ts
│   │   │   ├── conversation.repository.ts
│   │   │   ├── progress.repository.ts
│   │   │   ├── appointment.repository.ts
│   │   │   └── followup.repository.ts
│   │   │
│   │   └── models/                   # Modelos de dominio
│   │       ├── user.model.ts
│   │       ├── conversation.model.ts
│   │       ├── appointment.model.ts
│   │       └── intent.model.ts
│   │
│   ├── lib/                          # Utilidades y helpers
│   │   ├── utils/
│   │   │   ├── date-parser.ts        # Parseo de fechas en español
│   │   │   ├── text-normalizer.ts    # Normalización de texto
│   │   │   └── validators.ts
│   │   │
│   │   ├── constants/                # Constantes del sistema
│   │   │   ├── intents.ts
│   │   │   ├── time-slots.ts
│   │   │   └── messages.ts
│   │   │
│   │   └── config/                   # Configuración
│   │       ├── env.ts                # Variables de entorno tipadas
│   │       └── bot-config.ts         # Configuración del bot
│   │
│   ├── components/                   # Componentes React (Dashboard)
│   │   ├── ui/                       # Shadcn UI components
│   │   ├── conversations/
│   │   │   ├── conversation-list.tsx
│   │   │   ├── message-thread.tsx
│   │   │   └── manual-control.tsx
│   │   │
│   │   ├── analytics/
│   │   │   ├── metrics-card.tsx
│   │   │   └── conversion-chart.tsx
│   │   │
│   │   └── layout/
│   │       ├── sidebar.tsx
│   │       └── header.tsx
│   │
│   ├── hooks/                        # Custom React Hooks
│   │   ├── use-conversations.ts
│   │   ├── use-realtime.ts          # Supabase Realtime
│   │   └── use-analytics.ts
│   │
│   └── types/                        # Tipos TypeScript globales
│       ├── intent.types.ts
│       ├── conversation.types.ts
│       ├── appointment.types.ts
│       └── api.types.ts
│
├── supabase/                         # Configuración Supabase
│   ├── migrations/                   # Migraciones SQL
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_progress_tracking.sql
│   │   └── 003_add_appointments.sql
│   │
│   ├── seed.sql                      # Datos de prueba
│   └── config.toml                   # Configuración local
│
├── scripts/                          # Scripts de utilidad
│   ├── seed-intents.ts              # Popular diccionarios
│   └── test-fuzzy.ts                # Probar fuzzy matching
│
├── tests/                            # Tests
│   ├── unit/
│   │   ├── intent-engine/
│   │   └── appointment/
│   │
│   └── integration/
│       └── webhook/
│
├── docs/                             # Documentación técnica
│   ├── API.md
│   ├── DATABASE_SCHEMA.md
│   └── DEPLOYMENT.md
│
├── .env.local.example
├── .env.production.example
├── .gitignore
├── next.config.js
├── tsconfig.json
├── tailwind.config.ts
├── package.json
└── README.md
```

---

## 4. Flujo de Datos

### Mensaje Entrante (Webhook)

```
WhatsApp → Webhook API Route → Message Processor
                                      ↓
                              Intent Detector (Fuzzy Matching)
                                      ↓
                              Progress Tracker
                                      ↓
                        ¿Intent válido? → NO → Fallback Handler
                              ↓ SÍ
                        Conversation Manager
                              ↓
                        Response Generator
                              ↓
                        WhatsApp Message Sender
                              ↓
                        Database (Log conversación)
```

### Dashboard (Admin)

```
Usuario Admin → Next.js App → Supabase Client
                                    ↓
                        User Repository (RLS aplicado)
                                    ↓
                        React Components + Realtime
```

---

## 5. Separación de Responsabilidades

### **Core (Lógica de Negocio)**
- **NO** debe conocer detalles de infraestructura (WhatsApp, Supabase)
- **SÍ** debe contener toda la lógica del bot (intenciones, fallback, scoring)
- Recibe datos ya normalizados
- Retorna decisiones/acciones

### **Services (Infraestructura)**
- **NO** debe contener lógica de negocio
- **SÍ** debe encapsular APIs externas (WhatsApp, Supabase)
- Maneja autenticación, rate limiting, retry logic

### **Data (Acceso a Datos)**
- **Patrón Repository**: abstrae el acceso a la BD
- Permite cambiar implementación sin afectar lógica de negocio
- Maneja queries complejas y optimizaciones

### **API Routes**
- Orquesta servicios y core
- Valida inputs
- Maneja errores HTTP
- Logging y monitoreo

---

## 6. Módulos Clave

### 6.1 Intent Engine (Motor de Intenciones)

**Responsabilidad**: Detectar qué quiere el usuario

```typescript
// src/core/intent-engine/intent-detector.ts
export class IntentDetector {
  detect(message: string, context?: ConversationContext): DetectedIntent | null
}
```

**Componentes**:
- `fuzzy-matcher.ts`: Algoritmo de similitud Levenshtein
- `intent-patterns.ts`: Diccionarios (keywords, sinónimos, typos)
- `intent-detector.ts`: Orquestador principal

### 6.2 Conversation Manager

**Responsabilidad**: Gestionar estado de la conversación

```typescript
// src/core/conversation/message-processor.ts
export class MessageProcessor {
  async process(userId: string, message: string): Promise<BotResponse>
}
```

**Componentes**:
- `message-processor.ts`: Procesador principal
- `context-manager.ts`: Mantiene contexto de últimos N mensajes
- `progress-tracker.ts`: Tracking de checkpoints (6 temas)

### 6.3 Appointment Manager

**Responsabilidad**: Gestionar agendamiento de citas

```typescript
// src/core/appointment/appointment-manager.ts
export class AppointmentManager {
  async requestAppointment(userId: string): Promise<AppointmentFlow>
  async processDay(userId: string, input: string): Promise<AppointmentFlow>
  async processTimeSlot(userId: string, input: string): Promise<AppointmentConfirmation>
}
```

### 6.4 Fallback Handler

**Responsabilidad**: Manejar mensajes no comprendidos

```typescript
// src/core/fallback/fallback-handler.ts
export class FallbackHandler {
  async handle(userId: string, attemptNumber: 1 | 2 | 3): Promise<FallbackResponse>
}
```

---

## 7. Configuración de Intenciones

### Ejemplo: `src/lib/constants/intents.ts`

```typescript
export const INTENT_PATTERNS = {
  precio: {
    keywords: ['precio', 'costo', 'vale', 'cuanto', 'dinero'],
    synonyms: ['cotización', 'presupuesto', 'inversión'],
    typos: ['presio', 'precyo', 'quanto'],
    phrases: ['cuánto cuesta', 'qué precio tiene'],
    minConfidence: 0.75
  },
  // ... otros
} as const;

export const INTENT_TOPICS = {
  precio: 'Información de Precios',
  ubicacion: 'Ubicación del Proyecto',
  modelo: 'Modelos de Casas',
  creditos: 'Financiamiento',
  seguridad: 'Seguridad del Fraccionamiento',
  brochure: 'Material Informativo'
} as const;
```

---

## 8. Variables de Entorno

### `.env.local.example`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# WhatsApp Business API
WHATSAPP_API_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=458574770662643
WHATSAPP_BUSINESS_ACCOUNT_ID=426465080551599
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Cron Secret (para proteger endpoints)
CRON_SECRET=your_random_secret
```

---

## 9. Patrón de Desarrollo

### Agregar Nueva Intención

1. **Actualizar constantes**: `src/lib/constants/intents.ts`
2. **Crear handler**: `src/core/conversation/handlers/nueva-intencion.handler.ts`
3. **Actualizar detector**: Ya funciona automáticamente con fuzzy matching
4. **Agregar tests**: `tests/unit/intent-engine/nueva-intencion.test.ts`

### Agregar Nuevo Canal (ej: Instagram)

1. **Crear servicio**: `src/services/instagram/client.ts`
2. **Crear adapter**: `src/services/instagram/message-adapter.ts`
3. **Crear webhook**: `src/app/api/webhook/instagram/route.ts`
4. **Reutilizar core**: El `MessageProcessor` ya funciona

---

## 10. Testing Strategy

```typescript
// tests/unit/intent-engine/fuzzy-matcher.test.ts
describe('FuzzyMatcher', () => {
  it('should match typo "presio" to intent "precio"', () => {
    const result = fuzzyMatcher.findBestIntent('presio');
    expect(result.intent).toBe('precio');
    expect(result.confidence).toBeGreaterThan(0.7);
  });
});
```

**Capas de testing**:
- **Unit**: Core (intent engine, fallback, scoring)
- **Integration**: API Routes + Supabase
- **E2E**: Flujos completos de conversación

---

## 11. Deployment

### Vercel (Frontend + API)
```bash
vercel --prod
```

### Supabase (Database)
```bash
supabase db push
```

### Environment Variables
Configurar en Vercel Dashboard

---

## 12. Próximos Pasos

1. **Crear estructura de carpetas**: `mkdir -p src/{core,services,data,lib}`
2. **Inicializar Next.js**: `npx create-next-app@latest`
3. **Configurar Supabase**: Crear proyecto y migraciones
4. **Implementar Intent Engine**: Comenzar con fuzzy matching
5. **Crear webhook básico**: Recibir mensajes de WhatsApp

---

**Nota**: Esta estructura es flexible y escalable. Cada módulo puede crecer independientemente sin afectar otros componentes.
