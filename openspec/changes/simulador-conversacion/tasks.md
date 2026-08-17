## 1. Preparación

- [x] 1.1 Leer `openspec/conversacion-objetivo.md`. Es el criterio de aceptación de esta spec y de las siguientes
- [x] 1.2 Correr `npx tsx scripts/simulate-fymsa.ts` y ver qué imprime. La pantalla tiene que mostrar lo mismo que ese script, en el navegador
- [x] 1.3 Revisar `POST /api/test/process-message` y `POST /api/test/reset-user`: qué reciben, qué devuelven y qué les falta para sostener la pantalla

## 2. El lead simulado

- [x] 2.1 Marcar de forma explícita al usuario creado desde el simulador, en el dato y no por convención de teléfono
- [x] 2.2 Migración aditiva a partir de la última, con valor por defecto que preserve el comportamiento actual, RLS y grants explícitos
- [x] 2.3 **Recorrer una por una las lecturas de operación** —listado de leads, métricas de calificación, seguimientos programados, reportes— y decidir de cada una si excluye a los simulados. La mayoría debe excluirlos; escribir de las que no, por qué
- [x] 2.4 Poder usar varios leads simulados a la vez, cada uno con su estado
- [x] 2.5 Verificar que un lead simulado que llega a calificar no aparece entre los leads reales ni suma a las métricas
- [x] 2.6 Verificar que una conversación simulada no programa ningún seguimiento

## 3. La conversación

- [x] 3.1 Pantalla de chat que envía al procesador real y muestra la respuesta
- [x] 3.2 Mostrar una respuesta de varios fragmentos como varios mensajes, en el orden en que saldrían
- [x] 3.3 Indicar mientras se procesa, para que no parezca colgada
- [x] 3.4 Mostrar los fallos del procesador como lo que son, sin tragárselos: si revienta, se ve el error
- [ ] 3.5 Verificar que aprobar contenido nuevo cambia lo que responde el simulador, sin tocar la pantalla

## 4. El diagnóstico

- [x] 4.1 Junto a cada turno: alcance en foco, intención detectada, si fue fallback y la pregunta pendiente
- [x] 4.2 Leerlo de la fuente —resultado del procesador y sesión del usuario—, no de un formato propio que haya que mantener al día
- [x] 4.3 Presentarlo separado de la conversación, de modo que la conversación se lea de corrido como la leería un lead
- [x] 4.4 Verificar el caso que hoy falla: escribir solo "Solara" muestra la respuesta de fallback **y** que el foco sí quedó en ese modelo

## 5. Reinicio y procedencia

- [x] 5.1 Reiniciar el lead simulado en una acción: sin foco, sin pendiente, sin historial, sin progreso
- [x] 5.2 Verificar que reiniciar no toca a ningún otro usuario
- [x] 5.3 Permitir indicar el anuncio de procedencia antes del primer mensaje
- [x] 5.4 Verificar que un anuncio conocido fija el foco y que uno desconocido no rompe la conversación

## 6. Acceso

- [x] 6.1 Bloquear la pantalla en producción, además del bloqueo que ya tienen los endpoints
- [x] 6.2 Exigir sesión de administrador, como el resto del panel
- [x] 6.3 Verificar los dos cierres por separado

## 7. Verificación

- [ ] 7.1 **Recorrer en el navegador la conversación objetivo completa**, turno por turno, y anotar cuáles se cumplen y cuáles no. Es la razón de ser de esta spec: si no se puede hacer sin terminal, no está terminada
- [x] 7.2 Confirmar que ninguna prueba deja datos en la base, y que si los deja, la prueba falla en vez de callarse
- [x] 7.3 Verificar que cada prueba nueva **falla con el código anterior**
- [x] 7.4 Confirmar `tsc --noEmit` limpio, sin emojis, componentes shadcn y tokens del tema conforme a `AGENTS.md`
- [x] 7.5 Dejar anotado qué debe verificarse en el esquema remoto antes de aplicar en producción

## 8. Lo que esta pantalla no reproduce

- [x] 8.1 Decirlo en la propia pantalla: no hay latencia real de WhatsApp, no hay pausas entre fragmentos y no hay botones ni listas interactivas. Una fidelidad que se asume y no se cumple es peor que una limitación escrita
