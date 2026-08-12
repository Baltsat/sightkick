(function () {
  const button = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');

  if (!button || !nav) {
    return;
  }

  const closeMenu = () => {
    nav.dataset.open = 'false';
    button.setAttribute('aria-expanded', 'false');
  };

  button.addEventListener('click', () => {
    const open = nav.dataset.open !== 'true';

    nav.dataset.open = String(open);
    button.setAttribute('aria-expanded', String(open));
  });

  nav
    .querySelectorAll('a')
    .forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });
})();
