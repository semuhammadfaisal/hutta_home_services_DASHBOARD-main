(function () {
  'use strict';

  const state = { items: [], agents: [], summary: {}, query: '', urgency: 'all', loading: false, error: '', agentsError: '' };
  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const displayDate = value => {
    if (!value) return 'Not set';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not set' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Phoenix' }).format(date);
  };
  const displayDateTime = value => {
    if (!value) return 'Unknown';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix', timeZoneName: 'short' }).format(date);
  };
  const titleCase = value => String(value || 'routine').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

  function setMetric(id, value) {
    const element = byId(id);
    if (element) element.textContent = Number(value || 0).toLocaleString();
  }

  function renderSummary() {
    setMetric('agentRequestsAwaiting', state.summary.awaitingReview);
    setMetric('agentRequestsUrgent', state.summary.urgent);
    setMetric('agentRequestsClosing', state.summary.closingWithinSevenDays);
    setMetric('agentRequestsAttachments', state.summary.attachments);
    const badge = byId('agentRequestsNavBadge');
    const count = Number(state.summary.awaitingReview || 0);
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
  }

  function filteredItems() {
    const query = state.query.trim().toLowerCase();
    return state.items.filter(item => {
      if (state.urgency !== 'all' && item.request?.urgency !== state.urgency) return false;
      if (!query) return true;
      return [item.requestReference, item.service, item.scope, item.customer?.name, item.customer?.address, item.agent?.displayName, item.agent?.brokerageName, item.transaction?.label]
        .some(value => String(value || '').toLowerCase().includes(query));
    });
  }

  function documentList(item) {
    if (!item.documents?.length) return '<p><small>No inspection or supporting documents attached.</small></p>';
    return `<ul class="agent-request-documents">${item.documents.map(document => `<li>${escapeHtml(document.name || 'Supporting document')} <small>(${escapeHtml(titleCase(document.type || 'file'))})</small></li>`).join('')}</ul>`;
  }

  function renderCard(item) {
    const risk = item.deadlineRisk || {};
    const riskLevel = String(risk.level || 'normal').toLowerCase();
    const agentName = item.agent?.displayName || 'Agent profile unavailable';
    const brokerage = item.agent?.brokerageName || 'Brokerage not provided';
    return `<article class="agent-request-card" data-agent-request-id="${escapeHtml(item.id)}">
      <div>
        <div class="agent-request-reference"><span class="agent-request-source">Agent Portal</span><span>${escapeHtml(item.requestReference || 'Pending request')}</span></div>
        <h2>${escapeHtml(item.service || 'Service request')}</h2>
        <p>${escapeHtml(item.scope || 'No scope supplied')}</p>
        <p><strong>${escapeHtml(item.customer?.name || 'Client unavailable')}</strong> · ${escapeHtml(item.customer?.address || item.transaction?.label || 'Property unavailable')}</p>
        <p>Submitted by ${item.agent?.userId ? `<button class="agent-request-profile-link" type="button" data-agent-action="profile" data-agent-id="${escapeHtml(item.agent.userId)}">${escapeHtml(agentName)}</button>` : escapeHtml(agentName)} · ${escapeHtml(brokerage)}</p>
        <span class="agent-request-risk is-${escapeHtml(riskLevel)}">${escapeHtml(titleCase(riskLevel))}: ${escapeHtml(risk.reason || 'No deadline warning')}</span>
        ${documentList(item)}
      </div>
      <div class="agent-request-facts">
        <div class="agent-request-fact"><span>Close date</span><strong>${escapeHtml(displayDate(item.transaction?.closeDate))}</strong></div>
        <div class="agent-request-fact"><span>Requested deadline</span><strong>${escapeHtml(displayDate(item.request?.targetCompletionDeadline))}</strong></div>
        <div class="agent-request-fact"><span>Urgency</span><strong>${escapeHtml(titleCase(item.request?.urgency))}</strong></div>
        <div class="agent-request-fact"><span>Preferred timing</span><strong>${escapeHtml(item.request?.preferredTiming || 'Not provided')}</strong></div>
        <div class="agent-request-fact"><span>Received</span><strong>${escapeHtml(displayDateTime(item.createdAt))}</strong></div>
        <div class="agent-request-fact"><span>Authority</span><strong>Homeowner approves & pays</strong></div>
      </div>
      <div class="agent-request-actions">
        <button class="btn-secondary" type="button" data-agent-action="open" data-order-id="${escapeHtml(item.id)}">Open record</button>
        <button class="btn-primary" type="button" data-agent-action="advance" data-order-id="${escapeHtml(item.id)}">Send to fulfillment</button>
      </div>
    </article>`;
  }

  function render() {
    renderSummary();
    const list = byId('agentRequestsList');
    const status = byId('agentRequestsStatus');
    if (!list) return;
    const items = filteredItems();
    if (status) status.textContent = state.loading
      ? 'Loading agent requests…'
      : state.error || `${items.length} of ${state.items.length} pending request${state.items.length === 1 ? '' : 's'} shown`;
    if (state.loading && !state.items.length) {
      list.innerHTML = '<div class="agent-requests-empty"><h2>Loading requests…</h2><p>Retrieving the separate agent intake queue.</p></div>';
      return;
    }
    if (!items.length) {
      const filtered = Boolean(state.query || state.urgency !== 'all');
      list.innerHTML = `<div class="agent-requests-empty"><h2>${filtered ? 'No matching requests' : 'No pending agent requests'}</h2><p>${filtered ? 'Change the search or urgency filter.' : 'New Agent Portal submissions will appear here for staff review.'}</p></div>`;
      return;
    }
    list.innerHTML = items.map(renderCard).join('');
  }

  function renderRegisteredAgents() {
    const list = byId('agentRequestsAgentsList'); const status = byId('agentRequestsAgentsStatus');
    if (!list || !status) return;
    status.textContent = state.agentsError || `${state.agents.length} registered agent${state.agents.length === 1 ? '' : 's'}`;
    if (!state.agents.length) { list.innerHTML = `<div class="agent-requests-empty"><h2>${state.agentsError ? 'Agents could not be loaded' : 'No registered agents'}</h2><p>${state.agentsError || 'Approved agent accounts will appear here.'}</p></div>`; return; }
    list.innerHTML = state.agents.slice(0, 8).map(agent => `<button class="agent-requests-agent-card" type="button" data-agent-action="profile" data-agent-id="${escapeHtml(agent.userId)}"><span class="agent-requests-agent-avatar" aria-hidden="true">${escapeHtml(String(agent.displayName || 'Agent').split(/\s+/).slice(0,2).map(part => part[0] || '').join('').toUpperCase())}</span><span><strong>${escapeHtml(agent.displayName || 'Real estate agent')}</strong><small>${escapeHtml(agent.brokerageName || 'Brokerage not provided')}</small><small>${escapeHtml(agent.email || '')}</small></span><span class="agent-requests-agent-card-meta"><strong>${Number(agent.counts?.activeTransactions || 0)} active transaction${Number(agent.counts?.activeTransactions || 0) === 1 ? '' : 's'}</strong><span>${agent.profileCompletion?.complete ? 'Profile complete' : 'Profile incomplete'}</span><span>Open profile →</span></span></button>`).join('');
  }

  async function loadAgentRequestsAdmin() {
    if (state.loading) return;
    state.loading = true;
    state.error = ''; state.agentsError = '';
    render();
    try {
      const [requestsResult, agentsResult] = await Promise.allSettled([window.APIService.getAgentAdminRequests(), window.APIService.getAgentAdminAgents()]);
      if (requestsResult.status === 'rejected') throw requestsResult.reason;
      const payload = requestsResult.value;
      state.items = Array.isArray(payload?.data) ? payload.data : []; state.summary = payload?.summary || {};
      if (agentsResult.status === 'fulfilled') state.agents = Array.isArray(agentsResult.value?.data) ? agentsResult.value.data : [];
      else state.agentsError = agentsResult.reason?.message || 'Registered agents could not be loaded.';
      const updated = byId('agentRequestsUpdated');
      if (updated) updated.textContent = `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date())}`;
    } catch (error) {
      window.showToast?.(error.message || 'Agent requests could not be loaded.', 'error');
      state.error = state.items.length ? 'Refresh failed. Showing the last successful result.' : 'Agent requests could not be loaded. Use Refresh to try again.';
    } finally {
      state.loading = false;
      render(); renderRegisteredAgents();
    }
  }

  async function confirmAdvance() {
    const options = {
      title: 'Send this request to fulfillment?',
      message: 'This will remove it from Agent Requests and create its first Pipeline record in Service Requests.',
      impact: 'The homeowner keeps estimate approval and payment authority.',
      confirmLabel: 'Send to Fulfillment'
    };
    if (window.WorkflowDialog?.confirm) return window.WorkflowDialog.confirm(options);
    return window.confirm(`${options.message}\n\n${options.impact}`);
  }

  async function advanceRequest(orderId, button) {
    if (!await confirmAdvance()) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Sending…';
    try {
      await window.APIService.advanceAgentAdminRequest(orderId);
      window.showToast?.('Agent request sent to Service Requests for fulfillment.', 'success');
      await loadAgentRequestsAdmin();
    } catch (error) {
      window.showToast?.(error.message || 'The request could not be sent to fulfillment.', 'error');
      button.disabled = false;
      button.textContent = original;
    }
  }

  function bind() {
    byId('agentRequestsRefresh')?.addEventListener('click', loadAgentRequestsAdmin);
    byId('agentRequestsSearch')?.addEventListener('input', event => { state.query = event.target.value; render(); });
    byId('agentRequestsUrgency')?.addEventListener('change', event => { state.urgency = event.target.value; render(); });
    byId('viewAllAgentsButton')?.addEventListener('click', () => { window.dashboard?.showSection?.('agents'); history.replaceState(null, '', '#agents'); document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active')); document.querySelector('[data-section="agents"]')?.parentElement?.classList.add('active'); window.loadAgentDirectoryAdmin?.(); });
    byId('agentRequestsList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-agent-action]');
      if (!button) return;
      const orderId = button.dataset.orderId;
      if (button.dataset.agentAction === 'open') window.viewOrder?.(orderId, true);
      if (button.dataset.agentAction === 'advance') advanceRequest(orderId, button);
      if (button.dataset.agentAction === 'profile') window.openAgentAdminProfile?.(button.dataset.agentId);
    });
    if (window.location.hash === '#agent-requests') {
      Promise.resolve(window.AuthReady).then(() => window.setTimeout(() => {
        window.dashboard?.showSection?.('agent-requests');
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        document.querySelector('[data-section="agent-requests"]')?.parentElement?.classList.add('active');
        loadAgentRequestsAdmin();
      }, 0)).catch(() => {});
    }
  }

  window.loadAgentRequestsAdmin = loadAgentRequestsAdmin;
  document.addEventListener('DOMContentLoaded', bind);
})();
