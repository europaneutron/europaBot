# Plan: Checkpoints Completamente Dinamicos (Fase 2)

## Estado Actual (Fase 1 Completada)

La UI del dashboard ahora obtiene los checkpoints dinamicamente desde `intent_configurations.is_checkpoint = true`.

**Limitacion actual:** La tabla `user_progress` tiene columnas fijas:
- `precio_completed`, `ubicacion_completed`, `modelo_completed`, etc.
- Si agregas un nuevo checkpoint en la UI, necesitas una migracion para agregar la columna correspondiente.

---

## Objetivo Fase 2

Permitir agregar/quitar checkpoints desde la interfaz **sin necesidad de migraciones de base de datos**.

---

## Solucion Propuesta

### Opcion A: Tabla separada `user_checkpoint_completions` (Recomendada)

```sql
CREATE TABLE user_checkpoint_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intent_name VARCHAR(50) NOT NULL REFERENCES intent_configurations(intent_name) ON DELETE CASCADE,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, intent_name)
);

CREATE INDEX idx_checkpoint_completions_user ON user_checkpoint_completions(user_id);
CREATE INDEX idx_checkpoint_completions_intent ON user_checkpoint_completions(intent_name);
```

**Ventajas:**
- Completamente dinamico
- No requiere migraciones al agregar checkpoints
- Historico de cuando se completo cada checkpoint
- Facil de consultar y mantener

**Desventajas:**
- Requiere migracion inicial
- Cambios en repositorios y servicios

### Opcion B: Campo JSONB en user_progress

```sql
ALTER TABLE user_progress 
ADD COLUMN checkpoint_completions JSONB DEFAULT '{}';
-- Ejemplo: {"precio": "2024-12-02T10:30:00Z", "ubicacion": "2024-12-02T11:00:00Z"}
```

**Ventajas:**
- Cambio minimo en estructura
- Una sola columna para todos los checkpoints

**Desventajas:**
- Menos tipado, mas propenso a errores
- Queries menos eficientes

---

## Plan de Implementacion (Opcion A)

### Paso 1: Crear migracion
```sql
-- migrations/021_dynamic_checkpoints.sql

-- 1. Crear nueva tabla
CREATE TABLE user_checkpoint_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intent_name VARCHAR(50) NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, intent_name)
);

CREATE INDEX idx_checkpoint_completions_user ON user_checkpoint_completions(user_id);

-- 2. Migrar datos existentes
INSERT INTO user_checkpoint_completions (user_id, intent_name, completed_at)
SELECT user_id, 'precio', precio_completed_at FROM user_progress WHERE precio_completed = true;

INSERT INTO user_checkpoint_completions (user_id, intent_name, completed_at)
SELECT user_id, 'ubicacion', ubicacion_completed_at FROM user_progress WHERE ubicacion_completed = true;

INSERT INTO user_checkpoint_completions (user_id, intent_name, completed_at)
SELECT user_id, 'modelo', modelo_completed_at FROM user_progress WHERE modelo_completed = true;

INSERT INTO user_checkpoint_completions (user_id, intent_name, completed_at)
SELECT user_id, 'creditos', creditos_completed_at FROM user_progress WHERE creditos_completed = true;

INSERT INTO user_checkpoint_completions (user_id, intent_name, completed_at)
SELECT user_id, 'seguridad', seguridad_completed_at FROM user_progress WHERE seguridad_completed = true;

INSERT INTO user_checkpoint_completions (user_id, intent_name, completed_at)
SELECT user_id, 'brochure', brochure_completed_at FROM user_progress WHERE brochure_completed = true;

-- 3. (Opcional) Eliminar columnas antiguas despues de verificar
-- ALTER TABLE user_progress DROP COLUMN precio_completed, precio_completed_at, ...
```

### Paso 2: Actualizar user.repository.ts

```typescript
// Nuevo metodo
async markCheckpointCompleted(userId: string, intentName: string): Promise<void> {
  await supabaseServer
    .from('user_checkpoint_completions')
    .upsert({
      user_id: userId,
      intent_name: intentName,
      completed_at: new Date().toISOString()
    }, { onConflict: 'user_id,intent_name' });
}

async isCheckpointCompleted(userId: string, intentName: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from('user_checkpoint_completions')
    .select('id')
    .eq('user_id', userId)
    .eq('intent_name', intentName)
    .single();
  
  return !!data;
}

async getCompletedCheckpoints(userId: string): Promise<string[]> {
  const { data } = await supabaseServer
    .from('user_checkpoint_completions')
    .select('intent_name')
    .eq('user_id', userId);
  
  return data?.map(c => c.intent_name) || [];
}

async countCompletedCheckpoints(userId: string): Promise<number> {
  const { count } = await supabaseServer
    .from('user_checkpoint_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  
  return count || 0;
}
```

### Paso 3: Eliminar CheckpointKey type

El type `CheckpointKey` ya no seria necesario, se usaria `string` directamente.

### Paso 4: Actualizar hook use-conversations.ts

```typescript
// En lugar de mapear con progress[key], hacer join con user_checkpoint_completions
const { data: completions } = await supabase
  .from('user_checkpoint_completions')
  .select('intent_name')
  .eq('user_id', userId);

const completedSet = new Set(completions?.map(c => c.intent_name) || []);

const checkpoints = (checkpointIntents || []).map((intent) => ({
  intent_name: intent.intent_name,
  display_name: intent.display_name,
  is_completed: completedSet.has(intent.intent_name),
}));
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `migrations/021_dynamic_checkpoints.sql` | Nueva migracion |
| `src/data/repositories/user.repository.ts` | Nuevos metodos para checkpoints |
| `src/core/types/user.types.ts` | Eliminar CheckpointKey o hacerlo dinamico |
| `src/core/conversation/message-processor.ts` | Usar nuevo metodo markCheckpointCompleted |
| `src/hooks/use-conversations.ts` | Query a nueva tabla |

---

## Riesgos

| Riesgo | Mitigacion |
|--------|------------|
| Datos perdidos en migracion | Script de migracion conserva datos existentes |
| Bot deja de funcionar | Pruebas en ambiente de desarrollo primero |
| Rollback necesario | Mantener columnas antiguas hasta verificar funcionamiento |

---

## Estimacion de Tiempo

- Migracion SQL: 30 min
- Actualizacion repositorio: 1 hora
- Actualizacion hook/UI: 30 min
- Pruebas: 1 hora
- **Total: ~3 horas**

---

## Prerequisitos

1. Backup de base de datos
2. Ambiente de pruebas configurado
3. Acceso a Supabase para ejecutar migracion

---

_Creado: 2 de diciembre de 2025_
