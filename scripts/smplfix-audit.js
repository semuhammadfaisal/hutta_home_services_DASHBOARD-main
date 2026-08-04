const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walk(directory, extensions) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(relative, extensions);
    return extensions.includes(path.extname(entry.name).toLowerCase()) ? [relative] : [];
  });
}

function fail(message) {
  failures.push(message);
}

function visibleHtmlText(source) {
  const withoutCode = source
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  const attributes = [];
  const attributePattern = /\b(?:alt|aria-label|placeholder|title)\s*=\s*["']([^"']*)["']/gi;
  let match;
  while ((match = attributePattern.exec(withoutCode))) attributes.push(match[1]);
  const metadataPattern = /<meta\b[^>]*(?:name|property)=["'](?:application-name|apple-mobile-web-app-title|description|og:title|og:description)["'][^>]*content=["']([^"']*)["'][^>]*>/gi;
  while ((match = metadataPattern.exec(withoutCode))) attributes.push(match[1]);
  return `${withoutCode.replace(/<[^>]+>/g, ' ')} ${attributes.join(' ')}`;
}

const officialAssets = [
  'assets/images/smplfix-logo-ink.png',
  'assets/images/smplfix-logo-reversed.png',
  'assets/images/smplfix-icon-192.png',
  'assets/images/smplfix-icon-512.png',
  'manifest.webmanifest'
];
officialAssets.forEach((asset) => {
  if (!exists(asset)) fail(`Missing official asset: ${asset}`);
});

const htmlFiles = ['index.html', ...walk('pages', ['.html'])]
  .filter((file) => !file.endsWith('profile-modal.html'));
const oldBrand = /\b(?:hutta home services|hutta(?:s|'s|’s)?)\b/i;
const invalidSmplfix = /\b(?:SMPL\s+Fix|SMPLFIX|Smpl\s+Fix)\b/;

htmlFiles.forEach((file) => {
  const source = read(file);
  const visible = visibleHtmlText(source);
  if (oldBrand.test(visible)) fail(`Visible legacy brand text in ${file}`);
  if (invalidSmplfix.test(visible)) fail(`Invalid SMPLFix wordmark spelling in ${file}`);
  if (!/<title>[^<]*smplfix[^<]*<\/title>/i.test(source)) fail(`Missing smplfix browser title in ${file}`);
  if (!/manifest\.webmanifest/i.test(source)) fail(`Missing manifest reference in ${file}`);
  if (!/smplfix-theme\.css/i.test(source)) fail(`Missing centralized theme in ${file}`);
  if (!/smplfix-components\.css/i.test(source)) fail(`Missing centralized components in ${file}`);
  const themeIndex = source.lastIndexOf('smplfix-theme.css');
  const componentsIndex = source.lastIndexOf('smplfix-components.css');
  if (themeIndex > componentsIndex) fail(`Theme must load before components in ${file}`);
});

const adminDashboard = read('pages/admin-dashboard.html');
const staticSectionHeaders = [
  ['calendar', 'Command', 'Calendar'],
  ['recurring-calendar', 'Command', 'Recurring calendar'],
  ['orders', 'Operations', 'Orders'],
  ['pipeline', 'Operations', 'Pipeline'],
  ['customers', 'Operations', 'Customers'],
  ['vendors', 'Operations', 'Vendors'],
  ['vendor-reviews', 'Operations', 'Vendor reviews'],
  ['payments', 'Finance', 'Payments'],
  ['accounting', 'Finance', 'Accounting'],
  ['reports', 'Finance', 'Reports and analytics'],
  ['employees', 'People &amp; Admin', 'Employees'],
  ['users', 'People &amp; Admin', 'Users'],
  ['settings', 'People &amp; Admin', 'Settings']
];
staticSectionHeaders.forEach(([id, eyebrow, title]) => {
  const start = adminDashboard.indexOf(`<section id="${id}"`);
  const header = start >= 0 ? adminDashboard.slice(start, start + 2400) : '';
  if (!header.includes('smpl-section-header')) fail(`Missing unified section header in #${id}`);
  if (!header.includes(`<p class="page-eyebrow">${eyebrow}</p>`)) fail(`Incorrect header eyebrow in #${id}`);
  if (!header.includes(`<h1>${title}</h1>`)) fail(`Incorrect header title in #${id}`);
  if (!header.includes('smpl-section-description')) fail(`Missing header description in #${id}`);
});
const workflowHub = read('assets/js/workflow-hub.js');
if (!/workflow-hub-header[^`]*smpl-section-header/.test(workflowHub) || !/<h1>Workflow center<\/h1>/.test(workflowHub)) {
  fail('Workflow Center must render the unified dynamic section header');
}

const manifest = JSON.parse(read('manifest.webmanifest'));
if (manifest.name !== 'smplfix' || manifest.short_name !== 'smplfix') {
  fail('Manifest name and short_name must both be lowercase smplfix');
}
if (String(manifest.theme_color).toUpperCase() !== '#0B0B0C') fail('Manifest theme_color must use SMPLFix Ink');
if (String(manifest.background_color).toUpperCase() !== '#F6F6F4') fail('Manifest background_color must use SMPLFix Surface');

const theme = read('assets/css/smplfix-theme.css');
const components = read('assets/css/smplfix-components.css');
const canonicalCss = `${theme}\n${components}`;
const requiredTokens = {
  '--smpl-ink': '#0B0B0C',
  '--smpl-surface': '#F6F6F4',
  '--smpl-paper': '#FFFFFF',
  '--smpl-line': '#ECECED',
  '--smpl-mute': '#9A9A9E',
  '--smpl-soft': '#B6B6BA'
};
Object.entries(requiredTokens).forEach(([token, value]) => {
  if (!new RegExp(`${token}\\s*:\\s*${value}`, 'i').test(theme)) fail(`Missing or incorrect token ${token}`);
});
if (!/Space\+Grotesk:wght@500;600;700/.test(theme)) fail('Space Grotesk must request only weights 500, 600, and 700');
if (/\b(?:linear|radial)-gradient\s*\(/i.test(canonicalCss)) fail('Canonical SMPLFix CSS must not contain gradients');
if (/#(?:0056b8|3b82f6|2563eb|1d4ed8|0b63ce|075eb8|1872d3|0066cc)\b/i.test(canonicalCss)) {
  fail('Canonical SMPLFix CSS contains a legacy blue color');
}

const legacyCss = walk('assets/css', ['.css']).filter((file) => !/smplfix-(?:theme|shell|components)\.css$/i.test(file));
let legacyGradientCount = 0;
let legacyBlueCount = 0;
legacyCss.forEach((file) => {
  const source = read(file);
  legacyGradientCount += (source.match(/\b(?:linear|radial)-gradient\s*\(/gi) || []).length;
  legacyBlueCount += (source.match(/#(?:0056b8|3b82f6|2563eb|1d4ed8|0b63ce|075eb8|1872d3|0066cc)\b/gi) || []).length;
});
if (legacyGradientCount || legacyBlueCount) {
  warnings.push(`${legacyGradientCount} legacy gradient declarations and ${legacyBlueCount} legacy blue declarations remain in pre-theme feature CSS; the final SMPLFix layer neutralizes loaded UI output.`);
}

console.log('SMPLFix production audit');
console.log(`Checked ${htmlFiles.length} full HTML pages and ${legacyCss.length} legacy CSS files.`);
warnings.forEach((warning) => console.warn(`WARN: ${warning}`));
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exitCode = 1;
} else {
  console.log('PASS: Brand assets, metadata, public copy, canonical tokens, typography, and component CSS checks passed.');
}
