# Próximos pasos — investigación y decisiones pendientes

> Escrito el 25/8/2026, para revisar con tiempo. Arrancó siendo decisiones
> tomadas hasta donde se puede sin escribir código. Las **secciones 2 y 3 ya
> están implementadas** (ver "Hecho" en cada una); la sección 4 sigue sin una
> línea escrita.
>
> **Advertencia sobre las fuentes:** los límites de rate y las licencias de la
> **sección 2** salen de la documentación de cada proyecto, no de haberlas
> probado contra la API real — el entorno donde se investigó tenía la salida a
> internet filtrada. Antes de construir encima de cualquiera de estas, hacer una
> llamada de prueba y confirmar.
>
> La sección 3 ya no está en esa categoría: las 90 fotos se bajaron de verdad
> desde el repo de Free Exercise DB. La sección 4 sale de leer el código de acá.

---

## 1. Lo que ya está hecho

| Commit | Qué |
|--------|-----|
| `922b691` | Rediseño cyberpunk: rojo neón sobre negro, HUD de terminal |
| `57455c9` | Chakra Petch autohospedada y pase mobile-first hasta 320 px |
| `b6285d0` | Autodeploy por la integración de Git de Cloudflare Pages |
| `19f7395` | Fotos de ejercicios: 45 de 48, autohospedadas (sección 3) |
| `2e76eea` | Estimación de kcal y proteína del texto de la comida (sección 2) |

### Pasada de contraste y tap targets — 25/8/2026

Auditoría medida sobre las nueve pantallas, a 320 px. Encontró dos cosas, y las
dos eran un patrón, no casos sueltos.

**Contraste: los modificadores de opacidad eran el problema.** `muted` y
`accent` ya están en el piso al 100% —5,58 y 5,48 sobre `ink`, contra los 4,5
que pide WCAG AA. Cualquier `/60` o `/70` encima los hunde por debajo:
`text-muted/70` da 3,20 y `text-accent/60` da 2,51. Estaban en nueve lugares y
ninguno pasaba.

El cian (`accent-2`) es la excepción: aguanta hasta 56 % de opacidad sin bajar
de 4,5, así que ahí el modificador se dejó.

Los ordinales que estaban en `accent/60` fueron a `muted`, no a `accent` pleno:
un numerito de orden en rojo al 100 % grita más que el nombre del ejercicio que
acompaña. La razón quedó escrita arriba del token en `index.css`, que es donde
la va a leer el próximo que quiera atenuar algo.

**Tap targets: la pasada anterior arregló alto, no ancho.** Los ✕ de borrar
medían 29×44 y 37×44. Y peor: los cuatro links de volver medían **13 px de
alto** —un `<a>` inline toma la altura de la línea, no la del dedo—, siendo el
control más usado de cada pantalla de detalle. Ahora son un `BackLink` en
`primitives.jsx`, 53×44, con el área tocable extendida hacia el margen sin
mover el texto.

Después de la pasada: cero fallos de contraste y cero tap targets chicos en las
nueve pantallas.

Los dos primeros no tocan lógica: es CSS y clases. El pase de 320 px encontró
tres botones de 36 px de alto que venían de antes (el ✕ de borrar serie y las
flechas ↑↓ de rutinas). Están en 44.

`b6285d0` cambia cómo se publica: se fue el workflow de GitHub Actions y el
deploy lo maneja Cloudflare solo. **Cloudflare no permite conectarle Git a un
proyecto de Pages que ya existe** y nació como Direct Upload, así que hubo que
borrar `tingym` y recrearlo importando el repo.

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

**Un endpoint `/api/meal/parse` que use la capa de IA que ya está prevista.**
Le pasa el texto, devuelve kcal y proteína estimadas.

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

### Hecho — 25/8/2026

Implementado como `POST /api/meals/parse`, colgado del mismo mecanismo que el
coach. Las dos preguntas abiertas se resolvieron por la recomendada:

**Número editable.** La estimación llena los campos de kcal y proteína del
formulario, y de ahí en más son tuyos: los pisás y la corrección queda. Es un
diario, no un contador — el número es una sugerencia, no un candado.

