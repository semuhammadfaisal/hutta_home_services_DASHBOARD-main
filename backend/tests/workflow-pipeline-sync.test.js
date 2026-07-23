const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const PipelineRecord = require('../models/PipelineRecord');
const Stage = require('../models/Stage');
const { STAGE_DEFINITIONS, WORKFLOW_STATUS } = require('../utils/workflowSync');

test('every Workflow Center state has a broad Order status and Pipeline mapping', () => {
  assert.deepEqual(WORKFLOW_STATUS.request_received, { orderStatus: 'new', stageKey: 'work_order_received' });
  assert.deepEqual(WORKFLOW_STATUS.scheduled, { orderStatus: 'in-progress', stageKey: 'in_progress' });
  assert.deepEqual(WORKFLOW_STATUS.completed, { orderStatus: 'completed', stageKey: 'invoice_sent' });
  assert.deepEqual(WORKFLOW_STATUS.closeout_issue_reported, { orderStatus: 'completed', stageKey: 'awaiting_documentation' });
  assert.equal(Object.keys(WORKFLOW_STATUS).length, 12);
  assert.equal(STAGE_DEFINITIONS.paid.name, 'Paid');
});

test('Pipeline stages and records retain stable synchronization metadata', () => {
  assert.ok(Stage.schema.path('systemKey'));
  assert.ok(Stage.schema.indexes().some(([fields, options]) => fields.systemKey === 1 && options.unique && options.sparse));
  assert.deepEqual(PipelineRecord.schema.path('stageSource').enumValues, ['manual', 'workflow', 'payment']);
  assert.ok(PipelineRecord.schema.path('stageSyncedAt'));
  assert.ok(PipelineRecord.schema.path('workflowStatus'));
  assert.ok(PipelineRecord.schema.indexes().some(([fields, options]) => fields.orderId === 1 && options.unique && options.sparse));
});

test('workflow transitions synchronize Pipeline and manual Pipeline dragging is blocked', () => {
  const service = read('backend/utils/workflowSync.js');
  const pipeline = read('backend/routes/pipelineRecords.js');
  const intake = read('backend/utils/websiteIntake.js');
  assert.match(service, /Payment\.exists/);
  assert.match(service, /stageKey = 'paid'/);
  assert.match(service, /PipelineRecord\.create/);
  assert.match(pipeline, /Workflow-managed Orders must be advanced through Workflow Center/);
  assert.match(intake, /synchronizeWorkflowOrder\(order, 'request_received'/);
});

test('migration supports dry-run, apply, conflict reporting, and unique-index replacement', () => {
  const migration = read('backend/migrate-workflow-pipeline-sync.js');
  const backendPackage = JSON.parse(read('backend/package.json'));
  assert.match(migration, /process\.argv\.includes\('--apply'\)/);
  assert.match(migration, /Duplicate Pipeline records must be resolved/);
  assert.match(migration, /dropIndex/);
  assert.equal(backendPackage.scripts['migrate:workflow-pipeline-sync'], 'node migrate-workflow-pipeline-sync.js');
  assert.equal(backendPackage.scripts['migrate:workflow-pipeline-sync:apply'], 'node migrate-workflow-pipeline-sync.js --apply');
});
