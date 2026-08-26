// Iconos de la navegacion.
//
// SVG inline y no una libreria: son cinco, pesan menos que el import, y no
// suman una dependencia que actualizar. Tampoco emojis —se ven distinto en
// cada sistema, no heredan el color del tema y no se pueden pintar de rojo
// cuando la pestaña esta activa.
//
// Todos comparten trazo de 1.75, viewBox de 24 y `currentColor`, que es lo que
// los hace verse de la misma familia. Cambiar uno solo de esos tres rompe la
// coherencia mas rapido que dibujar mal la figura.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

// Hoy: un cursor de terminal dentro de una pantalla. El resto de la app habla
// en HUD, el icono tambien.
export function IconHoy(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </svg>
  );
}

// Progreso: barras subiendo. Es literal lo que muestra la pantalla.
export function IconProgreso(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V13M10 20V8M16 20v-4M22 20V4" />
    </svg>
  );
}

// Rutinas: una lista con sus marcas. No un calendario: la rutina no son dias,
// son ejercicios en orden.
export function IconRutinas(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </svg>
  );
}

// Comidas: tenedor y cuchillo.
export function IconComidas(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3v7a2 2 0 002 2v9M6 3v5M9 3v5" />
      <path d="M16 3c-1.5 1.5-2 3.5-2 5.5S15 12 16 12s2-1 2-3.5S17.5 4.5 16 3zM16 12v9" />
    </svg>
  );
}

// Peso: una balanza. El arco es la aguja del dial.
export function IconPeso(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8.5 14a3.5 3.5 0 117 0" />
      <path d="M12 14l2.5-3.5" />
    </svg>
  );
}
