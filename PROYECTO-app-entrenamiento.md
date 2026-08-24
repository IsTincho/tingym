# App de entrenamiento — Documento maestro

> Documento de arranque para Claude Code. Leer completo antes de escribir código.

---

## 1. Qué es esto

Una app web para registrar entrenamientos de gimnasio, con una capa de IA que **interpreta** los números en vez de solo guardarlos.

**El insight que justifica el proyecto:** el logging ya está resuelto por el mercado (Hevy, Strong). Lo que ninguna app hace es leer el dato y decidir. Ejemplos reales de decisiones que la app tiene que poder tomar:

- "12 reps con objetivo de 6-8 → el peso está liviano, subí"
- "Caés de 10 a 8 entre series → el peso te está ganando, mantené"
- "Esa primera serie salió baja porque la encadenaste sin descanso, no por el peso"
- "Llegaste al techo del rango en las 4 series → subí en la próxima sesión"

Sin esa capa, esto es una versión peor de Hevy. **La capa de interpretación es el producto.**

---

## 2. Restricciones no negociables

### 2.1 Offline-first

Los gimnasios son subsuelos sin señal. **Si la app necesita red para anotar una serie, la app está muerta.**

- Todo el registro escribe primero en IndexedDB local
- La UI nunca espera una respuesta de red para confirmar una acción
- Sync oportunista cuando hay conexión, en background
- La app tiene que funcionar completa en modo avión, salvo la capa de IA

### 2.2 Mobile-first real

Se usa parado, con una mano, sudado, entre series. No es un dashboard.

- Targets táctiles grandes
- Anotar una serie: máximo 2 taps
- Nada de scroll horizontal, nada de modales anidados
- PWA instalable

### 2.3 La API key vive en el servidor

La key de Anthropic nunca toca el cliente. Es la única razón técnica por la que existe el backend Node — sin la capa de IA, esto sería una PWA estática y no haría falta servidor.

---

## 3. Stack

**MERN**, con justificación por pieza:

| Pieza | Decisión | Por qué |
|-------|----------|---------|
| MongoDB | Sí | Una sesión es un documento con ejercicios y series anidados. El esquema va a mutar seguido mientras se agregan ejercicios y variantes. Es fit real, no forzado. |
| Express | Sí | API delgada: auth, sync, y proxy a la API de Anthropic. |
| React | Sí | + Vite. |
| Node | Sí | Ver 2.3. |

**Agregados:**
- **Dexie.js** sobre IndexedDB (no uses la API cruda)
- **Tailwind** para estilos
- **Zod** para validación compartida cliente/servidor
- **vite-plugin-pwa** para el service worker

**No uses:** Redux (alcanza con Context + useReducer), ORM pesado sobre Mongo, librería de componentes completa.

---

## 4. Modelo de datos

Decisión clave: **todo lleva `ownerId` desde el día uno, y un `gymId` opcional.** Es seguro barato — si más adelante se vende a un gimnasio (ver sección 7), la multi-tenencia no requiere migración.

```js
// users
{
  _id, email, passwordHash,
  name,
  role: 'athlete' | 'trainer' | 'admin',   // default 'athlete'
  gymId: ObjectId | null,                   // null = usuario individual
  bodyweightLog: [{ date, kg }],            // pesajes
  createdAt, updatedAt
}

// exercises  (catálogo, seedeable + custom por usuario)
{
  _id, ownerId: ObjectId | null,            // null = global
  name,                                      // "Press militar sentado"
  muscleGroup: 'espalda'|'hombros'|'pecho'|'biceps'|'triceps'|'piernas'|'core',
  pattern: 'push'|'pull'|'squat'|'hinge'|'isolation'|'static',
  loadType: 'barbell'|'dumbbell'|'cable'|'machine'|'bodyweight'|'time',
  notes                                      // cues de técnica
}

// routines  (la plantilla, no lo ejecutado)
{
  _id, ownerId, gymId,
  name,                                      // "4 días — espalda y hombros"
  assignedTo: ObjectId | null,               // trainer → atleta
  days: [{
    key: 'D1',
    label: 'Espalda + hombros',
    slots: [{
      exerciseId,
      targetSets: 4,
      repRangeMin: 6,
      repRangeMax: 8,
      restSeconds: 150,
      note                                    // "codo fijo, bajá lento"
    }]
  }],
  createdAt, updatedAt
}

// sessions  (una sesión ejecutada)
{
  _id, ownerId, routineId, dayKey,
  date,
  status: 'in_progress' | 'done',
  entries: [{
    exerciseId,
    substitutedFor: ObjectId | null,          // si cambió el ejercicio ese día
    sets: [{
      weightKg,                                // null si bodyweight
      reps,
      rpe: Number | null,
      failed: Boolean,
      note,                                    // "última costó"
      loggedAt
    }],
    aiVerdict: {                               // ver sección 6
      reading, action, confidence, generatedAt
    } | null
  }],
  syncState: 'local' | 'synced',
  clientUpdatedAt                              // para resolver conflictos
}
```

**Sobre `substitutedFor`:** en la práctica los ejercicios se cambian todo el tiempo (no hay mancuernas de 4 kg, la máquina está ocupada, el movimiento resultó incómodo). Modelarlo desde el principio evita que el historial se rompa.

