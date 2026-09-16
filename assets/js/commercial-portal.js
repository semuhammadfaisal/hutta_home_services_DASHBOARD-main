(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = { profile: null, navigation: [], organizationId: '', portfolioId: '', portfolios: [], dashboard: null, activities: [], invoices: [], reports: [], documents: [], preferences: null, users: [], invitations: [], warranty: [], notifications: [], search: '' };
  const routeTitles = { overview: 'Overview', properties: 'Properties', orders: 'Open Orders', activity: 'Activity', invoices: 'Invoices', reports: 'Reports', documents: 'Documents', users: 'Users', warranty: 'Warranty Claims', notifications: 'Notifications', account: 'Account' };
  const el = {
    loading: $('loadingState'), error: $('errorState'), errorMessage: $('errorMessage'), emptyAccess: $('emptyAccessState'), content: $('portalContent'),
    organization: $('organizationSelect'), portfolio: $('portfolioSelect'), search: $('globalSearch'), navigation: $('portalNavigation'), routeTitle: $('routeTitle'),
    metrics: $('overviewMetrics'), priorityOrders: $('priorityOrders'), estimates: $('estimateList'), propertyPulse: $('propertyPulse'), activity: $('activityList'), consolidatedActivity: $('consolidatedActivity'), activityEmpty: $('activityEmpty'),
    properties: $('propertyGrid'), propertyEmpty: $('propertyEmpty'), tierFilter: $('tierFilter'), orders: $('orderList'), orderEmpty: $('orderEmpty'), orderFilter: $('orderFilter'),
    invoices: $('invoiceList'), invoiceEmpty: $('invoiceEmpty'), reports: $('reportGrid'), reportEmpty: $('reportEmpty'), billingProperty: $('billingProperty'), billingDateFrom: $('billingDateFrom'), billingDateTo: $('billingDateTo'), users: $('userList'), userEmpty: $('userEmpty'),
    warranty: $('warrantyList'), warrantyEmpty: $('warrantyEmpty'), documents: $('documentList'), documentEmpty: $('documentEmpty'), notifications: $('notificationList'), notificationEmpty: $('notificationEmpty'), notificationBadge: $('notificationBadge'),
    profile: $('profileCard'), dialog: $('propertyDialog'), dialogTitle: $('dialogTitle'), dialogBody: $('dialogBody'), toast: $('toast')
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  const date = value => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : 'Not scheduled';
  const relative = value => { if (!value) return ''; const days = Math.round((new Date(value) - new Date()) / 86400000); if (days === 0) return 'Today'; if (days === 1) return 'Tomorrow'; if (days > 1 && days < 14) return `In ${days} days`; return date(value); };
  const title = value => String(value || 'pending').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
  const address = property => [property?.address?.line1, property?.address?.city, property?.address?.state, property?.address?.postalCode].filter(Boolean).join(', ');
  const pill = (value, urgent = false) => `<span class="status-pill ${urgent ? 'urgent' : escapeHtml(String(value || '').toLowerCase())}">${escapeHtml(title(value))}</span>`;
  const emptyRow = message => `<div class="empty-state"><strong>${escapeHtml(message)}</strong></div>`;
  const currentOrganization = () => state.profile?.organizations?.find(item => item.id === state.organizationId);
  const currentProperty = id => state.dashboard?.properties?.find(item => item.propertyId === id);
  const matches = (...values) => !state.search || values.some(value => String(value || '').toLowerCase().includes(state.search));

  function setState(name) {
    el.loading.hidden = name !== 'loading'; el.error.hidden = name !== 'error'; el.emptyAccess.hidden = name !== 'empty'; el.content.hidden = name !== 'ready';
  }
  function renderSetupState() {
    const linked = Boolean(state.organizationId);
    $('setupHeading').textContent = linked ? 'Your organization has no assigned locations' : 'Your commercial workspace needs setup';
    $('setupDescription').textContent = linked
      ? 'Ask your account administrator to link your locations, owners, and service agreements. Your existing account will be kept.'
      : 'Your login is active, but no commercial organization is linked to it. Request setup so SMPLfix can assign the correct organization and locations.';
    renderScope(); renderNavigation(); renderAccount();
    $('preferenceForm').querySelectorAll('input, select, button').forEach(input => { input.disabled = !linked; });
    el.search.disabled = true;
    setState('empty');
  }
  function showToast(message) { el.toast.textContent = message; el.toast.hidden = false; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { el.toast.hidden = true; }, 3000); }
  function filters() { return { organizationId: state.organizationId, portfolioId: state.portfolioId }; }
  function billingFilters() { return { ...filters(), propertyId: el.billingProperty?.value || '', dateFrom: el.billingDateFrom?.value || '', dateTo: el.billingDateTo?.value || '' }; }

  function renderNavigation() {
    const allowed = new Set(state.navigation);
    el.navigation.querySelectorAll('[data-route]').forEach(link => { link.hidden = !allowed.has(link.dataset.route); });
    const requested = (location.hash || '#overview').slice(1);
    if (!allowed.has(requested)) location.hash = '#overview'; else activateRoute(requested);
  }
  function activateRoute(route) {
    if (!state.navigation.includes(route)) route = 'overview';
    document.querySelectorAll('.portal-view').forEach(view => { const active = view.dataset.view === route; view.hidden = !active; view.classList.toggle('is-active', active); });
    el.navigation.querySelectorAll('[data-route]').forEach(link => { const active = link.dataset.route === route; link.classList.toggle('is-active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    el.routeTitle.textContent = routeTitles[route] || 'Overview';
    if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
    $('commercialMain').focus({ preventScroll: true }); closeSidebar();
    if (!state.organizationId || !state.dashboard?.properties?.length) {
      el.emptyAccess.hidden = route !== 'overview'; el.content.hidden = route === 'overview';
    }
  }

  function renderScope() {
    const organizations = state.profile?.organizations || [];
    el.organization.innerHTML = organizations.length ? organizations.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('') : '<option value="">Organization not linked</option>'; el.organization.value = state.organizationId;
    el.organization.disabled = !organizations.length;
    el.portfolio.disabled = !state.organizationId;
    el.portfolio.innerHTML = '<option value="">All portfolios</option>' + state.portfolios.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join(''); el.portfolio.value = state.portfolioId;
    const selectedBillingProperty = el.billingProperty?.value || '';
    if (el.billingProperty) { el.billingProperty.innerHTML = '<option value="">All properties</option>' + (state.dashboard?.properties || []).map(item => `<option value="${escapeHtml(item.propertyId)}">${escapeHtml(item.label || item.locationCode)}</option>`).join(''); el.billingProperty.value = (state.dashboard?.properties || []).some(item => item.propertyId === selectedBillingProperty) ? selectedBillingProperty : ''; }
    const organization = currentOrganization(); $('sidebarOrgName').textContent = organization?.name || 'Portfolio access'; $('scopeSummary').textContent = state.portfolioId ? `${state.portfolios.find(item => item.id === state.portfolioId)?.name || 'Selected portfolio'} · ${state.dashboard?.summary?.propertyCount || 0} authorized locations` : `${organization?.name || 'Your organization'} · ${state.dashboard?.summary?.propertyCount || 0} authorized locations`;
  }

  function renderMetrics() {
    const summary = state.dashboard?.summary || {};
    const cards = [
      ['Properties', summary.propertyCount || 0, 'Authorized locations', ''], ['Open orders', summary.openOrders || 0, 'Across this portfolio', ''],
      ['Current-period spend', money(summary.currentPeriodSpend), 'Client-visible invoices', ''], ['Urgent items', summary.urgentItems || 0, 'Needs close attention', summary.urgentItems ? 'is-alert' : ''],
      ['Estimates to approve', summary.estimatesRequiringAction || 0, 'Based on your approval role', summary.estimatesRequiringAction ? 'is-action' : '']
    ];
    el.metrics.innerHTML = cards.map(([label, value, hint, tone]) => `<article class="metric-card ${tone}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><p>${escapeHtml(hint)}</p></article>`).join('');
  }

  function orderRow(order) {
    const property = currentProperty(order.propertyId); const urgent = ['high', 'urgent', 'emergency'].includes(String(order.priority).toLowerCase());
    return `<div class="data-row"><span><strong>${escapeHtml(order.service || 'Service order')}</strong><small>${escapeHtml(order.orderReference || order.workOrderNumber || 'Order')} · ${escapeHtml(property?.label || 'Authorized property')}</small></span><span><em>Status</em>${escapeHtml(title(order.workflowStatus || order.status))}</span><span><em>Scheduled</em>${escapeHtml(date(order.scheduledStart))}</span><span><em>PO</em>${escapeHtml(order.purchaseOrderNumber || 'Not required')}</span><button class="secondary-button" type="button" data-order-id="${escapeHtml(order.id)}">View job</button></div>`;
  }
  function renderOverview() {
    renderMetrics(); const orders = state.dashboard?.openOrders || [];
    const priorities = [...orders].sort((a, b) => Number(['high', 'urgent', 'emergency'].includes(String(b.priority).toLowerCase())) - Number(['high', 'urgent', 'emergency'].includes(String(a.priority).toLowerCase()))).slice(0, 6);
    el.priorityOrders.innerHTML = priorities.length ? priorities.map(order => { const property = currentProperty(order.propertyId); const urgent = ['high', 'urgent', 'emergency'].includes(String(order.priority).toLowerCase()); return `<div class="stack-item"><span><strong>${escapeHtml(order.service)}</strong><small>${escapeHtml(property?.label || 'Property')} · ${escapeHtml(order.orderReference || 'Order')}</small></span><span class="stack-meta">${pill(urgent ? 'urgent' : order.workflowStatus || order.status, urgent)}<small>${escapeHtml(date(order.scheduledStart))}</small></span></div>`; }).join('') : emptyRow('No open work in this view');
    const estimates = state.dashboard?.estimates || []; el.estimates.innerHTML = estimates.length ? estimates.slice(0, 5).map(item => `<div class="stack-item"><span><strong>${escapeHtml(item.service)}</strong><small>${escapeHtml(item.quoteReference)} · valid until ${escapeHtml(date(item.validUntil))}</small></span><span class="stack-meta"><strong>${escapeHtml(money(item.amount))}</strong><button class="secondary-button" type="button" data-estimate-order="${escapeHtml(item.orderId)}" data-estimate-id="${escapeHtml(item.id)}">Review estimate</button></span></div>`).join('') : emptyRow('No estimates need your approval');
    const properties = state.dashboard?.properties || []; el.propertyPulse.innerHTML = properties.length ? properties.slice(0, 6).map(item => `<button class="pulse-card" type="button" data-property-id="${escapeHtml(item.propertyId)}"><header><strong>${escapeHtml(item.label || item.locationCode)}</strong><span class="tier-pill ${escapeHtml(item.tier)}">${escapeHtml(title(item.tier))}</span></header><p>${escapeHtml(item.portfolioName || 'Portfolio')}</p><div class="pulse-stats"><span><b>${item.openOrderCount || 0}</b>Open</span><span><b>${escapeHtml(money(item.currentPeriodSpend))}</b>Spend</span></div></button>`).join('') : emptyRow('No properties in this scope');
    const activity = state.dashboard?.recentActivity || []; el.activity.innerHTML = activity.length ? activity.slice(0, 7).map(item => `<div class="timeline-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary || title(item.type))}</p><small>${escapeHtml(relative(item.occurredAt))}</small></div>`).join('') : emptyRow('No recent activity');
  }

  function renderProperties() {
    const tier = el.tierFilter.value; const items = (state.dashboard?.properties || []).filter(item => (tier === 'all' || item.tier === tier) && matches(item.label, item.locationCode, item.portfolioName, address(item), item.tier));
    el.properties.innerHTML = items.map(item => `<article class="property-card"><header><div><p class="eyebrow">${escapeHtml(item.portfolioName || 'Portfolio')}</p><h3>${escapeHtml(item.label || item.locationCode)}</h3></div><span class="tier-pill ${escapeHtml(item.tier)}">${escapeHtml(title(item.tier))}</span></header><p class="address">${escapeHtml(address(item))}</p><div class="property-facts"><div class="property-fact"><span>Open</span><strong>${item.openOrderCount || 0}</strong></div><div class="property-fact"><span>Period spend</span><strong>${escapeHtml(money(item.currentPeriodSpend))}</strong></div><div class="property-fact"><span>Status</span><strong>${escapeHtml(title(item.status))}</strong></div></div><p class="next-visit"><strong>Next visit:</strong> ${escapeHtml(item.upcomingVisit ? `${date(item.upcomingVisit.scheduledStart)} · ${item.upcomingVisit.service}` : 'None scheduled')}</p><button class="secondary-button" type="button" data-property-id="${escapeHtml(item.propertyId)}">View property</button></article>`).join('');
    el.propertyEmpty.hidden = items.length > 0;
  }
  function renderOrders() { const filter = el.orderFilter.value; const items = (state.dashboard?.openOrders || []).filter(item => { const urgent = ['high', 'urgent', 'emergency'].includes(String(item.priority).toLowerCase()); const filtered = filter === 'all' || (filter === 'urgent' && urgent) || (filter === 'scheduled' && item.scheduledStart) || (filter === 'approval' && ['quote_sent', 'outgoing_quote_draft'].includes(item.workflowStatus)); const property = currentProperty(item.propertyId); return filtered && matches(item.service, item.orderReference, item.status, item.workflowStatus, item.purchaseOrderNumber, property?.label); }); el.orders.innerHTML = items.map(orderRow).join(''); el.orderEmpty.hidden = items.length > 0; }
  function renderActivity() { const items=state.activities.filter(item=>matches(item.title,item.summary,item.type,currentProperty(item.propertyId)?.label));el.consolidatedActivity.innerHTML=items.map(item=>`<div class="timeline-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary||title(item.type))} · ${escapeHtml(currentProperty(item.propertyId)?.label||'Authorized property')}</p><small>${escapeHtml(relative(item.occurredAt))}</small></div>`).join('');el.activityEmpty.hidden=items.length>0; }
  function renderInvoices() { const items = state.invoices.filter(item => matches(item.invoiceNumber, item.invoiceType, item.purchaseOrderNumber, item.amount, ...(item.properties || []).map(row => row.propertyLabel))); el.invoices.innerHTML = items.map(item => `<div class="data-row"><span><strong>${escapeHtml(item.invoiceNumber)}</strong><small>${escapeHtml(title(item.invoiceType))} · ${(item.properties || []).map(row => escapeHtml(row.propertyLabel)).join(', ') || 'Authorized property'}</small></span><span><em>Amount</em>${escapeHtml(money(item.amount))}<small>${escapeHtml(money(item.balanceDue))} due</small></span><span><em>Issued</em>${escapeHtml(date(item.issuedAt))}</span><span><em>Status</em>${pill(item.status, item.status === 'overdue')}</span><a class="secondary-button" href="${escapeHtml(item.pdfUrl)}" target="_blank" rel="noopener">Open PDF</a></div>`).join(''); el.invoiceEmpty.hidden = items.length > 0; }
  function renderReports() { const items = state.reports.filter(item => matches(item.period, item.total, ...(item.properties || []).map(row => row.propertyLabel))); el.reports.innerHTML = items.map(item => `<article class="report-card"><span class="report-icon" aria-hidden="true">▥</span><p class="eyebrow">${escapeHtml(item.period)}</p><h3>${escapeHtml(money(item.total))} billed</h3><p>${item.invoiceCount} invoice${item.invoiceCount === 1 ? '' : 's'} · ${escapeHtml(money(item.paid))} paid · ${escapeHtml(money(item.balanceDue))} due</p><small>${(item.properties || []).map(row => `${escapeHtml(row.propertyLabel)} ${escapeHtml(money(row.total))}`).join(' · ')}</small><p><a class="secondary-button" href="/api/commercial/reports?${escapeHtml(new URLSearchParams({...billingFilters(),period:item.period,format:'pdf'}))}">Download PDF</a> <a class="secondary-button" href="/api/commercial/reports?${escapeHtml(new URLSearchParams({...billingFilters(),period:item.period,format:'csv'}))}">Download CSV</a></p></article>`).join(''); el.reportEmpty.hidden = items.length > 0; }
  function renderUsers() { const items = state.users.filter(item => matches(item.user?.displayName, item.user?.email, item.role)); el.users.innerHTML = items.map(item => `<div class="data-row"><span><strong>${escapeHtml(item.user?.displayName || 'Account user')}</strong><small>${escapeHtml(item.user?.email)}</small></span><span><em>Organization role</em>${escapeHtml(title(item.role))}</span><span><em>Property access</em>${escapeHtml(title(item.propertyAccess))}</span><span><em>Property roles</em>${item.propertyRoles?.length || 0}</span>${pill(item.status)}${item.user?.id !== state.profile?.user?.id ? `<button class="secondary-button" type="button" data-edit-user-id="${escapeHtml(item.user.id)}">Edit access</button>` : ''} </div>`).join(''); $('invitationList').innerHTML = state.invitations.filter(item=>item.status==='pending').map(item=>`<div class="data-row"><span><strong>${escapeHtml(item.email)}</strong><small>Invitation expires ${escapeHtml(date(item.expiresAt))}</small></span><span><em>Scope</em>${escapeHtml(title(item.scopeType))}</span><span><em>Role</em>${escapeHtml(title(item.role))}</span><span><em>Status</em>Pending</span><button class="text-button" type="button" data-revoke-invite="${escapeHtml(item.id)}">Revoke</button></div>`).join(''); el.userEmpty.hidden = items.length > 0 || state.invitations.length > 0; }
  function renderWarranty() { const items = state.warranty.filter(item => { const property = currentProperty(item.propertyId); return matches(item.claimReference, item.title, item.summary, item.status, property?.label, item.vendor?.name); }); el.warranty.innerHTML = items.map(item => `<article class="warranty-row"><header><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.claimReference)} · ${escapeHtml(currentProperty(item.propertyId)?.label || 'Tier 3 property')}</small></span>${pill(item.status, item.status === 'denied')}</header><p>${escapeHtml(item.summary || 'Warranty claim under management.')}</p><div class="warranty-facts"><span><em>Contractor</em>${escapeHtml(item.vendor?.name || 'Not assigned')}</span><span><em>Coverage</em>${escapeHtml(date(item.coverage?.startsAt))} – ${escapeHtml(date(item.coverage?.endsAt))}</span><span><em>Next appointment</em>${escapeHtml(date((item.appointments || []).find(value => ['proposed','confirmed'].includes(value.status))?.scheduledStart))}</span><span><em>Resolution</em>${escapeHtml(item.resolution?.summary || 'Pending')}</span></div><div>${(item.documents || []).map(document => `<a class="text-button" href="${escapeHtml(document.downloadUrl)}" target="_blank" rel="noopener">${escapeHtml(document.name)}</a>`).join(' ')}</div></article>`).join(''); el.warrantyEmpty.hidden = items.length > 0; }
  function renderDocuments() { const items = state.documents.filter(item => matches(item.name, item.source, currentProperty(item.propertyId)?.label)); el.documents.innerHTML = items.map(item => `<div class="data-row"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(title(item.source))} · ${escapeHtml(currentProperty(item.propertyId)?.label || 'Authorized property')}</small></span><span><em>Type</em>${escapeHtml(item.type || 'Document')}</span><span><em>Uploaded</em>${escapeHtml(date(item.uploadedAt))}</span><span><em>Size</em>${escapeHtml(item.size ? `${Math.ceil(item.size / 1024)} KB` : '—')}</span><a class="secondary-button" href="${escapeHtml(item.downloadUrl)}" target="_blank" rel="noopener">Open</a></div>`).join(''); el.documentEmpty.hidden = items.length > 0; }
  function renderNotifications() { const items = state.notifications.filter(item => matches(item.title, item.message, item.type)); el.notifications.innerHTML = items.map(item => `<article class="notification-item ${item.isRead ? '' : 'unread'}"><span class="notification-dot" aria-hidden="true"></span><span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></span><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(relative(item.createdAt))}</time></article>`).join(''); el.notificationEmpty.hidden = items.length > 0; const unread = state.notifications.filter(item => !item.isRead).length; el.notificationBadge.hidden = !unread; el.notificationBadge.textContent = String(unread); }
  function renderAccount() { const user = state.profile?.user || {}; const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Commercial client'; const initials = name.split(/\s+/).slice(0, 2).map(value => value[0]).join('').toUpperCase(); $('userInitials').textContent = initials; $('sidebarUserName').textContent = name; el.profile.innerHTML = `<span class="profile-avatar">${escapeHtml(initials)}</span><div><p class="eyebrow">Signed-in user</p><h3>${escapeHtml(name)}</h3><p>${escapeHtml(user.email)}</p></div><div class="profile-orgs">${(state.profile?.organizations || []).map(item => `<div class="profile-org"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(title(item.membership?.propertyAccess))} property access</small></span><span>${escapeHtml(title(item.membership?.role))}</span></div>`).join('')}</div>`; $('accountFirstName').value=user.firstName||'';$('accountLastName').value=user.lastName||'';$('accountPhone').value=user.phone||'';const pref=state.preferences||{};$('preferenceEmail').checked=pref.notifications?.email!==false;$('preferenceOrders').checked=pref.notifications?.orderUpdates!==false;$('preferenceBilling').checked=pref.notifications?.billingUpdates!==false;$('preferenceWarranty').checked=pref.notifications?.warrantyUpdates!==false;$('reportEnabled').checked=pref.monthlyReports?.enabled===true;$('reportDay').value=String(pref.monthlyReports?.deliveryDay||1);$('reportFormat').value=pref.monthlyReports?.format||'pdf';const selected=new Set((pref.monthlyReports?.propertyIds||[]).map(String));$('reportProperties').innerHTML=(state.dashboard?.properties||[]).filter(item=>item.entitlements?.monthlyReports&&item.capabilities?.canViewReports).map(item=>`<label><input type="checkbox" data-report-property="${escapeHtml(item.propertyId)}" ${selected.has(item.propertyId)?'checked':''}> ${escapeHtml(item.label)}</label>`).join('')||'<small>No report-enabled properties in this scope.</small>'; }
  function renderAll() { renderScope(); renderNavigation(); renderOverview(); renderProperties(); renderOrders(); renderActivity(); renderInvoices(); renderReports(); renderDocuments(); renderUsers(); renderWarranty(); renderNotifications(); renderAccount(); }

  async function loadAuxiliary() {
    const nav = new Set(state.navigation); const tasks = [];
    tasks.push(window.APIService.getCommercialActivity(filters()).then(value => { state.activities = value.data || []; }));
    if (nav.has('invoices')) tasks.push(window.APIService.getCommercialInvoices(billingFilters()).then(value => { state.invoices = value.data || []; })); else state.invoices = [];
    if (nav.has('reports')) tasks.push(window.APIService.getCommercialReports(billingFilters()).then(value => { state.reports = value.data || []; })); else state.reports = [];
    if (nav.has('users')) tasks.push(Promise.all([window.APIService.getCommercialUsers(state.organizationId), window.APIService.getCommercialInvitations(state.organizationId)]).then(([users, invitations]) => { state.users = users.data || []; state.invitations = invitations.data || []; })); else { state.users = []; state.invitations = []; }
    if (nav.has('warranty')) tasks.push(window.APIService.getCommercialWarrantyClaims(filters()).then(value => { state.warranty = value.data || []; })); else state.warranty = [];
    tasks.push(window.APIService.getCommercialDocuments(filters()).then(value => { state.documents = value.data || []; }));
    tasks.push(window.APIService.getCommercialPreferences(state.organizationId).then(value => { state.preferences = value.preferences || null; }));
    tasks.push(window.APIService.getCommercialNotifications().then(value => { state.notifications = value.data || []; }));
    await Promise.all(tasks);
  }
  async function loadScope() {
    setState('loading');
    try {
      const [portfolios, dashboard] = await Promise.all([window.APIService.getCommercialPortfolios(state.organizationId), window.APIService.getCommercialDashboard(filters())]);
      state.portfolios = portfolios.data || []; state.dashboard = dashboard; state.navigation = dashboard.navigation || state.profile.navigation || [];
      await loadAuxiliary(); renderAll(); el.search.disabled = false;
      if (state.dashboard?.properties?.length) setState('ready'); else { renderSetupState(); activateRoute((location.hash || '#overview').slice(1)); }
    } catch (error) { el.errorMessage.textContent = error?.status === 403 ? 'Your account does not have permission to open this commercial view.' : (error?.message || 'Try again in a moment.'); setState('error'); }
  }
  async function initialize() {
    setState('loading');
    try {
      window.APIService.clearCache?.();
      const session = await window.AuthReady; if (session?.user?.role !== 'commercial') throw Object.assign(new Error('This workspace requires a commercial client account.'), { status: 403 });
      state.profile = await window.APIService.getCommercialMe(); state.navigation = state.profile.navigation || [];
      state.organizationId = state.profile.organizations?.[0]?.id || '';
      if (!state.organizationId) { state.portfolios = []; state.dashboard = null; renderSetupState(); activateRoute((location.hash || '#overview').slice(1)); return; }
      await loadScope();
    } catch (error) { el.errorMessage.textContent = error?.message || 'Try again in a moment.'; setState('error'); }
  }

  async function openProperty(propertyId) {
    const property = currentProperty(propertyId); if (!property) return;
    el.dialogTitle.textContent = property.label || property.locationCode; el.dialogBody.innerHTML = '<div class="state-panel"><span class="spinner"></span><strong>Loading property history</strong></div>'; el.dialog.showModal();
    try {
      const [detail, orders] = await Promise.all([window.APIService.getCommercialProperty(state.organizationId, propertyId), window.APIService.getCommercialPropertyOrders(state.organizationId, propertyId)]);
      el.dialogBody.innerHTML = `<div class="detail-summary"><div class="detail-stat"><span>Service tier</span><strong>${escapeHtml(title(detail.property?.tier))}</strong></div><div class="detail-stat"><span>Open orders</span><strong>${property.openOrderCount || 0}</strong></div><div class="detail-stat"><span>Period spend</span><strong>${escapeHtml(money(property.currentPeriodSpend))}</strong></div><div class="detail-stat"><span>Status</span><strong>${escapeHtml(title(property.status))}</strong></div></div><section class="detail-section"><p class="eyebrow">Location</p><h3>${escapeHtml(address(detail.property))}</h3><p>${escapeHtml(detail.portfolio?.name || property.portfolioName)} · ${escapeHtml(detail.agreement?.agreementNumber || 'Agreement pending')}</p></section><section class="detail-section"><p class="eyebrow">Order history</p><div class="data-list">${(orders.data || []).length ? orders.data.map(orderRow).join('') : emptyRow('No service history for this location')}</div></section>`;
    } catch (error) { el.dialogBody.innerHTML = `<div class="state-panel state-error"><strong>Property details unavailable</strong><p>${escapeHtml(error?.message || 'Try again later.')}</p></div>`; }
  }

  async function prepareRequest() { const options=(state.dashboard?.properties||[]).filter(item=>item.capabilities?.canRequestService); if(!options.length)return showToast('You do not have request permission for these properties.'); $('requestProperty').innerHTML=options.map(item=>`<option value="${escapeHtml(item.propertyId)}">${escapeHtml(item.label)}</option>`).join(''); $('requestForm').reset(); await updateRequestAgreement(); $('requestDialog').showModal(); }
  async function updateRequestAgreement(){try{const propertyId=$('requestProperty').value;const detail=await window.APIService.getCommercialProperty(state.organizationId,propertyId);$('requestAgreement').value=detail.agreement?.id||'';const required=detail.agreement?.purchaseOrder?.required===true;$('requestPo').required=required;$('poHelp').textContent=required?`${detail.agreement.purchaseOrder.label||'PO number'} is required by this service agreement.`:'Optional for this location.';}catch(error){$('requestError').hidden=false;$('requestError').textContent=error.message;}}
  const requestDraft = new window.CommercialRequestDraft();
  async function submitRequest(event) {
    event.preventDefault(); if (!event.currentTarget.reportValidity() || requestDraft.busy) return;
    const payload = {propertyId:$('requestProperty').value,serviceAgreementId:$('requestAgreement').value,serviceCategory:$('requestService').value,description:$('requestDescription').value,urgency:$('requestUrgency').value,preferredTiming:$('requestTiming').value,purchaseOrderNumber:$('requestPo').value};
    const key = requestDraft.start(payload); if (!key) return;
    const button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true; $('requestError').hidden = true;
    try {
      if (!navigator.onLine) throw new Error('You are offline. Reconnect and retry; your request is retained.');
      await window.APIService.createCommercialRequest(state.organizationId, payload, key);
      requestDraft.finish(true); $('requestDialog').close(); showToast('Service request submitted.'); await loadScope();
    } catch (error) { requestDraft.finish(false); $('requestError').hidden=false; $('requestError').textContent=error.message; }
    finally { button.disabled=false; }
  }
  function cryptoRandom(){const values=new Uint32Array(2);crypto.getRandomValues(values);return [...values].map(value=>value.toString(36)).join('');}
  const roles={organization:['organization_admin','billing_admin','operations_manager','viewer'],portfolio:['portfolio_admin','approver','billing','coordinator','viewer'],property:['property_admin','approver','billing','coordinator','viewer']};
  function updateInviteScope(){const type=$('inviteScopeType').value;$('inviteRole').innerHTML=roles[type].map(role=>`<option value="${role}">${title(role)}</option>`).join('');if(type==='organization')$('inviteScope').innerHTML=`<option value="${escapeHtml(state.organizationId)}">${escapeHtml(currentOrganization()?.name)}</option>`;else if(type==='portfolio')$('inviteScope').innerHTML=state.portfolios.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');else $('inviteScope').innerHTML=(state.dashboard?.properties||[]).map(item=>`<option value="${escapeHtml(item.propertyId)}">${escapeHtml(item.label)}</option>`).join('');}
  function openInvite(){ $('inviteForm').reset(); updateInviteScope(); $('inviteDialog').showModal(); }
  async function submitInvite(event){event.preventDefault();$('inviteError').hidden=true;try{const permissions={view:true};document.querySelectorAll('[data-permission]').forEach(input=>{permissions[input.dataset.permission]=input.checked;});await window.APIService.createCommercialInvitation(state.organizationId,{email:$('inviteEmail').value,scopeType:$('inviteScopeType').value,scopeId:$('inviteScope').value,role:$('inviteRole').value,permissions});$('inviteDialog').close();showToast('Secure invitation sent.');const response=await window.APIService.getCommercialInvitations(state.organizationId);state.invitations=response.data||[];renderUsers();}catch(error){$('inviteError').hidden=false;$('inviteError').textContent=error.message;}}

  function openSidebar() { $('sidebar').classList.add('is-open'); $('sidebarScrim').hidden = false; $('menuButton').setAttribute('aria-expanded', 'true'); $('sidebarClose').focus(); }
  function closeSidebar() { $('sidebar').classList.remove('is-open'); $('sidebarScrim').hidden = true; $('menuButton').setAttribute('aria-expanded', 'false'); }
  window.addEventListener('hashchange', () => activateRoute((location.hash || '#overview').slice(1)));
  window.addEventListener('online', () => { $('offlineBanner').hidden = true; showToast('Connection restored.'); }); window.addEventListener('offline', () => { $('offlineBanner').hidden = false; });
  el.organization.addEventListener('change', async () => { state.organizationId = el.organization.value; state.portfolioId = ''; await loadScope(); });
  el.portfolio.addEventListener('change', async () => { state.portfolioId = el.portfolio.value; await loadScope(); });
  el.search.addEventListener('input', () => { state.search = el.search.value.trim().toLowerCase(); renderOverview(); renderProperties(); renderOrders(); renderActivity(); renderInvoices(); renderReports(); renderDocuments(); renderUsers(); renderWarranty(); renderNotifications(); });
  el.tierFilter.addEventListener('change', renderProperties); el.orderFilter.addEventListener('change', renderOrders);
  $('applyBillingFilters').addEventListener('click', async () => { try { await loadAuxiliary(); renderInvoices(); renderReports(); } catch (error) { showToast(error.message || 'Billing filters could not be applied.'); } });
  document.addEventListener('click', event => { const propertyButton = event.target.closest('[data-property-id]'); if (propertyButton) openProperty(propertyButton.dataset.propertyId); const routeButton = event.target.closest('[data-route-button]'); if (routeButton) location.hash = `#${routeButton.dataset.routeButton}`; });
  document.addEventListener('click', async event=>{const close=event.target.closest('[data-close-dialog]');if(close)$(close.dataset.closeDialog).close();const revoke=event.target.closest('[data-revoke-invite]');if(revoke&&confirm('Revoke this pending invitation?')){await window.APIService.revokeCommercialInvitation(state.organizationId,revoke.dataset.revokeInvite,'Revoked by commercial administrator');state.invitations=state.invitations.map(item=>item.id===revoke.dataset.revokeInvite?{...item,status:'revoked'}:item);renderUsers();}});
  $('accountShortcut').addEventListener('click', () => { location.hash = '#account'; }); $('retryButton').addEventListener('click', initialize); $('menuButton').addEventListener('click', openSidebar); $('sidebarClose').addEventListener('click', closeSidebar); $('sidebarScrim').addEventListener('click', closeSidebar); $('dialogClose').addEventListener('click', () => el.dialog.close());
  $('refreshSetupButton').addEventListener('click', initialize);
  $('requestSetupButton').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await window.APIService.request('/commercial/setup-request', { method: 'POST', body: JSON.stringify({ organizationId: state.organizationId || undefined }) }); $('setupStatus').textContent = 'Setup requested. A SMPLfix administrator will review your organization and location access.'; }
    catch (error) { $('setupStatus').textContent = error.message || 'Setup request failed. Please retry.'; }
    finally { button.disabled = false; }
  });
  $('logoutButton').addEventListener('click', async () => { try { await window.APIService.logout(); } finally { window.location.replace('/pages/login.html'); } });
  $('newRequestButton').addEventListener('click',prepareRequest);$('requestProperty').addEventListener('change',updateRequestAgreement);$('requestForm').addEventListener('submit',submitRequest);$('inviteUserButton').addEventListener('click',openInvite);$('inviteScopeType').addEventListener('change',updateInviteScope);$('inviteForm').addEventListener('submit',submitInvite);
  $('accountForm').addEventListener('submit',async event=>{event.preventDefault();try{const response=await window.APIService.updateCommercialAccount({firstName:$('accountFirstName').value,lastName:$('accountLastName').value,phone:$('accountPhone').value});state.profile.user={...state.profile.user,...response.user};renderAccount();showToast('Profile saved.');}catch(error){showToast(error.message||'Profile could not be saved.');}});
  $('preferenceForm').addEventListener('submit',async event=>{event.preventDefault();try{const propertyIds=[...document.querySelectorAll('[data-report-property]:checked')].map(input=>input.dataset.reportProperty);const response=await window.APIService.updateCommercialPreferences(state.organizationId,{notifications:{portal:true,email:$('preferenceEmail').checked,orderUpdates:$('preferenceOrders').checked,billingUpdates:$('preferenceBilling').checked,warrantyUpdates:$('preferenceWarranty').checked,reportReady:true},monthlyReports:{enabled:$('reportEnabled').checked,deliveryDay:Number($('reportDay').value),format:$('reportFormat').value,propertyIds}});state.preferences=response.preferences;showToast('Preferences saved.');}catch(error){showToast(error.message||'Preferences could not be saved.');}});
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSidebar(); });
  window.CommercialPortal = { state, loadScope, showToast, escapeHtml, money, date };
  initialize();
})();
