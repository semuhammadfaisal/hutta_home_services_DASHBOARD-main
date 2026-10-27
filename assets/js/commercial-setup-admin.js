(function () {
  'use strict';

  const state = { items: [], summary: {}, status: 'pending', query: '', loading: false, workspace: null, requestId: null, saving: false };
  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const titleCase = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const displayDate = value => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' }).format(date) : 'Unknown';
  };

  function updateSummary() {
    ['Pending', 'Completed', 'Rejected'].forEach(key => { const element = byId(`commercialSetup${key}`); if (element) element.textContent = Number(state.summary[key.toLowerCase()] || 0).toLocaleString(); });
    const count = Number(state.summary.pending || 0);
    const badge = byId('commercialSetupNavBadge');
    if (badge) { badge.textContent = String(count); badge.hidden = count === 0; }
  }

  function filteredItems() {
    const query = state.query.trim().toLowerCase();
    if (!query) return state.items;
    return state.items.filter(item => [item.reference, item.user?.name, item.user?.email, item.organization?.name, item.organization?.legalName, item.organization?.code].some(value => String(value || '').toLowerCase().includes(query)));
  }

  function renderList() {
    updateSummary();
    const list = byId('commercialSetupList');
    const status = byId('commercialSetupStatus');
    if (!list) return;
    const items = filteredItems();
    if (status) status.textContent = state.loading ? 'Loading commercial setup requests…' : `${items.length} request${items.length === 1 ? '' : 's'} shown`;
    if (state.loading && !state.items.length) { list.innerHTML = '<div class="commercial-setup-empty"><h2>Loading setup requests…</h2></div>'; return; }
    if (!items.length) { list.innerHTML = `<div class="commercial-setup-empty"><h2>${state.query ? 'No matching setup requests' : 'No commercial setup requests'}</h2><p>${state.query ? 'Try a different search.' : 'New commercial location requests will appear here.'}</p></div>`; return; }
    list.innerHTML = items.map(item => `<article class="commercial-setup-card">
      <div><div class="commercial-setup-reference"><span>${escapeHtml(item.reference)}</span><span class="is-${escapeHtml(item.status)}">${escapeHtml(titleCase(item.status))}</span></div><h2>${escapeHtml(item.organization?.name || 'Organization unavailable')}</h2><p>${escapeHtml(item.user?.name || 'Commercial user')} · ${escapeHtml(item.user?.email || '')}</p><small>Requested ${escapeHtml(displayDate(item.requestedAt))}</small></div>
      <div class="commercial-setup-card-actions"><button type="button" class="${item.status === 'pending' ? 'btn-primary' : 'btn-secondary'}" data-commercial-setup-open="${escapeHtml(item.id)}">${item.status === 'pending' ? 'Review & configure' : 'View setup'}</button></div>
    </article>`).join('');
  }

  async function loadRequests() {
    if (state.loading) return;
    state.loading = true; renderList();
    try {
      const payload = await window.APIService.getCommercialSetupRequests(state.status);
      state.items = Array.isArray(payload?.data) ? payload.data : [];
      state.summary = payload?.summary || {};
    } catch (error) {
      window.showToast?.(error.message || 'Commercial setup requests could not be loaded.', 'error');
      const status = byId('commercialSetupStatus'); if (status) status.textContent = 'Commercial setup requests could not be loaded. Try again.';
    } finally { state.loading = false; renderList(); }
  }

  function renderWorkspace() {
    const mount = byId('commercialSetupWorkspace');
    const payload = state.workspace;
    if (!mount || !payload) return;
    const request = payload.request;
    const isPending = request.status === 'pending';
    byId('commercialSetupDialogSubtitle').textContent = `${request.organization?.name || 'Organization'} · ${request.user?.name || request.user?.email || 'Commercial user'} · ${request.reference}`;
    const portfolios = payload.portfolios || [];
    const properties = payload.properties || [];
    mount.innerHTML = `<section class="commercial-setup-review-grid">
      <article><span>Commercial user</span><strong>${escapeHtml(request.user?.name || 'Unknown')}</strong><p>${escapeHtml(request.user?.email || '')}</p></article>
      <article><span>Organization</span><strong>${escapeHtml(request.organization?.name || 'Unknown')}</strong><p>${escapeHtml(request.organization?.legalName || request.organization?.code || '')}</p></article>
      <article><span>Access role</span><strong>${escapeHtml(titleCase(payload.membership?.role || 'unknown'))}</strong><p>${escapeHtml(titleCase(payload.membership?.propertyAccess || 'selected'))} property access</p></article>
    </section>
    <section class="commercial-setup-form-block"><h3>1. Choose the portfolio</h3><p>Locations remain tied to their canonical CRM property records.</p>
      <label class="commercial-setup-field"><span>Portfolio</span><select id="commercialSetupPortfolio" ${isPending ? '' : 'disabled'}><option value="__new__">Create a new portfolio</option>${portfolios.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} (${escapeHtml(item.code)})</option>`).join('')}</select></label>
      <label class="commercial-setup-field" id="commercialSetupPortfolioNameWrap"><span>New portfolio name</span><input id="commercialSetupPortfolioName" maxlength="160" value="${escapeHtml(request.organization?.name ? `${request.organization.name} Portfolio` : 'Commercial Portfolio')}" ${isPending ? '' : 'disabled'}></label>
    </section>
    <section class="commercial-setup-form-block"><div class="commercial-setup-property-heading"><div><h3>2. Select verified properties</h3><p>Only existing active CRM properties can be linked.</p></div><input id="commercialSetupPropertySearch" type="search" placeholder="Filter by address or owner…" aria-label="Filter properties"></div>
      <div class="commercial-setup-properties" id="commercialSetupProperties">${properties.length ? properties.map(propertyRow).join('') : '<div class="commercial-setup-empty"><h3>No active CRM properties are available</h3><p>Create and verify the customer property in the CRM first.</p></div>'}</div>
    </section>
    <section class="commercial-setup-form-block"><h3>3. Confirm verification</h3>
      <label class="commercial-setup-verification"><input id="commercialSetupVerified" type="checkbox" ${isPending ? '' : 'disabled'}><span>I verified the selected property ownership, billing contact, service tier, and purchase-order requirements.</span></label>
      <label class="commercial-setup-field"><span>Internal setup note (optional)</span><textarea id="commercialSetupNotes" maxlength="1000" rows="3" ${isPending ? '' : 'disabled'}></textarea></label>
    </section>`;
    const approve = byId('commercialSetupApprove'); const reject = byId('commercialSetupReject');
    if (approve) approve.hidden = !isPending;
    if (reject) reject.hidden = !isPending;
    bindWorkspaceControls();
  }

  function propertyRow(property) {
    const disabled = Boolean(property.unavailableReason);
    const checked = Boolean(property.currentLocation) && !disabled;
    return `<article class="commercial-setup-property ${disabled ? 'is-unavailable' : ''}" data-property-search="${escapeHtml([property.label, property.address, property.owner?.name, property.owner?.email].join(' ').toLowerCase())}">
      <label class="commercial-setup-property-choice"><input type="checkbox" data-setup-property="${escapeHtml(property.id)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${escapeHtml(property.label || 'Property')}</strong><small>${escapeHtml(property.address || 'Address unavailable')}</small><small>Owner: ${escapeHtml(property.owner?.name || 'Owner unavailable')} ${property.owner?.email ? `· ${escapeHtml(property.owner.email)}` : ''}</small>${property.currentLocation ? '<em>Already linked to this organization</em>' : ''}${disabled ? `<em>${escapeHtml(property.unavailableReason)}</em>` : ''}</span></label>
      <div class="commercial-setup-property-controls"><label><span>Service tier</span><select data-setup-tier="${escapeHtml(property.id)}" ${disabled ? 'disabled' : ''}><option value="tier_1">Tier 1 · coordination fee only</option><option value="tier_2" selected>Tier 2 · consolidated billing</option><option value="tier_3">Tier 3 · consolidated + warranty</option></select></label><label class="commercial-setup-po"><input type="checkbox" data-setup-po="${escapeHtml(property.id)}" ${disabled ? 'disabled' : ''}><span>PO required</span></label><label><span>PO field label</span><input data-setup-po-label="${escapeHtml(property.id)}" value="PO number" maxlength="80" ${disabled ? 'disabled' : ''}></label></div>
    </article>`;
  }

  function bindWorkspaceControls() {
    const portfolio = byId('commercialSetupPortfolio'); const nameWrap = byId('commercialSetupPortfolioNameWrap');
    const syncPortfolio = () => { if (nameWrap) nameWrap.hidden = portfolio?.value !== '__new__'; };
    portfolio?.addEventListener('change', syncPortfolio); syncPortfolio();
    byId('commercialSetupPropertySearch')?.addEventListener('input', event => { const query = event.target.value.trim().toLowerCase(); document.querySelectorAll('#commercialSetupProperties .commercial-setup-property').forEach(row => { row.hidden = query && !row.dataset.propertySearch.includes(query); }); });
  }

  async function openWorkspace(requestId) {
    const dialog = byId('commercialSetupDialog');
    state.requestId = requestId; state.workspace = null;
    byId('commercialSetupWorkspace').innerHTML = '<div class="commercial-setup-empty"><h3>Loading setup workspace…</h3></div>';
    byId('commercialSetupDialogStatus').textContent = '';
    if (!dialog.open) dialog.showModal();
    history.replaceState(null, '', `#commercial-setup/${encodeURIComponent(requestId)}`);
    try { state.workspace = await window.APIService.getCommercialSetupWorkspace(requestId); renderWorkspace(); }
    catch (error) { byId('commercialSetupDialogStatus').textContent = error.message || 'Setup workspace could not be loaded.'; }
  }

  async function submitSetup(event) {
    event.preventDefault();
    if (state.saving || !state.workspace || state.workspace.request.status !== 'pending') return;
    const selected = [...document.querySelectorAll('[data-setup-property]:checked')].map(input => {
      const id = input.dataset.setupProperty;
      return { propertyId: id, tier: document.querySelector(`[data-setup-tier="${CSS.escape(id)}"]`)?.value, purchaseOrderRequired: document.querySelector(`[data-setup-po="${CSS.escape(id)}"]`)?.checked === true, purchaseOrderLabel: document.querySelector(`[data-setup-po-label="${CSS.escape(id)}"]`)?.value || 'PO number' };
    });
    if (!selected.length) return void (byId('commercialSetupDialogStatus').textContent = 'Select at least one verified property.');
    if (!byId('commercialSetupVerified')?.checked) return void (byId('commercialSetupDialogStatus').textContent = 'Confirm ownership, billing, tier, and PO verification before approval.');
    const portfolioValue = byId('commercialSetupPortfolio')?.value;
    const portfolioName = byId('commercialSetupPortfolioName')?.value.trim();
    if (portfolioValue === '__new__' && !portfolioName) return void (byId('commercialSetupDialogStatus').textContent = 'Enter a name for the new portfolio.');
    state.saving = true; const button = byId('commercialSetupApprove'); button.disabled = true; button.textContent = 'Activating…';
    try {
      await window.APIService.completeCommercialSetup(state.requestId, { portfolioId: portfolioValue === '__new__' ? null : portfolioValue, portfolioName: portfolioValue === '__new__' ? portfolioName : null, properties: selected, notes: byId('commercialSetupNotes')?.value || '' });
      window.showToast?.('Commercial workspace activated. The client can now see the assigned locations.', 'success');
      closeDialog(); await loadRequests();
    } catch (error) { byId('commercialSetupDialogStatus').textContent = error.message || 'Workspace setup could not be completed.'; }
    finally { state.saving = false; button.disabled = false; button.textContent = 'Approve & activate workspace'; }
  }

  async function rejectRequest() {
    if (!state.requestId || state.saving) return;
    const reason = window.prompt('What information or correction is required? This message will be shown to the commercial user.');
    if (reason === null) return;
    if (reason.trim().length < 10) return void (byId('commercialSetupDialogStatus').textContent = 'Enter a clear reason with at least 10 characters.');
    state.saving = true;
    try { await window.APIService.rejectCommercialSetup(state.requestId, reason.trim()); window.showToast?.('The commercial user was asked for more information.', 'success'); closeDialog(); await loadRequests(); }
    catch (error) { byId('commercialSetupDialogStatus').textContent = error.message || 'The request could not be updated.'; }
    finally { state.saving = false; }
  }

  function closeDialog() { const dialog = byId('commercialSetupDialog'); if (dialog?.open) dialog.close(); history.replaceState(null, '', '#commercial-setup'); state.workspace = null; state.requestId = null; }

  function activateFromHash() {
    const match = window.location.hash.match(/^#commercial-setup(?:\/([^/]+))?$/);
    if (!match) return;
    window.dashboard?.showSection?.('commercial-setup');
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    document.querySelector('[data-section="commercial-setup"]')?.parentElement?.classList.add('active');
    loadRequests().then(() => { if (match[1]) openWorkspace(decodeURIComponent(match[1])); });
  }

  function bind() {
    byId('commercialSetupRefresh')?.addEventListener('click', loadRequests);
    byId('commercialSetupStatusFilter')?.addEventListener('change', event => { state.status = event.target.value; loadRequests(); });
    byId('commercialSetupSearch')?.addEventListener('input', event => { state.query = event.target.value; renderList(); });
    byId('commercialSetupList')?.addEventListener('click', event => { const button = event.target.closest('[data-commercial-setup-open]'); if (button) openWorkspace(button.dataset.commercialSetupOpen); });
    byId('commercialSetupForm')?.addEventListener('submit', submitSetup);
    byId('commercialSetupReject')?.addEventListener('click', rejectRequest);
    byId('commercialSetupClose')?.addEventListener('click', closeDialog);
    byId('commercialSetupCancel')?.addEventListener('click', closeDialog);
    byId('commercialSetupDialog')?.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
    byId('commercialSetupNav')?.addEventListener('click', () => window.setTimeout(loadRequests, 0));
    window.addEventListener('hashchange', activateFromHash);
    if (window.location.hash.startsWith('#commercial-setup')) Promise.resolve(window.AuthReady).then(() => window.setTimeout(activateFromHash, 0)).catch(() => {});
  }

  window.loadCommercialSetupAdmin = loadRequests;
  document.addEventListener('DOMContentLoaded', bind);
})();
