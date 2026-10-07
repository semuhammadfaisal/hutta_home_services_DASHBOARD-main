(function () {
  'use strict';

  const sidebar = document.getElementById('vendorSidebar');
  const menuButton = document.getElementById('vendorMenuButton');
  const closeButton = document.getElementById('vendorSidebarClose');
  const scrim = document.getElementById('vendorScrim');
  const accountShortcut = document.getElementById('vendorAccountShortcut');
  const companyName = document.getElementById('companyName');
  const sidebarName = document.getElementById('vendorSidebarName');
  const vendorInitials = document.getElementById('vendorInitials');
  const links = Array.from(document.querySelectorAll('.vendor-nav .nav-link'));
  const mobileQuery = window.matchMedia('(max-width: 860px)');

  if (!sidebar || !menuButton || !closeButton || !scrim) return;

  function setOpen(open) {
    sidebar.classList.toggle('is-open', open);
    scrim.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open && mobileQuery.matches ? 'hidden' : '';
    if (open) closeButton.focus();
  }

  function setActive(hash) {
    const current = hash || '#workspace';
    links.forEach((link) => {
      const active = link.getAttribute('href') === current;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  menuButton.addEventListener('click', () => setOpen(true));
  closeButton.addEventListener('click', () => setOpen(false));
  scrim.addEventListener('click', () => setOpen(false));
  accountShortcut?.addEventListener('click', () => {
    document.getElementById('company-profile')?.scrollIntoView({ behavior: 'smooth' });
    history.replaceState(null, '', '#company-profile');
    setActive('#company-profile');
    setOpen(false);
  });

  links.forEach((link) => link.addEventListener('click', () => {
    setActive(link.getAttribute('href'));
    setOpen(false);
  }));

  mobileQuery.addEventListener('change', () => setOpen(false));
  window.addEventListener('hashchange', () => setActive(location.hash));

  if (companyName && sidebarName) {
    const syncCompanyName = () => {
      const name = companyName.textContent.trim() || 'Vendor account';
      sidebarName.textContent = name;
      if (vendorInitials) vendorInitials.textContent = name.charAt(0).toUpperCase();
    };
    new MutationObserver(syncCompanyName).observe(companyName, { childList: true, characterData: true, subtree: true });
    syncCompanyName();
  }

  setActive(location.hash);
})();
