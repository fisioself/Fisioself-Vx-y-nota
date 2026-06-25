import { describe, it, expect } from 'vitest';
import { viewBoxCoords } from './BodyPainMap';

// El SVG se dibuja a 130×260 px en pantalla pero su viewBox es 100×200. El bug
// previo multiplicaba la Y por 100 (ancho) en vez de 200 (alto), así que los
// puntos caían en la mitad superior. Estos tests fijan el mapeo correcto.
describe('viewBoxCoords', () => {
  const rect = { left: 0, top: 0, width: 130, height: 260 };

  it('mapea la esquina superior izquierda a (0, 0)', () => {
    expect(viewBoxCoords(rect, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('mapea el centro del lienzo a (50, 100)', () => {
    expect(viewBoxCoords(rect, 65, 130)).toEqual({ x: 50, y: 100 });
  });

  it('mapea la esquina inferior derecha a (100, 200)', () => {
    expect(viewBoxCoords(rect, 130, 260)).toEqual({ x: 100, y: 200 });
  });

  it('la Y usa la altura 200 del viewBox, no el ancho 100 (regresión del bug)', () => {
    // A 3/4 de la altura el punto debe ir a y=150, no a y=75.
    const { y } = viewBoxCoords(rect, 0, 195);
    expect(y).toBe(150);
  });

  it('descuenta el desplazamiento del rect (left/top) del click', () => {
    const offset = { left: 40, top: 100, width: 130, height: 260 };
    expect(viewBoxCoords(offset, 105, 230)).toEqual({ x: 50, y: 100 });
  });
});
