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
  assert.match(html, /smplfix-components\.css\?v=20260806-profile-ui/);
  assert.match(components, /#pipeline \.pipeline-filter-bar[\s\S]*?padding:\s*0\s*!important;[\s\S]*?border:\s*0\s*!important;/);
  assert.match(components, /#pipeline \.pipeline-search-bar input\[type="search"\][\s\S]*?border:\s*0\s*!important;[\s\S]*?background:\s*transparent\s*!important;/);
});

test('dashboard loads cache-busted responsive styles in cascade order', () => {
  const html = read('pages/admin-dashboard.html');
  const shellIndex = html.indexOf('smplfix-shell.css?v=20260806-search-polish');
  const componentsIndex = html.indexOf('smplfix-components.css?v=20260806-profile-ui');
  const responsiveIndex = html.indexOf('dashboard-responsive.css?v=20260806-pipeline-board-ux');
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

test('Settings uses the responsive SMPLFix workspace and safe interaction states', () => {
  const html = read('pages/admin-dashboard.html');
  const settings = read('assets/css/settings.css');
  const dashboard = read('assets/js/dashboard-script.js');
  const markup = html.slice(html.indexOf('<section id="settings"'), html.indexOf('<!-- Calendar Section -->'));
  assert.match(html, /settings\.css\?v=20260806-settings-ui/);
  assert.match(html, /dashboard-script\.js\?v=20260812-payment-receipts/);
  assert.match(markup, /id="settingsForm" class="settings-workspace" onsubmit="saveSettings\(event\)"/);
  assert.match(markup, /id="settingsSaveState" role="status" aria-live="polite"/);
  assert.match(markup, /class="settings-toggle-control" aria-hidden="true"/);
  assert.match(settings, /#settings \.settings-container[\s\S]*?grid-template-columns: minmax\(300px, 0\.9fr\) minmax\(440px, 1\.35fr\)/);
  assert.match(settings, /@media \(max-width: 1100px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(settings, /input:checked \+ \.settings-toggle-control/);
  assert.match(dashboard, /document\.body\.classList\.toggle\('dark-theme', theme === 'dark'\)/);
  assert.doesNotMatch(dashboard, /document\.body\.className = theme/);
  assert.match(dashboard, /syncRefreshIntervalControl/);
});

test('Orders overview keeps KPI and analytics rows separate at every container size', () => {
  const html = read('pages/admin-dashboard.html');
  const responsive = read('assets/css/dashboard-responsive.css');
  assert.match(html, /dashboard-responsive\.css\?v=20260806-pipeline-board-ux/);
  assert.match(responsive, /\.orders-overview-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)\s*!important;[\s\S]*?align-items:\s*start\s*!important;/);
  assert.match(responsive, /\.orders-overview-metric-row\s*\{[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(responsive, /\.orders-overview-detail-grid\s*\{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(responsive, /@container dashboard-section \(max-width: 1180px\)[\s\S]*?\.orders-overview-metric-row, \.orders-overview-detail-grid[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(responsive, /@container dashboard-section \(max-width: 820px\)[\s\S]*?\.orders-overview-detail-grid[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(responsive, /@container dashboard-section \(max-width: 560px\)[\s\S]*?\.orders-overview-metric-row[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('Performance intelligence uses a full-width four-card row and dedicated service row', () => {
  const html = read('pages/admin-dashboard.html');
  const responsive = read('assets/css/dashboard-responsive.css');
  assert.match(html, /dashboard-responsive\.css\?v=20260806-pipeline-board-ux/);
  assert.match(responsive, /\.business-intelligence-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)\s*!important;[\s\S]*?align-items:\s*start\s*!important;/);
  assert.match(responsive, /\.business-intelligence-card\.wide\s*\{\s*grid-column:\s*1 \/ -1\s*!important;/);
  assert.match(responsive, /@container dashboard-section \(max-width: 1180px\)[\s\S]*?\.business-intelligence-grid[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(responsive, /@container dashboard-section \(max-width: 560px\)[\s\S]*?\.business-intelligence-grid[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('Top customers keeps summary, ranked list, and action in one responsive report flow', () => {
  const html = read('pages/admin-dashboard.html');
  const responsive = read('assets/css/dashboard-responsive.css');
  assert.match(html, /dashboard-responsive\.css\?v=20260806-pipeline-board-ux/);
  assert.match(responsive, /\.top-customers-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)\s*!important;[\s\S]*?align-items:\s*start\s*!important;/);
  assert.match(responsive, /\.top-customers-summary\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(responsive, /@container dashboard-section \(max-width: 1180px\)[\s\S]*?\.top-customers-summary[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(responsive, /@container dashboard-section \(max-width: 560px\)[\s\S]*?\.top-customers-summary, \.top-customer-stats[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
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

test('every full browser page loads the shared fluid layout before final form and icon layers', () => {
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
    const layoutIndex = styles.findIndex((href) => /smplfix-layout\.css\?v=20260806-fluid-layout$/.test(href));
    assert.ok(layoutIndex > -1, `${file} must load the fluid layout`);
    const iconIndex = styles.findIndex((href) => /smplfix-icons\.css\?v=20260807-icon-reliability$/.test(href));
    if (html.includes('<form')) {
      const formIndex = styles.findIndex((href) => /smplfix-forms\.css\?v=20260807-customer-backdrop$/.test(href));
      assert.ok(formIndex > layoutIndex, `${file} must load forms after layout`);
      if (iconIndex > -1) {
        assert.ok(iconIndex > formIndex, `${file} must load icons after forms`);
        assert.equal(iconIndex, styles.length - 1, `${file} must load the icon layer last`);
      } else {
        assert.equal(formIndex, styles.length - 1, `${file} must load the form system last when no icon layer is needed`);
      }
    } else {
      const expectedLastIndex = iconIndex > -1 ? iconIndex : layoutIndex;
      assert.equal(expectedLastIndex, styles.length - 1, `${file} must load its final shared layer last`);
      if (iconIndex > -1) assert.ok(iconIndex > layoutIndex, `${file} must load icons after layout`);
    }
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
