## ADDED Requirements

### Requirement: La configuracion del asesor tiene una sola fuente

El telefono del asesor, el horario de atencion y el correo de ventas SHALL vivir en una sola tabla, acotada por alcance, y SHALL resolverse con la misma herencia que el resto del contenido. El sistema SHALL NOT conservar copias de esos valores en otra tabla.

#### Scenario: Lo que se edita es lo que se usa

- **WHEN** se cambia el telefono del asesor desde el panel
- **THEN** la derivacion a asesor usa ese telefono
- **AND** no queda ninguna otra copia que pueda leerse en su lugar

#### Scenario: Un desarrollo con su propio asesor

- **WHEN** un desarrollo tiene telefono propio y otro no
- **THEN** el primero deriva al suyo
- **AND** el segundo hereda el del negocio

#### Scenario: Sin valor en ninguna parte

- **WHEN** no hay telefono en el alcance ni en sus ancestros
- **THEN** la derivacion falla de forma visible en vez de usar uno por omision
