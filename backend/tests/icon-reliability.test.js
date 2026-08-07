const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sourceFiles = [
  ...fs.readdirSync(path.join(root, 'pages')).filter((name) => name.endsWith('.html')).map((name) => `pages/${name}`),
  ...fs.readdirSync(path.join(root, 'assets/js')).filter((name) => name.endsWith('.js')).map((name) => `assets/js/${name}`)
];

const supportedIcons = new Set(`
  address-book address-card align-left archive arrow-down arrow-left arrow-right arrows-left-right at
  balance-scale ban bars bell bolt border-all briefcase broom building bullseye calculator calendar
  calendar-alt calendar-check calendar-plus camera camera-retro certificate chart-area chart-bar chart-line
  chart-pie chart-simple check check-circle check-double chevron-down chevron-left chevron-right chevron-up
  circle circle-check circle-exclamation circle-info circle-notch circle-xmark clipboard-check clipboard-list
  clock clock-rotate-left cloud-upload-alt code-branch cog coins comment-alt comment-dots comments copy credit-card
  crown dollar-sign download edit ellipsis-vertical envelope envelope-circle-check envelope-open-text eraser
  exclamation-circle exclamation-triangle expand-alt external-link-alt eye eye-slash file file-alt file-contract
  file-csv file-invoice file-invoice-dollar file-pdf file-signature file-upload filter filter-circle-xmark flag
  flag-checkered folder-open folder-plus gavel gem globe grip-vertical hammer hand-paper handshake hard-hat hashtag
  history hourglass-half id-card images inbox info-circle key keyboard landmark layer-group link list location-dot
  lock map-marker-alt minus money-bill-wave money-check note-sticky paperclip paper-plane pen pen-to-square percent
  phone piggy-bank play plus plus-circle receipt redo rocket rotate rotate-left rotate-right route save scale-balanced
  search server shield-alt shield-halved shopping-bag signal sign-out-alt sliders sliders-h sort sort-down sort-up
  spinner star sticky-note store stream sync-alt table-columns tachometer-alt tags tasks times tools trash
  triangle-exclamation trophy undo university user user-check user-clock user-friends user-plus users users-cog
  user-shield user-tag user-tie wallet wave-square wrench xmark
`.trim().split(/\s+/));
const utilities = new Set(['brands', 'regular', 'solid', 'spin', 'pulse', 'fw', 'lg', 'sm', 'xs', '2x']);

test('all browser documents load the final icon layer and Font Awesome pages use the pinned release', () => {
  const fontAwesomeDocuments = [
    'pages/admin-dashboard.html',
    'pages/login.html',
    'pages/signup.html',
    'pages/forgot-password.html',
    'pages/reset-password.html'
  ];

  for (const file of fontAwesomeDocuments) {
    const html = read(file);
    assert.match(html, /font-awesome\/6\.7\.2\/css\/all\.min\.css/, `${file} must use Font Awesome 6.7.2`);
    assert.doesNotMatch(html, /font-awesome\/(?!6\.7\.2\/)/, `${file} contains another Font Awesome version`);
  }

  const fullDocuments = [
    'index.html',
    ...fs.readdirSync(path.join(root, 'pages'))
      .filter((name) => name.endsWith('.html'))
      .map((name) => `pages/${name}`)
      .filter((file) => read(file).includes('</head>'))
  ];

  for (const file of fullDocuments) {
    const html = read(file);
    const styles = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)]
      .map((match) => match[1]);
    assert.match(styles.at(-1), /smplfix-icons\.css\?v=20260807-icon-reliability$/, `${file} must load icons last`);
    assert.match(html, /icon-system\.js\?v=20260807-icon-reliability/, `${file} must load the dynamic icon normalizer`);
  }
});

test('static and generated Font Awesome names are supported by the pinned release', () => {
  const unknown = [];
  for (const file of sourceFiles) {
    const source = read(file);
    for (const match of source.matchAll(/\bfa-([a-z0-9-]+)/gi)) {
      const name = match[1].toLowerCase();
      // Runtime templates append a validated direction or file type after this prefix.
      if (utilities.has(name) || name.endsWith('-')) continue;
      if (!supportedIcons.has(name)) unknown.push(`${file}: fa-${name}`);
    }
  }
  assert.deepEqual([...new Set(unknown)].sort(), []);
  assert.doesNotMatch(sourceFiles.map(read).join('\n'), /fa-user-hard-hat\b/);
});

test('icon-only controls have an accessible name in static and generated markup', () => {
  const unnamed = [];
  const iconOnlyButton = /<button\b(?<attrs>[^>]*)>\s*<i\b[^>]*class=["'][^"']*\bfa-[^"']+["'][^>]*>\s*<\/i>\s*<\/button>/gi;

  for (const file of sourceFiles) {
    const source = read(file);
    for (const match of source.matchAll(iconOnlyButton)) {
      if (!/\baria-label\s*=/.test(match.groups.attrs)) unnamed.push(file);
    }
  }
  assert.deepEqual(unnamed, []);
});

test('the final icon system inherits control color and preserves dynamic behavior', () => {
  const css = read('assets/css/smplfix-icons.css');
  const js = read('assets/js/icon-system.js');
  const legacyForms = read('assets/css/forms.css');
  const colorOverrides = read('assets/css/color-overrides.css');

  assert.match(css, /color:\s*inherit\s*!important/);
  assert.match(css, /fill:\s*currentColor/);
  assert.match(css, /stroke:\s*currentColor/);
  assert.match(css, /:disabled[\s\S]*?opacity:\s*0\.72/);
  assert.match(css, /\.fa-spin\s*\{\s*animation:/);
  assert.doesNotMatch(css, /#(?:0056b8|003d82|2563eb|3b82f6|1d4ed8)|rgb\(\s*0\s*,\s*86\s*,\s*184/i);
  assert.doesNotMatch(legacyForms, /\.form-group label i\s*\{[^}]*color:\s*#0056b8/is);
  assert.doesNotMatch(
    colorOverrides,
    /(?:\.btn-refresh|\.btn-primary|\.action-btn\.view)\s+i[^{}]*\{[^}]*color:\s*var\(--smpl-ink\)/is,
    'dark action button icons must not be forced to black'
  );

  assert.match(js, /MutationObserver/);
  assert.match(js, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(js, /setAttribute\('aria-label', fallbackLabel\.trim\(\)\)/);
});
