import type { CSSProperties } from 'react';

const border = '1px solid var(--color-border)';
const sectionPadding: CSSProperties = { margin: 0, padding: '16px 24px' };

type ModalStyles = Record<
  'container' | 'header' | 'body' | 'footer' | 'mask',
  CSSProperties
>;

export const modalStyles: ModalStyles = {
  container: { padding: 0, overflow: 'hidden', border, boxShadow: 'none' },
  header: {
    ...sectionPadding,
    background: 'var(--gradient-header)',
    borderBottom: border,
  },
  body: { padding: '16px 24px' },
  footer: {
    ...sectionPadding,
    background: 'var(--gradient-header-reverse)',
    borderTop: border,
  },
  mask: { background: 'rgba(10, 10, 12, 0.4)', backdropFilter: 'blur(2px)' },
};

export const popoverStyles: {
  root?: CSSProperties;
  container?: CSSProperties;
  arrow?: CSSProperties;
} = {
  // A small screen (or a clamped window) must never push a control past the
  // viewport edge where it can render but not receive a click — the surface
  // scrolls inside itself instead.
  container: {
    border,
    boxShadow: 'none',
    maxHeight: 'calc(100vh - 96px)',
    overflowY: 'auto',
  },
};

export const MODAL_ABOVE_POPOVER_Z_INDEX = 1050;

export function isAnyModalOpen(): boolean {
  return Array.from(document.querySelectorAll('.ant-modal-wrap')).some(
    (element) => (element as HTMLElement).style.display !== 'none',
  );
}

export function popoverOpenChange(
  setOpen: (open: boolean) => void,
): (open: boolean) => void {
  return (open) => {
    if (open || !isAnyModalOpen()) {
      setOpen(open);
    }
  };
}
