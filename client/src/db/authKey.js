// Derivación de la clave de autenticación, del lado del cliente.
//
// El backend corre en un Worker del plan gratuito, con 10 ms de CPU por
// request: bcrypt ahí es imposible. Así que el key stretching lo hace el
// navegador, que tiene todo el tiempo del mundo, y el servidor sólo guarda un
// SHA-256 con sal propia del valor ya estirado.
//
// Consecuencia buscada: la contraseña en limpio nunca sale del dispositivo.

const ITERACIONES = 210_000;

/**
 * La sal se deriva del email en vez de ser aleatoria porque tiene que poder
 * recalcularse en el login sin pedirla al servidor. No protege contra tablas
 * arcoíris —de eso se encarga la sal aleatoria del servidor—, sólo evita que
 * dos usuarios con la misma contraseña deriven la misma clave.
 */
export async function deriveAuthKey(email, password) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(`tingym|${email.toLowerCase().trim()}`),
      iterations: ITERACIONES,
      hash: 'SHA-256',
    },
    material,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
