## 1. Preparación

- [x] 1.1 Mapear y documentar en `design.md`, **antes de escribir código**, cada texto visible de `/compiler`, del formulario de intenciones y de los mensajes sembrados que hoy nombre el modelo del sistema o el tipo de proyecto. Es la lista de lo que hay que sustituir, y hacerla después obliga a rehacer pantallas
- [x] 1.2 Leer las decisiones cerradas en `design.md`. No quedan preguntas abiertas
- [x] 1.3 Registrar la línea base antes de tocar código: un cliente ya configurado responde exactamente lo mismo al terminar este cambio
- [x] 1.4 **Abrir la aplicación en el navegador antes de empezar** y anotar qué se entiende y qué no en `/compiler`. Este cambio nace de haber revisado ese panel leyendo código en vez de usándolo

## 2. Esquema

- [x] 2.1 Migración aditiva a partir de la 037, con RLS y políticas para `service_role` y `authenticated`, y grants explícitos como en la 028
- [x] 2.2 Vocabulario del cliente para nombrar sus proyectos, en singular y plural, con un valor por defecto utilizable
- [x] 2.3 Configuración de marca que el compilador consume al redactar: tono elegido y lo que lo acompañe
- [x] 2.4 Estado del recorrido, para poder retomarlo donde se dejó
- [x] 2.5 Verificar que la secuencia completa de migraciones corre desde cero sin error

## 3. El recorrido

- [x] 3.1 Siete pasos como máximo, con botones y no campo abierto. El campo libre es escotilla, no camino normal
- [x] 3.2 Toda pregunta con valor por defecto defendible y una opción para no responder
- [x] 3.3 Preguntar la profundidad del catálogo a través de cómo ocurre una visita en su negocio, sin mencionar niveles ni estructura
- [x] 3.4 Usar los datos que el sistema ya conoce en las preguntas siguientes, en lugar de hablar en general
- [x] 3.5 Afirmar el objetivo de conversión en lugar de preguntarlo: solo existe uno
- [x] 3.6 Guardar el avance en cada paso, de modo que abandonar y volver no repita nada
- [ ] 3.7 Verificar que el recorrido se completa respondiendo "no estoy seguro" en todas las preguntas, y que el bot resultante es razonable

## 4. Alta del proyecto

- [x] 4.1 Crear el proyecto y sus partes desde el recorrido, reutilizando lo que `scope.repository.ts` ya sabe hacer
- [x] 4.2 Registrar los nombres con los que un lead puede referirse a cada proyecto, para que el ruteo por mención funcione desde el primer día
- [x] 4.3 Verificar que dar de alta un segundo proyecto no altera el contenido ni la configuración del primero
- [x] 4.4 Verificar que un proyecto creado desde el recorrido es indistinguible de uno sembrado por SQL

## 5. Vocabulario del cliente

- [x] 5.1 Recoger cómo llama el cliente a sus proyectos y aplicarlo en toda la interfaz
- [x] 5.2 Aplicarlo también a los mensajes de sistema sembrados que mencionan el tipo de proyecto
- [x] 5.3 Resolver la sustitución **en un único lugar**, compartido por interfaz y mensajes. Dos implementaciones de la misma regla divergen, y ya costó rondas con la configuración del asesor
- [ ] 5.4 Verificar recorriendo el alta y la revisión completas que no aparece ninguno de los términos internos: alcance, nodo, árbol, aplanar, hecho, procedencia, etapa, ejecución, compilación

## 6. Material y tono

- [x] 6.1 Recibir el material dentro del recorrido y arrancar la compilación sin ninguna acción adicional
- [x] 6.2 Hacer avanzar la compilación por su cuenta hasta la siguiente decisión humana, sin controles en la interfaz
- [x] 6.3 Mostrar el estado en términos del cliente: qué está haciendo y qué falta, nunca qué etapa corre
- [x] 6.4 Mostrar los fallos del proveedor en términos del cliente, con forma de reintentar
- [x] 6.5 Ofrecer el tono como muestras renderizadas con los datos del propio cliente, y con datos de ejemplo si el material aún no se ha leído
- [x] 6.6 Pasar el tono elegido al compilador, de modo que las respuestas propuestas lo sigan
- [ ] 6.7 Verificar que un brochure en prosa publicitaria produce respuestas breves y no prosa publicitaria

