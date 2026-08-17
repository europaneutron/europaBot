## Verificación de implementación

### Lecturas operativas revisadas

- Listado y exportación de conversaciones: excluyen `users.is_simulated = true` antes de paginar y contar.
- Métricas: usuarios, leads hot, conversaciones del día, distribución de intenciones, conversaciones recientes y citas pendientes excluyen simulaciones mediante la relación con `users`.
- Solicitudes de asesor y su exportación: excluyen simulaciones mediante un `inner join` con `users`.
- Citas: la lista del panel y las métricas excluyen simulaciones. Las citas de prueba se conservan mientras dura el escenario y se borran al reiniciar.
- Seguimientos: tanto el procesador de conversaciones abandonadas como el programador por solicitud de asesor excluyen simulaciones. El reinicio borra defensivamente cualquier seguimiento de prueba.
- El detalle de una conversación no aplica el filtro deliberadamente: no es una lectura agregada ni un listado operativo y solo se abre con un identificador concreto. Esto permite diagnosticar un escenario si se conserva su URL.

### Verificación ejecutada

- `npx tsx scripts/simulate-fymsa.ts`: confirmó la línea base documentada, incluido foco en Modelo Solara con fallback.
- `supabase migration up --local --yes`: aplicó `040_simulated_users.sql` al stack local.
- `npx tsx scripts/test-conversation-simulator.ts`: verificó marca explícita, leads independientes, reinicio aislado, ausencia de seguimientos, exclusión de consultas operativas y procedencia conocida/desconocida. La prueba limpia sus datos en `finally`.
- `npx tsc --noEmit`: limpio.
- `npm run build`: limpio; la página `/simulator` queda resuelta como no encontrada en el build de producción.
- Verificación HTTP sin sesión en desarrollo: `/simulator` redirige a login y ambos endpoints `/api/test/*` responden 401.

`npm run lint` no es una comprobación automatizable todavía porque el repositorio no tiene configuración de ESLint y `next lint` abre el asistente interactivo. El build sí ejecutó la validación integrada de Next.js.

### Antes de aplicar en remoto

1. Confirmar que la migración remota más reciente es la 039 y que no existe ya una columna `users.is_simulated` con otra semántica.
2. Revisar que `users` conserva RLS habilitado y las políticas de lectura para administradores y acceso total para `service_role`.
3. Aplicar únicamente `040_simulated_users.sql` mediante el flujo de migraciones; no ejecutar `seed.sql` en remoto.
4. Confirmar que los usuarios existentes quedaron con `is_simulated = false` y que el índice parcial `idx_users_operational` existe.
5. Hacer el smoke test en un entorno no productivo autenticado. El simulador seguirá respondiendo 404 en producción por diseño.

### Verificación manual pendiente

- Aprobar una respuesta desde Contenido y confirmar en la pantalla abierta que el siguiente turno usa el texto nuevo.
- Recorrer en navegador todos los turnos de `openspec/conversacion-objetivo.md` y anotar los fallos conversacionales, sin confundirlos con defectos del simulador.
