// GENERADO por scripts/fetch-exercise-images.mjs. No editar a mano.
//
// Cuantas fotos tiene cada ejercicio en client/public/exercises/<id>/.
// Las fotos salen de Free Exercise DB (Unlicense, dominio publico).
//
// Se commitea generado en vez de calcularse en build para que el cliente no
// tenga que salir a preguntar si hay foto antes de decidir si dibuja el hueco:
// sin esto, cada ejercicio sin foto cuesta un 404, y sin senal cuesta una
// espera hasta el timeout.

export const EXERCISE_PHOTOS = {
  "ex-aperturas-con-mancuernas": 2,
  "ex-aperturas-en-polea": 2,
  "ex-curl-con-barra": 2,
  "ex-curl-con-mancuernas": 2,
  "ex-curl-femoral": 2,
  "ex-curl-inclinado-con-mancuernas": 2,
  "ex-curl-martillo": 2,
  "ex-deltoide-posterior-en-maquina": 2,
  "ex-dominada-agarre-neutro": 2,
  "ex-dominada-supina": 2,
  "ex-dominadas": 2,
  "ex-elevacion-de-gemelos": 2,
  "ex-elevacion-de-piernas-colgado": 2,
  "ex-elevaciones-laterales": 2,
  "ex-encogimientos": 2,
  "ex-extension-de-cuadriceps": 2,
  "ex-extension-en-polea": 2,
  "ex-extension-sobre-la-cabeza": 2,
  "ex-face-pull": 2,
  "ex-fondos": 2,
  "ex-hip-thrust": 2,
  "ex-jalon-al-pecho": 2,
  "ex-jalon-neutro": 2,
  "ex-pajaros": 2,
  "ex-pec-deck": 2,
  "ex-peso-muerto": 2,
  "ex-peso-muerto-rumano": 2,
  "ex-plancha": 2,
  "ex-plancha-lateral": 2,
  "ex-prensa": 2,
  "ex-press-arnold": 2,
  "ex-press-banca": 2,
  "ex-press-banca-en-maquina": 2,
  "ex-press-cerrado": 2,
  "ex-press-frances": 2,
  "ex-press-inclinado-con-mancuernas": 2,
  "ex-press-militar-con-barra": 2,
  "ex-press-militar-sentado": 2,
  "ex-pullover-en-polea": 2,
  "ex-remo-con-barra": 2,
  "ex-remo-con-mancuerna": 2,
  "ex-remo-en-polea-baja": 2,
  "ex-rueda-abdominal": 2,
  "ex-sentadilla": 2,
  "ex-zancadas": 2
};

export function exercisePhotos(exerciseId) {
  const n = EXERCISE_PHOTOS[exerciseId] ?? 0;
  return Array.from({ length: n }, (_, i) => `/exercises/${exerciseId}/${i}.jpg`);
}