## 7. Reducción del panel

- [x] 7.1 Retirar el selector de proyecto: el panel muestra lo que hay que revisar, no pregunta contra qué trabajar
- [x] 7.2 Retirar el control de avance de etapas
- [x] 7.3 Sustituir "hechos y procedencia" por de dónde salió el dato, y retirar toda referencia al almacenamiento del original
- [x] 7.4 Conservar lo que sí es del usuario: lo propuesto agrupado, la procedencia, las señales de revisión, aprobar y rechazar, y qué falta por cubrir
- [x] 7.5 Ordenar por señal, de modo que lo que necesita atención aparezca primero
- [x] 7.6 Reutilizar componentes y tokens del stack: shadcn, sin emojis, sin colores fijos que se rompan en modo oscuro

## 8. Verificación

- [x] 8.1 Confirmar que un cliente ya configurado responde exactamente lo mismo que en la línea base
- [ ] 8.2 Recorrido completo extremo a extremo: desde una base sin proyectos hasta un lead que recibe una respuesta compilada
- [x] 8.3 Recorrido de un cliente con dos proyectos, comprobando que el ruteo por mención funciona con los nombres dados de alta
- [x] 8.4 Verificar que abandonar el recorrido a la mitad y volver continúa donde se dejó
- [ ] 8.5 **Verificación manual en el navegador de todo el recorrido y del panel**, antes de pedir revisión, leyendo cada pantalla como si fuera la primera vez. Es la tarea que faltó en `document-compiler` y la razón de que este cambio exista
- [x] 8.6 Verificar que cada prueba nueva **falla con el código anterior**, para que no consagre el comportamiento que se está corrigiendo
- [x] 8.7 Confirmar `tsc --noEmit` limpio y sin emojis nuevos, conforme a `AGENTS.md`
- [x] 8.8 Dejar anotado en el cambio qué debe verificarse en el esquema remoto antes de aplicar en producción

## 9. Correcciones de la revisión

- [x] 9.1 Retirar la sustitución de vocabulario por búsqueda de palabras. Reescribía nombres propios —la dirección `Calle Principal #123, Fraccionamiento Europa` pasaba a decir `Plaza Europa`, y es la que el bot manda a un lead que va a ir físicamente—, no concordaba el género —`nuestro plaza`— y pisaba sustantivos comunes del español. Solo se expanden marcadores explícitos
- [x] 9.2 Sembrar los marcadores en los mensajes que sí necesitan la palabra, y dejar intactos los que llevan el nombre propio del cliente. Regla de redacción: el marcador no lleva artículo delante, porque el género de la palabra elegida no se conoce
- [x] 9.3 Resolver los mensajes configurables en un único lugar —valor, vocabulario y variables—, que es lo que pedía la tarea 5.3. Estaba envuelto a mano en ocho sitios: de los seis mensajes sembrados con la palabra, cinco la recibían, uno no, y dos de los cinco no debían recibirla
- [x] 9.4 Separar `resolveConfiguredTemplate` para el caso en que la plantilla se carga una vez y se personaliza por destinatario, como el seguimiento por lotes
- [x] 9.5 Avanzar la compilación desde el servidor con `/api/cron/advance-compilations`, para que no dependa de que el cliente deje la pestaña abierta. No cruza las etapas que esperan una decisión humana
- [x] 9.6 Corregir los acentos de las muestras de tono, que son el texto con el que el cliente juzga si el producto está cuidado
- [x] 9.7 Reescribir las aserciones de vocabulario, que afirmaban como correcta la reescritura del nombre propio

- [x] 9.8 Compuerta del árbol resuelta: no se retira ni se reconcilia, se invierte el orden. Ver la sección 10


