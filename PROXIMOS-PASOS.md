# Próximos pasos — investigación y decisiones pendientes

> Escrito el 25/8/2026, para revisar con tiempo. Nada de acá está implementado:
> son decisiones tomadas hasta donde se puede sin escribir código, con lo que
> falta marcado explícitamente.
>
> **Advertencia sobre las fuentes:** los límites de rate y las licencias de la
> sección 2 y 3 salen de la documentación de cada proyecto, no de haberlas
> probado contra la API real — el entorno donde se investigó tenía la salida a
> internet filtrada. Antes de construir encima de cualquiera de estas, hacer una
> llamada de prueba y confirmar. Lo de la sección 4 sí está verificado: sale de
> leer el código de este repo.

---

## 1. Lo que ya está hecho

Dos commits en `main`, sin cambios de lógica: es CSS y clases.

| Commit | Qué |
|--------|-----|
| `922b691` | Rediseño cyberpunk: rojo neón sobre negro, HUD de terminal |
| `57455c9` | Chakra Petch autohospedada y pase mobile-first hasta 320 px |

El pase de 320 px encontró tres botones de 36 px de alto que venían de antes
(el ✕ de borrar serie y las flechas ↑↓ de rutinas). Están en 44.

---

## 2. Comida → calorías y proteínas

**El problema real no es la base de datos, es el parseo.** Ninguna base gratis
resuelve `200 g de pollo, arroz y ensalada` escrito en argentino. Las gratis son
catálogos de envasados con código de barras, o de comida genérica en inglés.

