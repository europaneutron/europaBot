## ADDED Requirements

### Requirement: La prosa referencia el dato, no lo copia

Una respuesta SHALL poder llevar huecos enlazados a valores del catalogo. La etapa de redaccion del compilador SHALL producir prosa con huecos en lugar de cifras, y el editor SHALL enlazar datos en vez de admitir la cifra escrita dentro del texto.

#### Scenario: La respuesta compilada lleva huecos

- **WHEN** el compilador redacta el precio de un modelo
- **THEN** la respuesta dice "Desde {precio}" y no "Desde $2,980,000 MXN"
- **AND** el hueco apunta al valor de ese alcance

#### Scenario: Cambiar el dato cambia la respuesta

- **WHEN** se edita el precio de un modelo en el catalogo
- **THEN** todas las respuestas que lo referencian dicen el valor nuevo
- **AND** ninguna conserva el anterior

#### Scenario: El editor muestra el resultado

- **WHEN** alguien escribe una frase con un dato enlazado
- **THEN** debajo se ve la frase con el valor real

### Requirement: Los huecos se resuelven por alcance

Un hueco SHALL resolverse contra el catalogo del alcance desde el que se responde, con la misma herencia que el contenido: lo propio primero, lo del ancestro si no hay propio.

#### Scenario: Cada modelo con su propio valor

- **WHEN** la misma frase se responde desde dos modelos con precios distintos
- **THEN** cada lead recibe el precio de su modelo

#### Scenario: Un valor heredado

- **WHEN** un modelo no tiene direccion propia y su desarrollo si
- **THEN** el hueco de direccion se resuelve con la del desarrollo

### Requirement: Un hueco sin dato no se manda

Una respuesta con un hueco que no se puede resolver SHALL NOT enviarse. El sistema SHALL NOT sustituir el hueco por una cadena vacia ni dejar el token a la vista.

#### Scenario: Falta el dato en el alcance y en sus ancestros

- **WHEN** una respuesta referencia un valor que no existe en ninguna parte de la rama
- **THEN** no se envia
- **AND** el lead recibe el mismo trato que ante una pregunta que el material no cubre

#### Scenario: Nunca sale el hueco vacio

- **WHEN** falta un valor
- **THEN** el lead no recibe la frase con un espacio en blanco donde iba el dato
- **AND** tampoco recibe el token entre llaves

#### Scenario: La respuesta incompleta se ve en el panel

- **WHEN** una respuesta activa depende de un valor que falta
- **THEN** se ve como incompleta, con el dato que le falta

### Requirement: Una respuesta que no se puede completar no se publica

El compilador SHALL NOT publicar una respuesta cuyos huecos no tengan valor en el catalogo del alcance al que se publica, y SHALL indicar cual falta.

#### Scenario: Propuesta con un hueco sin respaldo

- **WHEN** una propuesta referencia un dato que el material no aporto
- **THEN** no se publica
- **AND** el motivo dice que dato falta

#### Scenario: Propuesta con todos sus datos

- **WHEN** todos los huecos de una propuesta tienen valor
- **THEN** se publica

### Requirement: La respuesta general se compone del catalogo

Una respuesta que enumera varios alcances con su dato SHALL componerse del catalogo en vez de redactarse una vez con cifras dentro.

#### Scenario: El precio general de un desarrollo

- **WHEN** el lead pregunta el precio con el foco en un desarrollo
- **THEN** la enumeracion de sus modelos toma el precio de cada uno del catalogo
- **AND** cambiar uno de esos precios cambia la enumeracion

#### Scenario: La composicion no mezcla ramas sin nombrarlas

- **WHEN** la enumeracion abarca modelos de mas de un desarrollo
- **THEN** cada uno aparece con su desarrollo