## 10. Invertir el orden: el material primero

Decidido el 2026-08-16. La estructura dejaba de proponerse desde el material para
pedírsela al cliente en frío, y era el único punto del sistema donde el humano
iba antes que el modelo. Ver la decisión en `design.md`.

- [ ] 10.1 Mover la entrega de material al principio del recorrido, antes de pedir estructura
- [ ] 10.2 Presentar la estructura deducida con los nombres del cliente, y pedir confirmarla o corregirla. Es la primera compuerta que `document-compiler` ya exigía y que había quedado vacía
- [ ] 10.3 Consumir `proposed_tree` para crear los proyectos y sus partes. Hoy se calcula, se guarda y no lo lee nadie
- [ ] 10.4 Permitir aplanar de un toque cuando el cliente no venda las opciones por separado
- [ ] 10.5 Hacer la pregunta sobre cómo ocurre una visita **después** de la propuesta, sobre nombres concretos
- [ ] 10.6 Conservar la declaración a mano como alternativa explícita para quien no tenga material, no como camino normal
- [ ] 10.7 Retirar la aprobación automática del árbol de `onboarding.service.ts`
- [ ] 10.8 Verificar el caso de una parte que el cliente no habría mencionado: aparece en la propuesta y su contenido no se atribuye a otro proyecto en silencio

## 11. La espera y el avance

- [ ] 11.1 Indicador de avance dentro del propio recorrido, con cuánto puede tardar y la instrucción de no cerrar. Es lo mínimo: sin eso la pantalla parece congelada y nadie sabe si sigue viva
- [ ] 11.2 Encadenar las etapas mientras el cliente espera, sin controles técnicos
- [ ] 11.3 Reanudar desde donde quedó **entre por donde entre**, incluido el panel de revisión. Hoy solo empuja la pantalla del recorrido, así que volver por el panel deja la compilación varada
- [ ] 11.4 Retirar `/api/cron/advance-compilations` y su entrada en `vercel.json`. No es desplegable en el plan actual y solo compraba terminar antes para alguien que no está mirando
- [ ] 11.5 Verificar que cerrar la pantalla a media compilación y volver continúa sin repetir trabajo

**Fuera de alcance, anotado como deuda:** impedir que dos pestañas avancen la
misma compilación a la vez. Necesita un operador simultáneo consigo mismo; se
vuelve necesario al vender a una agencia con varias personas tocando lo mismo.

## 12. La identidad del negocio

Decidido el 2026-08-16. La raíz del árbol es el negocio del cliente, no uno de
sus proyectos, y eso no estaba dicho en ninguna parte. Hoy la raíz se llama
`Europa` —un desarrollo— y el saludo arrastra ese nombre, así que en cuanto
existan dos desarrollos el mensaje de mayor volumen del bot le da la bienvenida
a uno de los dos.

- [ ] 12.1 Recoger el nombre del negocio en el recorrido, proponiéndolo desde el material cuando se pueda deducir y preguntándolo cuando no. Es lo único que un brochure no dice: menciona el proyecto, no la inmobiliaria que lo vende
- [ ] 12.2 Guardarlo junto al vocabulario y exponerlo como variable para los mensajes configurables. Son dos datos distintos que se confundían porque con un solo proyecto coinciden
- [ ] 12.3 Nombrar la raíz con el negocio cuando el cliente lo confirme, en lugar de dejar el nombre de un proyecto ocupando su lugar
- [ ] 12.4 Componer el saludo con la identidad y los proyectos disponibles para quien no tenga uno propio
- [ ] 12.5 No modificar un saludo ya redactado sin mostrárselo al cliente y que lo confirme. Reescribir contenido aprobado en una migración es lo que este proyecto se prohibió al retirar los CTA sembrados
- [ ] 12.6 Verificar que un cliente con saludo propio conserva su texto literal tras el recorrido, y que uno sin saludo recibe el compuesto
- [ ] 12.7 Verificar que dar de alta un proyecto nuevo lo incorpora al saludo compuesto sin editar textos