**Se cachea por texto normalizado**, en memoria y con techo de 500 entradas.
La normalización aplana mayúsculas, tildes, espacios y puntuación de borde,
pero **no** cantidades: `200 g de pollo` y `300 g de pollo` siguen siendo
claves distintas. En memoria y no en Mongo a propósito: es un acelerador, no
un dato. Si el proceso reinicia se pierde y no pasa nada.

Decisiones que aparecieron al escribirlo:

- **`kcal: null` es una respuesta válida, no un error.** "Comí bien" no tiene
  calorías estimables, y el prompt pide explícitamente devolver null antes que
  inventar un número. La UI lo distingue de un fallo de red, y en ninguno de
  los dos casos pisa los números que ya hubieras cargado.
- **Sólo se cachea lo que sirve.** Cachear una estimación vacía condenaría a
  ese texto a no estimarse nunca más, aun si el fallo fue pasajero.
- **Se muestra la confianza** ("estimación sobre una porción típica"). El
  usuario tiene derecho a saber cuánto pesar el número: media quiere decir que
  asumimos una porción, no que la contamos.
- **No hay fallback determinista**, a diferencia del veredicto. No se puede
  calcular calorías con una regla local. O estima la IA o escribís a mano, que
  es exactamente lo que la app hace hoy.

**Falta para que se encienda:** cargar la key en Railway. Hoy `/api/health`
responde `coach: false` y el botón ni aparece.

```bash
railway variables --service api --set "GEMINI_API_KEY=..."
```

La key sale de https://aistudio.google.com/apikey, sin tarjeta.

**Sin verificar contra la API real:** la calidad de las estimaciones. El
cableado está probado punta a punta y el esquema tiene tests, pero nadie le
preguntó todavía a un modelo de verdad cuántas calorías tiene una milanesa.
Cuando cargues la key, la primera prueba es esa —y es la que más importa,
porque el modelo ya no es Claude y el español rioplatense con nombres de
comida local es justo donde puede flaquear. Ver sección 6.

Open Food Facts para código de barras sigue pendiente, sin empezar.

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

### Hecho — 25/8/2026

Las dos preguntas que quedaban se resolvieron así:

**El mapeo está hecho: 45 de 48.** Vive en `scripts/fetch-exercise-images.mjs`,
con clave por *nombre* del catálogo y no por id derivado — si alguien renombra
un ejercicio, el script explota en vez de dejar la foto vieja pegada a un
ejercicio que ya no es ese. Chequea las tres direcciones: catálogo sin mapear,
mapa con entradas muertas, e ids que ya no existen en la fuente.

Los tres sin foto son `Plancha lateral con elevación de cadera`, `Hollow hold`
y `Plancha con toque de hombros`. Están en el mapa como `null` explícito, no
ausentes: así "no hay equivalente" se distingue de "nos lo olvidamos". Preferir
sin foto a una foto parecida no es pereza — al que mira la foto le falta saber
cómo se hace, y una foto casi-igual lo confunde más que ninguna.

**Se sirven propias**, desde `client/public/exercises/<id>/`. Son 5,8 MB por
90 fotos: nada para el repo, y saca a `raw.githubusercontent.com` del camino
crítico. Al renombrarlas con nuestro id, la ruta queda derivada del ejercicio y
la app nunca se entera de que Free Exercise DB existe. El día que cambiemos de
fuente no se toca una línea de UI.

Detalles que salieron en el camino:

- **Las 90 son 3:2** (88 en 850×567, 2 en 800×533). El contenedor usa esa misma
  proporción: en cuadrado, `object-cover` recortaba los costados, que en una
  foto instructiva es justo donde están la barra y los pies.
- **Sin `loading="lazy"`.** Están arriba del fold, así que diferirlas no ahorra
  un byte y agrega un viaje antes de que aparezcan.
- Fondo blanco de estudio sobre tema negro: van en monocromo con el tinte rojo
  del tema en `soft-light`. Se pierde el color de la remera del modelo.
