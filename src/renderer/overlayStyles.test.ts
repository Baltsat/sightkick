import { afterEach, describe, expect, it, vi } from 'vitest';
import { popoverOpenChange } from './overlayStyles';

afterEach(() => {
  document.body.replaceChildren();
});

describe('popoverOpenChange', () => {
  it('always propagates a close request while modal wrappers exist', () => {
    const visibleModal = document.createElement('div');
    const hiddenModal = document.createElement('div');

    visibleModal.className = 'ant-modal-wrap';
    hiddenModal.className = 'ant-modal-wrap';
    hiddenModal.style.display = 'none';
    document.body.append(visibleModal, hiddenModal);

    const setOpen = vi.fn();

    popoverOpenChange(setOpen)(false);

    expect(setOpen).toHaveBeenCalledOnce();
    expect(setOpen).toHaveBeenCalledWith(false);
  });
});
