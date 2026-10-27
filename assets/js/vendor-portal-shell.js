(function () {
  'use strict';

  const routes = new Set(['overview', 'assignments', 'opportunities', 'billing', 'compliance', 'documents', 'account']);
  const titles = { overview: 'Overview', assignments: 'Assignments', opportunities: 'Opportunities', billing: 'Billing & payouts', compliance: 'Compliance', documents: 'Documents', account: 'Account' };
  const sidebar = document.getElementById('vendorSidebar');
  const menuButton = document.getElementById('vendorMenuButton');
  const closeButton = document.getElementById('vendorSidebarClose');
  const scrim = document.getElementById('vendorScrim');
  const accountShortcut = document.getElementById('vendorAccountShortcut');
  const companyName = document.getElementById('companyName');
  const sidebarName = document.getElementById('vendorSidebarName');
  const vendorInitials = document.getElementById('vendorInitials');
  const routeTitle = document.getElementById('routeTitle');
  const links = Array.from(document.querySelectorAll('.vendor-nav .nav-link'));
  const views = Array.from(document.querySelectorAll('[data-view]'));
  const mobileQuery = window.matchMedia('(max-width: 860px)');

  function parseRoute() {
    const parts = String(location.hash || '#overview').slice(1).split('/').filter(Boolean);
    const route = routes.has(parts[0]) ? parts[0] : 'overview';
    return { route, id: parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : '' };
  }

  function setOpen(open) {
    if (!sidebar || !menuButton || !scrim) return;
    sidebar.classList.toggle('is-open', open);
    scrim.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open && mobileQuery.matches ? 'hidden' : '';
    if (open) closeButton?.focus();
  }

  function applyRoute(options = {}) {
    const state = parseRoute();
    views.forEach((view) => { view.hidden = view.dataset.view !== state.route; });
    links.forEach((link) => {
      const active = link.getAttribute('href') === `#${state.route}`;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (routeTitle) routeTitle.textContent = state.id ? `${titles[state.route]} · Detail` : titles[state.route];
    document.body.dataset.vendorRoute = state.route;
    document.body.classList.toggle('vendor-detail-route', Boolean(state.id));
    document.getElementById('assignmentDetailBar')?.toggleAttribute('hidden', !(state.route === 'assignments' && state.id));
    document.getElementById('opportunityDetailBar')?.toggleAttribute('hidden', !(state.route === 'opportunities' && state.id));
    setOpen(false);
    window.dispatchEvent(new CustomEvent('vendorroutechange', { detail: state }));
    if (options.focus !== false) document.getElementById('main')?.focus({ preventScroll: true });
  }

  window.VendorPortalRouter = { parseRoute, applyRoute };
  menuButton?.addEventListener('click', () => setOpen(true));
  closeButton?.addEventListener('click', () => setOpen(false));
  scrim?.addEventListener('click', () => setOpen(false));
  accountShortcut?.addEventListener('click', () => { location.hash = '#account'; });
  links.forEach((link) => link.addEventListener('click', () => setOpen(false)));
  mobileQuery.addEventListener('change', () => setOpen(false));
  window.addEventListener('hashchange', () => applyRoute());

  if (companyName && sidebarName) {
    const syncCompanyName = () => {
      const name = companyName.textContent.trim() || 'Vendor account';
      sidebarName.textContent = name;
      if (vendorInitials) vendorInitials.textContent = name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || 'V';
    };
    new MutationObserver(syncCompanyName).observe(companyName, { childList: true, characterData: true, subtree: true });
    syncCompanyName();
  }

  if (!location.hash || !routes.has(String(location.hash).slice(1).split('/')[0])) history.replaceState(null, '', '#overview');
  applyRoute({ focus: false });
})();
