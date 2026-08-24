// Catalogo global de ejercicios, compartido por cliente y servidor.
//
// El id se deriva del nombre en vez de generarse al azar. Eso importa: el
// catalogo se siembra en cada dispositivo por separado, y con ids aleatorios
// el mismo "Press militar sentado" tendria un id distinto en el telefono y en
// la tablet, con lo cual una rutina sincronizada apuntaria a ejercicios
// inexistentes. Derivarlo del nombre lo vuelve estable en todos lados.

export function exerciseId(name) {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `ex-${slug}`;
}

const raw = [
  // espalda
  ['Dominadas', 'espalda', 'pull', 'bodyweight', 'Escápulas abajo antes de tirar'],
  ['Dominada supina', 'espalda', 'pull', 'bodyweight', ''],
  ['Dominada agarre neutro', 'espalda', 'pull', 'bodyweight', ''],
  ['Jalón al pecho', 'espalda', 'pull', 'cable', ''],
  ['Jalón neutro', 'espalda', 'pull', 'cable', ''],
  ['Remo con barra', 'espalda', 'pull', 'barbell', 'Torso a 45°, tirá al ombligo'],
  ['Remo con mancuerna', 'espalda', 'pull', 'dumbbell', ''],
  ['Remo en polea baja', 'espalda', 'pull', 'cable', ''],
  ['Pullover en polea', 'espalda', 'isolation', 'cable', 'Codo semi fijo, tirá con el dorsal'],
  ['Encogimientos', 'espalda', 'isolation', 'dumbbell', 'Subí y sostené arriba, sin rotar'],

  // hombros
  ['Press militar sentado', 'hombros', 'push', 'dumbbell', 'Codo fijo, bajá lento'],
  ['Press militar con barra', 'hombros', 'push', 'barbell', ''],
  ['Press Arnold', 'hombros', 'push', 'dumbbell', ''],
  ['Elevaciones laterales', 'hombros', 'isolation', 'dumbbell', 'Livianas y lentas. Si llegás a 8, el peso está mal'],
  ['Pájaros', 'hombros', 'isolation', 'dumbbell', 'Pecho apoyado en banco inclinado'],
  ['Face pull', 'hombros', 'pull', 'cable', 'Codos altos, tirá a la cara'],
  ['Deltoide posterior en máquina', 'hombros', 'isolation', 'machine', ''],

  // pecho
  ['Press banca', 'pecho', 'push', 'barbell', 'Escápulas retraídas'],
  ['Press banca en máquina', 'pecho', 'push', 'machine', ''],
  ['Press inclinado con mancuernas', 'pecho', 'push', 'dumbbell', ''],
  ['Aperturas con mancuernas', 'pecho', 'isolation', 'dumbbell', ''],
  ['Aperturas en polea', 'pecho', 'isolation', 'cable', ''],
  ['Pec deck', 'pecho', 'isolation', 'machine', ''],
  ['Fondos', 'pecho', 'push', 'bodyweight', ''],

  // biceps
  ['Curl con barra', 'biceps', 'isolation', 'barbell', ''],
  ['Curl con mancuernas', 'biceps', 'isolation', 'dumbbell', ''],
  ['Curl inclinado con mancuernas', 'biceps', 'isolation', 'dumbbell', 'Banco a 45°, brazo atrás del cuerpo'],
  ['Curl martillo', 'biceps', 'isolation', 'dumbbell', ''],

  // triceps
  ['Extensión en polea', 'triceps', 'isolation', 'cable', ''],
  ['Extensión sobre la cabeza', 'triceps', 'isolation', 'cable', 'Codo quieto, sólo abre el antebrazo'],
  ['Press cerrado', 'triceps', 'push', 'barbell', ''],
  ['Press francés', 'triceps', 'isolation', 'barbell', ''],

  // piernas
  ['Sentadilla', 'piernas', 'squat', 'barbell', 'Rodilla sigue la punta del pie'],
  ['Prensa', 'piernas', 'squat', 'machine', ''],
  ['Peso muerto', 'piernas', 'hinge', 'barbell', 'Barra pegada a la pierna'],
  ['Peso muerto rumano', 'piernas', 'hinge', 'barbell', ''],
  ['Hip thrust', 'piernas', 'hinge', 'barbell', 'Mentón al pecho, apretá arriba'],
  ['Zancadas', 'piernas', 'squat', 'dumbbell', ''],
  ['Curl femoral', 'piernas', 'isolation', 'machine', ''],
  ['Extensión de cuádriceps', 'piernas', 'isolation', 'machine', ''],
  ['Elevación de gemelos', 'piernas', 'isolation', 'machine', ''],

  // core
  ['Plancha', 'core', 'static', 'time', 'Glúteo apretado, cadera neutra'],
  ['Plancha lateral', 'core', 'static', 'time', 'Por lado'],
  ['Plancha lateral con elevación de cadera', 'core', 'isolation', 'bodyweight', 'Por lado'],
  ['Hollow hold', 'core', 'static', 'time', 'Lumbar pegada al piso'],
  ['Plancha con toque de hombros', 'core', 'isolation', 'bodyweight', 'Contá los toques, cadera quieta'],
  ['Rueda abdominal', 'core', 'static', 'bodyweight', ''],
  ['Elevación de piernas colgado', 'core', 'isolation', 'bodyweight', ''],
];

export const SEED_EXERCISES = raw.map(([name, muscleGroup, pattern, loadType, notes]) => ({
  _id: exerciseId(name),
  ownerId: null, // catalogo global
  name,
  muscleGroup,
  pattern,
  loadType,
  notes,
}));
