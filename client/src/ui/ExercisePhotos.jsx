import { useState } from 'react';
import { exercisePhotos } from '@gym/shared';

// Las dos fotos que trae Free Exercise DB son el inicio y el final del
// movimiento, en ese orden. Etiquetarlas es la mitad del valor: dos fotos sin
// rotulo son dos fotos parecidas; con rotulo son un antes y un despues.
const ROTULOS = ['Inicio', 'Fin'];

// Las fotos de la fuente estan tomadas sobre fondo claro de estudio. Sin
// tratar, un rectangulo blanco en medio del negro es lo unico que se ve en la
// pantalla. El filtro las pasa a monocromo y las apaga; el overlay rojo en
// `soft-light` las devuelve al idioma del resto. Se pierde el color de la
// remera del modelo, que no le importa a nadie.
const FILTRO = 'grayscale(1) contrast(1.15) brightness(0.78)';

export default function ExercisePhotos({ exerciseId, name }) {
  const fotos = exercisePhotos(exerciseId);
  // Si una foto no esta (repo a medio clonar, cache podrida), se cae sola en
  // vez de dejar el icono de imagen rota, que es peor que no mostrar nada.
  const [rotas, setRotas] = useState(() => new Set());

  const visibles = fotos.filter((src) => !rotas.has(src));
  if (!visibles.length) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {fotos.map((src, i) =>
        rotas.has(src) ? null : (
          <figure key={src} className="relative chamfer border border-line bg-surface-2 overflow-hidden">
            <img
              src={src}
              alt={`${name} — ${ROTULOS[i] ?? `paso ${i + 1}`}`}
              // Sin `loading="lazy"`: son dos fotos y estan arriba del fold,
              // asi que diferirlas no ahorra ni un byte y sí agrega un viaje
              // antes de que aparezcan. Lazy sirve para lo que está abajo.
              decoding="async"
              // 3/2 es la proporcion nativa de la fuente (850x567, las 90
              // iguales). Con el contenedor en esa proporcion, `cover` no
              // recorta nada. En cuadrado recortaba los costados, que en una
              // foto instructiva es justo donde estan la barra y los pies.
              className="block w-full aspect-[3/2] object-cover"
              style={{ filter: FILTRO }}
              onError={() => setRotas((s) => new Set(s).add(src))}
            />
            {/* Tinte rojo del tema. `pointer-events-none` porque no es un
                control: el dedo tiene que llegar a la foto, no al velo. */}
            <span
              aria-hidden
              className="absolute inset-0 pointer-events-none bg-accent/25 mix-blend-soft-light"
            />
            <figcaption className="absolute bottom-0 inset-x-0 label-hud text-[9px] text-accent-2
                                   bg-ink/85 px-2 py-1 border-t border-line">
              {ROTULOS[i] ?? `paso ${i + 1}`}
            </figcaption>
          </figure>
        ),
      )}
    </div>
  );
}
