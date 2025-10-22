# Guía de Implementación - Bot Europa

**Objetivo**: Guía paso a paso para implementar el bot desde cero.  
**Última actualización**: 2025-10-21

---

## Fase 1: Setup Inicial (Semana 1)

### 1.1 Crear Proyecto Next.js

```bash
# Crear proyecto
npx create-next-app@latest europabot --typescript --tailwind --app --use-npm

cd europabot

# Instalar dependencias principales
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
npm install fastest-levenshtein
npm install date-fns
npm install zod

# Dependencias de desarrollo
npm install -D @types/node

# Nota: Usaremos fastest-levenshtein para fuzzy matching
# Es la opción más rápida y ligera (5KB, escrita en C++)
# Performance: ~2ms para procesar 1000 comparaciones
```

---

### 1.2 Configurar Supabase

```bash
# Instalar CLI de Supabase
npm install -g supabase

# Inicializar proyecto local
supabase init

# Conectar a proyecto remoto (si ya existe)
supabase link --project-ref your-project-ref
```

**Crear proyecto en Supabase.com**:
1. Ir a https://supabase.com/dashboard
2. Crear nuevo proyecto
3. Guardar las credenciales

---

### 1.3 Variables de Entorno

Crear `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# WhatsApp
WHATSAPP_API_TOKEN=EAB5uTpjspNQBPrcPfS657pz8XmREClzIcq0YHIYPDZBhl8daW73NXUNZAsNhB6rpFZCeTmjqEE0tFAezj18p9dcm5Pt7RmlyxArkDFjZBAhFCZBa79iL8LxTWRO33cM6y7iEr08xrVCurskYtMWM77afVirZBVEk4KEjcaBBByXGjWZArZC5ZBbdLmiEZBwd09wQZDZD
WHATSAPP_PHONE_NUMBER_ID=458574770662643
WHATSAPP_BUSINESS_ACCOUNT_ID=426465080551599
WHATSAPP_WEBHOOK_VERIFY_TOKEN=europa_bot_verify_token_2025

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=your-random-secret-here
```

---

### 1.4 Estructura de Carpetas

```bash
mkdir -p src/{core,services,data,lib,types}
mkdir -p src/core/{intent-engine,conversation,fallback,appointment,scoring}
mkdir -p src/services/{whatsapp,supabase,storage}
mkdir -p src/data/{repositories,models}
mkdir -p src/lib/{utils,constants,config}
```

---

## Fase 2: Base de Datos (Semana 1)

### 2.1 Crear Migración Inicial

Crear archivo `supabase/migrations/20251021000000_initial_schema.sql`:

```sql
-- Ver contenido completo en DATABASE_SCHEMA.md

-- Tablas principales
CREATE TABLE users (...);
CREATE TABLE user_sessions (...);
CREATE TABLE user_progress (...);
CREATE TABLE conversations (...);
CREATE TABLE intents_log (...);
CREATE TABLE appointments (...);
CREATE TABLE scheduled_followups (...);
CREATE TABLE resources (...);
CREATE TABLE bot_status (...);

-- Índices y triggers
-- ...
```

### 2.2 Aplicar Migración

```bash
# Local
supabase db reset

# Producción
supabase db push
```

### 2.3 Generar Tipos TypeScript

```bash
# Generar tipos desde el esquema
supabase gen types typescript --local > src/types/database.types.ts
```

---

## Fase 3: Core - Intent Engine (Semana 2)

### 3.1 Crear Constantes de Intenciones

`src/lib/constants/intents.ts`:

```typescript
export const INTENT_PATTERNS = {
  precio: {
    keywords: ['precio', 'costo', 'vale', 'cuanto', 'dinero', 'pagar'],
    synonyms: ['cotización', 'presupuesto', 'inversión', 'valor'],
    typos: ['presio', 'precyo', 'quanto', 'cuánto'],
    phrases: ['cuánto cuesta', 'qué precio tiene', 'me sale en'],
    minConfidence: 0.75
  },
  ubicacion: {
    keywords: ['ubicación', 'donde', 'dirección', 'lugar', 'zona'],
    synonyms: ['localización', 'dónde está', 'sector', 'área'],
    typos: ['ubicasion', 'hubicacion', 'adonde'],
    phrases: ['dónde está', 'cómo llegar', 'en qué parte'],
    minConfidence: 0.75
  },
  // ... resto de intenciones
} as const;

export type IntentName = keyof typeof INTENT_PATTERNS;
```

---

### 3.2 Implementar Fuzzy Matcher

`src/core/intent-engine/fuzzy-matcher.ts`:

