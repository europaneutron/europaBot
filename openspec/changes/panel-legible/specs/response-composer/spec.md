## ADDED Requirements

### Requirement: La unidad no se repite al renderizar

Cuando el valor de un dato ya incluye su unidad y la prosa la repite justo despues, el sistema SHALL enseñar la unidad una sola vez, aunque tenga varias palabras.

#### Scenario: Unidad de una palabra

- **WHEN** el valor es "96 casas" y la plantilla dice "Tiene {casas} casas"
- **THEN** el lead lee "Tiene 96 casas"

#### Scenario: Unidad de varias palabras

- **WHEN** el valor es "1 medio bano" y la plantilla dice "{medio_bano} medio bano"
- **THEN** el lead lee "1 medio bano"

#### Scenario: Una repeticion que estaba escrita

- **WHEN** la plantilla dice "Ya ya veremos" y no hay ningun dato sustituido ahi
- **THEN** el texto se respeta tal cual

#### Scenario: Sin repeticion

- **WHEN** el valor es "250 m2" y la plantilla dice "Terreno de {terreno}"
- **THEN** el lead lee "Terreno de 250 m2"
