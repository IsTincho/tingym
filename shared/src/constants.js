export const MUSCLE_GROUPS = [
  'espalda', 'hombros', 'pecho', 'biceps', 'triceps', 'piernas', 'core',
];

export const PATTERNS = ['push', 'pull', 'squat', 'hinge', 'isolation', 'static'];

export const LOAD_TYPES = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'time'];

export const ROLES = ['athlete', 'trainer', 'admin'];

// V2 — la capa de IA devuelve una de estas acciones.
export const COACH_ACTIONS = ['subir', 'mantener', 'bajar', 'sumar_reps', 'revisar_tecnica'];

// Los ejercicios de bodyweight/time no llevan peso en kg.
export const LOAD_TYPES_WITHOUT_WEIGHT = ['bodyweight', 'time'];

export const MUSCLE_GROUP_LABELS = {
  espalda: 'Espalda',
  hombros: 'Hombros',
  pecho: 'Pecho',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  piernas: 'Piernas',
  core: 'Core',
};

export const LOAD_TYPE_LABELS = {
  barbell: 'Barra',
  dumbbell: 'Mancuerna',
  cable: 'Polea',
  machine: 'Máquina',
  bodyweight: 'Peso corporal',
  time: 'Tiempo',
};

export const MEAL_SLOTS = ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'];

export const MEAL_SLOT_LABELS = {
  desayuno: 'Desayuno',
  almuerzo: 'Almuerzo',
  merienda: 'Merienda',
  cena: 'Cena',
  snack: 'Snack',
};

// Medidas corporales, en el orden en que se toman: de arriba hacia abajo. Ese
// orden es el que evita equivocarse anotando cuatro numeros parecidos seguidos.
export const MEASUREMENTS = ['shoulders', 'chest', 'arm', 'waist'];

export const MEASUREMENT_LABELS = {
  shoulders: 'Hombros',
  chest: 'Pecho',
  arm: 'Brazo',
  waist: 'Cintura',
};
