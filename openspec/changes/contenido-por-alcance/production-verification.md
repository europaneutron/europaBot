## Verificación antes de producción

1. Confirmar que producción tiene aplicadas las migraciones hasta la `040` y
   que no existe ningún objeto llamado `scope_tree_version` o
   `response_replacements` creado fuera de migraciones.
2. Ejecutar una copia de seguridad de Postgres antes de subir `041` y `042`.
3. Inventariar las colisiones activas por `intent_id`. La lista se obtiene con:

   ```sql
   SELECT i.scope_id, i.intent_name, count(*) AS active_responses,
          array_agg(r.id ORDER BY r.order_priority, r.created_at) AS response_ids
   FROM public.intent_configurations AS i
   JOIN public.bot_responses AS r ON r.intent_id = i.id
   WHERE i.is_active AND r.is_active
   GROUP BY i.scope_id, i.intent_name
   HAVING count(*) > 1;
   ```

4. Aplicar las migraciones. Verificar que el conteo y el texto de todas las
   respuestas activas sean idénticos al inventario anterior: ninguna migración
   desactiva ni reescribe contenido.
5. Abrir el compilador y resolver cada colisión manualmente. En secuencias
   `main + followup`, confirmar la combinación solo después de comparar texto y
   orden. En las demás, elegir conscientemente qué respuesta conservar.
6. Consultar `response_replacements` y comprobar que cada fila retirada tenga
   su reemplazo, fecha y administrador. Confirmar que no quedó ninguna pregunta
   sin una respuesta activa.
7. Dar de alta, renombrar, desactivar y reactivar un alcance desde una instancia
   y comprobar desde otra que el cambio se refleja en el siguiente mensaje.
8. Compilar un material de prueba en un alcance aislado, aprobarlo y comprobar
   que el lead recibe una sola respuesta. Retirar después únicamente ese
   alcance y sus datos de prueba.

