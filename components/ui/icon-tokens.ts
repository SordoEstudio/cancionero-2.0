import type { LucideProps } from 'lucide-react';

/**
 * Convenciones Lucide para esta app (Material / Apple: trazo 2px, grid 24px).
 *
 * - toolbar: barra de acciones del editor (target ~36×36 px de toque).
 * - control: header global, theme, entradas secundarias.
 * - inline: rejillas de opciones junto a texto corto.
 * - chevron: acento secundario en split button (ligeramente más chico).
 */
export const ICON_TOOLBAR = 18;
export const ICON_CONTROL = 20;
export const ICON_INLINE = 16;
export const ICON_CHEVRON = 15;

/** Grosor por defecto de Lucide; no usar <2 en tamaños pequeños (legibilidad). */
export const ICON_STROKE: LucideProps['strokeWidth'] = 2;

/** Props para iconos puramente decorativos (el padre expone nombre en aria-label). */
export const lucideDecorative = (size: number): Pick<LucideProps, 'size' | 'strokeWidth' | 'aria-hidden' | 'className'> => ({
  size,
  strokeWidth: ICON_STROKE,
  'aria-hidden': true,
  className: 'shrink-0',
});
