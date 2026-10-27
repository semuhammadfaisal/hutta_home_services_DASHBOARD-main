(() => {
  'use strict';
  const state = { type: 'overview', overview: null, directories: null, detail: null, detailType: null, detailId: null, tab: null, canManage: false, loaded: false };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const fmtDate = value => value ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
  const label = value => String(value || 'Unknown').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const api = (path, options) => window.APIService.request(`/portal-admin${path}`, options);
  const empty = message => `<div class="portal-empty">${esc(message)}</div>`;
  const status = (message = '', error = false) => { const el = $('portalAccountsStatus'); if (el) { el.textContent = message; el.classList.toggle('error', error); } };

  function setRoute(route, replace = false) {
    const hash = `#portal-accounts/${route}`;
    if (location.hash === hash) return;
    history[replace ? 'replaceState' : 'pushState']({}, '', hash);
  }

  function showSection() {
    window.dashboard?.showSection('portal-accounts');
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    $('portalAccountsNav')?.closest('.menu-item')?.classList.add('active');
  }

  function renderOverview() {
    const root = $('portalAccountsOverview'); const directory = $('portalAccountsDirectory'); const detail = $('portalAccountDetail');
    root.hidden = false; directory.hidden = true; detail.hidden = true;
    if (!state.overview) { root.innerHTML = '<div class="portal-loading">Loading portal account overview…</div>'; return; }
    const t = state.overview.totals; const a = state.overview.attention;
    root.innerHTML = `<div class="portal-accounts-metrics">
      <article><span>Residential clients</span><strong>${t.residential}</strong></article><article><span>Commercial organizations</span><strong>${t.commercial}</strong></article><article><span>Real estate agents</span><strong>${t.agents}</strong></article><article><span>Vendors</span><strong>${t.vendors}</strong></article>
    </div><div class="portal-attention-grid">
      ${attention('user-clock', a.pendingApprovals, 'Pending user approvals')}${attention('building-circle-exclamation', a.commercialSetupRequests, 'Commercial setup requests')}${attention('shield-halved', a.vendorComplianceWarnings, 'Vendor compliance warnings')}${attention('hourglass-half', a.agentAccessExpiringSoon, 'Agent access expiring soon')}${attention('house-circle-exclamation', a.accountsWithoutProperties, 'Clients without properties')}${attention('user-slash', a.unassignedOrders, 'Unassigned open orders')}
    </div><section class="portal-account-panel"><h3>Recent portal orders</h3>${table(['Reference', 'Portal', 'Service', 'Workflow', 'Created'], (state.overview.recentPortalOrders || []).map(order => [order.requestReference || order.orderId, label(order.source), order.service, label(order.workflowStatus || order.status), fmtDate(order.createdAt)]))}</section>`;
    const attentionCount = Object.values(a).reduce((sum, value) => sum + Number(value || 0), 0); const badge = $('portalAccountsNavBadge'); if (badge) { badge.textContent = attentionCount; badge.hidden = !attentionCount; }
  }

  function attention(icon, value, text) { return `<article class="portal-attention-card"><i class="fas fa-${icon}" aria-hidden="true"></i><div><strong>${Number(value || 0)}</strong><span>${esc(text)}</span></div></article>`; }

  function table(headers, rows) {
    if (!rows.length) return empty('No records in this section.');
    const cell = value => value && typeof value === 'object' && value.safeHtml ? value.safeHtml : (value == null ? '—' : esc(value));
    return `<table class="portal-data-table"><thead><tr>${headers.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${cell(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function selectDirectory(type) {
    state.type = type; state.detail = null; state.detailType = null; state.detailId = null;
    if ($('portalAccountsStatusFilter')) $('portalAccountsStatusFilter').value = '';
    document.querySelectorAll('[data-portal-type]').forEach(button => button.classList.toggle('active', button.dataset.portalType === type));
    if (type === 'overview') { setRoute('overview'); renderOverview(); return; }
    setRoute(type); loadDirectory(type);
  }

  async function loadDirectory(type = state.type) {
    showSection(); state.type = type; $('portalAccountsOverview').hidden = true; $('portalAccountDetail').hidden = true; $('portalAccountsDirectory').hidden = false; $('portalAccountsList').innerHTML = '<div class="portal-loading">Loading accounts…</div>';
    try {
      const params = new URLSearchParams({ type }); const q = $('portalAccountsSearch')?.value.trim(); const statusValue = $('portalAccountsStatusFilter')?.value; if (q) params.set('q', q); if (statusValue) params.set('status', statusValue);
      const response = await api(`/accounts?${params}`); state.directories = response.data; state.canManage = response.capabilities?.canManage === true; renderDirectory();
    } catch (error) { $('portalAccountsList').innerHTML = empty(error.message || 'Unable to load portal accounts.'); }
  }

  function renderDirectory() {
    const items = state.directories?.[state.type] || []; const attentionOnly = $('portalAccountsAttentionFilter')?.value === 'needed'; const filtered = attentionOnly ? items.filter(item => item.needsAttention) : items;
    if (!filtered.length) { $('portalAccountsList').innerHTML = empty('No matching portal accounts.'); return; }
    $('portalAccountsList').innerHTML = filtered.map(item => {
      const config = cardConfig(state.type, item);
      return `<button class="portal-account-card" type="button" data-account-id="${esc(item.id)}"><div><span class="portal-account-kicker">${esc(config.kicker)}</span><h3>${esc(config.title)}</h3><p>${esc(config.subtitle)}</p></div>${config.stats.map(stat => `<div class="portal-account-stat"><span>${esc(stat[0])}</span><strong>${esc(stat[1])}</strong></div>`).join('')}<span class="portal-status-pill ${item.needsAttention ? 'attention' : ''}">${esc(item.needsAttention ? 'Attention' : config.status)}</span><i class="fas fa-chevron-right" aria-hidden="true"></i></button>`;
    }).join('');
  }

  function cardConfig(type, item) {
    if (type === 'residential') return { kicker: 'Residential client', title: item.name, subtitle: item.email || item.phone || 'No contact', stats: [['Properties', item.propertyCount], ['Members', item.memberCount], ['Orders', item.orderCount]], status: item.status };
    if (type === 'commercial') return { kicker: item.organizationCode || 'Commercial', title: item.name, subtitle: item.legalName || 'Commercial organization', stats: [['Locations', item.locationCount], ['Members', item.memberCount], ['Orders', item.orderCount]], status: item.status };
    if (type === 'agents') return { kicker: item.profile?.brokerageName || 'Real estate agent', title: item.profile?.displayName || item.name, subtitle: item.email, stats: [['Transactions', item.transactionCount], ['Active', item.activeTransactionCount], ['Profile', item.profile ? 'Complete' : 'Incomplete']], status: item.profile?.status || (item.isActive ? 'active' : 'inactive') };
    return { kicker: item.category || 'Vendor', title: item.companyName || item.legalBusinessName || item.name, subtitle: item.email || 'No email', stats: [['Assignments', item.assignmentCount], ['Members', item.memberCount], ['Compliance', item.incompleteCompliance?.length ? `${item.incompleteCompliance.length} needed` : 'Complete']], status: item.portalStatus || (item.isActive ? 'active' : 'inactive') };
  }

  async function openDetail(type, accountId, replace = false) {
    state.detailType = type; state.detailId = accountId; state.tab = null; showSection(); setRoute(`${type}/${accountId}`, replace); $('portalAccountsOverview').hidden = true; $('portalAccountsDirectory').hidden = true; $('portalAccountDetail').hidden = false; $('portalAccountDetail').innerHTML = '<div class="portal-loading">Loading account workspace…</div>';
    try { const endpoint = type === 'agents' ? `/agents/${accountId}/workspace` : `/${type}/${accountId}/workspace`; state.detail = await api(endpoint); state.canManage = state.detail.capabilities?.canManage === true; renderDetail(); }
    catch (error) { $('portalAccountDetail').innerHTML = `<button class="btn-secondary portal-account-back" type="button" data-back-directory><i class="fas fa-arrow-left"></i> Back</button>${empty(error.message || 'Unable to load account workspace.')}`; }
  }

  function renderDetail() {
    const d = state.detail; const type = state.detailType; const root = $('portalAccountDetail'); const meta = detailMeta(type, d); const tabs = detailTabs(type, d); if (!state.tab || !tabs.some(x => x[0] === state.tab)) state.tab = tabs[0][0];
    root.innerHTML = `<button class="btn-secondary portal-account-back" type="button" data-back-directory><i class="fas fa-arrow-left" aria-hidden="true"></i> Back to ${label(type)}</button><header class="portal-account-detail-header"><div><span class="portal-account-kicker">${esc(meta.kicker)}</span><h2>${esc(meta.title)}</h2><p>${esc(meta.subtitle)}</p></div><div class="portal-account-detail-actions">${detailActions(type, d)}</div></header><section class="portal-account-summary"><span class="portal-account-kicker">Account summary</span><div class="portal-account-summary-grid">${meta.summary.map(x => `<div><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong></div>`).join('')}</div></section><nav class="portal-account-subtabs" aria-label="Account profile sections">${tabs.map(x => `<button type="button" class="${x[0] === state.tab ? 'active' : ''}" data-detail-tab="${esc(x[0])}">${esc(x[1])}<span aria-hidden="true"> · ${x[2]}</span></button>`).join('')}</nav><section class="portal-account-panel" id="portalAccountPanel">${renderTab(type, d, state.tab)}</section>`;
  }

  function detailMeta(type, d) {
    if (type === 'residential') return { kicker: 'Residential client', title: d.account.name, subtitle: d.account.email || d.account.phone || 'No contact details', summary: [['Status', label(d.account.status)], ['Properties', d.properties.length], ['Members', d.members.length], ['Orders', d.orders.length]] };
    if (type === 'commercial') return { kicker: d.organization.organizationCode || 'Commercial organization', title: d.organization.name, subtitle: d.organization.legalName || 'Portfolio account', summary: [['Status', label(d.organization.status)], ['Locations', d.locations.length], ['Members', d.members.length], ['Agreements', d.agreements.length]] };
    if (type === 'agents') return { kicker: d.profile?.brokerageName || 'Real estate agent', title: d.profile?.displayName || d.user.name, subtitle: d.user.email, summary: [['Status', label(d.profile?.status || (d.user.isActive ? 'active' : 'inactive'))], ['Transactions', d.transactions.length], ['Invitations', d.invitations.length], ['Orders', d.orders.length]] };
    return { kicker: d.vendor.category || 'Vendor', title: d.vendor.companyName || d.vendor.legalBusinessName || d.vendor.name, subtitle: d.vendor.email || 'No email', summary: [['Portal status', label(d.vendor.portalStatus)], ['Team', d.team.length], ['Assignments', d.assignments.length], ['Compliance', `${d.compliance.filter(x => !x.complete).length} outstanding`]] };
  }

  function detailTabs(type, d) {
    if (type === 'residential') return [['properties', 'Properties', d.properties.length], ['members', 'Members', d.members.length], ['orders', 'Orders', d.orders.length], ['estimates', 'Estimates', d.estimates.length], ['invoices', 'Invoices', d.invoices.length], ['documents', 'Documents', d.documents.length], ['messages', 'Messages', d.messages.length], ['activity', 'Activity', d.activity.length]];
    if (type === 'commercial') return [['locations', 'Locations', d.locations.length], ['members', 'Organization members', d.members.length], ['property-access', 'Property access', d.propertyMembers?.length || 0], ['agreements', 'Agreements', d.agreements.length], ['orders', 'Orders', d.orders.length], ['invoices', 'Invoices', d.invoices.length], ['warranty', 'Warranty', d.warrantyClaims.length], ['activity', 'Activity', d.activity.length]];
    if (type === 'agents') return [['transactions', 'Transactions', d.transactions.length], ['invitations', 'Invitations', d.invitations.length], ['orders', 'Orders', d.orders.length], ['referrals', 'Referrals', d.referrals.length], ['invoices', 'Invoices', d.invoices.length], ['messages', 'Messages', d.messages.length], ['activity', 'Activity', d.activity.length]];
    return [['team', 'Team', d.team.length], ['assignments', 'Assignments', d.assignments.length], ['opportunities', 'Opportunities', d.opportunities.length], ['estimates', 'Estimates', d.estimates.length], ['invoices', 'Invoices', d.invoices.length], ['payouts', 'Payouts', d.payouts.length], ['compliance', 'Compliance', d.compliance.length], ['documents', 'Documents', d.documents.length], ['performance', 'Performance', d.performance.length]];
  }

  function detailActions(type, d) {
    if (!state.canManage) return '<span class="portal-status-pill">Read only</span>';
    if (type === 'residential') return '<button class="btn-primary" type="button" data-action="residential-order">Create order</button><button class="btn-secondary" type="button" data-action="residential-member">Add member</button>';
    if (type === 'commercial') return '<button class="btn-primary" type="button" data-action="commercial-order">Create location order</button><button class="btn-secondary" type="button" data-action="commercial-member">Add member</button>';
    if (type === 'agents') return '<button class="btn-primary" type="button" data-action="agent-order">Create transaction order</button><button class="btn-secondary" type="button" data-action="agent-link">Link existing order</button>';
    return '<button class="btn-primary" type="button" data-action="vendor-assign">Attach to order</button><button class="btn-secondary" type="button" data-action="vendor-member">Add team member</button>';
  }

  function renderTab(type, d, tab) {
    const title = label(tab); let headers = []; let rows = [];
    if (tab === 'properties') { headers = ['Property', 'Address', 'Type', 'Status']; rows = d.properties.map(x => [x.label, [x.addressLine1, x.city, x.state].filter(Boolean).join(', '), x.propertyType, label(x.status)]); }
    else if (tab === 'locations') { headers = ['Location', 'Property', 'Portfolio', 'Status']; rows = d.locations.map(x => [x.code, x.property?.label || x.label, d.portfolios.find(p => p.id === x.portfolioId)?.name, label(x.status)]); }
    else if (tab === 'members' || tab === 'team' || tab === 'property-access') { const list = tab === 'property-access' ? (d.propertyMembers || []) : d[tab]; headers = ['Member', 'Email', 'Role', 'Status']; if (tab === 'property-access') headers.splice(2, 0, 'Property'); if (state.canManage) headers.push('Access'); rows = list.map(x => { const row = [x.user?.name || 'Unlinked user', x.user?.email]; if (tab === 'property-access') row.push(d.locations?.find(location => location.propertyId === x.propertyId)?.property?.label || x.propertyId); row.push(label(x.role || x.relationship), label(x.status)); if (state.canManage) row.push({ safeHtml: `<button type="button" class="btn-link" ${tab === 'property-access' ? 'data-toggle-property-member' : 'data-toggle-member'}="${esc(x.id)}" data-member-status="${esc(x.status)}">${x.status === 'active' ? 'Revoke' : 'Restore'}</button>` }); return row; }); }
    else if (tab === 'orders') { headers = ['Reference', 'Service', 'Source', 'Workflow', 'Created']; rows = d.orders.map(x => [{ safeHtml: `<button type="button" class="btn-link" data-open-order="${esc(x.id)}">${esc(x.requestReference || x.orderId)}</button>` }, x.service, label(x.source), label(x.workflowStatus || x.status), fmtDate(x.createdAt)]); }
    else if (tab === 'estimates') { headers = ['Reference', 'Order', 'Status', 'Amount', 'Date']; rows = d.estimates.map(x => [x.reference, x.orderId, label(x.decisionStatus || x.status), x.customerTotal ?? x.amount ?? '—', fmtDate(x.sentAt || x.submittedAt)]); }
    else if (tab === 'invoices') { headers = ['Invoice', 'Order', 'Amount', 'Status', 'Date']; rows = d.invoices.map(x => [x.invoiceNumber, x.orderId, x.amount, label(x.status || x.paymentStatus || 'open'), fmtDate(x.issuedAt || x.submittedAt)]); }
    else if (tab === 'documents') { headers = ['Document', 'Source', 'Type', 'Uploaded']; rows = d.documents.map(x => [x.name, label(x.source), x.type, fmtDate(x.uploadedAt)]); }
    else if (tab === 'messages') { headers = ['Order', 'Sender', 'Message', 'Sent']; rows = d.messages.map(x => [x.orderId, label(x.senderType), x.body, fmtDate(x.createdAt)]); }
    else if (tab === 'activity') { headers = ['Event', 'Summary', 'Occurred']; rows = d.activity.map(x => [label(x.action || x.type || x.title), x.summary || x.title, fmtDate(x.occurredAt || x.createdAt)]); }
    else if (tab === 'agreements') { headers = ['Agreement', 'Tier', 'Invoice mode', 'PO', 'Status']; rows = d.agreements.map(x => [x.agreementNumber, label(x.tier), label(x.billingRules?.invoiceMode), x.purchaseOrder?.required ? 'Required' : 'Optional', label(x.status)]); }
    else if (tab === 'warranty') { headers = ['Reference', 'Title', 'Status', 'Opened']; rows = d.warrantyClaims.map(x => [x.reference, x.title, label(x.status), fmtDate(x.openedAt)]); }
    else if (tab === 'transactions') { headers = ['Transaction', 'Homeowner', 'Property', 'Close', 'Onboarding', 'Access']; if (state.canManage) headers.push('Controls'); rows = d.transactions.map(x => { const row = [x.label, x.customer?.name, x.property?.label, fmtDate(x.closeDate), x.onboarding ? `${x.onboarding.completedCount}/${x.onboarding.totalCount}${x.onboarding.complete ? ' complete' : ''}` : 'Not available', `${label(x.status)} · ${fmtDate(x.accessEndsAt)}`]; if (state.canManage) row.push({ safeHtml: x.status === 'active' ? `<button type="button" class="btn-link" data-agent-access="extend" data-transaction-id="${esc(x.id)}" data-maximum-access="${esc(String(x.maximumAccessEndsAt || '').slice(0, 10))}">Extend</button> <button type="button" class="btn-link" data-agent-access="revoke" data-transaction-id="${esc(x.id)}">Revoke</button>` : '—' }); return row; }); }
    else if (tab === 'invitations') { headers = ['Homeowner', 'Email', 'Transaction', 'Status', 'Expires']; rows = d.invitations.map(x => [x.homeownerName, x.homeownerEmail, x.transactionLabel, label(x.status), fmtDate(x.expiresAt)]); }
    else if (tab === 'referrals') { headers = ['Customer', 'Property', 'Source', 'Completed jobs', 'Converted']; rows = d.referrals.map(x => [x.customerId, x.propertyId, label(x.source), x.completedJobCount || 0, fmtDate(x.convertedAt)]); }
    else if (tab === 'assignments') { headers = ['Order', 'Service', 'Status', 'Billing lane', 'Scheduled']; rows = d.assignments.map(x => [x.reference, x.service, label(x.status), label(x.billingLane), fmtDate(x.scheduledStart)]); }
    else if (tab === 'opportunities') { headers = ['Order', 'Status', 'Response', 'Expires']; rows = d.opportunities.map(x => [x.orderId, label(x.status), label(x.response), fmtDate(x.expiresAt)]); }
    else if (tab === 'payouts') { headers = ['Invoice', 'Order', 'Amount', 'Status', 'Paid']; rows = d.payouts.map(x => [x.invoiceId, x.orderId, x.amount, label(x.status), fmtDate(x.paidAt)]); }
    else if (tab === 'compliance') { headers = ['Requirement', 'Status', 'Next action']; rows = d.compliance.map(x => [label(x.key), x.complete ? 'Complete' : 'Required', x.message || x.action || '—']); }
    else if (tab === 'performance') { headers = ['Event', 'Response time', 'Date']; rows = d.performance.map(x => [label(x.type), x.responseTimeMs ? `${x.responseTimeMs} ms` : '—', fmtDate(x.occurredAt)]); }
    return `<h3>${esc(title)}</h3>${table(headers, rows)}`;
  }

  function openAction(action) {
    if (!state.canManage) return;
    const dialog = $('portalAccountActionDialog'); const fields = $('portalAccountActionFields'); dialog.dataset.action = action; $('portalAccountActionStatus').textContent = '';
    const configs = actionConfig(action); $('portalAccountActionTitle').textContent = configs.title; $('portalAccountActionSubtitle').textContent = configs.subtitle; $('portalAccountActionSubmit').textContent = configs.submit; fields.innerHTML = configs.fields; dialog.showModal(); fields.querySelector('input,select,textarea')?.focus();
  }

  function options(items, value, text) { return items.map(item => `<option value="${esc(item[value])}">${esc(text(item))}</option>`).join(''); }
  function actionConfig(action) {
    const d = state.detail;
    if (action === 'agent-extend') return { title: 'Extend agent access', subtitle: 'Access cannot exceed the Arizona closing date plus 30 calendar days.', submit: 'Extend access', fields: `<input type="hidden" name="transactionId" value="${esc($('portalAccountActionDialog').dataset.transactionId)}"><label class="full">New access end date<input type="date" name="accessEndsAt" max="${esc($('portalAccountActionDialog').dataset.maximumAccess || '')}" required></label><label class="full">Reason<textarea name="reason" rows="3" required minlength="10"></textarea></label>` };
    if (action === 'agent-revoke') return { title: 'Revoke agent access', subtitle: 'Historical orders and documents remain intact.', submit: 'Revoke access', fields: `<input type="hidden" name="transactionId" value="${esc($('portalAccountActionDialog').dataset.transactionId)}"><label class="full">Reason<textarea name="reason" rows="3" required minlength="10"></textarea></label>` };
    if (action === 'residential-order') return orderConfig('Create residential order', 'Uses the selected authorized property and keeps homeowner ownership intact.', `<label class="full">Property<select name="propertyId" required><option value="">Select property</option>${options(d.properties.filter(x => x.status === 'active'), 'id', x => `${x.label} — ${x.addressLine1}`)}</select></label>`);
    if (action === 'commercial-order') return orderConfig('Create commercial location order', 'Tier, billing, PO, owner, property, and agreement are derived from the selected location.', `<label class="full">Location<select name="locationId" required><option value="">Select location</option>${options(d.locations.filter(x => x.status === 'active'), 'id', x => `${x.code} — ${x.property?.label || x.label}`)}</select></label><label>PO number<input name="purchaseOrderNumber" maxlength="120"></label>`);
    if (action === 'agent-order') return orderConfig('Create transaction order', 'Creates a staff-entered order without falsely attributing submission to the agent.', `<label class="full">Active transaction<select name="transactionId" required><option value="">Select transaction</option>${options(d.transactions.filter(x => x.status === 'active'), 'id', x => `${x.label} — closes ${fmtDate(x.closeDate)}`)}</select></label>`);
    if (action === 'agent-link') return { title: 'Link existing order', subtitle: 'The order must match the transaction homeowner and property. Source and submitter attribution are preserved.', submit: 'Link order', fields: `<label class="full">Active transaction<select name="transactionId" required><option value="">Select transaction</option>${options(d.transactions.filter(x => x.status === 'active'), 'id', x => x.label)}</select></label><label class="full">Existing order database ID<input name="orderId" required placeholder="Mongo order ID"></label>` };
    if (action === 'vendor-assign') return { title: 'Attach vendor to order', subtitle: 'Adds a service assignment through the canonical order vendor-assignment workflow.', submit: 'Attach vendor', fields: `<label class="full">Existing order database ID<input name="orderId" required placeholder="Mongo order ID"></label><label>Service<input name="service" required maxlength="500"></label><label>Billing lane<select name="billingLane"><option value="smplfix_direct">SMPLfix direct</option><option value="owner_billed">Billed to owner</option></select></label><label class="full">Scope<textarea name="scope" rows="3"></textarea></label><label class="full">Scheduled Arizona time<input type="datetime-local" name="scheduledStart" required></label>` };
    if (action === 'residential-member') return { title: 'Add residential member', subtitle: 'Links an existing active residential login to an authorized property.', submit: 'Add member', fields: `<label class="full">Residential login email<input type="email" name="email" required></label><label class="full">Property<select name="propertyId" required>${options(d.properties.filter(x => x.status === 'active'), 'id', x => x.label)}</select></label><label>Relationship<select name="relationship"><option value="owner">Owner</option><option value="household_member">Household member</option></select></label>` };
    if (action === 'commercial-member') return { title: 'Add commercial member', subtitle: 'Links an existing active commercial login to this organization. Select a location when access is property-scoped.', submit: 'Add member', fields: `<label class="full">Commercial login email<input type="email" name="email" required></label><label>Role<select name="role"><option value="organization_admin">Organization admin</option><option value="billing_admin">Billing admin</option><option value="operations_manager">Operations manager</option><option value="viewer">Viewer</option></select></label><label>Property access<select name="propertyAccess"><option value="all">All locations</option><option value="selected">Selected location</option></select></label><label class="full">Selected location<select name="locationId"><option value="">Choose when using selected-location access</option>${options(d.locations.filter(x => x.status === 'active'), 'id', x => `${x.code} — ${x.property?.label || x.label}`)}</select></label>` };
    return { title: 'Add vendor team member', subtitle: 'Links an existing active vendor login to this vendor account.', submit: 'Add member', fields: `<label class="full">Vendor login email<input type="email" name="email" required></label><label>Role<select name="role"><option value="member">Member</option><option value="admin">Admin</option></select></label><label><input type="checkbox" name="invoices"> Invoice access</label><label><input type="checkbox" name="assignments" checked> Assignment access</label>` };
  }
  function orderConfig(title, subtitle, prefix) { return { title, subtitle, submit: 'Create order', fields: `${prefix}<label>Service<input name="service" required maxlength="500"></label><label>Priority<select name="priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label><label class="full">Scope<textarea name="description" rows="4" required maxlength="10000"></textarea></label><label>Preferred timing<input name="preferredTiming" maxlength="500"></label><label>Target deadline<input type="date" name="targetCompletionDeadline"></label><label class="full">Access instructions<textarea name="accessInstructions" rows="2"></textarea></label>` }; }

  async function submitAction(event) {
    event.preventDefault(); const dialog = $('portalAccountActionDialog'); const action = dialog.dataset.action; const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries()); if (action === 'vendor-member') payload.permissions = { assignments: form.has('assignments'), invoices: form.has('invoices') }; const submit = $('portalAccountActionSubmit'); submit.disabled = true; $('portalAccountActionStatus').textContent = 'Saving…';
    try {
      if (action === 'residential-order') await api(`/residential/${state.detailId}/orders`, { method: 'POST', body: JSON.stringify(payload) });
      else if (action === 'commercial-order') await api(`/commercial/${state.detailId}/orders`, { method: 'POST', body: JSON.stringify(payload) });
      else if (action === 'agent-order') await api(`/agents/transactions/${encodeURIComponent(payload.transactionId)}/orders`, { method: 'POST', body: JSON.stringify(payload) });
      else if (action === 'agent-link') await api(`/agents/transactions/${encodeURIComponent(payload.transactionId)}/link-order`, { method: 'POST', body: JSON.stringify({ orderId: payload.orderId }) });
      else if (action === 'vendor-assign') { const start = new Date(payload.scheduledStart); await window.APIService.addOrderVendorAssignment(payload.orderId, { vendor: state.detailId, service: payload.service, scope: payload.scope, billingLane: payload.billingLane, scheduledStart: start.toISOString(), completionRules: { requireServiceNotes: true, requireBeforePhotos: true, requireAfterPhotos: true } }); }
      else if (action === 'agent-extend') await window.APIService.request(`/agent-admin/transactions/${encodeURIComponent(payload.transactionId)}/extend`, { method: 'POST', body: JSON.stringify({ accessEndsAt: payload.accessEndsAt, reason: payload.reason }) });
      else if (action === 'agent-revoke') await window.APIService.request(`/agent-admin/transactions/${encodeURIComponent(payload.transactionId)}/revoke`, { method: 'POST', body: JSON.stringify({ reason: payload.reason }) });
      else if (action === 'residential-member') await api(`/residential/${state.detailId}/members`, { method: 'POST', body: JSON.stringify(payload) });
      else if (action === 'commercial-member') await api(`/commercial/${state.detailId}/members`, { method: 'POST', body: JSON.stringify(payload) });
      else await window.APIService.request(`/vendor-portal-admin/vendors/${state.detailId}/team`, { method: 'POST', body: JSON.stringify(payload) });
      dialog.close(); window.showToast?.('Portal account updated.', 'success'); await openDetail(state.detailType, state.detailId, true);
    } catch (error) { $('portalAccountActionStatus').textContent = error.message || 'Unable to save this change.'; }
    finally { submit.disabled = false; }
  }

  async function toggleMember(button) {
    if (!state.canManage) return; const membershipId = button.dataset.toggleMember; const statusValue = button.dataset.memberStatus === 'active' ? 'revoked' : 'active'; button.disabled = true;
    try {
      if (state.detailType === 'residential') await api(`/residential/members/${encodeURIComponent(membershipId)}`, { method: 'PATCH', body: JSON.stringify({ status: statusValue }) });
      else if (state.detailType === 'commercial') await api(`/commercial/members/${encodeURIComponent(membershipId)}`, { method: 'PATCH', body: JSON.stringify({ status: statusValue }) });
      else if (state.detailType === 'vendors') await window.APIService.request(`/vendor-portal-admin/vendors/${encodeURIComponent(state.detailId)}/team/${encodeURIComponent(membershipId)}`, { method: 'PATCH', body: JSON.stringify({ status: statusValue }) });
      window.showToast?.(`Membership ${statusValue}.`, 'success'); await openDetail(state.detailType, state.detailId, true);
    } catch (error) { window.showToast?.(error.message || 'Unable to update membership.', 'error'); button.disabled = false; }
  }

  async function togglePropertyMember(button) {
    if (!state.canManage) return; const membershipId = button.dataset.togglePropertyMember; const statusValue = button.dataset.memberStatus === 'active' ? 'revoked' : 'active'; button.disabled = true;
    try {
      await api(`/commercial/property-members/${encodeURIComponent(membershipId)}`, { method: 'PATCH', body: JSON.stringify({ status: statusValue }) });
      window.showToast?.(`Property access ${statusValue}.`, 'success'); await openDetail(state.detailType, state.detailId, true);
    } catch (error) { window.showToast?.(error.message || 'Unable to update property access.', 'error'); button.disabled = false; }
  }

  async function load() {
    showSection(); status('Loading portal accounts…');
    try { const [overview, directories] = await Promise.all([api('/overview'), api('/accounts?type=all')]); state.overview = overview; state.directories = directories.data; state.canManage = overview.capabilities?.canManage === true; state.loaded = true; $('portalAccountsUpdated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`; status(''); if (!location.hash.startsWith('#portal-accounts')) setRoute('overview'); routeFromHash(true); }
    catch (error) { status(error.message || 'Unable to load Portal Accounts.', true); $('portalAccountsOverview').innerHTML = empty('Portal account data could not be loaded. Try again.'); }
  }

  function routeFromHash(replace = false) {
    if (!location.hash.startsWith('#portal-accounts')) return; showSection(); const parts = location.hash.slice(1).split('/'); const type = parts[1] || 'overview'; document.querySelectorAll('[data-portal-type]').forEach(button => button.classList.toggle('active', button.dataset.portalType === type));
    if (parts[2]) openDetail(type, parts[2], replace); else if (type === 'overview') { state.type = 'overview'; renderOverview(); } else { state.type = type; loadDirectory(type); }
  }

  function bind() {
    $('portalAccountsRefresh')?.addEventListener('click', load); document.querySelectorAll('[data-portal-type]').forEach(button => button.addEventListener('click', () => selectDirectory(button.dataset.portalType)));
    let timer; $('portalAccountsSearch')?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => loadDirectory(), 250); }); $('portalAccountsStatusFilter')?.addEventListener('change', () => loadDirectory()); $('portalAccountsAttentionFilter')?.addEventListener('change', renderDirectory);
    $('portalAccountsList')?.addEventListener('click', event => { const card = event.target.closest('[data-account-id]'); if (card) openDetail(state.type, card.dataset.accountId); });
    $('portalAccountDetail')?.addEventListener('click', event => { if (event.target.closest('[data-back-directory]')) return selectDirectory(state.detailType); const order = event.target.closest('[data-open-order]'); if (order) return window.viewOrder?.(order.dataset.openOrder, true); const propertyMember = event.target.closest('[data-toggle-property-member]'); if (propertyMember) return togglePropertyMember(propertyMember); const member = event.target.closest('[data-toggle-member]'); if (member) return toggleMember(member); const access = event.target.closest('[data-agent-access]'); if (access) { $('portalAccountActionDialog').dataset.transactionId = access.dataset.transactionId; $('portalAccountActionDialog').dataset.maximumAccess = access.dataset.maximumAccess || ''; return openAction(`agent-${access.dataset.agentAccess}`); } const tab = event.target.closest('[data-detail-tab]'); if (tab) { state.tab = tab.dataset.detailTab; renderDetail(); return; } const action = event.target.closest('[data-action]'); if (action) openAction(action.dataset.action); });
    $('portalAccountActionForm')?.addEventListener('submit', submitAction); $('portalAccountActionClose')?.addEventListener('click', () => $('portalAccountActionDialog').close()); $('portalAccountActionCancel')?.addEventListener('click', () => $('portalAccountActionDialog').close());
    window.addEventListener('popstate', () => { if (location.hash.startsWith('#portal-accounts')) routeFromHash(true); });
  }

  window.loadPortalAccountsAdmin = load;
  document.addEventListener('DOMContentLoaded', () => { bind(); if (location.hash.startsWith('#portal-accounts')) load(); });
})();