```typescript
import { distance } from 'fastest-levenshtein';
import { INTENT_PATTERNS, IntentName } from '@/lib/constants/intents';

export interface FuzzyMatchResult {
  intent: IntentName;
  confidence: number;
  matchedKeywords: string[];
}

export class FuzzyMatcher {
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remover acentos
  }

  findBestIntent(message: string): FuzzyMatchResult | null {
    const normalized = this.normalizeText(message);
    const words = normalized.split(/\s+/);
    
    const scores: Array<{
      intent: IntentName;
      score: number;
      matchedKeywords: string[];
    }> = [];

    for (const [intentName, pattern] of Object.entries(INTENT_PATTERNS)) {
      let score = 0;
      const matched: string[] = [];

      // 1. Exact keyword match
      for (const keyword of pattern.keywords) {
        if (normalized.includes(this.normalizeText(keyword))) {
          score += 40;
          matched.push(keyword);
        }
      }

      // 2. Synonym match
      for (const synonym of pattern.synonyms) {
        if (normalized.includes(this.normalizeText(synonym))) {
          score += 35;
          matched.push(synonym);
        }
      }

      // 3. Phrase match
      for (const phrase of pattern.phrases) {
        if (normalized.includes(this.normalizeText(phrase))) {
          score += 45;
          matched.push(phrase);
        }
      }

      // 4. Fuzzy matching con typos conocidos
      for (const typo of pattern.typos) {
        const normalizedTypo = this.normalizeText(typo);
        for (const word of words) {
          const similarity = 1 - (distance(word, normalizedTypo) / 
            Math.max(word.length, normalizedTypo.length));
          
          if (similarity > 0.75) {
            score += 30;
            matched.push(typo);
            break;
          }
        }
      }

      // 5. Fuzzy matching con keywords
      for (const keyword of pattern.keywords) {
        const normalizedKeyword = this.normalizeText(keyword);
        for (const word of words) {
          const similarity = 1 - (distance(word, normalizedKeyword) / 
            Math.max(word.length, normalizedKeyword.length));
          
          if (similarity > 0.70 && similarity <= 0.99) {
            score += 25;
            matched.push(keyword);
            break;
          }
        }
      }

      if (score > 0) {
        scores.push({
          intent: intentName as IntentName,
          score,
          matchedKeywords: [...new Set(matched)]
        });
      }
    }

    // Ordenar por score
    scores.sort((a, b) => b.score - a.score);

    // Retornar mejor match si supera umbral mínimo
    if (scores.length > 0 && scores[0].score > 20) {
      const best = scores[0];
      const pattern = INTENT_PATTERNS[best.intent];
      
      // Normalizar confidence a 0-1
      const confidence = Math.min(best.score / 100, 1);
      
      if (confidence >= pattern.minConfidence) {
        return {
          intent: best.intent,
          confidence,
          matchedKeywords: best.matchedKeywords
        };
      }
    }

    return null;
  }
}
```

---

### 3.3 Crear Intent Detector

`src/core/intent-engine/intent-detector.ts`:

```typescript
import { FuzzyMatcher, FuzzyMatchResult } from './fuzzy-matcher';

export interface DetectedIntent {
  intent: string;
  confidence: number;
  matchedKeywords: string[];
  timestamp: Date;
}

export class IntentDetector {
  private fuzzyMatcher: FuzzyMatcher;

  constructor() {
    this.fuzzyMatcher = new FuzzyMatcher();
  }

  detect(message: string): DetectedIntent | null {
    const result = this.fuzzyMatcher.findBestIntent(message);
    
    if (!result) {
      return null;
    }

    return {
      intent: result.intent,
      confidence: result.confidence,
      matchedKeywords: result.matchedKeywords,
      timestamp: new Date()
    };
  }
}
```

---

## Fase 4: Repositorios (Semana 2)

### 4.1 Cliente Supabase

`src/services/supabase/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

---

### 4.2 User Repository

`src/data/repositories/user.repository.ts`:

```typescript
import { supabaseAdmin } from '@/services/supabase/client';
import { Database } from '@/types/database.types';

type User = Database['public']['Tables']['users']['Row'];
type UserInsert = Database['public']['Tables']['users']['Insert'];

export class UserRepository {
  async findByPhone(phoneNumber: string): Promise<User | null> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data;
  }

  async create(userData: UserInsert): Promise<User> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert(userData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateLastInteraction(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ last_interaction_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;
  }

  async updateLeadScore(userId: string, score: number): Promise<void> {
    let status = 'cold';
    if (score >= 60) status = 'hot';
    else if (score >= 30) status = 'warm';

    const { error } = await supabaseAdmin
      .from('users')
      .update({ 
        lead_score: score,
        lead_status: status 
      })
      .eq('id', userId);

    if (error) throw error;
  }
}
```

---

### 4.3 Progress Repository

`src/data/repositories/progress.repository.ts`:

```typescript
import { supabaseAdmin } from '@/services/supabase/client';
import { IntentName } from '@/lib/constants/intents';

export class ProgressRepository {
  async getProgress(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No existe, crear uno nuevo
      return this.createProgress(userId);
    }

    if (error) throw error;
    return data;
  }

  private async createProgress(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('user_progress')
      .insert({ user_id: userId })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async markTopicCompleted(userId: string, topic: IntentName): Promise<void> {
    const columnName = `${topic}_completed`;
    const timestampColumn = `${topic}_completed_at`;

    const { error } = await supabaseAdmin
      .from('user_progress')
      .update({
        [columnName]: true,
        [timestampColumn]: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) throw error;
  }

  async isTopicCompleted(userId: string, topic: IntentName): Promise<boolean> {
    const progress = await this.getProgress(userId);
    const columnName = `${topic}_completed`;
    return progress[columnName] || false;
  }

  async getCompletedCount(userId: string): Promise<number> {
    const progress = await this.getProgress(userId);
    
    let count = 0;
    if (progress.precio_completed) count++;
    if (progress.ubicacion_completed) count++;
    if (progress.modelo_completed) count++;
    if (progress.creditos_completed) count++;
    if (progress.seguridad_completed) count++;
    if (progress.brochure_completed) count++;
    
    return count;
  }
}
```

---

## Continúa en próximo mensaje...

**Nota**: Esta es la implementación paso a paso. ¿Quieres que continúe con las siguientes fases (Webhook, WhatsApp Service, Message Processor)?
