const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('pipeline board exposes local rail navigation and live status', () => {
  const html = read('pages/admin-dashboard.html');
  const script = read('assets/js/pipeline-mongodb.js');
  assert.match(html, /id="pipelineBoardShell"[^>]*data-can-scroll-left="false"[^>]*data-can-scroll-right="false"/);
  assert.match(html, /id="pipelineScrollPrevious"[^>]*scrollPipelineRail\(-1\)/);
  assert.match(html, /id="pipelineScrollNext"[^>]*scrollPipelineRail\(1\)/);
  assert.match(html, /id="stagesContainer"[^>]*role="region"[^>]*tabindex="0"/);
  assert.match(html, /id="pipelineLiveStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /pipeline-mongodb\.js\?v=20260806-board-ux/);
  assert.match(script, /function scrollPipelineRail\(direction\)/);
  assert.match(script, /function updatePipelineRailControls\(\)/);
  assert.match(script, /container\.addEventListener\('scroll', updatePipelineRailControls/);
});

test('pipeline stages use compact headers and accessible overflow actions', () => {
  const script = read('assets/js/pipeline-mongodb.js');
  assert.match(script, /column\.setAttribute\('role', 'group'\)/);
  assert.match(script, /column\.setAttribute\('aria-labelledby', stageHeadingId\)/);
  assert.match(script, /class="icon-btn expand-stage-btn"[^>]*aria-label="Expand/);
  assert.match(script, /class="pipeline-overflow stage-overflow"/);
  assert.match(script, /aria-expanded="false"[^>]*title="More stage actions"/);
  assert.match(script, /role="menuitem" class="edit-stage-btn"/);
  assert.match(script, /role="menuitem" class="delete-stage-btn danger"/);
  assert.match(script, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/);
  assert.match(script, /event\.key === 'Escape'/);
  assert.match(script, /closePipelineOverflow\(details, \{ restoreFocus: true \}\)/);
});

test('record and new-order cards open details without replacing explicit controls', () => {
  const script = read('assets/js/pipeline-mongodb.js');
  assert.match(script, /class="record-card-open"[^>]*aria-label=/);
  assert.match(script, /class="new-order-card-open"[^>]*aria-label=/);
  assert.match(script, /function openPipelineCardDetails\(card\)/);
  assert.match(script, /Date\.now\(\) < pipelineSuppressCardOpenUntil/);
  assert.match(script, /pipelineSuppressCardOpenUntil = Date\.now\(\) \+ 350/);
  assert.match(script, /class="icon-btn record-pickup-btn"[^>]*aria-label="Move/);
  assert.match(script, /class="pipeline-overflow record-overflow"/);
  assert.match(script, /class="record-workflow-state"/);
  assert.match(script, /class="icon-btn new-order-pickup-btn"/);
});

test('pipeline movement keeps pickup, restriction, busy, success, and rollback feedback', () => {
  const script = read('assets/js/pipeline-mongodb.js');
  assert.match(script, /function pickUpPipelineNewOrder\(orderId\)/);
  assert.match(script, /pickedPipelineItem\.type === 'order'/);
  assert.match(script, /await createPipelineRecordFromOrder\(order, stageId\)/);
  assert.match(script, /data-workflow-managed="\$\{workflowManaged \? 'true' : 'false'\}"/);
  assert.match(script, /Advance this Order through Workflow Center/);
  assert.match(script, /function setPipelineRecordBusy\(recordId, busy\)/);
  assert.match(script, /setPipelineRecordBusy\(record\._id, true\)/);
  assert.match(script, /Move failed\.[\s\S]*?returned to/);
});

test('pipeline state panels distinguish success, empty, filtered, loading, and error states', () => {
  const script = read('assets/js/pipeline-mongodb.js');
  assert.match(script, /function renderPipelineEmptyState/);
  assert.match(script, /title: 'All caught up'/);
  assert.match(script, /title: 'No records yet'/);
  assert.match(script, /title: 'No matching records'/);
  assert.match(script, /onclick="clearPipelineFilters\(\)"/);
  assert.match(script, /pipeline-board-state--loading/);
  assert.match(script, /pipeline-board-state--error/);
  assert.doesNotMatch(script, /No records yet<\/div>/);
});

test('pipeline component CSS keeps columns balanced and scrolling local', () => {
  const components = read('assets/css/smplfix-components.css');
  const responsive = read('assets/css/dashboard-responsive.css');
  assert.match(components, /\.pipeline-board-shell\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/);
  assert.match(components, /#stagesContainer\.stages-container\s*\{[\s\S]*?min-height:\s*520px\s*!important;/);
  assert.match(components, /#stagesContainer\.stages-container > \.stage-column\s*\{[\s\S]*?flex:\s*0 0 320px\s*!important;/);
  assert.match(components, /\.record-card-open, \.new-order-card-open[\s\S]*?position:\s*absolute;/);
  assert.doesNotMatch(components, /#pipeline \.record-card::before\s*\{/);
  assert.match(components, /\.pipeline-stage-state--success \.pipeline-stage-state-icon\s*\{[\s\S]*?color:\s*var\(--smpl-paper\);[\s\S]*?border-color:\s*var\(--smpl-ink\);[\s\S]*?background:\s*var\(--smpl-ink\);/);
  assert.match(components, /@media \(max-width: 720px\)[\s\S]*?min-width:\s*44px\s*!important;/);
  assert.match(responsive, /#stagesContainer\.stages-container\s*\{[\s\S]*?overflow-x:\s*auto\s*!important;[\s\S]*?overflow-y:\s*hidden\s*!important;/);
  assert.match(responsive, /clamp\(300px, 26cqi, 320px\)/);
});
