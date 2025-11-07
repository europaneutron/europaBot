# Optimización de Performance: Advisor Requests

## Problema Identificado

### Antes (Filtro en Cliente)
```typescript
// ❌ INEFICIENTE: Traía TODOS los registros y filtraba en JavaScript
const { data } = await query;
let results = data || [];

if (filters.searchTerm) {
  const term = filters.searchTerm.toLowerCase();
  results = results.filter((req: any) => {
    const userData = Array.isArray(req.user) ? req.user[0] : req.user;
    const name = userData?.name?.toLowerCase() || '';
    const phone = userData?.phone_number?.toLowerCase() || '';
    return name.includes(term) || phone.includes(term);
  });
}
```

**Impacto negativo:**
- Si hay 1000 advisor_requests → trae los 1000 registros
- Consume banda ancha innecesaria
- Procesa datos en navegador (lento)
- Desperdicia memoria del cliente

### Después (Filtro en Servidor)
```typescript
// ✅ OPTIMIZADO: Filtra en PostgreSQL antes de traer datos
if (filters.searchTerm) {
  query = query.or(
    `users.name.ilike.%${filters.searchTerm}%,users.phone_number.ilike.%${filters.searchTerm}%`
  );
}

const { data } = await query;
```

**Beneficios:**
- PostgreSQL filtra antes de devolver datos
- Solo trae registros que coinciden con búsqueda
- Usa índices de base de datos (más rápido)
- Menos banda ancha y memoria

---

## Comparación de Performance

| Escenario | Antes (Cliente) | Después (Servidor) | Mejora |
|-----------|-----------------|-------------------|--------|
| 10 requests, 0 coinciden con búsqueda | Trae 10, procesa 10 | Trae 0 | 100% menos datos |
| 1000 requests, 5 coinciden | Trae 1000, procesa 1000 | Trae 5 | 99.5% menos datos |
| Sin búsqueda (1000 requests) | Trae 1000 | Trae 1000 | Sin cambio |

---

## Otros Filtros (Ya Optimizados)

Estos filtros YA estaban optimizados desde el inicio:

```typescript
// ✅ Estado contactado (filtro en servidor)
if (filters.status === 'contacted') {
  query = query.eq('contacted', true);
}

// ✅ Filtros de fecha (filtro en servidor)
if (filters.dateFrom) {
  query = query.gte('created_at', filters.dateFrom);
}
if (filters.dateTo) {
  query = query.lte('created_at', filters.dateTo);
}
```

---

## Índices de Base de Datos

Ya existen índices que aceleran estas queries:

```sql
-- Índice para filtro de estado
CREATE INDEX idx_advisor_requests_contacted 
ON advisor_requests(contacted) WHERE contacted = false;

-- Índice para orden por fecha
CREATE INDEX idx_advisor_requests_created 
ON advisor_requests(created_at DESC);

-- Índice para join con users
CREATE INDEX idx_advisor_requests_user 
ON advisor_requests(user_id);
```

**Nota:** No hay índices específicos para `users.name` o `users.phone_number`, pero PostgreSQL puede usar índices btree básicos si la tabla crece mucho.

---

## Sintaxis de Supabase `.or()`

```typescript
// Buscar en MÚLTIPLES columnas de tabla relacionada
.or(`users.name.ilike.%term%,users.phone_number.ilike.%term%`)
```

**Explicación:**
- `users.name.ilike.%term%` → Busca en columna `name` de tabla `users`
- `.ilike.` → LIKE case-insensitive (ignora mayúsculas)
- `%term%` → Coincidencia parcial (contiene el término)
- `,` → Separador OR (busca en name O phone_number)

---

## Testing Manual

Para verificar la optimización:

1. Abrir DevTools → Network tab
2. Ir a `/advisor-requests`
3. Buscar "Juan" en la caja de búsqueda
4. Ver request a Supabase:
   - **URL incluirá:** `users.name.ilike.%25Juan%25`
   - **Payload:** Solo registros que coinciden
   - **Tamaño:** Mucho menor si hay muchos registros

---

## Próximas Optimizaciones (Futuras)

Si la tabla crece mucho (>5000 registros):

1. **Paginación:** Limitar a 50-100 resultados por página
2. **Índices Full-Text:** Para búsquedas más rápidas en texto
3. **Server-Side Rendering:** Pre-cargar datos en servidor (Next.js)
4. **Caché:** Guardar resultados comunes en memoria

---

Fecha: 7 de noviembre de 2025