- El precache **no** se movió: sigue en 9 entradas y 453,7 KB. Las fotos van
  por `runtimeCaching` con `CacheFirst`, verificado en el `sw.js` generado.

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

## 6. Cambio de proveedor de IA — 25/8/2026

Anthropic quedaba pago y la decisión fue no sumar gasto. En vez de cambiar un
SDK clavado por otro SDK clavado, la llamada se metió detrás de
`server/src/llm.js`: `fetch` pelado contra el formato `/chat/completions` de
OpenAI, que es el que hablan Groq, Gemini, OpenRouter, Together y un Ollama
local. **Cambiar de proveedor ahora es una variable de entorno.** El proyecto
ya cambió una vez; la segunda no tiene que doler.

Se fue la dependencia `@anthropic-ai/sdk`. El server ya no tiene ningún SDK de
IA.

### Por qué Gemini y no Groq

La primera versión de esta sección decía Groq, por la fila de privacidad. Se
revisó y se dio vuelta.

| | Gemini free | Groq |
|---|---|---|
| Gratis sin tarjeta | Sí | Sí |
| Límites | 15/min, 1.500/día | 30/min, 1.000/día |
| Calidad en español rioplatense | Mejor | Peor |
| Obediencia al "sólo JSON" | Mejor | Peor |
| **Entrena con tus prompts** | **Sí** | **No** |

Los dos riesgos abiertos de esta feature son las dos filas del medio, y Gemini
las gana. Elegir el modelo peor para ganar la fila de privacidad era pagar en
la moneda equivocada, porque **lo que viaja no identifica a nadie**: `Press
banca (barbell), 4 series de 8 con 60 kg` y `milanesa con puré`. Sin email, sin
nombre, sin id de usuario. Son strings anónimos sobre series y comida.

Los límites de cualquiera de los dos sobran por dos órdenes de magnitud para un
usuario solo.

**Cuándo revisar esta decisión:** si las notas del atleta empiezan a llevar
texto más personal —una molestia, una lesión—, la fila de privacidad pasa a
pesar y Groq es un `LLM_PROVIDER=groq`.

### Medido contra la API real — 25/8/2026

Con la key cargada, la feature se probó de verdad. Dos hallazgos.

**Bug real: `max_tokens` estaba muy bajo.** Toda la familia Gemini 3.x razona
antes de responder, y el presupuesto de tokens se gasta PRIMERO pensando. Con
200 tokens, `gemini-3.6-flash` devolvía `{"kcal": 580, "proteinG": 30,` —
cortado al medio, `finish_reason: "length"`— y el JSON no parseaba. No era la
API ni el prompt: era el presupuesto. Ahora se piden 1.500 para una respuesta
de 22 tokens, y en un modelo que no razona eso no cuesta nada porque frena en
cuanto cierra la llave.

**El plan gratis de Gemini está congestionado.** Ocho comidas por modelo:

| | `3.6-flash` | `3.5-flash-lite` |
|---|---|---|
| Respuestas válidas | 6/8 (2× HTTP 503) | 3/8 (5 timeouts >40 s) |
| Latencia mediana | **20,2 s** | 5,1 s |
| Máxima | 32,6 s | >40 s |

`gemini-3.7-flash` quedó descartado: devuelve 503 "high demand" o cuelga más de
60 s. `gemini-flash-latest` apunta ahí, así que tampoco sirve. Y `2.5-flash` ya
tira 404 para cuentas nuevas — el pinneo envejeció en una hora, tal como
advertía la sección de más arriba.

La calidad cuando responde está bien: asado con chorizo y morcilla 950 kcal /
60 g, milanesa con puré 670 / 32. Plausibles. **El problema no es el modelo, es
la disponibilidad.**

**Y después apareció el número que cierra la discusión.** Persiguiendo los 429
salió el cuerpo del error, que es el único lugar donde Google dice la cuota
real:

```
quotaId:    GenerateRequestsPerDayPerProjectPerModel-FreeTier
quotaValue: 20
model:      gemini-3.6-flash
```

