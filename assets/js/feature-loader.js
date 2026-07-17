(function () {
  const version = '20260718-perf1';
  const features = {
    pipeline: ['pipeline-mongodb.js', 'pipeline-drag-fix.js'],
    accounting: ['accounting-system.js'],
    calendar: ['calendar.js'],
    'incoming-quotes': ['incoming-quotes.js'],
    'outgoing-quotes': ['outgoing-quotes.js'],
    'customer-approvals': ['customer-approvals.js'],
    scheduling: ['scheduling.js'],
    'vendor-reviews': ['vendor-onboarding-admin.js']
  };
  const loaded = new Map();
  const source = file => `../assets/js/${file}?v=${version}`;
  function script(file) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script'); element.src = source(file); element.async = false;
      element.onload = resolve; element.onerror = () => reject(new Error(`Unable to load ${file}`)); document.body.appendChild(element);
    });
  }
  async function load(name) {
    if (!features[name]) return;
    if (!loaded.has(name)) loaded.set(name, features[name].reduce((promise, file) => promise.then(() => script(file)), Promise.resolve()));
    return loaded.get(name);
  }
  function prefetch(name) {
    (features[name] || []).forEach(file => { const href = source(file); if (document.querySelector(`link[href="${href}"]`)) return; const link = document.createElement('link'); link.rel = 'preload'; link.as = 'script'; link.href = href; document.head.appendChild(link); });
  }
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.menu-item a[data-section]').forEach(item => {
    const name = item.dataset.section; item.addEventListener('pointerenter', () => prefetch(name), { once: true }); item.addEventListener('focus', () => prefetch(name), { once: true });
  }));
  window.FeatureLoader = { load, prefetch };
})();
