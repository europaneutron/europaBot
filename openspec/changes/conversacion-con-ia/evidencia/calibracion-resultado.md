# Calibración: resultado contra el etiquetado a mano

Hoja: `scripts/fixtures/calibracion-100.csv`. Filas comparadas: 99; con algún tema etiquetado: 68.

Precisión = temas marcados que coinciden con la etiqueta / temas marcados. Cobertura = temas marcados que coinciden / temas etiquetados.
El clasificador cuenta solo los temas de claridad "clara"; el matcher, todos los suyos.

| Tema | Clasificador: precisión | Clasificador: cobertura | Matcher: precisión | Matcher: cobertura |
|---|---|---|---|---|
| amenidades | 90% (9/10) | 90% (9/10) | 67% (10/15) | 100% (10/10) |
| brochure | 100% (6/6) | 67% (6/9) | 50% (7/14) | 78% (7/9) |
| creditos | 84% (16/19) | 94% (16/17) | 68% (15/22) | 88% (15/17) |
| modelo | 90% (19/21) | 86% (19/22) | 82% (9/11) | 41% (9/22) |
| precio | 90% (19/21) | 73% (19/26) | 96% (23/24) | 88% (23/26) |
| promociones | 86% (12/14) | 92% (12/13) | 87% (13/15) | 100% (13/13) |
| ubicacion | 89% (16/18) | 100% (16/16) | 73% (16/22) | 100% (16/16) |
| **Total** | 89% (97/109) | 86% (97/113) | 76% (93/123) | 82% (93/113) |

Referencia: el clasificador con claros y dudosos juntos tiene precisión 89% y cobertura 89%.

Umbral de precisión de temas claros: 90%. Clasificador: 89%, no alcanza el umbral (el score sigue con el matcher y se itera la descripción de los temas).
Matcher, como referencia: precisión 76%.