**Veinte requests por día.** No 1.500, que es lo que dicen los blogs — deben
referirse a otro modelo o a otra época. Cuatro comidas anotadas y tres
ejercicios con veredicto son la mitad del día.

Eso descarta Gemini, y no por calidad. El default vuelve a **Groq**, que da
1.000 por día: cincuenta veces más. La cuota de Gemini es por modelo, así que
se podría estirar rotando modelos, pero es frágil y no vale la pena.

### Groq, medido — 25/8/2026

Con la key cargada se midió también. Dos sorpresas.

**`llama-3.3-70b-versatile` ya no existe en Groq.** El catálogo cambió y no hay
más modelos Llama de chat. El mensaje de 404 que nombra la variable volvió a
ser lo que lo destapó, por segunda vez en el día.

**`qwen/qwen3.6-27b` es inutilizable acá:** filtra bloques `<think>` dentro del
`content` y el JSON no parsea nunca. 0 de 10. Es exactamente el riesgo que
estaba anotado como "los modelos abiertos obedecen menos el sólo-JSON", sólo
que peor de lo esperado: no es que envuelva en backticks, es que escribe el
razonamiento adentro de la respuesta.

Quedó `openai/gpt-oss-120b`. Seis de seis válidas, **~700 ms** contra los 20
segundos de mediana de Gemini.

Calidad: clava los platos simples (200 g de pollo con arroz → 530 kcal / 66 g,
contra ~530/65 de tabla; alfajor → 220/3) y **subestima los compuestos** entre
20 % y 30 % — milanesa con puré da 450-550 donde deberían ser ~700, tres
empanadas 600 donde son ~750.

**El presupuesto de tokens fue el 80 % del trabajo.** Tres vueltas:

1. `max_tokens: 200` truncaba a Gemini. Se subió a 1.500.
2. Con 1.500, Groq daba 429 constantes: reserva el `max_tokens` pedido contra
   su cuota de **8.000 tokens por minuto**, así que cinco llamadas y se acabó.
3. `gpt-oss` también razona —y engaña: los tokens de razonamiento cuentan en
   `completion_tokens` pero **no aparecen en `content`**, así que al truncarse
   la API devuelve 200 OK con el content vacío. Fallaban justo las comidas de
   varios ítems.

Quedó resuelto poniendo la holgura en la capa de LLM y no en quien llama:
`maxTokens` es el tamaño de la respuesta, y `llm.js` le suma lo que ese
proveedor necesita para pensar (600 en Groq, 1.500 en Gemini). Dos tests fijan
las dos mitades.

**Estado final, medido contra producción: 12 de 12 válidas, mediana 1,2 s.**

| Comida | Estimación |
|--------|-----------|
| 200 g de pollo con arroz | 530 kcal · 66 g |
| Milanesa con puré | 450 · 23 |
| Asado: dos chorizos, morcilla y tira | 1380 · 83 |
| Tres empanadas de carne | 600 · 27 |
| Un alfajor | 220 · 3 |
| Provoleta y una picada | 860 · 35 |
| `comí bien` / `lo de siempre` | `null` · `null` |

**Pendiente:** calibrar el prompt. Los platos simples salen bien (pollo con
arroz 530/66 contra ~530/65 de tabla, alfajor 220/3) pero los compuestos
oscilan: la milanesa con puré da 450 donde deberían ser ~700, y el asado 1380
que parece alto. El lugar es el prompt de `server/src/routes/meals.js`, con
porciones de referencia argentinas. Ahora se puede medir de verdad, que es lo
que faltaba.

---

### Lo que hay que mirar cuando esté andando

El modelo ya no es Claude. Dos cosas a vigilar:

- **Obediencia al "solo JSON".** El parseo tolerante ya estaba y ahora tiene
  tests que cubren backticks y prosa alrededor, pero si falla seguido, el paso
  siguiente es `response_format`, que los dos proveedores soportan.