| Opción | Para qué sirve | El problema |
|--------|----------------|-------------|
| [Open Food Facts](https://openfoodfacts.github.io/openfoodfacts-server/api/) | Código de barras de envasados. Sin API key, sólo User-Agent propio | 10 req/min por IP en búsqueda, 15 en producto. Datos ODbL: atribución obligatoria |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide.html) | Genéricos, gratis, +380k alimentos | Inglés y céntrico en EE.UU. "Milanesa" no existe |
| [FatSecret Platform](https://platform.fatsecret.com/api-editions) | Multilingüe real, español incluido. 5.000 llamadas/día gratis | Requiere OAuth y aprobación previa |
| [Nutritionix](https://www.nutritionix.com/business/api) | Lenguaje natural de verdad | En inglés, y el free tier es restrictivo |

### La trampa del límite por IP

Open Food Facts limita **por IP**, no por usuario. Si las llamadas salen del
server de Railway, ese límite lo comparten todos los usuarios de la app: diez
búsquedas por minuto entre todos. Si salen del navegador, cada uno tiene su
propia IP y el límite deja de importar — pero hay que confirmar que respondan
con CORS abierto.

### Propuesta

**Un endpoint `/api/meal/parse` que use la key de Anthropic que ya está
prevista.** Le pasa el texto, devuelve kcal y proteína estimadas.

Por qué esto y no una base de datos:

- Entiende argentino sin diccionario ni traducción.
- No suma una dependencia nueva, un OAuth nuevo ni una atribución legal nueva.
- **Degrada igual que el coach**, que es el patrón que la app ya tiene: sin
  señal no hay estimación y anotás a mano, que es exactamente lo que se hace
  hoy. El `/api/health` ya informa `coach: false`; esto se cuelga del mismo
  mecanismo.
- El doc maestro dice que esto es *un diario, no un contador*. Un diario tolera
  una estimación; un contador no. Si algún día se vuelve contador, esta decisión
  hay que revisarla.

**Open Food Facts queda, pero sólo para código de barras.** Escanear la barrita
de proteína o el yogur es su caso de uso real, y ahí 15 req/min sobra. Es la
parte donde sí hace falta el número exacto y donde una estimación no sirve.

Lo que falta decidir:

- Si el resultado del parseo se guarda como número editable (recomendado: el
  usuario corrige y la corrección queda) o como valor cerrado.
- Si se cachea el parseo por texto normalizado. "Pollo con arroz" se va a
  escribir cincuenta veces y no tiene sentido pagar cincuenta llamadas.

---

## 3. Ejercicios con foto o video

| Opción | Qué trae | Licencia |
|--------|----------|----------|
| **[Free Exercise DB](https://github.com/yuhonas/free-exercise-db)** | 800+ ejercicios, 2 fotos c/u (inicio y fin), instrucciones | **Unlicense — dominio público** |
| [wger](https://github.com/wger-project/wger) | 845+ ejercicios traducidos al español, imágenes y videos, instancia pública en wger.de | Software AGPL-3.0; los datos son Creative Commons **por entrada** |
| [ExerciseDB](https://github.com/exercisedb/exercisedb-api) | 11.000+ con GIFs animados | AGPL con planes pagos, y los derechos de redistribución de los GIFs no están claros |

### Propuesta

**Free Exercise DB.** El catálogo propio ya existe y está en español con ids
derivados del nombre (`ex-press-militar-sentado`) — no hace falta su lista,
hacen falta sus **imágenes**. Dominio público quiere decir bajarlas, servirlas
desde el propio dominio y no volver a pensar en el tema legal nunca más.

**ExerciseDB se descarta** por los derechos de los GIFs. wger es la alternativa
si se quiere español de fábrica y video, pero "Creative Commons por entrada"
significa revisar licencia ejercicio por ejercicio, y son 845.

### Lo que no hay que hacer

**No precachear las imágenes.** 800 ejercicios × 2 fotos rompe el arranque de la
PWA, que hoy son 9 entradas y 450 KB. Va con `CacheFirst` en el service worker:
el ejercicio que miraste una vez queda disponible sin señal, que es justo cuando
lo vas a querer. El resto no ocupa nada.

Lo que falta:

- El mapeo entre el catálogo propio y los ids de Free Exercise DB. Son ~60
  ejercicios en el seed, así que es a mano y una sola vez. Los que no matcheen
  se quedan sin foto, y está bien.
- Decidir si las imágenes se sirven desde Cloudflare Pages junto al frontend
  (simple, gratis, y quedan en el mismo dominio) o desde el raw de GitHub
  (cero laburo, pero dependencia de un tercero en el camino crítico).

---

## 4. Entrenador y alumno

Esto es lo que más hay que pensar antes de escribir nada, porque **rompe una
premisa explícita del diseño actual**.

### El problema

El sync de hoy es `owner_id` + last-write-wins sobre `clientUpdatedAt`, y el
README lo justifica así:

> Sin CRDTs: no hay edición concurrente real, es un usuario con varios
> dispositivos.

Compartir rutinas rompe exactamente esa premisa. Un entrenador editando la
rutina mientras el alumno entrena **es** edición concurrente real, entre dos
personas distintas, cada una con su copia local y sin señal en el subsuelo. Con
last-write-wins, el que sincroniza último pisa al otro sin avisar. En el peor
caso el alumno pierde las series que anotó.

### La salida que no obliga a CRDTs: copia al asignar

El entrenador no comparte *la* rutina: **publica una versión** de la rutina. El
alumno recibe un snapshot propio, con `owner_id` suyo.

```
routine (del entrenador)          routineAssignment (del alumno)
  _id                               _id
  ownerId: <entrenador>             ownerId: <alumno>
  name, days[...]                   sourceRoutineId: <routine._id>
  publishedVersion: 3               sourceVersion: 3
                                    assignedBy: <entrenador>
                                    name, days[...]   ← snapshot congelado
                                    acceptedAt
```

Qué se gana:

- **El last-write-wins queda intacto.** Cada documento sigue teniendo un solo
  dueño y un solo escritor. No hay que tocar el motor de sync.
- El alumno puede modificar su copia (cambiar un ejercicio porque la máquina
  estaba ocupada) sin pelear con el entrenador ni romperle la rutina a nadie.
- Si el entrenador cambia algo, sube `publishedVersion` y al alumno le llega
  como **una versión nueva que acepta o no**. Nunca se le cambia la rutina
  abajo de los pies en el medio de una sesión.
- Sale gratis el historial: "qué rutina me dio en marzo" es una fila más.

Qué se pierde, y hay que aceptarlo: el entrenador no ve en vivo lo que el alumno
está haciendo. Para eso hace falta que el alumno **comparta resultados**, que es
una feature aparte y con su propio permiso — no un efecto secundario de la
asignación.

### Auth y roles

El esquema de auth actual (PBKDF2 en el cliente, SHA-256 con sal en el server)
no necesita cambios: un entrenador es un usuario más. Lo que hace falta:

- `role` en el usuario, o mejor **una relación `coaching`** entre dos usuarios,
  porque la misma persona puede entrenar y ser entrenada. Un `role` global lo
  impide y es difícil de revertir después.
- El vínculo lo inicia el alumno o se acepta explícitamente. Que un entrenador
  te pueda asignar rutinas sin que hayas aceptado es un agujero.

### Lo que no hay que hacer

- **No** documentos compartidos con ACL por documento. Es donde se necesitan
  CRDTs de verdad, y el doc maestro ya descartó ese camino por buenas razones.
- **No** meter `role` global en el usuario si se puede evitar (ver arriba).
- **No** empezar por la UI del entrenador. Lo primero es el modelo de datos y la
  migración; la pantalla es lo fácil.

### Orden sugerido

1. Relación `coaching` + aceptación. Sin esto no hay nada.
2. Publicar versión de rutina (el entrenador) y asignación como snapshot.
3. UI de "rutinas que me asignaron", con el diff cuando llega una versión nueva.
4. Recién después, compartir resultados hacia el entrenador.

---

## 5. Para decidir mañana

- [ ] ¿El parseo de comida va por Anthropic o se mete FatSecret? (recomendado:
      Anthropic, sección 2)
- [ ] ¿Las imágenes de ejercicios se sirven propias o desde el raw de GitHub?
- [ ] ¿Se arranca por entrenador/alumno o por las dos features chicas primero?
- [ ] Confirmar con una llamada real los límites de Open Food Facts antes de
      construir encima.
