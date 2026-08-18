## MODIFIED Requirements

### Requirement: Contenido propuesto y trazable

La compilación SHALL generar patrones de detección y respuestas propuestas por par de alcance e intención, y cada respuesta SHALL conservar de qué hechos depende.

Los patrones de detección SHALL ser suficientes para alcanzar la respuesta: sinónimos, erratas y frases completas derivadas del material, no las palabras del nombre de la intención. Una propuesta cuyos patrones no reconocen su propia pregunta no está completa y no se publica.

Las preguntas que el catálogo estable contempla SHALL nombrarse con ese nombre, para que dos corridas del mismo material no produzcan intenciones distintas para lo mismo.

#### Scenario: Respuesta propuesta

- **WHEN** una pregunta del catálogo tiene hechos que la respaldan
- **THEN** el sistema propone una respuesta para ella
- **AND** registra los hechos de los que depende
- **AND** los patrones propuestos reconocen la pregunta que dice cubrir

#### Scenario: Patrones insuficientes

- **WHEN** los patrones propuestos no reconocen ninguna forma corriente de hacer esa pregunta
- **THEN** la propuesta se marca y queda fuera de la publicación

#### Scenario: Trazabilidad hasta el material

- **WHEN** un administrador revisa una respuesta propuesta
- **THEN** puede llegar desde ella hasta los hechos y desde los hechos hasta el material

#### Scenario: El catálogo de intenciones no se multiplica

- **WHEN** se compila el material de un alcance que hereda el catálogo de su ancestro
- **THEN** el sistema no duplica esas intenciones en el alcance
- **AND** produce respuestas propias donde el material difiere

#### Scenario: Nombres estables entre corridas

- **WHEN** se compila el mismo material dos veces
- **THEN** las preguntas equivalentes se nombran igual en ambas corridas
