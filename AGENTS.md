# AGENTS.md
### Guía de Directrices y Buenas Prácticas de Desarrollo

---

## 1. Propósito del Documento

Este archivo define las reglas y principios generales de desarrollo para todos los agentes o colaboradores del proyecto.  
Su objetivo es mantener un sistema **coherente, escalable, mantenible y libre de antipatrones**, garantizando decisiones técnicas con sentido y contexto.

El proyecto se basa en **Flutter (frontend y lógica cliente)**, **Supabase (backend, autenticación y base de datos Postgres)** y **Google Cloud (hosting y servicios gratuitos)**.  
Incluye módulos como autenticación, productos, pedidos, sucursales, pagos, permisos, quejas y notificaciones.

---

## 2. Principios Generales

- Favorecer **claridad, estabilidad y mantenibilidad** antes que complejidad técnica.
- Crear **patrones reutilizables**: componentes, widgets y funciones que puedan escalar sin reescritura.
- Evitar **antipatrones** y diseños híbridos contradictorios.
- No usar **emojis** en comentarios, logs o mensajes del sistema.
- Confirmar siempre con el **usuario o líder del proyecto** antes de realizar cambios con impacto estructural o funcional.
- Cuando se desconozca algo, **investigar el contexto del desarrollo** antes de actuar.
- Evitar la **sobrecodificación o sobreingeniería**: construir solo lo necesario, con propósito y claridad.
- Documentar el *por qué* de las decisiones importantes, no el *qué hace* cada línea.

---

## 3. Patrones Reutilizables y Buenas Prácticas

- Aplicar **modularidad**: cada clase, función o widget debe tener una única responsabilidad (principio SRP).  
- Evitar lógica dispersa: la interacción con la base de datos y la UI deben estar claramente separadas.  
- Usar **nombres descriptivos** para variables, funciones, widgets y tablas.  
- Mantener la **coherencia de nomenclatura** (camelCase en código, snake_case en base de datos).  
- Aplicar el principio **DRY** (*Don’t Repeat Yourself*): abstraer patrones comunes en servicios, mixins o utilidades.  
- Validar entradas y manejar errores con mensajes claros y predecibles.  
- No introducir dependencias o paquetes externos sin evaluar su necesidad real y su impacto en mantenimiento.  
- Estructurar el código con base en **carpetas lógicas**: `lib/features`, `lib/core`, `lib/services`, etc.

---

## 4. Evitar Antipatrones

Evitar cualquier práctica que afecte la coherencia, seguridad o mantenimiento del sistema.  
En particular:

- ❌ Implementar **sistemas híbridos o antagonistas** (por ejemplo, mezclar frameworks o arquitecturas incompatibles) sin una razón técnica totalmente justificada o un caso de uso inevitable.  
  > *Ejemplo:* evitar mezclar Flutter con frameworks web o backends paralelos que dupliquen la lógica de Supabase.  
- ❌ Copiar y pegar código sin abstraerlo.  
- ❌ Usar valores “hardcodeados” en lugar de variables o configuraciones.  
- ❌ Manejar errores con `try/catch` vacíos o silenciosos.  
- ❌ Escribir funciones con múltiples responsabilidades.  
- ❌ Dejar logs o comentarios decorativos.  
- ❌ Cambiar estructuras de datos sin verificar dependencias existentes.  
- ❌ Crear funcionalidades que dupliquen procesos ya cubiertos por el sistema o la base de datos.  
- ❌ Depender de soluciones temporales o “parches” sin plan de mantenimiento.

---

## 5. Colaboración y Control de Cambios

- Antes de realizar cambios estructurales, confirmar con el **usuario o responsable técnico**.  
- Describir en cada commit o documento técnico **qué se hizo y por qué**.  
- Mantener trazabilidad en las migraciones de base de datos y cambios en el esquema.  
- Evitar modificaciones directas en producción sin pruebas o revisión previa.  
- En caso de duda, **analizar primero el flujo de datos y dependencias** antes de escribir código nuevo.  
- Priorizar el trabajo incremental, verificable y fácilmente reversible.

---


## 7. Estilo de Comunicación entre Agentes

- Usar lenguaje **técnico, directo y verificable**.  
- No asumir comportamientos no documentados.  
- Si hay ambigüedad, **preguntar o investigar antes de implementar**.  
- Comunicar riesgos y alternativas antes de realizar cambios profundos.  
- Documentar decisiones relevantes con contexto y justificación.  

---

## 8. Enfoque General

Este proyecto prioriza:

- **Simplicidad bien estructurada.**  
- **Escalabilidad gradual, basada en módulos.**  
- **Compatibilidad y mantenibilidad a largo plazo.**

Desarrollar con criterio y visión:  
> “No se trata de hacer más código, sino de hacer mejor código.”

---

_Última actualización: {{fecha de creación o revisión}}_