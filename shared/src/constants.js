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
