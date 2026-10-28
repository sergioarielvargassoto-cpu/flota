'use client';
import { useState, type ReactNode } from 'react';

/** Mini administrador de ventanas: open(close => <Formulario onClose={close} />) y renderizar {el}. */
export function useModal() {
  const [el, setEl] = useState<ReactNode>(null);
  const close = () => setEl(null);
  const open = (render: (close: () => void) => ReactNode) => setEl(render(close));
  return { el, open };
}
