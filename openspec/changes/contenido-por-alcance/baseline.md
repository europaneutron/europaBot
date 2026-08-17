## Línea base local

Capturada el 2026-08-17 antes de resolver colisiones. La unidad de comparación
es `(alcance, intent_name)` y la lista conserva el orden efectivo de envío.

| Alcance | Intención | Respuestas activas | Claves, en orden |
|---|---|---:|---|
| Altabrisa | modelo | 1 | `main` |
| Altabrisa | precio | 1 | `main` |
| Altabrisa | seguridad | 1 | `main` |
| Altabrisa | ubicacion | 1 | `main` |
| Europa | modelo | 1 | `main` |
| Europa | precio | 1 | `main` |
| Europa | seguridad | 1 | `main` |
| Europa | ubicacion | 1 | `main` |
| Inmobiliaria FYMSA | brochure | 2 | `main`, `followup` |
| Inmobiliaria FYMSA | cita | 2 | `main`, `main` |
| Inmobiliaria FYMSA | creditos | 3 | `main`, `compiler_creditos`, `simulator` |
| Inmobiliaria FYMSA | despedida | 1 | `main` |
| Inmobiliaria FYMSA | modelo | 2 | `main`, `followup` |
| Inmobiliaria FYMSA | precio | 3 | `main`, `compiler_precio`, `followup` |
| Inmobiliaria FYMSA | saludo | 1 | `main` |
| Inmobiliaria FYMSA | seguridad | 1 | `main` |
| Inmobiliaria FYMSA | ubicacion | 3 | `main`, `compiler_ubicacion`, `maps` |
| Modelo Aura | precio | 1 | `main` |
| Modelo Cala | precio | 1 | `main` |
| Modelo Mare | precio | 1 | `main` |
| Modelo Solara | precio | 1 | `main` |
| Modelo Vento | precio | 1 | `main` |
| Terrenos | precio | 1 | `main` |

Las respuestas propias por alcance que sostienen la conversación objetivo son:

| Alcance | Intención | Contenido activo |
|---|---|---|
| Europa | precio | En Europa las casas van desde $1,850,000 y los terrenos desde $780,000. |
| Europa | ubicacion | Europa está en Avenida Ruiz Cortines 1820, Colonia Tamulté, Villahermosa. A 8 minutos de Plaza Altabrisa. |
| Europa | seguridad | Europa tiene caseta de vigilancia 24/7, alberca semiolímpica, casa club y áreas verdes en el 22% del terreno. |
| Modelo Aura | precio | Modelo Aura: desde $1,850,000. Terreno de 160 m2 y construcción de 118 m2, 3 recámaras y 2 baños. |
| Modelo Vento | precio | Modelo Vento: desde $2,340,000. Terreno de 200 m2 y construcción de 152 m2, 3 recámaras y 3 baños. |
| Modelo Solara | precio | Modelo Solara: desde $2,980,000. Terreno de 250 m2 y construcción de 198 m2, 4 recámaras y 4 baños. |
| Altabrisa | precio | En Altabrisa las casas van desde $1,420,000. |
| Altabrisa | ubicacion | Altabrisa está en Prolongación Paseo Tabasco 1503, Fraccionamiento Lomas de Ocuiltzapotlán, Villahermosa. |
| Modelo Cala | precio | Modelo Cala: desde $1,420,000. Terreno de 140 m2 y construcción de 96 m2, 2 recámaras y 1.5 baños. |
| Modelo Mare | precio | Modelo Mare: desde $1,780,000. Terreno de 160 m2 y construcción de 124 m2, 3 recámaras y 2 baños. |

La migración no resuelve las seis colisiones de la raíz. El panel las muestra
con su texto completo y pide confirmación. Las secuencias `main + followup` se
proponen como fragmentos; las demás proponen conservar la fila más reciente.
