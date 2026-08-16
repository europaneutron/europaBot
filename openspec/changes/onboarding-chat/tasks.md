## 1. Preparación

- [ ] 1.1 Mapear y documentar en `design.md`, **antes de escribir código**, cada texto visible de `/compiler`, del formulario de intenciones y de los mensajes sembrados que hoy nombre el modelo del sistema o el tipo de proyecto. Es la lista de lo que hay que sustituir, y hacerla después obliga a rehacer pantallas
- [ ] 1.2 Leer las decisiones cerradas en `design.md`. No quedan preguntas abiertas
- [ ] 1.3 Registrar la línea base antes de tocar código: un cliente ya configurado responde exactamente lo mismo al terminar este cambio
- [ ] 1.4 **Abrir la aplicación en el navegador antes de empezar** y anotar qué se entiende y qué no en `/compiler`. Este cambio nace de haber revisado ese panel leyendo código en vez de usándolo

## 2. Esquema

- [ ] 2.1 Migración aditiva a partir de la 037, con RLS y políticas para `service_role` y `authenticated`, y grants explícitos como en la 028
- [ ] 2.2 Vocabulario del cliente para nombrar sus proyectos, en singular y plural, con un valor por defecto utilizable
- [ ] 2.3 Configuración de marca que el compilador consume al redactar: tono elegido y lo que lo acompañe
- [ ] 2.4 Estado del recorrido, para poder retomarlo donde se dejó
- [ ] 2.5 Verificar que la secuencia completa de migraciones corre desde cero sin error

## 3. El recorrido

- [ ] 3.1 Siete pasos como máximo, con botones y no campo abierto. El campo libre es escotilla, no camino normal
- [ ] 3.2 Toda pregunta con valor por defecto defendible y una opción para no responder
- [ ] 3.3 Preguntar la profundidad del catálogo a través de cómo ocurre una visita en su negocio, sin mencionar niveles ni estructura
- [ ] 3.4 Usar los datos que el sistema ya conoce en las preguntas siguientes, en lugar de hablar en general
- [ ] 3.5 Afirmar el objetivo de conversión en lugar de preguntarlo: solo existe uno
- [ ] 3.6 Guardar el avance en cada paso, de modo que abandonar y volver no repita nada
- [ ] 3.7 Verificar que el recorrido se completa respondiendo "no estoy seguro" en todas las preguntas, y que el bot resultante es razonable

## 4. Alta del proyecto

- [ ] 4.1 Crear el proyecto y sus partes desde el recorrido, reutilizando lo que `scope.repository.ts` ya sabe hacer
- [ ] 4.2 Registrar los nombres con los que un lead puede referirse a cada proyecto, para que el ruteo por mención funcione desde el primer día
- [ ] 4.3 Verificar que dar de alta un segundo proyecto no altera el contenido ni la configuración del primero
- [ ] 4.4 Verificar que un proyecto creado desde el recorrido es indistinguible de uno sembrado por SQL

## 5. Vocabulario del cliente

- [ ] 5.1 Recoger cómo llama el cliente a sus proyectos y aplicarlo en toda la interfaz
- [ ] 5.2 Aplicarlo también a los mensajes de sistema sembrados que mencionan el tipo de proyecto
- [ ] 5.3 Resolver la sustitución **en un único lugar**, compartido por interfaz y mensajes. Dos implementaciones de la misma regla divergen, y ya costó rondas con la configuración del asesor
- [ ] 5.4 Verificar recorriendo el alta y la revisión completas que no aparece ninguno de los términos internos: alcance, nodo, árbol, aplanar, hecho, procedencia, etapa, ejecución, compilación

## 6. Material y tono

- [ ] 6.1 Recibir el material dentro del recorrido y arrancar la compilación sin ninguna acción adicional
- [ ] 6.2 Hacer avanzar la compilación por su cuenta hasta la siguiente decisión humana, sin controles en la interfaz
- [ ] 6.3 Mostrar el estado en términos del cliente: qué está haciendo y qué falta, nunca qué etapa corre
- [ ] 6.4 Mostrar los fallos del proveedor en términos del cliente, con forma de reintentar
- [ ] 6.5 Ofrecer el tono como muestras renderizadas con los datos del propio cliente, y con datos de ejemplo si el material aún no se ha leído
- [ ] 6.6 Pasar el tono elegido al compilador, de modo que las respuestas propuestas lo sigan
- [ ] 6.7 Verificar que un brochure en prosa publicitaria produce respuestas breves y no prosa publicitaria

## 7. Reducción del panel

- [ ] 7.1 Retirar el selector de proyecto: el panel muestra lo que hay que revisar, no pregunta contra qué trabajar
- [ ] 7.2 Retirar el control de avance de etapas
- [ ] 7.3 Sustituir "hechos y procedencia" por de dónde salió el dato, y retirar toda referencia al almacenamiento del original
- [ ] 7.4 Conservar lo que sí es del usuario: lo propuesto agrupado, la procedencia, las señales de revisión, aprobar y rechazar, y qué falta por cubrir
- [ ] 7.5 Ordenar por señal, de modo que lo que necesita atención aparezca primero
- [ ] 7.6 Reutilizar componentes y tokens del stack: shadcn, sin emojis, sin colores fijos que se rompan en modo oscuro

## 8. Verificación

- [ ] 8.1 Confirmar que un cliente ya configurado responde exactamente lo mismo que en la línea base
- [ ] 8.2 Recorrido completo extremo a extremo: desde una base sin proyectos hasta un lead que recibe una respuesta compilada
- [ ] 8.3 Recorrido de un cliente con dos proyectos, comprobando que el ruteo por mención funciona con los nombres dados de alta
- [ ] 8.4 Verificar que abandonar el recorrido a la mitad y volver continúa donde se dejó
- [ ] 8.5 **Verificación manual en el navegador de todo el recorrido y del panel**, antes de pedir revisión, leyendo cada pantalla como si fuera la primera vez. Es la tarea que faltó en `document-compiler` y la razón de que este cambio exista
- [ ] 8.6 Verificar que cada prueba nueva **falla con el código anterior**, para que no consagre el comportamiento que se está corrigiendo
- [ ] 8.7 Confirmar `tsc --noEmit` limpio y sin emojis nuevos, conforme a `AGENTS.md`
- [ ] 8.8 Dejar anotado en el cambio qué debe verificarse en el esquema remoto antes de aplicar en producción
