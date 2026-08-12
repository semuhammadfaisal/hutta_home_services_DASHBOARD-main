(() => {
  const STAGES = [
    { stage: 1, section: 'workflow-center', short: 'Request', title: 'Request Received', load: 'loadWorkflowCenter', open: 'openWorkflowOrder', workspace: 'order-detail' },
    { stage: 2, section: 'incoming-quotes', short: 'Vendor Quotes', title: 'Incoming Quotes', load: 'loadIncomingQuotes', open: 'openIncomingQuoteWorkspace', close: 'closeIncomingQuoteWorkspace', workspace: 'incomingQuoteWorkspace' },
    { stage: 3, section: 'outgoing-quotes', short: 'Customer Quote', title: 'Outgoing Quotes', load: 'loadOutgoingQuotes', open: 'openOutgoingQuoteWorkspace', close: 'closeOutgoingQuoteWorkspace', workspace: 'outgoingQuoteWorkspace' },
    { stage: 4, section: 'customer-approvals', short: 'Approval', title: 'Customer Approvals', load: 'loadCustomerApprovals', open: 'openCustomerApproval', close: 'closeCustomerApprovalWorkspace', workspace: 'customerApprovalWorkspace' },
    { stage: 5, section: 'scheduling', short: 'Schedule', title: 'Scheduling', load: 'loadScheduling', open: 'openSchedulingWorkspace', close: 'closeSchedulingWorkspace', workspace: 'schedulingWorkspace' },
    { stage: 6, section: 'closeout', short: 'Closeout', title: 'Completion & Closeout', load: 'loadCloseout', open: 'openCloseoutWorkspace', close: 'closeCloseoutWorkspace', workspace: 'closeoutWorkspace' }
  ];
  const listIds = { 1: 'workflowRequestList', 2: 'incomingQuoteOrderList', 3: 'outgoingQuoteOrderList', 4: 'customerApprovalList', 5: 'schedulingOrderList', 6: 'closeoutOrderList' };
  const STORAGE_KEY = 'smplfix.workflow-center.ui.v2';
  const LEGACY_STORAGE_KEY = 'huttas.workflow-center.ui.v2';
  const restored = (() => {
    try {
      const current = sessionStorage.getItem(STORAGE_KEY);
      const legacy = current ? null : sessionStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        sessionStorage.setItem(STORAGE_KEY, legacy);
        sessionStorage.removeItem(LEGACY_STORAGE_KEY);
      }
      return JSON.parse(current || legacy || '{}');
    }
    catch (_) { return {}; }
  })();
  const state = {
    overview: null,
    activeStage: 0,
    currentOrderId: '',
    filters: restored.filters || {},
    scroll: restored.scroll || {},
    overviewAttention: restored.overviewAttention || 'all',
    loadingOverview: false,
    dirty: false,
    routing: false
  };
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const fmtDate = value => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const relativeTime = value => {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return 'just now';
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 45) return 'just now';
    if (seconds < 3600) { const count = Math.floor(seconds / 60); return `${count} minute${count === 1 ? '' : 's'} ago`; }
    if (seconds < 86400) { const count = Math.floor(seconds / 3600); return `${count} hour${count === 1 ? '' : 's'} ago`; }
    if (seconds < 604800) { const count = Math.floor(seconds / 86400); return `${count} day${count === 1 ? '' : 's'} ago`; }
    return fmtDate(value);
  };
  const statusText = value => String(value || '').replaceAll('_', ' ');
  const persist = () => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filters: state.filters, scroll: state.scroll, overviewAttention: state.overviewAttention })); }
    catch (_) {}
  };

  function countsFor(stage) { return state.overview?.counts?.find(item => item.stage === stage) || { total: 0, attention: 0 }; }
  function tabs(active = 0) {
    const icons = ['fa-border-all', 'fa-file-alt', 'fa-users', 'fa-file-invoice-dollar', 'fa-user-check', 'fa-calendar-alt', 'fa-check-circle'];
    const allTotal = STAGES.reduce((total, item) => total + countsFor(item.stage).total, 0);
    return `<nav class="workflow-tabs workflow-reference-tabs" aria-label="Workflow stages" role="tablist">
      <button class="workflow-tab" data-workflow-view="overview" role="tab" aria-selected="${active === 0}"><i class="fas ${icons[0]}" aria-hidden="true"></i><span><strong>All Work</strong></span><em class="workflow-tab-count">${allTotal}</em></button>
      ${STAGES.map((item, index) => { const count = countsFor(item.stage); return `<button class="workflow-tab" data-workflow-view="stage-${item.stage}" role="tab" aria-selected="${active === item.stage}"><i class="fas ${icons[index + 1]}" aria-hidden="true"></i><span><strong>${esc(item.short)}</strong>${count.attention ? `<small>${count.attention} attention</small>` : ''}</span><em class="workflow-tab-count">${count.total}</em></button>`; }).join('')}
    </nav>`;
  }
  function filterbar(stage) {
    const saved = state.filters[stage] || {};
    return `<div class="workflow-filterbar" data-stage-filter="${stage}" role="search" aria-label="Filter workflow records">
      <label class="workflow-search"><i class="fas fa-search" aria-hidden="true"></i><span class="sr-only">Search this stage</span><input data-filter="search" type="search" value="${esc(saved.search || '')}" placeholder="Search reference, customer, vendor, email, phone, service…"></label>
      <label class="workflow-filter-field"><span class="workflow-filter-label">Attention</span><select data-filter="attention"><option value="all">All work</option><option value="attention" ${saved.attention === 'attention' ? 'selected' : ''}>Needs attention</option><option value="clear" ${saved.attention === 'clear' ? 'selected' : ''}>No warnings</option></select></label>
      <label class="workflow-filter-field"><span class="workflow-filter-label">Issue</span><select data-filter="issue"><option value="all">All issues</option><option value="email" ${saved.issue === 'email' ? 'selected' : ''}>Email problems</option><option value="compliance" ${saved.issue === 'compliance' ? 'selected' : ''}>Compliance</option><option value="missing" ${saved.issue === 'missing' ? 'selected' : ''}>Missing information</option><option value="changes" ${saved.issue === 'changes' ? 'selected' : ''}>Changes requested</option></select></label>
      <label class="workflow-filter-field"><span class="workflow-filter-label">State</span><select data-filter="status"><option value="all">All states</option><option value="active" ${saved.status === 'active' ? 'selected' : ''}>Active</option><option value="waiting" ${saved.status === 'waiting' ? 'selected' : ''}>Waiting</option><option value="failed" ${saved.status === 'failed' ? 'selected' : ''}>Blocked / failed</option><option value="completed" ${saved.status === 'completed' ? 'selected' : ''}>Completed</option><option value="historical" ${saved.status === 'historical' ? 'selected' : ''}>Historical</option></select></label>
      <label class="workflow-filter-field"><span class="workflow-filter-label">Updated since</span><input data-filter="date" type="date" value="${esc(saved.date || '')}"></label>
      <button class="workflow-filter-clear" type="button" data-filter-clear aria-label="Clear stage filters"><i class="fas fa-times" aria-hidden="true"></i><span>Clear</span></button>
    </div>`;
  }
  function sharedChrome(stage) {
    return `<div class="workflow-shared-chrome">${tabs(stage)}${filterbar(stage)}</div>`;
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
      if (state.activeStage && !state.currentOrderId) {
        state.scroll[state.activeStage] = window.scrollY;
        persist();
      }
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

  function overviewHeader() {
    return `<header class="workflow-hub-header workflow-reference-header smpl-section-header"><div class="smpl-section-header-copy"><p class="page-eyebrow">Command</p><h1>Workflow center</h1><p class="smpl-section-description">Requests, quotes, approvals, scheduling, and closeout.</p></div><div class="workflow-hub-actions smpl-section-header-actions"><span class="workflow-updated">Updated <time data-relative-time="${esc(state.overview?.refreshedAt || '')}">${relativeTime(state.overview?.refreshedAt)}</time></span><button class="btn-refresh" type="button" data-workflow-refresh><i class="fas fa-sync-alt" aria-hidden="true"></i> Refresh</button></div></header>`;
  }

  const metricIcons = {
    open_requests: 'fa-file-alt',
    waiting_vendors: 'fa-users',
    awaiting_approval: 'fa-user-clock',
    scheduled_this_week: 'fa-calendar-alt',
    ready_to_close: 'fa-check-circle'
  };
  const metricClearLabels = {
    open_requests: 'No blockers',
    waiting_vendors: 'No overdue requests',
    awaiting_approval: 'No overdue quotes',
    scheduled_this_week: 'Current Phoenix week',
    ready_to_close: 'No overdue feedback'
  };

  function metricCards() {
    return `<section class="workflow-kpi-grid" aria-label="Workflow performance">${(state.overview?.metrics || []).map(metric => `<button type="button" class="workflow-kpi-card tone-${esc(metric.tone || 'info')}" data-workflow-view="stage-${Number(metric.targetStage || 1)}"><span class="workflow-kpi-icon"><i class="fas ${metricIcons[metric.key] || 'fa-chart-line'}" aria-hidden="true"></i></span><span class="workflow-kpi-copy"><span>${esc(metric.label)}</span><strong>${Number(metric.total || 0).toLocaleString()}</strong>${metric.supportingCount ? `<small><i class="fas fa-exclamation-circle" aria-hidden="true"></i>${Number(metric.supportingCount).toLocaleString()} ${esc(metric.supportingLabel)}</small>` : `<small class="is-clear"><i class="fas fa-check-circle" aria-hidden="true"></i>${esc(metricClearLabels[metric.key] || 'Up to date')}</small>`}</span></button>`).join('')}</section>`;
  }

  function employeeMarkup(item) {
    if (!item.employee) return '<span class="workflow-assignee is-unassigned"><span class="workflow-avatar">?</span><span>Unassigned</span></span>';
    const initials = String(item.employee.name || 'Team').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    return `<span class="workflow-assignee">${item.employee.avatar ? `<img class="workflow-avatar" src="${esc(item.employee.avatar)}" alt="">` : `<span class="workflow-avatar">${esc(initials)}</span>`}<span>${esc(item.employee.name)}</span></span>`;
  }

  function renderOverview() {
    const mount = document.getElementById('workflowOverviewMount');
    if (!mount || !state.overview) return;
    const attention = state.overview.attention || [];
    const recent = state.overview.recentActivity || [];
    const filterLabels = { all: 'All', overdue: 'Overdue', blocked: 'Blocked', unassigned: 'Unassigned' };
    mount.innerHTML = `<div class="workflow-hub-shell workflow-reference-shell">${overviewHeader()}${metricCards()}${tabs(0)}
      <div class="workflow-overview-grid">
        <section class="workflow-overview-panel workflow-attention-panel"><div class="workflow-panel-head"><div><h2><span class="workflow-panel-icon danger"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i></span>Needs Attention</h2><p>Blocked, overdue, or waiting items that require action.</p></div><span class="workflow-attention-pill ${Number(state.overview.attentionCounts?.all || 0) ? '' : 'is-zero'}">${Number(state.overview.attentionCounts?.all || 0) ? `${Number(state.overview.attentionCounts.all)} items` : 'All clear'}</span></div>
          <div class="workflow-attention-filters" role="tablist" aria-label="Attention category">${Object.entries(filterLabels).map(([key, label]) => `<button type="button" role="tab" data-attention-filter="${key}" aria-selected="${state.overviewAttention === key}">${label}<span>${Number(state.overview.attentionCounts?.[key] || 0)}</span></button>`).join('')}</div>
          <div class="workflow-attention-list">${attention.length ? attention.map(item => `<article class="workflow-queue-row workflow-reference-row"><div class="workflow-row-reference"><strong>${esc(item.requestReference || item.orderId)}</strong><time datetime="${esc(item.createdAt || item.updatedAt)}" data-relative-time="${esc(item.createdAt || item.updatedAt)}">${relativeTime(item.createdAt || item.updatedAt)}</time></div><div class="workflow-row-identity"><h3>${esc(item.customer?.name || 'Customer')}</h3><p>${esc(item.service || 'Service request')}</p></div><span class="workflow-stage-badge stage-${item.stage}">${esc(STAGES[item.stage - 1]?.short || `Stage ${item.stage}`)}</span><p class="workflow-primary-reason">${esc(item.primaryReason || item.reasons?.[0] || 'Review workflow item')}</p>${employeeMarkup(item)}<button class="btn-secondary workflow-row-action" data-workflow-open="${esc(item._id)}" data-stage="${item.stage}">${esc(item.nextAction?.label || 'Review')} <i class="fas fa-arrow-right" aria-hidden="true"></i></button></article>`).join('') : '<div class="workflow-empty workflow-empty-illustrated workflow-attention-empty"><span class="workflow-empty-art success" aria-hidden="true"><i class="fas fa-check"></i></span><strong>No matching items need attention</strong><p>Everything in this view is on track.</p></div>'}</div>
        </section>
        <aside class="workflow-overview-panel workflow-activity-panel"><div class="workflow-panel-head"><div><h2><span class="workflow-panel-icon info"><i class="fas fa-wave-square" aria-hidden="true"></i></span>Recent Activity</h2><p>Latest updates across all stages.</p></div></div><div class="workflow-recent-list workflow-activity-list">${recent.length ? recent.map(item => `<button class="workflow-recent-item tone-${esc(item.tone || 'info')}" data-workflow-open="${esc(item.orderId)}" data-stage="${item.stage}" type="button"><span class="workflow-recent-content"><strong>${esc(item.label)}</strong><span class="workflow-activity-reference">${esc(item.requestReference || '')}</span><time datetime="${esc(item.occurredAt)}" data-relative-time="${esc(item.occurredAt)}">${relativeTime(item.occurredAt)}</time></span><span class="workflow-stage-badge stage-${item.stage}">${esc(STAGES[item.stage - 1]?.short || '')}</span></button>`).join('') : '<div class="workflow-empty workflow-empty-illustrated compact"><span class="workflow-empty-art"><i class="fas fa-calendar-check"></i></span><strong>No workflow activity yet.</strong><p>New activity will appear here.</p></div>'}</div></aside>
      </div></div>`;
    bindNavigation(mount);
    updateRelativeTimes(mount);
  }

  async function loadOverview() {
    if (state.loadingOverview) return;
    const mount = document.getElementById('workflowOverviewMount');
    if (mount && !state.overview) mount.innerHTML = `<div class="workflow-reference-loading" aria-label="Loading Workflow Center"><div class="workflow-skeleton workflow-skeleton-header"></div><div class="workflow-kpi-grid">${Array.from({ length: 5 }, () => '<div class="workflow-skeleton workflow-skeleton-kpi"></div>').join('')}</div><div class="workflow-skeleton workflow-skeleton-tabs"></div><div class="workflow-overview-grid"><div class="workflow-skeleton workflow-skeleton-panel"></div><div class="workflow-skeleton workflow-skeleton-panel"></div></div></div>`;
    state.loadingOverview = true;
    try {
      state.overview = await window.APIService.getWorkflowOverview({ attention: state.overviewAttention, attentionLimit: 5, activityLimit: 8 });
      const badge = document.getElementById('workflowHubNavBadge');
      if (badge) { badge.textContent = state.overview.actionRequiredTotal || 0; badge.hidden = !state.overview.actionRequiredTotal; }
      renderOverview();
      injectStageChrome();
    } catch (error) {
      if (mount) mount.innerHTML = `<div class="workflow-empty"><i class="fas fa-exclamation-circle"></i><p>${esc(error.message || 'Unable to load Workflow Center')}</p><button class="btn-primary" data-workflow-refresh>Retry</button></div>`;
      bindNavigation(mount);
    } finally { state.loadingOverview = false; }
  }

  function updateRelativeTimes(root = document) {
    root.querySelectorAll('[data-relative-time]').forEach(node => { node.textContent = relativeTime(node.dataset.relativeTime); });
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
    root.querySelectorAll('[data-attention-filter]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        state.overviewAttention = button.dataset.attentionFilter;
        state.overview = null;
        persist();
        loadOverview();
      });
    });
    root.querySelectorAll('[data-workflow-refresh]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = 'true';
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.classList.add('is-loading');
        state.overview = null;
        await loadOverview();
      });
    });
  }

  function injectStageChrome() {
    STAGES.forEach(config => {
      const section = document.getElementById(config.section);
      if (!section) return;
      let chrome = section.querySelector(':scope > .workflow-shared-chrome');
      if (!chrome) { chrome = document.createElement('div'); chrome.innerHTML = sharedChrome(config.stage); section.prepend(chrome.firstElementChild); }
      else chrome.outerHTML = sharedChrome(config.stage);
      const header = section.querySelector(':scope > .workflow-header');
      const refresh = header?.querySelector('.workflow-stage-header-actions button,:scope > button');
      if (header && refresh) {
        let actions = header.querySelector('.workflow-stage-header-actions');
        if (!actions) {
          actions = document.createElement('div');
          actions.className = 'workflow-stage-header-actions';
          refresh.before(actions);
          actions.append(refresh);
        }
        const count = countsFor(config.stage);
        actions.querySelector('.workflow-stage-attention')?.remove();
        if (count.attention) {
          actions.insertAdjacentHTML('afterbegin', `<span class="workflow-stage-attention"><i class="fas fa-exclamation-circle" aria-hidden="true"></i>${count.attention} need attention</span>`);
        }
        actions.querySelector('.workflow-stage-refreshed')?.remove();
        actions.insertAdjacentHTML('afterbegin', `<span class="workflow-stage-refreshed">Updated ${fmtDate(state.overview?.refreshedAt)}</span>`);
      }
      bindNavigation(section);
      bindFilters(section, config.stage);
    });
  }

  function bindFilters(section, stage) {
    const bar = section.querySelector(`[data-stage-filter="${stage}"]`);
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = 'true';
    const controls = bar.querySelectorAll('[data-filter]');
    controls.forEach(control => control.addEventListener(control.type === 'search' ? 'input' : 'change', () => {
      state.filters[stage] = [...controls].reduce((result, item) => ({ ...result, [item.dataset.filter]: item.value }), {});
      persist();
      applyFilters(stage);
    }));
    bar.querySelector('[data-filter-clear]')?.addEventListener('click', () => {
      controls.forEach(control => { control.value = control.dataset.filter === 'date' || control.dataset.filter === 'search' ? '' : 'all'; });
      state.filters[stage] = {};
      persist();
      applyFilters(stage);
    });
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
      const statusTerms = {
        active: /active|draft|ready|collecting|current|received/i,
        waiting: /awaiting|pending|sent|waiting/i,
        failed: /blocked|failed|expired|issue reported|changes requested/i,
        completed: /completed|approved|confirmed|satisfied|selected/i,
        historical: /superseded|voided|revoked|not selected|withdrawn/i
      };
      const matchesStatus = !filter.status || filter.status === 'all' || statusTerms[filter.status]?.test(text);
      const time = card.querySelector('time')?.dateTime || card.querySelector('time')?.textContent;
      const matchesDate = !filter.date || !time || new Date(time) >= new Date(`${filter.date}T00:00:00`);
      card.hidden = !(matchesSearch && matchesAttention && matchesIssue && matchesStatus && matchesDate);
    });
  }

  function journeyMarkup(data) {
    const meta = [data.order.service, data.order.customer?.address || 'Service address not provided', data.order.vendor?.name].filter(Boolean);
    return `<section class="workflow-workspace-overview">
      <div class="workflow-order-context"><div><span class="workflow-hub-eyebrow">${esc(data.order.requestReference || data.order.orderId)}</span><h2>${esc(data.order.customer?.name || 'Customer')}</h2><p>${meta.map(value => `<span>${esc(value)}</span>`).join('')}</p></div><span class="workflow-chip info">${esc(statusText(data.order.workflowStatus))}</span></div>
      <div class="workflow-journey" aria-label="Order workflow progress">${data.stages.map((item, index) => `<div class="workflow-journey-step ${esc(item.state)}" data-step="${item.stage}"><strong>${esc(STAGES[index].short)}</strong><span>${item.reference ? esc(item.reference) : item.state === 'upcoming' ? 'Not started' : statusText(item.state)}</span></div>`).join('')}</div>
    </section>`;
  }

  function workspaceToolbar(config, loading = false) {
    return `<div class="workflow-workspace-back"><button class="workflow-back-button" type="button"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>Back to ${esc(config.title)}</span></button><span class="workflow-back-context">Stage ${config.stage}<i aria-hidden="true">&middot;</i>${esc(config.short)}${loading ? '<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>' : ''}</span></div>`;
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
    top.innerHTML = `${workspaceToolbar(config, true)}<div class="workflow-skeleton"></div>`;
    top.querySelector('button').addEventListener('click', () => leaveWorkspace(stage));
    try { top.innerHTML = `${workspaceToolbar(config)}${journeyMarkup(await window.APIService.getWorkflowJourney(orderId))}`; top.querySelector('button').addEventListener('click', () => leaveWorkspace(stage)); }
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
    const inviteForm = document.getElementById('incomingInvitationForm');
    const staffForm = document.getElementById('incomingStaffQuoteForm');
    const compare = workspace.querySelector('.incoming-comparison-panel');
    const invites = document.getElementById('incomingInvitationList')?.closest('.incoming-panel');
    const delivery = document.getElementById('incomingEmailDeliveryList')?.closest('.incoming-panel');
    let tabsNode = workspace.querySelector('.incoming-workspace-tabs');
    if (!tabsNode) {
      tabsNode = document.createElement('div'); tabsNode.className = 'incoming-workspace-tabs'; tabsNode.setAttribute('role','tablist');
      tabsNode.innerHTML = [
        ['invitations','fa-paper-plane','Vendor Invitations','Request & follow up'],
        ['entry','fa-keyboard','Staff Quote Entry','Record offline quote'],
        ['comparison','fa-scale-balanced','Quote Comparison','Review & select'],
        ['delivery','fa-clock-rotate-left','Delivery & History','Email activity']
      ].map(([id,icon,label,description],index) => `<button id="incoming-tab-${id}" class="incoming-workspace-tab" role="tab" data-pane="${id}" aria-controls="incoming-pane-${id}" aria-selected="${index === 0}"><i class="fas ${icon}" aria-hidden="true"></i><span><strong>${label}</strong><small>${description}</small></span></button>`).join('');
      actionGrid.before(tabsNode);
    }
    let panesHost = workspace.querySelector('.incoming-workspace-panes');
    if (!panesHost) {
      panesHost = document.createElement('div');
      panesHost.className = 'incoming-workspace-panes';
      tabsNode.after(panesHost);
      ['invitations','entry','comparison','delivery'].forEach(pane => {
        const section = document.createElement('section');
        section.id = `incoming-pane-${pane}`;
        section.className = `incoming-workspace-pane incoming-pane-${pane}`;
        section.dataset.workflowPane = pane;
        section.setAttribute('role', 'tabpanel');
        section.setAttribute('aria-labelledby', `incoming-tab-${pane}`);
        panesHost.append(section);
      });
    }
    const place = (node, pane) => {
      if (!node) return;
      node.removeAttribute('data-workflow-pane');
      const target = panesHost.querySelector(`[data-workflow-pane="${pane}"]`);
      if (target && node.parentElement !== target) target.append(node);
    };
    place(inviteForm, 'invitations');
    place(invites, 'invitations');
    place(staffForm, 'entry');
    place(compare, 'comparison');
    place(delivery, 'delivery');
    actionGrid.hidden = true;
    const selectPane = pane => {
      panesHost.querySelectorAll(':scope > [data-workflow-pane]').forEach(node => { node.hidden = node.dataset.workflowPane !== pane; });
      tabsNode.querySelectorAll('button').forEach(button => {
        const selected = button.dataset.pane === pane;
        button.setAttribute('aria-selected', selected);
        button.tabIndex = selected ? 0 : -1;
      });
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
      ['Customer email','oqCustomerEmail',() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field('oqCustomerEmail'))],
      ['Approved terms','oqTerms',() => !!field('oqTerms')], ['Licensed contractor','oqContractor',() => !!field('oqContractor')],
      ['Contractor license','oqLicenseNumber',() => !!field('oqLicenseNumber')], ['License type','oqLicenseType',() => !!field('oqLicenseType')],
      ['ROC number','oqRoc',() => !!field('oqRoc')], ['COI on file','',() => vendor.coiOnFile === true],
      ['Insurance current','',() => !!vendor.insuranceExpirationDate && new Date(vendor.insuranceExpirationDate) > new Date()],
      ['ROC license current','',() => futureOrMissing(vendor.rocLicenseExpirationDate)],
      ['Future quote expiration','oqValidUntil',() => new Date(field('oqValidUntil')) > new Date()]
    ];
    const side = document.createElement('aside'); side.className = 'outgoing-panel outgoing-readiness'; layout.appendChild(side);
    const refresh = () => {
      const results = checks.map(([label,target,test]) => [label,target,test()]);
      side.innerHTML = `<span class="workflow-hub-eyebrow">Send readiness</span><h3>${results.every(item => item[2]) ? 'Ready to send' : 'Action required'}</h3><ul class="workflow-readiness-list">${results.map(([label,target,ready]) => `<li class="${ready?'ready':'blocked'}"><i class="fas fa-${ready?'check-circle':'exclamation-circle'}"></i><span>${esc(label)}</span>${!ready&&target?`<button type="button" data-readiness-target="${esc(target)}">Fix</button>`:''}</li>`).join('')}</ul><p class="workflow-updated">Compliance checks are revalidated securely when sending.</p>`;
      side.querySelectorAll('[data-readiness-target]').forEach(button => button.onclick = () => {
        const target = document.getElementById(button.dataset.readinessTarget);
        target?.scrollIntoView({ behavior:'smooth', block:'center' });
        target?.focus();
      });
      const send = form.querySelector('button[onclick^="sendOutgoingQuote"]');
      if (send) {
        send.disabled = !results.every(item => item[2]);
        send.title = send.disabled ? 'Complete every readiness item before sending' : '';
      }
    };
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

  function setupCloseout(workspace) {
    const form = document.getElementById('closeoutStaffForm');
    if (!form) return;
    const schedule = document.getElementById('closeoutJobSummary');
    if (schedule) schedule.closest('.closeout-panel')?.classList.add('workflow-context-panel');
    document.getElementById('closeoutInvoicePanel')?.classList.add('workflow-accounting-panel');
    document.getElementById('closeoutSatisfactionPanel')?.classList.add('workflow-timeline-panel');
    const submit = document.getElementById('closeoutCompleteButton');
    submit?.closest('.full')?.classList.add('workflow-sticky-actions');
  }

  function setupWorkspaceShell(stage, workspace) {
    workspace.classList.add('workflow-unified-workspace');
    const heading = workspace.querySelector('.incoming-workspace-head,.outgoing-panel-head,.approval-workspace-head,.scheduling-head,.closeout-workspace-head');
    heading?.classList.add('workflow-local-heading');
    if (stage === 2) workspace.querySelector('.incoming-form-actions')?.classList.add('workflow-sticky-actions');
    if (stage === 3) workspace.querySelector('#outgoingDraftForm > .outgoing-actions')?.classList.add('workflow-sticky-actions');
    if (stage === 4) workspace.querySelector('.approval-actions')?.classList.add('workflow-sticky-actions');
    if (stage === 5) workspace.querySelector('#scheduleProposalForm > .full:last-child')?.classList.add('workflow-sticky-actions');
  }

  function setupStageEnhancements(stage, workspace) {
    setupWorkspaceShell(stage, workspace);
    if (stage === 2) setupIncomingTabs(workspace);
    if (stage === 3) setupOutgoing(workspace);
    if (stage === 4) setupApproval(workspace);
    if (stage === 5) setupScheduling(workspace);
    if (stage === 6) setupCloseout(workspace);
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
    const legacy = { '#workflow-center':1,'#incoming-quotes':2,'#outgoing-quotes':3,'#customer-approvals':4,'#scheduling':5,'#closeout':6 };
    return legacy[hash] ? { stage:legacy[hash],orderId:'' } : null;
  }

  function bindButtonEffects() {
    if (document.documentElement.dataset.workflowButtonEffects === 'true') return;
    document.documentElement.dataset.workflowButtonEffects = 'true';
    const selector = [
      '.workflow-hub-section button',
      '.workflow-stage-section button',
      '.workflow-stage-section a.btn-primary',
      '.workflow-stage-section a.btn-secondary',
      '.workflow-dialog button',
      '.outgoing-settings button'
    ].join(',');
    const decorate = root => {
      if (root?.matches?.(selector)) root.classList.add('workflow-clickable');
      root?.querySelectorAll?.(selector).forEach(control => control.classList.add('workflow-clickable'));
    };
    decorate(document);
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) decorate(node);
      }));
    }).observe(document.body, { childList: true, subtree: true });
    const findControl = target => target?.closest?.(selector);
    const release = control => control?.classList.remove('is-workflow-pressed');
    const press = (control, event) => {
      if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
      control.classList.add('is-workflow-pressed');
      control.querySelector(':scope > .workflow-click-ripple')?.remove();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const bounds = control.getBoundingClientRect();
      const diameter = Math.max(bounds.width, bounds.height) * 1.65;
      const pointerX = Number.isFinite(event?.clientX) && event.clientX > 0 ? event.clientX - bounds.left : bounds.width / 2;
      const pointerY = Number.isFinite(event?.clientY) && event.clientY > 0 ? event.clientY - bounds.top : bounds.height / 2;
      const ripple = document.createElement('span');
      ripple.className = 'workflow-click-ripple';
      ripple.setAttribute('aria-hidden', 'true');
      ripple.style.width = `${diameter}px`;
      ripple.style.height = `${diameter}px`;
      ripple.style.left = `${pointerX - diameter / 2}px`;
      ripple.style.top = `${pointerY - diameter / 2}px`;
      control.append(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    };
    document.addEventListener('pointerdown', event => press(findControl(event.target), event));
    document.addEventListener('pointerup', event => release(findControl(event.target)));
    document.addEventListener('pointercancel', event => release(findControl(event.target)));
    document.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key) || event.repeat) return;
      press(findControl(event.target));
    });
    document.addEventListener('keyup', event => {
      if (['Enter', ' '].includes(event.key)) release(findControl(event.target));
    });
    document.addEventListener('focusout', event => release(findControl(event.target)));
  }

  async function boot() {
    bindButtonEffects();
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
    window.setInterval(() => updateRelativeTimes(document), 60000);
    document.addEventListener('submit', event => {
      const form = event.target.closest('.workflow-stage-section form');
      const submitter = event.submitter;
      if (!form || !submitter || submitter.dataset.submitting === 'true') return;
      submitter.dataset.submitting = 'true';
      submitter.setAttribute('aria-busy', 'true');
      const observer = new MutationObserver(() => {
        if (!submitter.disabled) {
          submitter.dataset.submitting = 'false';
          submitter.removeAttribute('aria-busy');
          observer.disconnect();
        }
      });
      observer.observe(submitter, { attributes: true, attributeFilter: ['disabled'] });
      setTimeout(() => {
        submitter.dataset.submitting = 'false';
        submitter.removeAttribute('aria-busy');
        observer.disconnect();
      }, 15000);
    }, true);
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
