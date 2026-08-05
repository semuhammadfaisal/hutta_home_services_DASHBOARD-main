const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('dashboard shell uses shrink-safe viewport geometry', () => {
  const shell = read('assets/css/smplfix-shell.css');
  const components = read('assets/css/smplfix-components.css');
  const responsive = read('assets/css/dashboard-responsive.css');
  assert.match(shell, /\.main-content\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*none;/);
  assert.match(shell, /\.main-content\s*>\s*\.content-section,[\s\S]*?min-width:\s*0;/);
  assert.doesNotMatch(shell, /body\s*\{\s*overflow-x:\s*hidden;/);
  assert.match(components, /body\s+:where\(\s*\.content-section,[\s\S]*?\)\s*\{\s*width:\s*100%/);
  assert.match(responsive, /\.main-content\s*\{[\s\S]*?width:\s*auto;/);
  assert.doesNotMatch(responsive, /\.main-content(?:\.expanded)?\s*\{[^}]*width:\s*(?:100vw|calc\(100vw)/);
});

test('responsive completion layer wraps dashboard cards at shared breakpoints', () => {
  const components = read('assets/css/smplfix-components.css');
  assert.match(components, /@media \(max-width: 1280px\)[\s\S]*?\.kpi-board-metrics[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(components, /@media \(max-width: 900px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(components, /@media \(max-width: 640px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('pipeline owns horizontal scrolling without widening the page', () => {
  const components = read('assets/css/smplfix-components.css');
  const html = read('pages/admin-dashboard.html');
  assert.match(components, /#stagesContainer\.stages-container\s*\{[\s\S]*?min-width:\s*0\s*!important;[\s\S]*?max-width:\s*100%\s*!important;[\s\S]*?overflow-x:\s*auto\s*!important;/);
  assert.match(components, /#pipeline \.pipeline-page\s*\{\s*overflow:\s*visible\s*!important;/);
  assert.match(components, /@media \(max-width: 1180px\)[\s\S]*?pipeline-header-bar\.smpl-section-header[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(html, /class="pipeline-search-field" for="pipelineSearchInput"[\s\S]*?<span>Search pipeline<\/span>/);
  assert.match(html, /smplfix-components\.css\?v=20260806-pipeline-search-polish/);
  assert.match(components, /#pipeline \.pipeline-filter-bar[\s\S]*?padding:\s*0\s*!important;[\s\S]*?border:\s*0\s*!important;/);
  assert.match(components, /#pipeline \.pipeline-search-bar input\[type="search"\][\s\S]*?border:\s*0\s*!important;[\s\S]*?background:\s*transparent\s*!important;/);
});

test('dashboard loads cache-busted responsive styles in cascade order', () => {
  const html = read('pages/admin-dashboard.html');
  const shellIndex = html.indexOf('smplfix-shell.css?v=20260806-search-polish');
  const componentsIndex = html.indexOf('smplfix-components.css?v=20260806-pipeline-search-polish');
  const responsiveIndex = html.indexOf('dashboard-responsive.css?v=20260806-fluid-sections');
  const layoutIndex = html.indexOf('smplfix-layout.css?v=20260806-fluid-layout');
  assert.ok(shellIndex > -1);
  assert.ok(componentsIndex > shellIndex);
  assert.ok(responsiveIndex > componentsIndex);
  assert.ok(layoutIndex > responsiveIndex);
});

test('global search palette has polished, accessible navigation states', () => {
  const html = read('pages/admin-dashboard.html');
  const shell = read('assets/css/smplfix-shell.css');
  const ux = read('assets/js/premium-dashboard-ux.js');
  assert.match(html, /class="search-shortcut"[^>]*>Ctrl K<\/kbd>/);
  assert.match(html, /id="commandPaletteResultCount"[^>]*aria-live="polite"/);
  assert.match(html, /class="command-palette-footer" id="commandPaletteHelp"/);
  assert.match(html, /premium-dashboard-ux\.js\?v=20260806-search-polish/);
  assert.match(shell, /\.command-palette-search:focus-within/);
  assert.match(shell, /body \.command-palette-search input\[type="search"\][\s\S]*?border:\s*0\s*!important/);
  assert.match(shell, /\.command-palette-footer kbd/);
  assert.match(shell, /body\.command-palette-open\s*\{\s*overflow:\s*hidden/);
  assert.match(ux, /aria-selected/);
  assert.match(ux, /aria-activedescendant/);
  assert.match(ux, /setActiveCommandItem/);
});

test('final responsive stylesheet covers nested workspaces and every dialog family', () => {
  const responsive = read('assets/css/dashboard-responsive.css');
  for (const selector of [
    '.workflow-request-list', '.outgoing-workspace', '.approval-workspace',
    '.scheduling-workspace-layout', '.closeout-grid', '.incoming-action-grid',
    '.accounting-tab-content', '.allocation-grid', '.ar-aging-grid', '.cash-flow-grid',
    '.exec-kpi-grid', '.exec-overview-grid', '.scenarios-grid', '.reports-tab-content',
    '.record-detail-layout', '.profile-orders-table-wrapper', '.vendor-review-detail-content',
    '.modal-overlay', '.modal-content', '.command-palette-panel', '#orderDetailModal'
  ]) assert.ok(responsive.includes(selector), `missing nested responsive coverage for ${selector}`);
  assert.match(responsive, /body \.modal-overlay > \.modal-content[\s\S]*?max-height:\s*calc\(100dvh - 24px\)/);
  assert.match(responsive, /#scheduling \.scheduling-workspace-layout[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(responsive, /#closeout \.closeout-grid[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('record detail pages fill the content rail and use explicit responsive columns', () => {
  const layout = read('assets/css/smplfix-layout.css');
  assert.match(layout, /#order-detail, #customer-profile, #vendor-detail, #employee-detail[\s\S]*?\.record-detail-header,[\s\S]*?\.record-detail-layout[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/);
  assert.match(layout, /\.order-summary-card,[\s\S]*?\.profile-info-card[\s\S]*?> \.info-grid[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(layout, /@container dashboard-section \(max-width: 1180px\)[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(layout, /@container dashboard-section \(max-width: 820px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(layout, /@container dashboard-section \(max-width: 560px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('every full browser page loads the shared fluid layout last', () => {
  const htmlFiles = [
    'index.html',
    ...fs.readdirSync(path.join(root, 'pages'))
      .filter((name) => name.endsWith('.html'))
      .map((name) => `pages/${name}`)
  ];

  for (const file of htmlFiles) {
    const html = read(file);
    if (!html.includes('</head>')) continue;
    const styles = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)]
      .map((match) => match[1]);
    assert.ok(styles.length > 0, `${file} has no stylesheets`);
    assert.match(styles.at(-1), /smplfix-layout\.css\?v=20260806-fluid-layout$/, `${file} must load the fluid layout last`);
  }
});

test('shared layout removes page-shell ceilings but preserves readable terminal states', () => {
  const shell = read('assets/css/smplfix-shell.css');
  const components = read('assets/css/smplfix-components.css');
  const details = read('assets/css/detail-pages.css');
  const layout = read('assets/css/smplfix-layout.css');
  assert.doesNotMatch(shell, /--shell-content-max/);
  assert.doesNotMatch(components, /#(?:order-detail|customer-profile|vendor-detail|employee-detail)[\s\S]{0,300}?max-width:\s*(?:1200|1280|1320)px\s*!important/);
  assert.doesNotMatch(details, /max-width:\s*(?:1200|1280|1320)px/);
  assert.match(layout, /\.main-content > \.content-section,[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/);
  assert.match(layout, /\.quote-shell,[\s\S]*?\.intake-shell[\s\S]*?width:\s*100%\s*!important;[\s\S]*?max-width:\s*none\s*!important;/);
  assert.match(layout, /Terminal states remain intentionally readable[\s\S]*?max-width:\s*620px\s*!important/);
});

test('final responsive stylesheet covers every admin dashboard section family', () => {
  const responsive = read('assets/css/dashboard-responsive.css');
  for (const selector of [
    '#dashboard', '#workflow-overview', '.workflow-stage-section', '#orders', '#customers',
    '#vendors', '#vendor-reviews', '#vendor-review-detail', '#employees', '#pipeline',
    '#payments', '#accounting', '#reports', '#users', '#settings', '#calendar',
    '#recurring-calendar', '#order-detail', '#customer-profile', '#vendor-detail', '#employee-detail'
  ]) assert.ok(responsive.includes(selector), `missing responsive coverage for ${selector}`);
  assert.match(responsive, /container-type:\s*inline-size/);
  assert.match(responsive, /@container dashboard-section \(max-width: 1180px\)/);
  assert.match(responsive, /@container dashboard-section \(max-width: 820px\)/);
  assert.match(responsive, /@container dashboard-section \(max-width: 560px\)/);
  assert.match(responsive, /\.calendar-layout\s*\{\s*width:\s*100%;\s*min-width:\s*0;/);
  assert.match(responsive, /\.calendar-container\s*>\s*:where\(\.calendar-header, \.calendar-grid\)[\s\S]*?min-width:\s*700px;/);
});