- **Español rioplatense con comida local.** Milanesa, facturas, provoleta. Es
  el punto más probable de flaqueza y no está verificado contra el modelo real.
  Elegir Gemini lo baja, no lo elimina.

El worker de Cloudflare también se portó, aunque hoy no esté en uso: dejar dos
backends en proveedores distintos es una trampa para el que vuelva en tres
meses. Su `llmConfig` está duplicado a propósito —`shared` es código puro sin
red y el Worker no tiene `process.env`.

---

## 7. Pasada de UX sobre la rutina real — 25/8/2026

`rutina-4-dias.md` se leyó como especificación, no como dato. Dos cosas que la
rutina escrita a mano hacía y la app no podía expresar:

### Cronómetro de descanso

El `restSeconds` ya estaba en el modelo y se mostraba (`2:30 descanso`), pero
nunca corría: había que contar con el reloj del celular, teniendo la rutina la
regla escrita ("2-3 min en los pesados, 60-90 seg en los livianos").

Arranca solo al anotar la serie. El estado es un **instante de fin**, no un
contador que baja: un `setInterval` se congela al bloquear la pantalla y volvés
a los dos minutos con el reloj en quince segundos. Verificado recargando a
mitad de un descanso — faltaban 130 s, tras la recarga marcaba 115 s, mismo
`finishAt`.

Vibra una sola vez al llegar a cero y sigue contando hacia arriba. Vibrar es el
único aviso que sirve con el teléfono en el bolsillo: un sonido molesta al
gimnasio y una push necesita servidor y permiso.

Vive en `localStorage` y no en Dexie: es el estado de un cronómetro, no un dato
del entrenamiento. Se descarta solo si tiene más de una hora.

### Alternativas por slot

La rutina tiene **ocho** slots con "X o Y" —*Dominadas o jalón al pecho*,
*Sentadilla o prensa*, *Press cerrado o fondos*— y el modelo tenía un solo
`exerciseId`. Cambiar era abrir el buscador y filtrar 48 ejercicios con la mano
sudada. Ahora se declaran en la rutina y en la sesión aparecen como botones: un
tap.

No reemplaza a `substitutedFor`, que sigue siendo el registro reactivo de que
cambiaste. Esto es el **plan**; aquello es el **hecho**. Y cuando cambiás, el
original pasa a ser una opción más: volver atrás cuesta lo mismo que haber ido.

Tope de cuatro, porque una lista más larga deja de ser un plan y vuelve a ser
un buscador.

### `accent-3` no pasaba contraste

La auditoría encontró el magenta `#c026d3` en 4.09 sobre `surface`, contra los
4.5 de AA. Se usaba como texto en dos lugares (la marca de "en lugar de" y el
veredicto `revisar_tecnica`), así que se corrigió el token y no los dos usos.
`#d946ef` da 5.17 en el peor fondo.

Se le escapó a la pasada de contraste anterior porque esa buscó modificadores
de opacidad, y este color fallaba al 100 %.

### Medidas corporales

El doc dice que *"la balanza es mala herramienta con tu objetivo"* y tiene su
propia tabla de hombros/pecho/brazo/cintura, pero la app sólo guardaba kg.

Van **adentro del pesaje**, no en una colección aparte, porque en la planilla
de papel van en la misma fila: una fecha, un peso, y las medidas si ese día
tocaba medirse. Separarlas obligaría a cruzar dos series por fecha para mostrar
lo que es una sola lectura del cuerpo.

El formulario las muestra plegadas detrás de un botón: el pesaje es semanal y
la cinta es mensual, así que mostrar cuatro campos vacíos en cada anotada es
pedir que se ignoren doce veces por cada vez que se usan.

La tarjeta compara contra **la medición anterior con cinta**, no contra el
pesaje anterior — es lo que contesta "¿estoy creciendo?".

`measurements` entra con `.default({})`, así que los pesajes que ya están en el
teléfono siguen parseando sin migración. Hay un test que lo fija, porque si eso
se rompe la app no arranca para quien ya la usaba.

### "Por lado" y iconos

