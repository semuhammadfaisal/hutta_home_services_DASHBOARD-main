(function agentDirectoryAdmin() {
  'use strict';

  const state = { agents: [], summary: {}, query: '', status: 'all', loading: false, error: '', selectedId: null };
  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const titleCase = value => String(value || 'Unknown').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const initials = name => String(name || 'Agent').split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const displayDate = value => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Not set' : parsed.toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: 'numeric' }); };
  const inputDate = value => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10); };
  const address = property => [property?.addressLine1, property?.addressLine2, property?.city, property?.state, property?.postalCode].filter(Boolean).join(', ') || 'Property address unavailable';
  const empty = (title, detail) => `<div class="agent-directory-empty"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail || '')}</p></div>`;

  function filteredAgents() {
    const query = state.query.trim().toLowerCase();
    return state.agents.filter(agent => {
      if (state.status === 'active' && !(agent.isActive && agent.status === 'active')) return false;
      if (state.status === 'incomplete' && agent.profileCompletion?.complete) return false;
      if (state.status === 'inactive' && agent.isActive && agent.status === 'active') return false;
      if (!query) return true;
      return [agent.displayName, agent.email, agent.phone, agent.brokerageName, agent.licenseNumber, agent.referralCode].some(value => String(value || '').toLowerCase().includes(query));
    });
  }

  function renderSummary() {
    byId('agentsTotal').textContent = Number(state.summary.total || 0).toLocaleString();
    byId('agentsActive').textContent = Number(state.summary.active || 0).toLocaleString();
    byId('agentsIncomplete').textContent = Number(state.summary.incomplete || 0).toLocaleString();
    byId('agentsTransactions').textContent = Number(state.summary.activeTransactions || 0).toLocaleString();
  }

  function renderDirectory() {
    renderSummary();
    const agents = filteredAgents(); const list = byId('agentsList');
    byId('agentsStatusText').textContent = state.loading ? 'Loading agents…' : state.error || `${agents.length} of ${state.agents.length} agent${state.agents.length === 1 ? '' : 's'} shown`;
    if (state.loading && !state.agents.length) { list.innerHTML = empty('Loading agents…', 'Retrieving agent accounts and portfolio totals.'); return; }
    if (!agents.length) { list.innerHTML = empty(state.query || state.status !== 'all' ? 'No matching agents' : 'No agent accounts yet', state.query || state.status !== 'all' ? 'Change the search or status filter.' : 'Approved real estate agents will appear here.'); return; }
    list.innerHTML = agents.map(agent => `<button class="agent-directory-card" type="button" data-agent-id="${escapeHtml(agent.userId)}">
      <span class="agent-directory-identity"><span class="agent-directory-avatar" aria-hidden="true">${escapeHtml(initials(agent.displayName))}</span><span><h2>${escapeHtml(agent.displayName || 'Real estate agent')}</h2><p>${escapeHtml(agent.brokerageName || 'Brokerage not provided')}</p><p>${escapeHtml(agent.email || '')}</p></span></span>
      <span class="agent-directory-counts"><span><strong>${Number(agent.counts?.activeTransactions || 0)}</strong>Active deals</span><span><strong>${Number(agent.counts?.submittedRequests || 0)}</strong>Requests</span><span><strong>${Number(agent.counts?.pendingInvitations || 0)}</strong>Pending invites</span><span><strong>${Number(agent.counts?.completedJobs || 0)}</strong>Completed jobs</span></span>
      <span class="agent-directory-badges"><span class="agent-directory-pill ${agent.isActive && agent.status === 'active' ? '' : 'inactive'}">${escapeHtml(agent.isActive ? titleCase(agent.status) : 'Inactive')}</span><span class="agent-directory-pill ${agent.profileCompletion?.complete ? '' : 'incomplete'}">${agent.profileCompletion?.complete ? 'Profile complete' : 'Profile incomplete'}</span><strong>Open profile →</strong></span>
    </button>`).join('');
  }

  async function loadAgentDirectoryAdmin() {
    if (state.loading) return;
    state.loading = true; state.error = ''; renderDirectory();
    try {
      const payload = await window.APIService.getAgentAdminAgents();
      state.agents = Array.isArray(payload?.data) ? payload.data : []; state.summary = payload?.summary || {};
      byId('agentsUpdated').textContent = `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date())}`;
    } catch (error) { state.error = state.agents.length ? 'Refresh failed. Showing the last successful result.' : 'Agent accounts could not be loaded.'; window.showToast?.(error.message || state.error, 'error'); }
    finally { state.loading = false; renderDirectory(); }
  }

  function detailRow(title, lines, meta, action = '') {
    return `<article class="agent-detail-row"><div><h3>${escapeHtml(title)}</h3>${lines.filter(Boolean).map(line => `<p>${escapeHtml(line)}</p>`).join('')}</div><div class="agent-detail-row-meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join('')}${action}</div></article>`;
  }

  function renderAgentDetail(payload) {
    const agent = payload.agent || {}; const transactions = payload.transactions || []; const invitations = payload.invitations || []; const orders = payload.orders || []; const referrals = payload.referrals || [];
    const missingLabels = { firstName: 'First name', lastName: 'Last name', phone: 'Phone', brokerageName: 'Brokerage', licenseNumber: 'License number' };
    byId('agentDetailContent').innerHTML = `<header class="agent-detail-hero"><div class="agent-detail-hero-main"><span class="agent-directory-avatar" aria-hidden="true">${escapeHtml(initials(agent.displayName))}</span><div><p class="page-eyebrow">Agent CRM profile</p><h1 id="agentDetailTitle">${escapeHtml(agent.displayName || 'Real estate agent')}</h1><p>${escapeHtml(agent.brokerageName || 'Brokerage not provided')} · ${escapeHtml(agent.licenseNumber || 'License not provided')}</p></div></div><div class="agent-detail-contact"><strong>${escapeHtml(agent.email || 'Email unavailable')}</strong><span>${escapeHtml(agent.phone || 'Phone not provided')}</span><span class="agent-directory-pill ${agent.profileCompletion?.complete ? '' : 'incomplete'}">${agent.profileCompletion?.complete ? 'Profile complete' : 'Profile incomplete'}</span></div></header>
      <div class="agent-detail-metrics"><article><span>Active transactions</span><strong>${Number(agent.counts?.activeTransactions || 0)}</strong></article><article><span>Portfolio history</span><strong>${Number(agent.counts?.totalTransactions || 0)}</strong></article><article><span>Service requests</span><strong>${Number(agent.counts?.submittedRequests || 0)}</strong></article><article><span>Completed jobs</span><strong>${Number(agent.counts?.completedJobs || 0)}</strong></article></div>
      <div class="agent-detail-grid">
        <section class="agent-detail-panel"><h2>Account and professional profile</h2><p>Agent identity and portal setup information.</p><div class="agent-detail-facts"><div class="agent-detail-fact"><span>Account status</span><strong>${escapeHtml(agent.isActive ? titleCase(agent.status) : 'Inactive')}</strong></div><div class="agent-detail-fact"><span>Referral code</span><strong>${escapeHtml(agent.referralCode || 'Not assigned')}</strong></div><div class="agent-detail-fact"><span>Email</span><strong>${escapeHtml(agent.email || 'Not provided')}</strong></div><div class="agent-detail-fact"><span>Phone</span><strong>${escapeHtml(agent.phone || 'Not provided')}</strong></div><div class="agent-detail-fact"><span>Brokerage</span><strong>${escapeHtml(agent.brokerageName || 'Not provided')}</strong></div><div class="agent-detail-fact"><span>License number</span><strong>${escapeHtml(agent.licenseNumber || 'Not provided')}</strong></div></div>${agent.profileCompletion?.complete ? '' : `<p><strong>Missing:</strong> ${escapeHtml((agent.profileCompletion?.missingFields || []).map(field => missingLabels[field] || field).join(', '))}</p>`}</section>
        <section class="agent-detail-panel"><h2>Invitation activity</h2><p>Homeowners invited into this agent's portfolio.</p><div class="agent-detail-list">${invitations.length ? invitations.map(item => detailRow(item.homeownerName || item.homeownerEmail || 'Homeowner invitation', [item.homeownerEmail, item.transactionLabel], [titleCase(item.status), `Closes ${displayDate(item.closeDate)}`])).join('') : empty('No invitations', 'This agent has not invited a homeowner yet.')}</div></section>
        <section class="agent-detail-panel is-wide"><h2>Portfolio and transactions</h2><p>Every homeowner and property linked to the agent, including expired or revoked history.</p><div class="agent-detail-list">${transactions.length ? transactions.map(item => detailRow(item.label, [item.customer?.name || 'Homeowner unavailable', address(item.property)], [titleCase(item.status), `Close ${displayDate(item.closeDate)}`, `Access ends ${displayDate(item.accessEndsAt)}`, `Maximum ${displayDate(item.maximumAccessEndsAt)}`], item.status === 'active' && item.acceptedAt ? `<form class="agent-extension-form" data-agent-extension="${escapeHtml(item.id)}"><label>New access end<input name="accessEndsAt" type="date" min="${escapeHtml(inputDate(item.accessEndsAt))}" max="${escapeHtml(inputDate(item.maximumAccessEndsAt))}" required></label><label>Reason<input name="reason" minlength="10" maxlength="1000" required placeholder="Reason for extension"></label><button class="btn-secondary" type="submit">Extend</button></form>` : '')).join('') : empty('No portfolio records', 'Accepted transactions and authorized properties will appear here.')}</div></section>
        <section class="agent-detail-panel is-wide"><h2>Service requests and work</h2><p>Requests submitted by the agent and their current operational status.</p><div class="agent-detail-list">${orders.length ? orders.map(item => detailRow(item.service || 'Service request', [item.requestReference || item.orderId || 'Order', item.targetCompletionDeadline ? `Target ${displayDate(item.targetCompletionDeadline)}` : 'No target date'], [titleCase(item.workflowStatus || item.status), displayDate(item.createdAt)], `<button class="btn-secondary" type="button" data-agent-order-id="${escapeHtml(item.id)}">Open order</button>`)).join('') : empty('No service activity', 'Agent-submitted work will appear here.')}</div></section>
        <section class="agent-detail-panel is-wide"><h2>Referral attribution</h2><p>Counts and attribution history only—no commission or payout information.</p><div class="agent-detail-list">${referrals.length ? referrals.map(item => detailRow(`Transaction ${item.transactionId}`, [`${Number(item.convertedJobCount || 0)} converted job(s)`, `${Number(item.completedJobCount || 0)} completed job(s)`], [titleCase(item.status), displayDate(item.attributedAt)])).join('') : empty('No referral history', 'Accepted homeowner referrals will appear here.')}</div></section>
      </div>`;
  }

  async function openAgent(agentUserId) {
    state.selectedId = agentUserId; window.dashboard?.showSection?.('agent-detail'); history.replaceState(null, '', `#agents/${encodeURIComponent(agentUserId)}`);
    byId('agentDetailContent').innerHTML = empty('Loading agent profile…', 'Retrieving portfolio and activity.');
    try { renderAgentDetail(await window.APIService.getAgentAdminAgent(agentUserId)); }
    catch (error) { byId('agentDetailContent').innerHTML = empty('Agent profile could not be loaded', error.message || 'Use Back to Agents and try again.'); }
  }

  async function extendTransaction(form) {
    const button = form.querySelector('button'); button.disabled = true;
    try { await window.APIService.extendAgentAdminTransaction(form.dataset.agentExtension, { accessEndsAt: form.elements.accessEndsAt.value, reason: form.elements.reason.value }); window.showToast?.('Agent access extension saved.', 'success'); await openAgent(state.selectedId); }
    catch (error) { window.showToast?.(error.message || 'Could not extend transaction access.', 'error'); }
    finally { if (button.isConnected) button.disabled = false; }
  }

  function backToAgents() { state.selectedId = null; window.dashboard?.showSection?.('agents'); history.replaceState(null, '', '#agents'); loadAgentDirectoryAdmin(); }

  function bind() {
    byId('agentsRefresh')?.addEventListener('click', loadAgentDirectoryAdmin);
    byId('agentsSearch')?.addEventListener('input', event => { state.query = event.target.value; renderDirectory(); });
    byId('agentsStatus')?.addEventListener('change', event => { state.status = event.target.value; renderDirectory(); });
    byId('agentsList')?.addEventListener('click', event => { const card = event.target.closest('[data-agent-id]'); if (card) openAgent(card.dataset.agentId); });
    byId('agentDetailBack')?.addEventListener('click', backToAgents);
    byId('agentDetailContent')?.addEventListener('click', event => { const button = event.target.closest('[data-agent-order-id]'); if (button) window.viewOrder?.(button.dataset.agentOrderId, true); });
    byId('agentDetailContent')?.addEventListener('submit', event => { const form = event.target.closest('[data-agent-extension]'); if (!form) return; event.preventDefault(); extendTransaction(form); });
    const match = location.hash.match(/^#agents\/([a-f\d]{24})$/i);
    if (match) Promise.resolve(window.AuthReady).then(() => window.setTimeout(() => openAgent(match[1]), 0)).catch(() => {});
    else if (location.hash === '#agents') Promise.resolve(window.AuthReady).then(() => window.setTimeout(() => { window.dashboard?.showSection?.('agents'); document.querySelector('[data-section="agents"]')?.parentElement?.classList.add('active'); loadAgentDirectoryAdmin(); }, 0)).catch(() => {});
  }

  window.loadAgentDirectoryAdmin = loadAgentDirectoryAdmin;
  window.openAgentAdminProfile = openAgent;
  document.addEventListener('DOMContentLoaded', bind);
})();
