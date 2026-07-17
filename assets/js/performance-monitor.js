(function () {
  const metrics = { api: [], longTasks: [], navigation: null, lcp: null, cls: 0 };
  const keep = (list, value, max = 100) => { list.push(value); if (list.length > max) list.shift(); };
  window.addEventListener('hutta:api-performance', event => keep(metrics.api, event.detail));
  if ('PerformanceObserver' in window) {
    try { new PerformanceObserver(list => list.getEntries().forEach(entry => keep(metrics.longTasks, { start: entry.startTime, duration: entry.duration }))).observe({ type: 'longtask', buffered: true }); } catch (_) {}
    try { new PerformanceObserver(list => { const entries = list.getEntries(); if (entries.length) metrics.lcp = entries[entries.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (_) {}
    try { new PerformanceObserver(list => list.getEntries().forEach(entry => { if (!entry.hadRecentInput) metrics.cls += entry.value; })).observe({ type: 'layout-shift', buffered: true }); } catch (_) {}
  }
  window.addEventListener('load', () => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) metrics.navigation = { ttfb: nav.responseStart, domInteractive: nav.domInteractive, load: nav.loadEventEnd };
  }, { once: true });
  window.HuttaPerformance = { metrics, markSection(name, started) { performance.measure(`section:${name}`, { start: started, end: performance.now() }); } };
})();