`perSide` es un flag **del slot**, no del ejercicio: la misma plancha lateral
va por lado un día y a tiempo total otro. Se muestra en el editor, en el
objetivo de la sesión y en la etiqueta del campo de reps.

La navegación pasó de cinco etiquetas de texto a icono + etiqueta. SVG inline,
no una librería —son cinco y pesan menos que el import— y **nunca emojis**: se
ven distinto en cada sistema y no heredan el color del tema. Los cinco
comparten viewBox 24, trazo 1.75 y `currentColor`; eso es lo que los hace
verse de la misma familia.

### Dos tap targets más que aparecieron midiendo

El título editable de la rutina medía **22 px** de alto: había que acertarle a
la línea de texto para renombrar. Y el `accent-3` del commit anterior. Los dos
salieron de la auditoría automática, no de mirar la pantalla.

### Series de calentamiento — era un bug de corrección

La rutina dice *"Calentamiento: 1-2 series livianas del primer ejercicio"*, y
esas series entraban al motor de progresión como series de trabajo. No es
cosmético: calentar con 40 kg × 12 antes de trabajar con 60 × 7 hacía que el
motor viera la primera serie por encima del techo del rango y una caída de
cinco reps hasta la última. **Dos señales falsas sobre una sesión normal.**

Ahora `warmup` es un flag de la serie y `workingSets()` lo excluye. Todo lo que
mide esfuerzo —volumen, peso tope, veredicto, serie histórica, barra de avance—
pasa por ahí, así que alcanza con filtrarlo en un lugar.

De paso se sacó la duplicación que había causado el problema: `insights.js`
repetía el filtro `reps > 0` en tres lugares con su propia copia. Ahora los
tres importan `workingSets`.

**Dos bugs que sólo aparecieron probando en el navegador**, no en los tests:

- `logSet` construye el objeto campo por campo y no incluía `warmup`, así que
  el flag no se persistía nunca. Los tests unitarios pasaban porque probaban
  las funciones puras, no la capa que guarda.
- Los contadores de avance (`1/4` en la tarjeta y la barra de la sesión)
  contaban el calentamiento como serie hecha.

El calentamiento tampoco arranca el cronómetro de descanso: no se descansan dos
minutos después de calentar. Y no consume número de serie —la primera de
trabajo dice "Serie 1" aunque hayas calentado dos veces—, porque si dijera
"Serie 3" no cerraría con el objetivo de la rutina.

### Objetivo de proteína

El plan dice *"Proteína: 110-125 g por día. **Es el punto que más define el
resultado**"*. La app sumaba proteína por día pero no sabía contra qué, así que
no podía contestar la única pregunta que importa: si llegaste.

Barra por día contra el objetivo, verde sólo al llegar —una barra que se pone
verde al 80 % vuelve difuso justo eso— y pasarse no se castiga. Sin objetivo
cargado no se muestra ninguna barra: una barra contra un número inventado
miente.

Vive en `meta`, así que **no viaja en el sync**: en un teléfono nuevo hay que
volver a cargarlo. Es un número; agregar una colección al sync para eso no se
paga.

### Lo que sigue faltando

- **Core como pareja A/B alternante.** La rutina alterna dos parejas de
  ejercicios entre días de core, y no hay forma de expresarlo. Es una pregunta
  de modelo antes que de UI: ¿superserie, o rotación por sesión?
- **RIR global.** *"Reps en reserva: 1"* es una regla de toda la rutina; hoy el
  `rpe` es por serie y no se usa. Habría que decidir si el RIR lo reemplaza o
  convive.

---

## 5. Para decidir mañana

- [x] ~~¿El parseo de comida va por Anthropic o se mete FatSecret?~~
      Ni uno ni otro: va por Gemini, gratis. Ver sección 2 y la 6.
- [x] ~~¿Las imágenes de ejercicios se sirven propias o desde el raw de GitHub?~~
      Propias. Ver sección 3.
- [ ] ¿Se arranca por entrenador/alumno o por las dos features chicas primero?
- [ ] Confirmar con una llamada real los límites de Open Food Facts antes de
      construir encima.
