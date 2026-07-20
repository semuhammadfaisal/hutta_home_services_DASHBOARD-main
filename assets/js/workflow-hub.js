(() => {
  const STAGES = [
    { stage: 1, section: 'workflow-center', short: 'Request', title: 'Request Received', load: 'loadWorkflowCenter', open: 'openWorkflowOrder', workspace: 'order-detail' },
    { stage: 2, section: 'incoming-quotes', short: 'Vendor Quotes', title: 'Incoming Quotes', load: 'loadIncomingQuotes', open: 'openIncomingQuoteWorkspace', close: 'closeIncomingQuoteWorkspace', workspace: 'incomingQuoteWorkspace' },
    { stage: 3, section: 'outgoing-quotes', short: 'Customer Quote', title: 'Outgoing Quotes', load: 'loadOutgoingQuotes', open: 'openOutgoingQuoteWorkspace', close: 'closeOutgoingQuoteWorkspace', workspace: 'outgoingQuoteWorkspace' },
    { stage: 4, section: 'customer-approvals', short: 'Approval', title: 'Customer Approvals', load: 'loadCustomerApprovals', open: 'openCustomerApproval', close: 'closeCustomerApprovalWorkspace', workspace: 'customerApprovalWorkspace' },
    { stage: 5, section: 'scheduling', short: 'Schedule', title: 'Scheduling', load: 'loadScheduling', open: 'openSchedulingWorkspace', close: 'closeSchedulingWorkspace', workspace: 'schedulingWorkspace' }
  ];
  const listIds = { 1: 'workflowRequestList', 2: 'incomingQuoteOrderList', 3: 'outgoingQuoteOrderList', 4: 'customerApprovalList', 5: 'schedulingOrderList' };
  const state = { overview: null, activeStage: 0, currentOrderId: '', filters: {}, scroll: {}, dirty: false, routing: false };
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const fmtDate = value => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const statusText = value => String(value || '').replaceAll('_', ' ');

  function countsFor(stage) { return state.overview?.counts?.find(item => item.stage === stage) || { total: 0, attention: 0 }; }
  function tabs(active = 0) {
    return `<nav class="workflow-tabs" aria-label="Workflow stages" role="tablist">
      <button class="workflow-tab" data-workflow-view="overview" role="tab" aria-selected="${active === 0}"><span>All work</span><strong>Overview</strong></button>
      ${STAGES.map(item => `<button class="workflow-tab" data-workflow-view="stage-${item.stage}" role="tab" aria-selected="${active === item.stage}"><span>Stage ${item.stage}<em class="workflow-tab-count">${countsFor(item.stage).total}</em></span><strong>${esc(item.short)}</strong></button>`).join('')}
    </nav>`;
  }
  function stageStrip(active = 0) {
    return `<div class="workflow-stage-strip" aria-label="Five-stage workflow">
      ${STAGES.map(item => { const count = countsFor(item.stage); return `<button class="workflow-stage-step ${active === item.stage ? 'is-active' : ''} ${count.attention ? 'has-attention' : ''}" data-workflow-view="stage-${item.stage}"><span class="dot">${item.stage}</span><strong>${esc(item.short)}</strong><small>${count.total} total${count.attention ? ` · ${count.attention} attention` : ''}</small></button>`; }).join('')}
    </div>`;
  }
  function filterbar(stage) {
    const saved = state.filters[stage] || {};
    return `<div class="workflow-filterbar" data-stage-filter="${stage}">
      <label class="workflow-search"><i class="fas fa-search" aria-hidden="true"></i><span class="sr-only">Search this stage</span><input type="search" value="${esc(saved.search || '')}" placeholder="Search reference, customer, vendor, service…"></label>
      <select aria-label="Filter by attention"><option value="all">All work</option><option value="attention" ${saved.attention === 'attention' ? 'selected' : ''}>Needs attention</option><option value="clear" ${saved.attention === 'clear' ? 'selected' : ''}>No warnings</option></select>
      <select aria-label="Filter by issue"><option value="all">All issues</option><option value="email">Email problems</option><option value="compliance">Compliance</option><option value="missing">Missing information</option><option value="changes">Changes requested</option></select>
      <input type="date" aria-label="Updated on or after" value="${esc(saved.date || '')}">
    </div>`;
  }
  function sharedChrome(stage) {
    return `<div class="workflow-shared-chrome">${tabs(stage)}${stageStrip(stage)}${filterbar(stage)}</div>`;
  }

  function setSidebarActive() {
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    document.getElementById('workflowCenterNav')?.closest('.menu-item')?.classList.add('active');
  }

  function routeHash(stage, orderId = '') {
    if (!stage) return '#workflow-center/overview';
    return `#workflow-center/stage-${stage}${orderId ? `/order/${encodeURIComponent(orderId)}` : ''}`;
  }

  async function showView(stage = 0, orderId = '', { replace = false, fromHash = false } = {}) {
    if (state.routing) return;
    if (state.dirty && (stage !== state.activeStage || orderId !== state.currentOrderId)) {
      const leave = await window.WorkflowDialog.confirm({ title: 'Discard unsaved changes?', message: 'You have edits in this workspace that have not been saved.', confirmLabel: 'Discard Changes', tone: 'danger' });
      if (!leave) return;
      state.dirty = false;
    }
    state.routing = true;
    try {
      if (state.activeStage && !state.currentOrderId) state.scroll[state.activeStage] = window.scrollY;
      state.activeStage = Number(stage || 0);
      state.currentOrderId = orderId || '';
      setSidebarActive();
      if (!fromHash) history[replace ? 'replaceState' : 'pushState']({}, '', routeHash(state.activeStage, orderId));
      if (!stage) {
        window.dashboard.showSection('workflow-overview');
        await loadOverview();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const config = STAGES.find(item => item.stage === Number(stage));
      if (!config) return;
      window.dashboard.showSection(config.section);
      injectStageChrome();
      if (typeof window[config.load] === 'function') await window[config.load]();
      if (orderId && config.open && typeof window[config.open] === 'function') await window[config.open](orderId, false);
      else requestAnimationFrame(() => window.scrollTo(0, state.scroll[stage] || 0));
    } finally { state.routing = false; }
  }

  function priorityChip(reason) {
    const tone = /failed/i.test(reason) ? 'error' : /missing|changes|compliance/i.test(reason) ? 'warning' : 'info';
    return `<span class="workflow-chip ${tone}">${esc(reason)}</span>`;
  }

  function overviewHeader() {
    const attention = state.overview?.actionRequiredTotal || 0;
    return `<header class="workflow-hub-header"><div><span class="workflow-hub-eyebrow">Operations control center</span><h1>Workflow Center</h1><p>Move every request from intake to a vendor-confirmed schedule with one clear next action.</p></div><div class="workflow-hub-actions"><span class="workflow-attention-pill"><i class="fas fa-bell"></i>${attention} need attention</span><span class="workflow-updated">Updated ${fmtDate(state.overview?.refreshedAt)}</span><button class="btn-secondary" type="button" data-workflow-refresh><i class="fas fa-sync-alt"></i> Refresh</button></div></header>`;
  }

  function renderOverview() {
    const mount = document.getElementById('workflowOverviewMount');
    if (!mount || !state.overview) return;
    const attention = state.overview.attention || [];
    const recent = state.overview.recent || [];
    mount.innerHTML = `<div class="workflow-hub-shell">${overviewHeader()}${tabs(0)}${stageStrip(0)}
      <div class="workflow-overview-grid">
        <section class="workflow-overview-panel"><div class="workflow-panel-head"><div><h2>Needs attention</h2><p>Blocked work and required next actions, prioritized for your team.</p></div><span class="workflow-attention-pill">${attention.length} shown</span></div>
          <div>${attention.length ? attention.map(item => `<article class="workflow-queue-row"><div><span class="workflow-hub-eyebrow">${esc(item.requestReference || item.orderId)}</span><h3>${esc(item.customer?.name || 'Customer')}</h3><p>${esc(item.service || 'Service request')}</p></div><div><strong>Stage ${item.stage}</strong><small>${esc(statusText(item.workflowStatus))}</small></div><div class="workflow-row-reasons">${item.reasons.map(priorityChip).join('')}</div><button class="btn-primary" data-workflow-open="${esc(item._id)}" data-stage="${item.stage}">Continue</button></article>`).join('') : '<div class="workflow-empty"><i class="fas fa-check-circle"></i><p>No workflow items need attention.</p></div>'}</div>
        </section>
        <aside class="workflow-overview-panel"><div class="workflow-panel-head"><div><h2>Recently updated</h2><p>Latest activity across all stages.</p></div></div><div class="workflow-recent-list">${recent.length ? recent.map(item => `<button class="workflow-recent-item" data-workflow-open="${esc(item._id)}" data-stage="${item.stage}" type="button"><span><strong>${esc(item.customer?.name || item.requestReference || item.orderId)}</strong><span>Stage ${item.stage} · ${esc(item.service || '')}</span></span><small>${fmtDate(item.updatedAt)}</small></button>`).join('') : '<p>No workflow activity yet.</p>'}</div></aside>
      </div></div>`;
    bindNavigation(mount);
  }

  async function loadOverview() {
    const mount = document.getElementById('workflowOverviewMount');
    if (mount && !state.overview) mount.innerHTML = '<div class="workflow-skeleton"></div><div class="workflow-skeleton"></div><div class="workflow-skeleton"></div>';
    try {
      state.overview = await window.APIService.getWorkflowOverview();
      const badge = document.getElementById('workflowHubNavBadge');
      if (badge) { badge.textContent = state.overview.actionRequiredTotal || 0; badge.hidden = !state.overview.actionRequiredTotal; }
      renderOverview();
      injectStageChrome();
    } catch (error) {
      if (mount) mount.innerHTML = `<div class="workflow-empty"><i class="fas fa-exclamation-circle"></i><p>${esc(error.message || 'Unable to load Workflow Center')}</p><button class="btn-primary" data-workflow-refresh>Retry</button></div>`;
      bindNavigation(mount);
    }
  }

  function bindNavigation(root = document) {
    root.querySelectorAll('[data-workflow-view]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        const value = button.dataset.workflowView;
        showView(value === 'overview' ? 0 : Number(value.replace('stage-', '')));
      });
    });
    root.querySelectorAll('[data-workflow-open]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = 'true';
      button.addEventListener('click', () => showView(Number(button.dataset.stage), button.dataset.workflowOpen));
    });
    root.querySelectorAll('[data-workflow-refresh]').forEach(button => button.addEventListener('click', () => { state.overview = null; loadOverview(); }));
  }

  function injectStageChrome() {
    STAGES.forEach(config => {
      const section = document.getElementById(config.section);
      if (!section) return;
      let chrome = section.querySelector(':scope > .workflow-shared-chrome');
      if (!chrome) { chrome = document.createElement('div'); chrome.innerHTML = sharedChrome(config.stage); section.prepend(chrome.firstElementChild); }
      else chrome.outerHTML = sharedChrome(config.stage);
      bindNavigation(section);
      bindFilters(section, config.stage);
    });
  }

  function bindFilters(section, stage) {
    const bar = section.querySelector(`[data-stage-filter="${stage}"]`);
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = 'true';
    const controls = bar.querySelectorAll('input,select');
    controls.forEach(control => control.addEventListener(control.type === 'search' ? 'input' : 'change', () => {
      const values = [...controls].map(item => item.value);
      state.filters[stage] = { search: values[0], attention: values[1], issue: values[2], date: values[3] };
      applyFilters(stage);
    }));
    applyFilters(stage);
  }

  function applyFilters(stage) {
    const list = document.getElementById(listIds[stage]);
    if (!list) return;
    const filter = state.filters[stage] || {};
    const terms = String(filter.search || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    [...list.querySelectorAll(':scope > article')].forEach(card => {
      const text = card.textContent.toLowerCase();
      const matchesSearch = terms.every(term => text.includes(term));
      const hasAttention = /missing|failed|warning|changes requested|expired|need review/i.test(text);
      const matchesAttention = !filter.attention || filter.attention === 'all' || (filter.attention === 'attention' ? hasAttention : !hasAttention);
      const issueTerms = { email: /email.*(failed|issue)|delivery issue/i, compliance: /compliance/i, missing: /missing/i, changes: /changes requested/i };
      const matchesIssue = !filter.issue || filter.issue === 'all' || issueTerms[filter.issue]?.test(text);
      const time = card.querySelector('time')?.dateTime || card.querySelector('time')?.textContent;
      const matchesDate = !filter.date || !time || new Date(time) >= new Date(`${filter.date}T00:00:00`);
      card.hidden = !(matchesSearch && matchesAttention && matchesIssue && matchesDate);
    });
  }

  function journeyMarkup(data) {
    return `<div class="workflow-order-context"><div><span class="workflow-hub-eyebrow">${esc(data.order.requestReference || data.order.orderId)}</span><h2>${esc(data.order.customer?.name || 'Customer')} · ${esc(data.order.service)}</h2><p>${esc(data.order.customer?.address || 'Service address not provided')}${data.order.vendor?.name ? ` · ${esc(data.order.vendor.name)}` : ''}</p></div><span class="workflow-chip info">${esc(statusText(data.order.workflowStatus))}</span></div>
      <div class="workflow-journey" aria-label="Order workflow progress">${data.stages.map((item, index) => `<div class="workflow-journey-step ${esc(item.state)}" data-step="${item.stage}"><strong>${esc(STAGES[index].short)}</strong><span>${item.reference ? esc(item.reference) : item.state === 'upcoming' ? 'Not started' : statusText(item.state)}</span></div>`).join('')}</div>`;
  }

  async function enterWorkspace(stage, orderId) {
    orderId = String(orderId?._id || orderId || '').trim();
    if (!orderId) {
      window.showToast?.('This request is not linked to an Order. Refresh the request or review its intake record.', 'error');
      return;
    }
    const config = STAGES.find(item => item.stage === stage);
    const section = document.getElementById(config?.section);
    const workspace = document.getElementById(config?.workspace);
    if (!section || !workspace) return;
    section.classList.add('is-workspace-open');
    state.activeStage = stage; state.currentOrderId = orderId; state.dirty = false;
    let top = workspace.querySelector('.workflow-workspace-frame');
    if (!top) { top = document.createElement('div'); top.className = 'workflow-workspace-frame'; workspace.prepend(top); }
    top.innerHTML = `<div class="workflow-workspace-back"><button class="workflow-back-button" type="button"><i class="fas fa-arrow-left"></i> Back to ${esc(config.title)}</button><span class="workflow-updated">Loading order journey…</span></div><div class="workflow-skeleton"></div>`;
    top.querySelector('button').addEventListener('click', () => leaveWorkspace(stage));
    try { top.innerHTML = `<div class="workflow-workspace-back"><button class="workflow-back-button" type="button"><i class="fas fa-arrow-left"></i> Back to ${esc(config.title)}</button></div>${journeyMarkup(await window.APIService.getWorkflowJourney(orderId))}`; top.querySelector('button').addEventListener('click', () => leaveWorkspace(stage)); }
    catch (error) { top.querySelector('.workflow-skeleton').outerHTML = `<div class="workflow-chip error">${esc(error.message)}</div>`; }
    setupStageEnhancements(stage, workspace);
    workspace.scrollIntoView({ block: 'start' });
  }

  async function leaveWorkspace(stage) {
    if (state.dirty) {
      const leave = await window.WorkflowDialog.confirm({ title: 'Discard unsaved changes?', message: 'Your unsaved edits will be lost.', confirmLabel: 'Discard Changes', tone: 'danger' });
      if (!leave) return;
    }
    state.dirty = false;
    const config = STAGES.find(item => item.stage === stage);
    if (config?.close && typeof window[config.close] === 'function') window[config.close]();
    document.getElementById(config?.section)?.classList.remove('is-workspace-open');
    showView(stage);
  }

  function setupIncomingTabs(workspace) {
    const actionGrid = workspace.querySelector('.incoming-action-grid');
    if (!actionGrid) return;
    actionGrid.classList.add('is-tabbed');
    const inviteForm = document.getElementById('incomingInvitationForm');
    const staffForm = document.getElementById('incomingStaffQuoteForm');
    const compare = workspace.querySelector('.incoming-comparison-panel');
    const invites = document.getElementById('incomingInvitationList')?.closest('.incoming-panel');
    const delivery = document.getElementById('incomingEmailDeliveryList')?.closest('.incoming-panel');
    [[inviteForm,'invitations'],[invites,'invitations'],[staffForm,'entry'],[compare,'comparison'],[delivery,'delivery']].forEach(([node,pane]) => { if (node) node.dataset.workflowPane = pane; });
    let tabsNode = workspace.querySelector('.incoming-workspace-tabs');
    if (!tabsNode) {
      tabsNode = document.createElement('div'); tabsNode.className = 'incoming-workspace-tabs'; tabsNode.setAttribute('role','tablist');
      tabsNode.innerHTML = [['invitations','Vendor Invitations'],['entry','Staff Quote Entry'],['comparison','Quote Comparison'],['delivery','Delivery & History']].map(([id,label],index) => `<button class="incoming-workspace-tab" role="tab" data-pane="${id}" aria-selected="${index === 0}">${label}</button>`).join('');
      actionGrid.before(tabsNode);
    }
    const selectPane = pane => {
      workspace.querySelectorAll('[data-workflow-pane]').forEach(node => { node.hidden = node.dataset.workflowPane !== pane; });
      tabsNode.querySelectorAll('button').forEach(button => button.setAttribute('aria-selected', button.dataset.pane === pane));
    };
    tabsNode.querySelectorAll('button').forEach(button => button.onclick = () => selectPane(button.dataset.pane));
    selectPane(tabsNode.querySelector('[aria-selected="true"]')?.dataset.pane || 'invitations');
    const updateTotal = () => { const total = Number(document.getElementById('incomingLabor')?.value || 0) + Number(document.getElementById('incomingMaterials')?.value || 0); let box = staffForm?.querySelector('.incoming-live-total'); if (!box && staffForm) { box = document.createElement('div'); box.className = 'incoming-live-total'; box.innerHTML = '<span>Calculated quote total</span><strong></strong>'; staffForm.querySelector('.incoming-form-actions')?.before(box); } if (box) box.querySelector('strong').textContent = total.toLocaleString('en-US',{style:'currency',currency:'USD'}); };
    ['incomingLabor','incomingMaterials'].forEach(id => document.getElementById(id)?.addEventListener('input', updateTotal)); updateTotal();
    const headers = ['Vendor','Compliance','Labor','Materials','Total','Duration','Earliest','Access','Conditions','Status','Actions'];
    workspace.querySelectorAll('.incoming-comparison-table tbody tr').forEach(row => [...row.children].forEach((cell,index) => cell.dataset.label = headers[index] || ''));
    const totals = [...workspace.querySelectorAll('.incoming-comparison-table tbody tr')].map(row => ({ row, cell: row.children[4], value: Number((row.children[4]?.textContent || '').replace(/[^0-9.-]/g,'')) })).filter(item => Number.isFinite(item.value));
    const lowest = Math.min(...totals.map(item => item.value)); totals.filter(item => item.value === lowest).forEach(item => item.cell?.classList.add('is-lowest'));
  }

  function setupOutgoing(workspace) {
    const form = document.getElementById('outgoingDraftForm');
    if (!form || form.closest('.outgoing-draft-layout')) return;
    const layout = document.createElement('div'); layout.className = 'outgoing-draft-layout';
    form.parentNode.insertBefore(layout, form); layout.appendChild(form);
    const field = id => String(document.getElementById(id)?.value || '').trim();
    const quote = window.__workflowOutgoingQuote || {};
    const vendor = quote.vendorSnapshot || {};
    const futureOrMissing = value => !value || new Date(value) > new Date();
    const checks = [
      ['Customer email', () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field('oqCustomerEmail'))],
      ['Approved terms', () => !!field('oqTerms')], ['Licensed contractor', () => !!field('oqContractor')],
      ['Contractor license', () => !!field('oqLicenseNumber')], ['License type', () => !!field('oqLicenseType')],
      ['ROC number', () => !!field('oqRoc')], ['COI on file', () => vendor.coiOnFile === true],
      ['Insurance current', () => !!vendor.insuranceExpirationDate && new Date(vendor.insuranceExpirationDate) > new Date()],
      ['ROC license current', () => futureOrMissing(vendor.rocLicenseExpirationDate)],
      ['Future quote expiration', () => new Date(field('oqValidUntil')) > new Date()]
    ];
    const side = document.createElement('aside'); side.className = 'outgoing-panel outgoing-readiness'; layout.appendChild(side);
    const refresh = () => { const results = checks.map(([label,test]) => [label,test()]); side.innerHTML = `<span class="workflow-hub-eyebrow">Send readiness</span><h3>${results.every(item => item[1]) ? 'Ready to send' : 'Action required'}</h3><ul class="workflow-readiness-list">${results.map(([label,ready]) => `<li class="${ready?'ready':'blocked'}"><i class="fas fa-${ready?'check-circle':'exclamation-circle'}"></i>${esc(label)}</li>`).join('')}</ul><p class="workflow-updated">All compliance checks are revalidated securely when sending.</p>`; const send = form.querySelector('button[onclick^="sendOutgoingQuote"]'); if (send) { send.disabled = !results.every(item => item[1]); send.title = send.disabled ? 'Complete every readiness item before sending' : ''; } };
    form.addEventListener('input', refresh); form.addEventListener('change', refresh); refresh();
  }

  function setupApproval(workspace) {
    const status = (workspace.querySelector('.approval-status')?.textContent || 'pending').trim().toLowerCase().replace(/\s+/g,'_');
    let timeline = workspace.querySelector('.workflow-decision-timeline');
    if (!timeline) { timeline=document.createElement('div'); timeline.className='workflow-decision-timeline'; workspace.querySelector('.approval-workspace-head')?.after(timeline); }
    const changed = status === 'changes_requested', approved = status === 'approved';
    timeline.innerHTML = `<div class="workflow-decision-step done">Quote prepared</div><div class="workflow-decision-step done">Secure quote sent</div><div class="workflow-decision-step ${changed?'attention':approved?'done':'current'}">${changed?'Changes requested':approved?'Customer approved':'Awaiting decision'}</div><div class="workflow-decision-step ${approved?'done':changed?'attention':''}">${approved?'Confirmation delivered':changed?'Revision required':'Confirmation pending'}</div>`;
    const audit = workspace.querySelector('.approval-audit');
    if (audit && !audit.closest('details')) { const details = document.createElement('details'); details.className = 'workflow-audit-details'; details.innerHTML = '<summary>Audit Evidence</summary><div></div>'; audit.parentNode.insertBefore(details, audit); details.querySelector('div').appendChild(audit); }
  }

  function setupScheduling(workspace) {
    const form = document.getElementById('scheduleProposalForm'); if (!form) return;
    let preview = form.querySelector('.schedule-time-preview'); if (!preview) { preview = document.createElement('div'); preview.className = 'schedule-time-preview full'; preview.innerHTML = '<div><span>Arizona start preview</span><strong>Choose a start time</strong></div><div><span>Arizona end preview</span><strong>Choose an end time</strong></div>'; form.querySelector('h3')?.after(preview); }
    const render = () => ['scheduleStartInput','scheduleEndInput'].forEach((id,index) => { const value=document.getElementById(id)?.value; preview.children[index].querySelector('strong').textContent=value?new Date(`${value}:00-07:00`).toLocaleString('en-US',{timeZone:'America/Phoenix',dateStyle:'medium',timeStyle:'short'}):`Choose ${index?'an end':'a start'} time`; });
    const conflictBox=document.getElementById('scheduleConflictBox'), conflictAck=document.getElementById('scheduleConflictAckLabel'), endField=document.getElementById('scheduleEndInput')?.closest('label');
    if(endField&&conflictBox&&conflictAck){endField.after(conflictBox);conflictBox.after(conflictAck)}
    ['scheduleStartInput','scheduleEndInput'].forEach(id => document.getElementById(id)?.addEventListener('change',render)); render();
  }

  function setupStageEnhancements(stage, workspace) {
    if (stage === 2) setupIncomingTabs(workspace);
    if (stage === 3) setupOutgoing(workspace);
    if (stage === 4) setupApproval(workspace);
    if (stage === 5) setupScheduling(workspace);
    workspace.querySelectorAll('input,textarea,select').forEach(control => control.addEventListener('input', () => { state.dirty = true; }, { once: true }));
    workspace.querySelectorAll('form').forEach(form => form.addEventListener('submit', () => { state.dirty = false; }));
  }

  function wrapWorkspaceOpeners() {
    STAGES.filter(item => item.open).forEach(config => {
      const original = window[config.open]; if (typeof original !== 'function' || original.__workflowWrapped) return;
      const wrapped = async (...args) => {
        const orderId = String(args[0]?._id || args[0] || '').trim();
        const result = await original(...args);
        if (!orderId) return result;
        await enterWorkspace(config.stage, orderId);
        if (!state.routing) history.pushState({}, '', routeHash(config.stage, orderId));
        return result;
      };
      wrapped.__workflowWrapped = true; window[config.open] = wrapped;
    });
  }

  function createDialog() {
    const dialog = document.createElement('div'); dialog.className = 'workflow-dialog'; dialog.hidden = true;
    dialog.innerHTML = '<div class="workflow-dialog-backdrop"></div><section class="workflow-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="workflowDialogTitle"><h2 id="workflowDialogTitle"></h2><p class="workflow-dialog-message"></p><div class="workflow-dialog-impact" hidden></div><label class="workflow-dialog-input" hidden><span>Details</span><textarea></textarea></label><div class="workflow-dialog-actions"><button class="btn-secondary" data-dialog-cancel>Cancel</button><button class="btn-primary" data-dialog-confirm>Confirm</button></div></section>';
    document.body.appendChild(dialog);
    let resolveCurrent = null, previousFocus = null;
    const close = value => { dialog.hidden = true; document.body.style.overflow=''; previousFocus?.focus?.(); resolveCurrent?.(value); resolveCurrent=null; };
    dialog.querySelector('[data-dialog-cancel]').onclick = () => close(null);
    dialog.querySelector('.workflow-dialog-backdrop').onclick = () => close(null);
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') close(null); if (event.key === 'Tab') { const nodes=[...dialog.querySelectorAll('button:not([hidden]),textarea:not([hidden])')]; const first=nodes[0],last=nodes[nodes.length-1]; if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()} } });
    const open = options => new Promise(resolve => { previousFocus=document.activeElement; resolveCurrent=resolve; dialog.hidden=false; document.body.style.overflow='hidden'; dialog.querySelector('h2').textContent=options.title||'Confirm action'; dialog.querySelector('.workflow-dialog-message').textContent=options.message||''; const impact=dialog.querySelector('.workflow-dialog-impact'); impact.hidden=!options.impact; impact.textContent=options.impact||''; const label=dialog.querySelector('.workflow-dialog-input'),textarea=label.querySelector('textarea'); label.hidden=!options.prompt; textarea.value=''; textarea.placeholder=options.placeholder||''; const confirm=dialog.querySelector('[data-dialog-confirm]'); confirm.textContent=options.confirmLabel||'Confirm'; confirm.classList.toggle('workflow-dialog-danger',options.tone==='danger'); confirm.onclick=()=>{const value=options.prompt?textarea.value.trim():true;if(options.prompt&&!value){textarea.setAttribute('aria-invalid','true');textarea.focus();return}close(value)}; (options.prompt?textarea:confirm).focus(); });
    window.WorkflowDialog = { confirm: options => open(options).then(Boolean), prompt: options => open({...options,prompt:true}) };
  }

  function parseHash() {
    const hash = location.hash;
    const modern = hash.match(/^#workflow-center\/(?:stage-(\d)(?:\/order\/([^/]+))?|overview)$/);
    if (modern) return { stage: Number(modern[1] || 0), orderId: modern[2] ? decodeURIComponent(modern[2]) : '' };
    const legacy = { '#workflow-center':1,'#incoming-quotes':2,'#outgoing-quotes':3,'#customer-approvals':4,'#scheduling':5 };
    return legacy[hash] ? { stage:legacy[hash],orderId:'' } : null;
  }

  async function boot() {
    createDialog();
    await window.AuthReady?.catch(() => null);
    for (let index=0; index<80 && !window.dashboard; index++) await new Promise(resolve => setTimeout(resolve,50));
    if (!window.dashboard || !document.getElementById('workflowOverviewMount')) return;
    await loadOverview(); injectStageChrome(); wrapWorkspaceOpeners();
    const nav = document.getElementById('workflowCenterNav'); nav?.addEventListener('click', event => { event.preventDefault(); showView(0); });
    const observer = new MutationObserver(records => { const list = records[0]?.target?.closest?.('[id]'); const stage = Number(Object.entries(listIds).find(([,id])=>id===list?.id)?.[0]); if(stage) applyFilters(stage); if(state.currentOrderId&&state.activeStage){const workspace=document.getElementById(STAGES.find(item=>item.stage===state.activeStage)?.workspace);if(workspace&&!workspace.hidden)setupStageEnhancements(state.activeStage,workspace)} });
    Object.values(listIds).forEach(id => { const list=document.getElementById(id); if(list)observer.observe(list,{childList:true,subtree:true}); });
    window.addEventListener('hashchange', () => { const route=parseHash(); if(route)showView(route.stage,route.orderId,{fromHash:true}); });
    window.addEventListener('beforeunload', event => { if(state.dirty){event.preventDefault();event.returnValue='';} });
    const route = parseHash(); if (route) await showView(route.stage,route.orderId,{fromHash:true});
  }
  window.startWorkflowQuoteCollection = async orderId => {
    if (!orderId) return;
    try {
      await window.APIService.startIncomingQuotes(orderId);
      window.showToast?.('Stage 2 quote collection started.');
      state.overview = null;
      await showView(2, orderId);
    } catch (error) { window.showToast?.(error.message || 'Unable to start quote collection', 'error'); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
