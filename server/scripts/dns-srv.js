import dns from 'node:dns';

/**
 * Las URIs `mongodb+srv://` obligan al driver a resolver un registro SRV, y
 * hay entornos donde el resolver del sistema no responde a ese tipo de
 * consulta aunque el resto de DNS ande (VPNs, resolvers corporativos, sandboxes
 * de red). El síntoma es un ECONNREFUSED en `querySrv` que parece un problema
 * del cluster y no lo es.
 *
 * Ante ese caso puntual se cambia el resolver del proceso por uno público. No
 * toca la configuración de la máquina ni afecta a nada más: sólo a este
 * proceso, y sólo si el resolver por defecto ya falló.
 *
 * @returns {Promise<'ok'|'fallback'|'sin-srv'>}
 */
export async function asegurarResolucionSrv(uri) {
  if (!uri.startsWith('mongodb+srv://')) return 'sin-srv';

  const host = uri.split('://')[1].split(/[/?@]/).pop().split('/')[0];
  const nombre = `_mongodb._tcp.${uri.split('@').pop().split(/[/?]/)[0]}`;

  const probar = () =>
    new Promise((resolve) => {
      dns.resolveSrv(nombre, (err) => resolve(!err));
    });

  if (await probar()) return 'ok';

  dns.setServers(['8.8.8.8', '1.1.1.1']);
  if (await probar()) return 'fallback';

  throw new Error(
    `No se pudo resolver el registro SRV de ${host}. Revisá el nombre del cluster y la conexión.`,
  );
}