**Sync:** last-write-wins por `clientUpdatedAt`. Con un solo usuario editando sus propias sesiones no hay conflictos reales. No construyas CRDTs.

---

## 5. Alcance V1

**Objetivo: que sea usable en el gimnasio en un fin de semana de trabajo.**

Incluye:

1. Auth básica (email + password, JWT)
2. Crear/editar una rutina con días, ejercicios y rangos objetivo
3. Iniciar sesión del día → lista de ejercicios
4. **Anotar serie: peso + reps, dos taps**
5. **Mostrar la última sesión de ese ejercicio al lado del input** ← el 80% del valor
6. Historial por ejercicio (lista simple, sin gráficos)
7. Registro de peso corporal
8. Funciona offline completo

El punto 5 es el que hace que la app sirva. Si al ir a hacer press militar ves "última: 12,5 kg × 8, costó", ya sabés qué hacer sin que nadie te lo diga.

### Anti-alcance de V1 — NO construir

- Gráficos y visualizaciones
- Timer de descanso con notificaciones
- Social, feed, compartir
- Ejercicios con video o animaciones
- Cálculo de 1RM estimado
- Integración con wearables
- Modo oscuro/claro configurable (elegí uno)
- Onboarding con tutorial
- Cualquier cosa multi-usuario (ver sección 7)

Si aparece la duda "¿y si le agrego...?", la respuesta en V1 es no.

---

## 6. V2 — La capa de IA

Recién después de que V1 esté en uso real durante al menos dos semanas.

**Endpoint:** `POST /api/coach/verdict`

**Input:** las series recién registradas de un ejercicio + el rango objetivo + las últimas 3 sesiones de ese mismo ejercicio + contexto de la sesión (qué número de ejercicio es, si es día consecutivo de entrenamiento).

**Output (JSON estricto, sin markdown):**

```json
{
  "reading": "Llegaste al techo del rango en las 4 series.",
  "action": "subir",
  "suggestedWeightKg": 45,
  "confidence": "alta"
}
```

`action` ∈ `subir` | `mantener` | `bajar` | `sumar_reps` | `revisar_tecnica`

**Reglas de implementación:**

- El system prompt tiene que codificar la lógica de progresión explícitamente (techo del rango → subir; caída entre series → mantener; por debajo del piso → bajar o sumar reps primero).
- Pedir **solo JSON**, sin preámbulo ni backticks. Parsear con try/catch y fallback a una regla determinista.
- **Tener siempre el fallback determinista.** Si la API falla o el gimnasio no tiene señal, una función pura que compare reps contra el rango cubre el 80% de los casos. La IA agrega el matiz (fatiga acumulada, ejercicios encadenados, técnica), no la decisión base.
- Cachear el veredicto en `entries[].aiVerdict` — no re-consultar al mostrar.
- Rate limit por usuario.

**Guardarraíl de producto:** la app no da consejos de nutrición ni diagnostica dolores. Si el usuario reporta molestia articular, el output es "consultá con un profesional", no una sugerencia de carga.

---

## 7. V3 — El ángulo gimnasio (B2B)

Esto es un producto distinto, no una feature más. Reconocerlo evita construir a medias.

**Qué cambia:**
- El entrenador arma rutinas y las asigna a alumnos
- El entrenador ve el progreso de sus alumnos
- El gimnasio es el que paga, el alumno es el que usa

**Qué está preparado desde V1:** `ownerId`, `gymId`, `role`, y `routines.assignedTo`. Con eso la multi-tenencia es agregar queries y vistas, no migrar datos.

**Lo que hay que validar antes de construirlo:** que un gimnasio pague. Los gimnasios chicos suelen tener presupuesto bajo y adopción tecnológica lenta, y el entrenador promedio ya usa WhatsApp y planillas. Antes de escribir una línea de V3, mostrale V1 funcionando a un entrenador real y preguntale qué le falta. La respuesta va a redefinir el alcance.

**No construir V3 hasta tener esa conversación.**

---

## 8. Milestones

| # | Entregable | Criterio de terminado |
|---|-----------|----------------------|
| M1 | Esqueleto + modelo de datos + Dexie | Se puede crear una rutina y persiste offline |
| M2 | Flujo de sesión completo | Se registra un entrenamiento entero sin red |
| M3 | Sync bidireccional | Cierro el navegador, abro en otro dispositivo, está todo |
| M4 | Historial + última sesión inline | **Usable en el gimnasio de verdad** |
| M5 | Deploy + PWA instalable | Anda desde el celular sin abrir el navegador |
| — | *(usar 2 semanas antes de seguir)* | |
| M6 | Capa de IA + fallback determinista | Veredicto correcto en casos de prueba |

Deploy sugerido: frontend en Cloudflare Pages, backend en Fly.io o Railway, Mongo Atlas free tier.

---

## 9. Cómo trabajar

- **M4 es la línea de meta real de la primera etapa.** Todo lo anterior existe para llegar ahí. Si M4 anda, el proyecto ya sirve aunque no se haga nada más.
- Después de M5, **usar la app dos semanas antes de escribir una línea de M6.** El uso real va a cambiar qué pide la capa de IA.
- Ante cualquier decisión ambigua de alcance, elegí la opción más chica.
- Escribí tests solo para la lógica de progresión determinista (sección 6) y para el sync. El resto no los necesita todavía.
