(function agentPortalApp() {
  'use strict';

  const ROUTES = new Set(['overview', 'portfolio', 'transactions', 'requests', 'documents', 'referrals', 'notifications', 'account']);
  const TITLES = { overview: 'Overview', portfolio: 'Portfolio', transactions: 'Transactions', 'transaction-detail': 'Transaction', requests: 'Requests', documents: 'Documents', referrals: 'Referrals', notifications: 'Notifications', account: 'Account' };
  const state = { profile: null, overview: null, portfolio: [], archivedTransactions: [], orders: [], packages: {}, messages: [], selectedMessageOrder: '', activity: [], referrals: [], referralTotals: {}, referralCode: '', notifications: [], invitations: [], invitationProperties: [], unreadCount: 0, route: 'overview', query: '', transactionFilter: 'all', invitationFilter: 'all', workspace: null, workspaceTransactionId: '' };
  let overviewTimer = null;
  let overviewRequest = 0;
  const element = {};
  let toastTimer;
  let guidanceRequest = 0;

  const byId = id => document.getElementById(id);
  const list = payload => Array.isArray(payload?.data) ? payload.data : [];
  const key = value => String(value || '');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const statusName = value => String(value || 'Pending').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const normalize = value => String(value || '').toLowerCase().replace(/[_\s]+/g, '-');
  const date = value => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Date pending' : parsed.toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: 'numeric' }); };
  const dateTime = value => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Schedule pending' : parsed.toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const relative = value => { const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return ''; const days = Math.round((parsed - Date.now()) / 86400000); if (Math.abs(days) >= 1) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(days, 'day'); const hours = Math.round((parsed - Date.now()) / 3600000); return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(hours, 'hour'); };
  const address = property => [property?.address?.line1, property?.address?.line2, property?.address?.city, property?.address?.state, property?.address?.postalCode].filter(Boolean).join(', ') || 'Address unavailable';
  const searchText = value => JSON.stringify(value || {}).toLowerCase();
  const matchesSearch = value => !state.query || searchText(value).includes(state.query);
  const transactionForProperty = propertyId => state.portfolio.find(transaction => key(transaction.property?.id) === key(propertyId));
  const ordersFor = transaction => state.orders.filter(order => key(order.propertyId) === key(transaction?.property?.id));
  const completed = order => /completed|invoiced|paid|closed/.test(`${normalize(order.status)} ${normalize(order.workflowStatus)}`);
  const cancelled = order => /cancel|void|lost/.test(`${normalize(order.status)} ${normalize(order.workflowStatus)}`);
  const openOrders = transaction => ordersFor(transaction).filter(order => !completed(order) && !cancelled(order));
  const readiness = transaction => { const orders = ordersFor(transaction).filter(order => !cancelled(order)); if (!orders.length) return 100; return Math.round((orders.filter(completed).length / orders.length) * 100); };
  const isRisk = transaction => openOrders(transaction).some(order => ['critical', 'high'].includes(order.deadlineRisk?.level));
  const initials = name => String(name || 'Agent').split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  const newKey = () => window.crypto?.randomUUID ? window.crypto.randomUUID() : `agent-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

  function empty(message, detail = '') { return `<div class="empty-state"><strong>${escapeHtml(message)}</strong>${detail ? `<p>${escapeHtml(detail)}</p>` : ''}</div>`; }
  function pill(value, extra = '') { return `<span class="status-pill ${escapeHtml(extra)}">${escapeHtml(statusName(value))}</span>`; }
  function showToast(message) { clearTimeout(toastTimer); element.toast.textContent = message; element.toast.hidden = false; toastTimer = setTimeout(() => { element.toast.hidden = true; }, 4200); }
  function setBusy(button, busy, busyLabel = 'Working…') { if (!button) return; if (busy) button.dataset.label = button.textContent; button.disabled = busy; button.textContent = busy ? busyLabel : (button.dataset.label || button.textContent); }
  function setOffline(offline) { element.offlineBanner.hidden = !offline; }

  function metric(label, value, detail, tone = '', route = '') { return `<button type="button" class="metric-card ${tone}" ${route ? `data-metric-route="${escapeHtml(route)}"` : ''}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p></button>`; }
  function renderOverview() {
    const overview = state.overview || { summary: {}, priorities: [], closings: [], appointments: [], openWorkItems: [], activity: [] };
    const summary = overview.summary || {};
    element.overviewMetrics.innerHTML = [
      metric('Active transactions', summary.activeTransactions || 0, 'Authorized properties', '', 'transactions'),
      metric('Closing in 7 days', summary.closingWithinSevenDays || 0, summary.closingWithinSevenDays ? 'Closing window' : 'No near-term closings', summary.closingWithinSevenDays ? 'is-warning' : 'is-success', 'transactions'),
      metric('Open work items', summary.openWorkItems || 0, 'Across active transactions', '', 'requests'),
      metric('At-risk items', summary.atRiskItems || 0, summary.atRiskItems ? 'High or critical' : 'No urgent blockers', summary.atRiskItems ? 'is-warning' : 'is-success', 'requests')
    ].join('');
    const priorities = (overview.priorities || []).filter(matchesSearch);
    element.priorityList.innerHTML = priorities.length ? priorities.slice(0, 8).map(item => `<article class="list-row priority-row"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.context || '')}</small><small>${escapeHtml(item.reason || '')}</small></span><span class="row-actions">${pill(item.severity, ['critical', 'high'].includes(item.severity) ? 'risk' : 'pending')}<button class="text-button" type="button" data-overview-kind="${escapeHtml(item.action?.kind || 'transaction')}" data-overview-transaction="${escapeHtml(item.transactionId || '')}" data-overview-order="${escapeHtml(item.orderId || '')}">${escapeHtml(item.action?.label || 'Open')}</button></span></article>`).join('') : empty('No priority items', 'Current transactions are on track.');
    const closings = (overview.closings || []).filter(matchesSearch);
    element.closingSoonList.innerHTML = closings.length ? closings.slice(0, 6).map(transaction => `<article class="list-row closing-row"><span><strong>${escapeHtml(transaction.label)}</strong><small>${escapeHtml(transaction.client?.displayName || 'Client')} · ${escapeHtml(address(transaction.property))}</small><small>${escapeHtml(transaction.readiness?.label || 'Readiness unavailable')} · ${Number(transaction.openItemCount || 0)} open</small></span><span class="row-meta"><strong>${Math.max(0, Number(transaction.daysUntilClose || 0))}</strong><small>days to close</small><button class="text-button" type="button" data-transaction-id="${escapeHtml(transaction.id)}">Open</button></span></article>`).join('') : empty('No active closings');
    const appointments = (overview.appointments || []).filter(matchesSearch);
    element.appointmentList.innerHTML = appointments.length ? appointments.slice(0, 5).map(item => `<article class="list-row"><span><strong>${escapeHtml(item.service || 'Service visit')}</strong><small>${escapeHtml(item.transaction?.label || 'Authorized property')}</small></span><span class="row-meta"><strong>${escapeHtml(dateTime(item.startsAt))}</strong><button class="text-button" type="button" data-overview-kind="message" data-overview-order="${escapeHtml(item.orderId)}">Open</button></span></article>`).join('') : empty('No appointments scheduled', 'Confirmed visits will appear here.');
    const openItems = (overview.openWorkItems || []).filter(matchesSearch);
    element.openItemsList.innerHTML = openItems.length ? openItems.slice(0, 6).map(order => `<article class="list-row"><span><strong>${escapeHtml(order.service || 'Service request')}</strong><small>${escapeHtml(order.transaction?.label || order.requestReference || 'Transaction')}</small><small>${escapeHtml(order.deadlineRisk?.reason || '')}</small></span><span class="row-actions">${pill(order.workflowStatus || order.status, /pending|received|new/.test(normalize(order.workflowStatus || order.status)) ? 'pending' : '')}<button class="text-button" type="button" data-overview-kind="message" data-overview-order="${escapeHtml(order.id)}">Open</button></span></article>`).join('') : empty('No open work items');
    const activity = overview.activity || [];
    element.activityList.innerHTML = activity.length ? activity.slice(0, 6).map(item => `<div class="timeline-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary || '')}</p><time datetime="${escapeHtml(item.occurredAt)}">${escapeHtml(relative(item.occurredAt))}</time></div>`).join('') : empty('No recent activity');
    element.overviewUpdated.textContent = overview.generatedAt ? `Updated ${relative(overview.generatedAt)}` : '';
  }

  async function refreshOverview({ manual = false } = {}) {
    const request = ++overviewRequest;
    if (manual) setBusy(element.overviewRefresh, true, 'Refreshing…');
    try {
      const payload = await window.APIService.getAgentOverview();
      if (request !== overviewRequest) return;
      state.overview = payload; state.unreadCount = Number(payload.unreadNotificationCount ?? state.unreadCount ?? 0);
      element.overviewStale.hidden = true; renderOverview(); renderNotifications();
      scheduleOverviewRefresh();
    } catch (error) {
      if (request !== overviewRequest) return;
      if (state.overview) element.overviewStale.hidden = false;
      else throw error;
    } finally { if (manual) setBusy(element.overviewRefresh, false); }
  }

  function scheduleOverviewRefresh() {
    clearTimeout(overviewTimer);
    if (document.hidden) return;
    overviewTimer = setTimeout(() => refreshOverview().catch(() => {}), Math.max(15, Number(state.overview?.refreshAfterSeconds || 60)) * 1000);
  }

  function renderPortfolio() {
    const grouped = new Map();
    state.portfolio.filter(matchesSearch).forEach(transaction => {
      const client = transaction.client || { id: 'unknown', displayName: 'Client' };
      if (!grouped.has(key(client.id))) grouped.set(key(client.id), { client, items: [] });
      grouped.get(key(client.id)).items.push(transaction);
    });
    element.portfolioList.innerHTML = [...grouped.values()].map(group => `<article class="client-card"><div class="client-card-header"><span class="avatar" aria-hidden="true">${escapeHtml(initials(group.client.displayName))}</span><div><h3>${escapeHtml(group.client.displayName)}</h3><p>${group.items.length} authorized ${group.items.length === 1 ? 'property' : 'properties'}</p></div></div><div class="property-list">${group.items.map(transaction => `<div class="property-row"><span><strong>${escapeHtml(transaction.property?.label || transaction.label)}</strong><small>${escapeHtml(address(transaction.property))}</small></span><button class="text-button" type="button" data-transaction-id="${escapeHtml(transaction.id)}">${Math.max(0, Number(transaction.daysUntilClose))} days</button></div>`).join('')}</div></article>`).join('');
    element.portfolioEmpty.hidden = grouped.size > 0;
    renderInvitations();
  }

  function renderInvitations() {
    const items = state.invitations.filter(item => (state.invitationFilter === 'all' || item.status === state.invitationFilter) && matchesSearch(item));
    element.invitationList.innerHTML = items.map(item => `<article class="invitation-row"><span><strong>${escapeHtml(item.homeownerName || item.homeownerEmail || 'Homeowner')}</strong><small>${escapeHtml(item.homeownerEmail || '')} · ${escapeHtml(item.transactionLabel || 'Transaction')}</small><small>${escapeHtml(item.property?.label || 'Property')} · closes ${escapeHtml(date(item.closeDate))}</small></span><span class="invitation-meta">${pill(item.status, item.status)}<small>${item.status === 'pending' ? `Expires ${escapeHtml(date(item.expiresAt))}` : item.status === 'accepted' ? `Accepted ${escapeHtml(date(item.acceptedAt))}` : item.status === 'revoked' ? `Revoked ${escapeHtml(date(item.revokedAt))}` : ''}</small></span><span class="invitation-actions">${item.status === 'pending' ? `<button class="text-button" type="button" data-invitation-resend="${escapeHtml(item.id)}">Resend</button><button class="text-button danger" type="button" data-invitation-revoke="${escapeHtml(item.id)}">Revoke</button>` : ''}</span></article>`).join('');
    element.invitationEmpty.hidden = items.length > 0;
  }

  function filteredTransactions() {
    return state.portfolio.filter(transaction => {
      if (!matchesSearch(transaction)) return false;
      if (state.transactionFilter === 'risk') return isRisk(transaction);
      if (state.transactionFilter === 'ready') return readiness(transaction) === 100;
      if (state.transactionFilter === 'open') return openOrders(transaction).length > 0;
      return true;
    });
  }
  function renderTransactions() {
    const items = filteredTransactions();
    element.transactionList.innerHTML = items.map(transaction => { const open = openOrders(transaction).length; const ready = readiness(transaction); return `<button class="transaction-card" type="button" data-transaction-id="${escapeHtml(transaction.id)}"><span><h3>${escapeHtml(transaction.label)}</h3><p>${escapeHtml(transaction.client?.displayName || 'Client')} · ${escapeHtml(transaction.property?.address?.city || '')}</p></span><span class="transaction-stat"><span>Close date</span><strong>${escapeHtml(date(transaction.closeDate))}</strong></span><span class="transaction-stat"><span>Open items</span><strong>${open}</strong></span><span class="transaction-stat"><span>Readiness</span><strong>${ready}%</strong></span>${pill(isRisk(transaction) ? 'At risk' : ready === 100 ? 'Ready' : 'On track', isRisk(transaction) ? 'risk' : ready === 100 ? 'ready' : '')}</button>`; }).join('');
    element.transactionEmpty.hidden = items.length > 0;
    element.archivedTransactionList.innerHTML = state.archivedTransactions.length ? state.archivedTransactions.filter(matchesSearch).map(item => `<article class="archive-row"><span><strong>${escapeHtml(item.label)}</strong><small>Closed ${escapeHtml(date(item.closeDate))} · ${escapeHtml(statusName(item.status))}</small></span><span>${pill('Archived')}<small>Protected access unavailable</small></span></article>`).join('') : empty('No archived transactions', 'Expired and revoked transaction summaries will appear here.');
  }

  function renderRequests() {
    const currentValue = element.requestTransaction.value;
    element.requestTransaction.innerHTML = '<option value="">Select a transaction</option>' + state.portfolio.filter(transaction => transaction.capabilities?.canRequestService).map(transaction => `<option value="${escapeHtml(transaction.id)}">${escapeHtml(transaction.label)} · ${Math.max(0, Number(transaction.daysUntilClose))} days</option>`).join('');
    if ([...element.requestTransaction.options].some(option => option.value === currentValue)) element.requestTransaction.value = currentValue;
    const messageValue = state.selectedMessageOrder || element.messageOrder.value;
    element.messageOrder.innerHTML = '<option value="">Select an active work item</option>' + state.orders.filter(order => !cancelled(order)).map(order => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.service || 'Service')} · ${escapeHtml(order.requestReference || order.orderReference || '')}</option>`).join('');
    if ([...element.messageOrder.options].some(option => option.value === messageValue)) element.messageOrder.value = messageValue;
    syncRequestContext({ loadGuidance: false });
    const items = state.orders.filter(matchesSearch);
    element.requestList.innerHTML = items.length ? items.map(order => {
      const estimate = order.estimateStatus ? `Estimate: ${statusName(order.estimateStatus.decisionStatus || order.estimateStatus.status)}` : 'Estimate not available';
      const risk = order.deadlineRisk || { level: 'unknown', reason: 'Deadline assessment pending' };
      return `<div class="request-row"><span><strong>${escapeHtml(order.service || 'Service request')}</strong><small>${escapeHtml(transactionForProperty(order.propertyId)?.label || order.requestReference || '')} · ${escapeHtml(order.requestReference || order.orderReference || '')}</small><small>${escapeHtml(estimate)} · Read-only</small><small>${escapeHtml(risk.reason)}</small></span><span class="request-statuses">${pill(order.workflowStatus || order.status)}${pill(risk.level, ['critical', 'high'].includes(risk.level) ? 'risk' : risk.level === 'ready' ? 'ready' : 'pending')}</span></div>`;
    }).join('') : empty('No matching requests', 'New requests will enter the shared SMPLfix workflow.');
    renderMessages();
  }

  function renderMessages() {
    if (!state.selectedMessageOrder) { element.messageList.innerHTML = empty('Select a work item', 'Messages are scoped to one active order.'); element.messageBody.disabled = true; element.messageSubmit.disabled = true; return; }
    element.messageBody.disabled = false; element.messageSubmit.disabled = false;
    element.messageList.innerHTML = state.messages.length ? state.messages.map(item => `<article class="message-bubble ${item.sender === 'You' ? 'mine' : ''}"><strong>${escapeHtml(item.sender)}</strong><p>${escapeHtml(item.body)}</p><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(relative(item.createdAt))}</time></article>`).join('') : empty('No messages yet', 'Start a logged SMPLfix conversation for this work item.');
  }

  async function loadMessages() {
    state.selectedMessageOrder = element.messageOrder.value; state.messages = []; renderMessages();
    if (!state.selectedMessageOrder) return;
    element.messageList.innerHTML = '<div class="message-loading">Loading messages…</div>';
    try { state.messages = list(await window.APIService.getAgentMessages(state.selectedMessageOrder)); renderMessages(); }
    catch (error) { element.messageList.innerHTML = empty('Messages unavailable', error?.message || 'Try again.'); }
  }

  async function submitMessage(event) {
    event.preventDefault(); element.messageError.hidden = true; const body = element.messageBody.value.trim(); if (!state.selectedMessageOrder || !body) return;
    setBusy(element.messageSubmit, true, 'Sending…');
    try { const response = await window.APIService.sendAgentMessage(state.selectedMessageOrder, body); state.messages.push(response.message); element.messageBody.value = ''; renderMessages(); showToast('Message sent and logged to the order.'); }
    catch (error) { element.messageError.textContent = error?.message || 'Message could not be sent.'; element.messageError.hidden = false; }
    finally { setBusy(element.messageSubmit, false); }
  }

  async function loadTransactionPackage(transactionId, button) {
    setBusy(button, true, 'Preparing…');
    try { const payload = await window.APIService.getAgentTransactionPackage(transactionId); state.packages[transactionId] = payload.package; renderDocuments(); showToast('Client-safe transaction package is ready.'); }
    catch (error) { showToast(error?.message || 'The transaction package could not be prepared.'); }
    finally { setBusy(button, false); }
  }

  function phoenixInputDate(value) {
    const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(parsed);
    const get = type => parts.find(part => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function syncRequestContext(options = {}) {
    const transaction = state.portfolio.find(item => key(item.id) === key(element.requestTransaction.value));
    element.requestPropertySummary.textContent = transaction ? `${transaction.property?.label || transaction.label} · ${address(transaction.property)} · closes ${date(transaction.closeDate)}` : 'Select a transaction to confirm the authorized property.';
    const tomorrow = new Date(Date.now() + 86400000);
    element.requestDeadline.min = phoenixInputDate(tomorrow);
    element.requestDeadline.max = transaction ? phoenixInputDate(transaction.closeDate) : '';
    if (element.requestDeadline.value && element.requestDeadline.max && element.requestDeadline.value > element.requestDeadline.max) element.requestDeadline.value = '';
    if (options.loadGuidance !== false) loadRequestGuidance();
  }

  async function loadRequestGuidance() {
    const serial = ++guidanceRequest; const transactionId = element.requestTransaction.value; const serviceCategory = element.requestService.value;
    if (!transactionId || !serviceCategory) { element.requestGuidance.innerHTML = '<strong>Planning guidance</strong><p>Select a transaction and service category. Guidance appears only when backed by recorded SMPLfix data.</p>'; return; }
    element.requestGuidance.innerHTML = '<strong>Planning guidance</strong><p>Checking recorded estimates and client-facing availability…</p>';
    try {
      const payload = await window.APIService.getAgentRequestGuidance(transactionId, serviceCategory); if (serial !== guidanceRequest) return;
      const turnaround = payload.estimateTurnaround ? `Observed median estimate turnaround: ${payload.estimateTurnaround.medianHours} hours (${payload.estimateTurnaround.sampleSize} recorded ${payload.estimateTurnaround.sampleSize === 1 ? 'estimate' : 'estimates'}).` : 'No qualifying estimate-turnaround history is available.';
      const availability = payload.nextSchedulingAvailability ? `Next confirmed vendor availability: ${dateTime(payload.nextSchedulingAvailability.date)}. Not reserved; scheduling must be confirmed.` : 'No confirmed vendor calendar availability is recorded. Contact SMPLfix to confirm scheduling.';
      element.requestGuidance.innerHTML = `<strong>Planning guidance from SMPLfix records</strong><p>${escapeHtml(turnaround)} ${escapeHtml(availability)}</p>`;
    } catch (error) { if (serial === guidanceRequest) element.requestGuidance.innerHTML = `<strong>Planning guidance unavailable</strong><p>${escapeHtml(error?.message || 'Recorded data could not be loaded.')}</p>`; }
  }

  function updateRequestFiles() {
    const inspection = [...(element.requestInspection.files || [])]; const supporting = [...(element.requestSupporting.files || [])];
    const files = [...inspection, ...supporting];
    element.requestFileSummary.textContent = files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'} selected · originals retained in protected storage` : 'Up to 1 inspection report and 4 supporting files; 10 MB per file.';
  }

  function renderDocuments() {
    element.packageList.innerHTML = state.portfolio.filter(matchesSearch).map(transaction => {
      const pkg = state.packages[transaction.id];
      if (!pkg) return `<article class="package-card"><p class="eyebrow">Transaction file</p><h3>${escapeHtml(transaction.label)}</h3><p>Prepare a client-safe package of estimates, invoices, completion evidence, service notes, warranties, and authorized documents.</p><button class="secondary-button" type="button" data-package-load="${escapeHtml(transaction.id)}">Prepare package</button></article>`;
      return `<article class="package-card ready"><p class="eyebrow">${escapeHtml(pkg.packageReference)}</p><h3>${escapeHtml(transaction.label)}</h3><div class="package-counts"><span><strong>${pkg.summary.completedJobs}</strong> completions</span><span><strong>${pkg.summary.documents}</strong> files</span><span><strong>${pkg.summary.estimates}</strong> estimates</span><span><strong>${pkg.summary.invoices}</strong> invoices</span></div><div class="package-actions"><a class="primary-button" href="${escapeHtml(pkg.pdfUrl)}">Summary PDF</a><a class="primary-button" href="${escapeHtml(pkg.pdfUrl.replace(/package\.pdf$/, 'package.zip'))}">Download full ZIP</a><button class="text-button" type="button" data-package-load="${escapeHtml(transaction.id)}">Refresh</button></div></article>`;
    }).join('');
    const groups = state.portfolio.filter(matchesSearch).map(transaction => {
      const orderDocuments = ordersFor(transaction).flatMap(order => (order.documents || []).map(document => ({ ...document, source: order.service || 'Work item' })));
      const transactionDocuments = (transaction.documents || []).map(document => ({ ...document, source: 'Transaction file' }));
      return { transaction, documents: [...transactionDocuments, ...orderDocuments] };
    }).filter(group => group.documents.length);
    element.documentList.innerHTML = groups.map(group => `<section class="document-group"><h3>${escapeHtml(group.transaction.label)}</h3><p>${escapeHtml(group.transaction.client?.displayName || 'Client')} · closes ${escapeHtml(date(group.transaction.closeDate))}</p>${group.documents.map(document => `<div class="document-row"><span><strong>${escapeHtml(document.name)}</strong><small>${escapeHtml(document.source)} · ${escapeHtml(date(document.uploadedAt))}</small></span><a href="${escapeHtml(document.downloadUrl)}" target="_blank" rel="noopener">Open file</a></div>`).join('')}</section>`).join('');
    element.documentEmpty.hidden = groups.length > 0;
  }

  function renderReferrals() {
    element.referralMetrics.innerHTML = metric('Leads', state.referralTotals.leads || 0, 'Attributed transactions') + metric('Converted clients', state.referralTotals.convertedClients || 0, 'Clients with an order', 'is-success') + metric('Converted jobs', state.referralTotals.convertedJobs || 0, 'Orders attributed') + metric('Completed jobs', state.referralTotals.completedJobs || 0, 'Completed referred work');
    element.referralProgram.innerHTML = `<div><p class="eyebrow">Referral tracking</p><h3>Your SMPLfix referral code</h3><p>Invitations and completed work are attributed to your portfolio. No commission or payout is promised by this dashboard.</p></div><strong class="referral-code">${escapeHtml(state.referralCode || state.profile?.referralCode || 'Pending')}</strong>`;
    const items = state.referrals.filter(matchesSearch);
    element.referralList.innerHTML = items.length ? `<div class="table-row header"><span>Transaction</span><span>Jobs</span><span>Attributed</span><span>Status</span></div>${items.map(item => `<div class="table-row"><span><strong>${escapeHtml(item.transaction?.label || item.transactionId)}</strong><small>${item.transaction?.archived ? 'Archived summary · protected records unavailable' : escapeHtml(item.propertyLabel || 'Active transaction')}</small></span><span>${item.convertedJobCount || 0} converted · ${item.completedJobCount || 0} completed</span><span>${escapeHtml(date(item.attributedAt))}</span>${pill(item.status)}</div>`).join('')}` : empty('No referral history yet');
  }

  function renderNotifications() {
    const items = state.notifications.filter(matchesSearch);
    element.notificationList.innerHTML = items.map(item => `<button class="notification-item ${item.isRead ? '' : 'unread'}" type="button" data-notification-id="${escapeHtml(item.id)}"><span class="notification-dot" aria-hidden="true"></span><span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></span><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(relative(item.createdAt))}</time></button>`).join('');
    element.notificationEmpty.hidden = items.length > 0;
    element.notificationBadge.hidden = state.unreadCount < 1; element.notificationBadge.textContent = String(state.unreadCount);
  }

  function renderAccount() {
    const profile = state.profile || {};
    element.profileCard.innerHTML = `<span class="avatar" aria-hidden="true">${escapeHtml(initials(profile.displayName))}</span><div><p class="eyebrow">Active agent</p><h3>${escapeHtml(profile.displayName || 'Real estate agent')}</h3><p>${escapeHtml(profile.brokerageName || 'Independent agent')}</p></div><div class="profile-facts"><div class="profile-fact"><span>Email</span><strong>${escapeHtml(profile.email || 'Not available')}</strong></div><div class="profile-fact"><span>License</span><strong>${escapeHtml(profile.licenseNumber || 'Not provided')}</strong></div><div class="profile-fact"><span>Referral code</span><strong>${escapeHtml(profile.referralCode || 'Pending')}</strong></div></div>`;
    element.profileFirstName.value = profile.firstName || '';
    element.profileLastName.value = profile.lastName || '';
    element.profileEmail.value = profile.email || '';
    element.profilePhone.value = profile.phone || '';
    element.profileBrokerage.value = profile.brokerageName || '';
    element.profileLicense.value = profile.licenseNumber || '';
    element.profileReferralCode.value = profile.referralCode || 'Pending';
    const complete = profile.profileCompletion?.complete === true;
    element.profileCompletionBadge.textContent = complete ? 'Complete' : 'Incomplete';
    element.profileCompletionBadge.className = `status-pill ${complete ? 'ready' : 'pending'}`;
  }

  function renderProfileAttention() {
    const completion = state.profile?.profileCompletion || { complete: false, missingFields: [] };
    element.profileAttention.hidden = completion.complete === true;
    if (completion.complete) return;
    const labels = { firstName: 'first name', lastName: 'last name', phone: 'phone', brokerageName: 'brokerage', licenseNumber: 'license number' };
    const missing = (completion.missingFields || []).map(field => labels[field]).filter(Boolean);
    element.profileAttentionMessage.textContent = missing.length ? `Missing: ${missing.join(', ')}.` : 'Add your contact, brokerage, and license details to finish setting up your account.';
  }

  function renderAccessState() {
    if (state.portfolio.length) { element.expired.hidden = true; return; }
    const pending = state.invitations.filter(item => item.status === 'pending');
    element.expired.hidden = false;
    if (pending.length) {
      element.accessStateEyebrow.textContent = 'Invitation pending';
      element.accessStateTitle.textContent = 'Waiting for homeowner acceptance';
      element.accessStateMessage.textContent = `${pending.length} secure invitation${pending.length === 1 ? ' is' : 's are'} awaiting review. You can resend or revoke it from Portfolio.`;
      element.accessStateInvite.textContent = 'View invitations';
      element.accessStateInvite.dataset.action = 'portfolio';
    } else if (state.archivedTransactions.length) {
      element.accessStateEyebrow.textContent = 'Portfolio status';
      element.accessStateTitle.textContent = 'No active transaction access';
      element.accessStateMessage.textContent = 'Previous transaction access has ended. Invite a homeowner to start another property transaction, or contact SMPLfix about an extension.';
      element.accessStateInvite.textContent = 'Invite a homeowner';
      element.accessStateInvite.dataset.action = 'invite';
    } else {
      element.accessStateEyebrow.textContent = 'Getting started';
      element.accessStateTitle.textContent = 'Build your first client portfolio';
      element.accessStateMessage.textContent = 'Invite a homeowner to connect their property and closing transaction. They stay in control of estimates and payments.';
      element.accessStateInvite.textContent = 'Invite a homeowner';
      element.accessStateInvite.dataset.action = 'invite';
    }
  }

  function renderAll() { renderAccessState(); renderProfileAttention(); renderOverview(); renderPortfolio(); renderTransactions(); renderRequests(); renderDocuments(); renderReferrals(); renderNotifications(); renderAccount(); }

  async function saveAgentProfile(event) {
    event.preventDefault(); element.profileFormError.hidden = true; setBusy(element.profileSaveButton, true, 'Saving…');
    try {
      const response = await window.APIService.updateAgentProfile({ firstName: element.profileFirstName.value, lastName: element.profileLastName.value, phone: element.profilePhone.value, brokerageName: element.profileBrokerage.value, licenseNumber: element.profileLicense.value });
      state.profile = response.agent || state.profile;
      element.sidebarAgentName.textContent = state.profile.displayName || 'Agent'; element.sidebarBrokerage.textContent = state.profile.brokerageName || 'Real estate portal'; element.agentAvatar.textContent = initials(state.profile.displayName); element.welcomeName.textContent = String(state.profile.displayName || 'Agent').split(/\s+/)[0];
      renderProfileAttention(); renderAccount(); showToast('Agent profile saved.');
    } catch (error) { element.profileFormError.textContent = error?.message || 'Could not save your profile.'; element.profileFormError.hidden = false; }
    finally { setBusy(element.profileSaveButton, false); }
  }

  function setPropertyMode() {
    const existing = element.invitePropertyMode.value === 'existing';
    element.inviteExistingField.hidden = !existing;
    element.invitePropertyFields.hidden = existing;
    element.inviteExistingProperty.required = existing;
    [element.inviteAddress, element.inviteCity, element.inviteState, element.invitePostal].forEach(input => { input.required = !existing; });
  }

  function openInviteDialog() {
    element.inviteForm.reset(); element.inviteView.checked = true; element.inviteState.value = 'AZ'; element.inviteError.hidden = true;
    const tomorrow = new Date(Date.now() + 86400000); element.inviteCloseDate.min = tomorrow.toISOString().slice(0, 10);
    element.inviteExistingProperty.innerHTML = '<option value="">Select a property</option>' + state.invitationProperties.map(property => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.label)} · ${escapeHtml(address(property))}</option>`).join('');
    element.invitePropertyMode.querySelector('option[value="existing"]').disabled = !state.invitationProperties.length;
    setPropertyMode(); element.inviteDialog.showModal(); element.inviteEmail.focus();
  }

  async function copyInviteLink(url) {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); return true; }
    const input = document.createElement('textarea'); input.value = url; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0'; document.body.appendChild(input); input.select(); const copied = document.execCommand('copy'); input.remove(); return copied;
  }

  async function submitInvitation(event) {
    event.preventDefault(); element.inviteError.hidden = true; setBusy(element.inviteSubmit, true, 'Creating…');
    const existing = element.invitePropertyMode.value === 'existing';
    const payload = {
      homeownerName: element.inviteName.value, homeownerEmail: element.inviteEmail.value,
      transactionLabel: element.inviteTransactionLabel.value, closeDate: element.inviteCloseDate.value,
      existingPropertyId: existing ? element.inviteExistingProperty.value : undefined,
      property: existing ? undefined : { label: element.invitePropertyLabel.value, addressLine1: element.inviteAddress.value, city: element.inviteCity.value, state: element.inviteState.value, postalCode: element.invitePostal.value, propertyType: element.invitePropertyType.value },
      permissions: { viewStatus: true, requestService: element.inviteRequest.checked, viewDocuments: element.inviteDocuments.checked, uploadInspection: element.inviteUpload.checked, message: element.inviteMessage.checked },
      delivery: element.inviteDelivery.value
    };
    try {
      const response = await window.APIService.createAgentClientInvitation(payload);
      if (response.inviteUrl && element.inviteDelivery.value === 'copy') await copyInviteLink(response.inviteUrl);
      element.inviteDialog.close(); showToast(element.inviteDelivery.value === 'copy' ? 'Secure invitation link copied.' : 'Secure invitation sent.');
      await loadPortal({ preserveRoute: true });
    } catch (error) { element.inviteError.textContent = error?.message || 'Could not create this invitation.'; element.inviteError.hidden = false; }
    finally { setBusy(element.inviteSubmit, false); }
  }

  async function resendInvitation(id, button) {
    setBusy(button, true, 'Sending…');
    try { await window.APIService.resendAgentClientInvitation(id); showToast('A fresh secure link was emailed. The previous link no longer works.'); await loadPortal({ preserveRoute: true }); }
    catch (error) { showToast(error?.message || 'Could not resend the invitation.'); }
    finally { setBusy(button, false); }
  }

  async function revokeInvitation(id, button) {
    setBusy(button, true, 'Revoking…');
    try { await window.APIService.revokeAgentClientInvitation(id, 'Revoked by the inviting agent from the portal'); showToast('Invitation revoked. Its link can no longer be used.'); await loadPortal({ preserveRoute: true }); }
    catch (error) { showToast(error?.message || 'Could not revoke the invitation.'); }
    finally { setBusy(button, false); }
  }

  function navigate(route, options = {}) {
    const next = route === 'transaction-detail' ? route : ROUTES.has(route) ? route : 'overview'; state.route = next;
    document.querySelectorAll('[data-view]').forEach(view => { const active = view.dataset.view === next; view.hidden = !active; view.classList.toggle('is-active', active); });
    document.querySelectorAll('[data-route]').forEach(link => { const active = link.dataset.route === next; link.classList.toggle('is-active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    element.routeTitle.textContent = TITLES[next];
    if (!options.skipHash && next !== 'transaction-detail' && location.hash !== `#${next}`) history.replaceState(null, '', `#${next}`);
    closeSidebar();
    if (options.focus !== false) element.main.focus({ preventScroll: true });
  }

  function openSidebar() { element.sidebar.classList.add('is-open'); element.scrim.hidden = false; element.menuButton.setAttribute('aria-expanded', 'true'); element.sidebarClose.focus(); }
  function closeSidebar() { element.sidebar.classList.remove('is-open'); element.scrim.hidden = true; element.menuButton.setAttribute('aria-expanded', 'false'); }

  async function showTransaction(transactionId) {
    const cached = state.portfolio.find(item => key(item.id) === key(transactionId)); if (!cached) return;
    state.workspaceTransactionId = transactionId; state.workspace = null;
    if (location.hash !== `#transactions/${transactionId}`) history.pushState({ transactionId }, '', `#transactions/${transactionId}`);
    navigate('transaction-detail', { skipHash: true });
    element.routeTitle.textContent = cached.label;
    element.transactionWorkspace.innerHTML = '<div class="state-panel"><span class="spinner" aria-hidden="true"></span><strong>Loading transaction workspace</strong><p>Collecting work, messages, documents, and onboarding status.</p></div>';
    try {
      const payload = await window.APIService.getAgentTransactionWorkspace(transactionId);
      state.workspace = payload.workspace; renderTransactionWorkspace();
    } catch (error) {
      const expired = error?.status === 404 || error?.status === 403;
      element.transactionWorkspace.innerHTML = empty(expired ? 'Access is no longer available' : 'Could not load this transaction', expired ? 'The transaction may have closed, expired, or been revoked.' : (error?.message || 'Try again.'));
    }
  }

  function renderTransactionWorkspace() {
    const workspace = state.workspace; if (!workspace) return;
    const transaction = workspace.transaction || {}; const work = workspace.workItems || []; const onboarding = workspace.onboarding || { steps: [] }; const docs = workspace.documents || {};
    const percent = workspace.readiness?.percent ?? (work.length ? 0 : 100);
    const messagesByOrder = new Map(); (workspace.messages || []).forEach(message => { if (!messagesByOrder.has(message.orderId)) messagesByOrder.set(message.orderId, []); messagesByOrder.get(message.orderId).push(message); });
    const workHtml = work.length ? work.map(order => `<article class="workspace-work-card"><div><p class="eyebrow">${escapeHtml(order.requestReference || order.orderReference || 'Work item')}</p><h3>${escapeHtml(order.service || 'Service')}</h3><p>${escapeHtml(order.description || '')}</p><small>${escapeHtml(order.deadlineRisk?.reason || 'Deadline assessment pending')}</small></div><div class="workspace-work-meta">${pill(order.deadlineRisk?.level || order.workflowStatus || order.status, ['critical','high'].includes(order.deadlineRisk?.level) ? 'risk' : '')}<span>${order.scheduledStart ? escapeHtml(dateTime(order.scheduledStart)) : 'Schedule not confirmed'}</span><span>${order.estimateStatus ? `Estimate ${escapeHtml(statusName(order.estimateStatus.decisionStatus || order.estimateStatus.status))}` : 'Estimate not available'}</span></div></article>`).join('') : empty('No work requested', 'Start a service request for this transaction when the property needs attention.');
    const messagesHtml = work.length ? work.map(order => { const messages = messagesByOrder.get(order.id) || []; return `<section class="workspace-message-thread"><div class="panel-heading"><div><p class="eyebrow">${escapeHtml(order.requestReference || order.orderReference || '')}</p><h3>${escapeHtml(order.service || 'Work item')}</h3></div></div><div class="message-list">${messages.length ? messages.map(message => `<div class="message-bubble ${message.sender === 'You' ? 'mine' : ''}"><strong>${escapeHtml(message.sender)}</strong><p>${escapeHtml(message.body)}</p><time>${escapeHtml(dateTime(message.createdAt))}</time></div>`).join('') : empty('No messages yet')}</div>${workspace.capabilities?.canMessage ? `<form class="message-form" data-workspace-message-form="${escapeHtml(order.id)}"><label class="visually-hidden">Message about ${escapeHtml(order.service || 'work item')}</label><textarea name="body" maxlength="3000" rows="2" required placeholder="Message the homeowner through SMPLfix"></textarea><button class="secondary-button" type="submit">Send message</button></form>` : ''}</section>`; }).join('') : empty('No work-item conversations');
    const files = [...(docs.files || []), ...(docs.estimates || []).map(item => ({ name: `${item.quoteReference} estimate`, category: 'Estimate', downloadUrl: item.pdfUrl })), ...(docs.invoices || []).map(item => ({ name: `${item.invoiceNumber} invoice`, category: item.contractor?.name ? `${item.contractor.name}${item.contractor.rocNumber ? ` · ROC ${item.contractor.rocNumber}` : ''}` : 'Invoice', downloadUrl: item.pdfUrl }))];
    const documentsHtml = files.length ? files.map(file => `<div class="document-row"><span><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.category || 'Transaction document')}</small></span><a href="${escapeHtml(file.downloadUrl)}" target="_blank" rel="noopener">Open file</a></div>`).join('') : empty('No authorized documents yet');
    element.transactionWorkspace.innerHTML = `<div class="workspace-hero"><div><p class="eyebrow">Transaction command center</p><h2 id="transactionWorkspaceHeading">${escapeHtml(transaction.label)}</h2><p>${escapeHtml(transaction.client?.displayName || 'Homeowner')} · ${escapeHtml(address(transaction.property))}</p></div><button class="primary-button" type="button" data-workspace-request="${escapeHtml(transaction.id)}" ${workspace.capabilities?.canRequestService ? '' : 'disabled'}>Request service</button></div><div class="detail-hero"><div class="detail-stat"><span>Close date</span><strong>${escapeHtml(date(transaction.closeDate))}</strong></div><div class="detail-stat"><span>Time remaining</span><strong>${Math.max(0, Number(transaction.daysUntilClose || 0))} days</strong></div><div class="detail-stat"><span>Access ends</span><strong>${escapeHtml(date(transaction.accessEndsAt))}</strong></div></div><div class="readiness"><div class="readiness-header"><span>${escapeHtml(workspace.readiness?.label || 'Completion readiness')}</span><strong>${percent}%</strong></div><div class="progress-track" aria-label="${percent}% complete"><span style="width:${percent}%"></span></div>${workspace.deadlineRisk?.reason ? `<p class="workspace-risk">${escapeHtml(workspace.deadlineRisk.reason)}</p>` : ''}</div><nav class="workspace-tabs" aria-label="Transaction workspace"><button type="button" class="is-active" data-workspace-tab="work">Work</button><button type="button" data-workspace-tab="messages">Messages</button><button type="button" data-workspace-tab="documents">Documents</button><button type="button" data-workspace-tab="onboarding">Onboarding</button></nav><section class="workspace-tab is-active" data-workspace-panel="work">${workHtml}</section><section class="workspace-tab" data-workspace-panel="messages" hidden>${messagesHtml}</section><section class="workspace-tab" data-workspace-panel="documents" hidden><article class="package-card ${workspace.package?.ready ? 'ready' : ''}"><p class="eyebrow">Transaction package</p><h3>${workspace.package?.ready ? 'Client-safe package ready' : 'Package is still being prepared'}</h3><p>${workspace.package?.ready ? 'All non-cancelled work and required completion records are available.' : 'The package becomes available after all work and required closeout documents are complete.'}</p>${workspace.package?.ready ? `<div class="package-actions"><a class="primary-button" href="${escapeHtml(workspace.package.pdfUrl)}">Summary PDF</a><a class="secondary-button" href="${escapeHtml(workspace.package.zipUrl)}">Full ZIP</a></div>` : ''}</article><section class="panel"><div class="panel-heading"><h3>Authorized files</h3></div>${documentsHtml}</section></section><section class="workspace-tab" data-workspace-panel="onboarding" hidden><section class="panel"><div class="panel-heading"><div><p class="eyebrow">White-glove onboarding</p><h3>Homeowner readiness</h3><p>${onboarding.completedCount || 0} of ${onboarding.totalCount || 0} steps complete. Private account and payment details remain hidden.</p></div>${onboarding.reminderAvailable ? '<button class="secondary-button" type="button" id="workspaceReminder">Send reminder</button>' : ''}</div><div class="onboarding-list">${(onboarding.steps || []).map(step => `<div class="onboarding-step ${step.complete ? 'complete' : ''}"><span aria-hidden="true">${step.complete ? '✓' : '○'}</span><strong>${escapeHtml(step.label)}</strong>${!step.complete && step.actionable ? '<small>Homeowner action needed</small>' : ''}</div>`).join('')}</div></section></section>`;
  }

  async function submitRequest(event) {
    event.preventDefault(); element.requestError.hidden = true;
    const transactionId = element.requestTransaction.value;
    if (!transactionId) return;
    const files = [...(element.requestInspection.files || []), ...(element.requestSupporting.files || [])];
    if (files.some(file => file.size > 10 * 1024 * 1024)) { element.requestError.textContent = 'Each file must be 10 MB or smaller.'; element.requestError.hidden = false; return; }
    setBusy(element.requestSubmit, true, 'Submitting…');
    try {
      const formData = new FormData(element.requestForm);
      await window.APIService.createAgentRequest(transactionId, formData, newKey());
      element.requestForm.reset(); updateRequestFiles(); syncRequestContext(); showToast('Service request submitted. The homeowner retains approval and payment control.'); await loadPortal({ preserveRoute: true });
    } catch (error) { element.requestError.textContent = error?.message || 'We could not submit this request.'; element.requestError.hidden = false; }
    finally { setBusy(element.requestSubmit, false); }
  }

  async function markNotificationRead(id) {
    const item = state.notifications.find(notification => key(notification.id) === key(id));
    try {
      if (item && !item.isRead) {
        await window.APIService.readAgentNotification(id);
        item.isRead = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
        renderNotifications();
      }
      const transactionMatch = String(item?.actionUrl || '').match(/^#transactions\/([^/?#]+)$/);
      if (transactionMatch) await showTransaction(decodeURIComponent(transactionMatch[1]));
      else if (item?.actionUrl === '#transactions') navigate('transactions');
    } catch (error) { showToast(error?.message || 'Could not update the notification.'); }
  }

  async function acceptInvitationFromFragment() {
    const params = new URLSearchParams(location.hash.slice(1)); const token = params.get('invitation');
    if (!token) return false;
    await window.APIService.acceptAgentInvitation(token);
    history.replaceState(null, '', '#overview'); showToast('Invitation accepted. The property is now in your portfolio.'); return true;
  }

  async function loadPortal(options = {}) {
    element.loading.hidden = false; element.error.hidden = true; element.content.hidden = true; element.expired.hidden = true;
    try {
      await window.AuthReady;
      if (window.AuthSession?.user?.role !== 'real_estate_agent') throw Object.assign(new Error('This portal is available to real estate agents only.'), { status: 403 });
      await acceptInvitationFromFragment();
      const [profilePayload, overviewPayload, portfolioPayload, historyPayload, orderPayload, activityPayload, referralPayload, notificationPayload, invitationPayload, invitationPropertyPayload] = await Promise.all([
        window.APIService.getAgentProfile(), window.APIService.getAgentOverview(), window.APIService.getAgentPortfolio(), window.APIService.getAgentTransactionHistory(), window.APIService.getAgentOrders(), window.APIService.getAgentActivity(), window.APIService.getAgentReferrals(), window.APIService.getAgentNotifications(), window.APIService.getAgentClientInvitations(), window.APIService.getAgentClientInvitationProperties()
      ]);
      state.profile = profilePayload.agent || {}; state.overview = overviewPayload; state.portfolio = list(portfolioPayload); state.archivedTransactions = list(historyPayload); state.orders = list(orderPayload); state.activity = list(activityPayload); state.referrals = list(referralPayload); state.referralTotals = referralPayload.totals || {}; state.referralCode = referralPayload.referralCode || state.profile.referralCode || ''; state.notifications = list(notificationPayload); state.invitations = list(invitationPayload); state.invitationProperties = list(invitationPropertyPayload); state.unreadCount = Number(overviewPayload.unreadNotificationCount ?? notificationPayload.unreadCount ?? 0);
      element.sidebarAgentName.textContent = state.profile.displayName || 'Agent'; element.sidebarBrokerage.textContent = state.profile.brokerageName || 'Real estate portal'; element.agentAvatar.textContent = initials(state.profile.displayName); element.welcomeName.textContent = String(state.profile.displayName || 'Agent').split(/\s+/)[0];
      renderAll(); scheduleOverviewRefresh(); element.loading.hidden = true; element.content.hidden = false;
      const hashRoute = location.hash.slice(1); const transactionMatch = hashRoute.match(/^transactions\/([a-f0-9]{24})$/i);
      const initial = options.preserveRoute ? state.route : (transactionMatch ? 'transaction-detail' : ROUTES.has(hashRoute) ? hashRoute : 'overview');
      navigate(initial, { skipHash: transactionMatch || initial === 'transaction-detail', focus: false });
      if (transactionMatch) await showTransaction(transactionMatch[1]);
    } catch (error) {
      element.loading.hidden = true; element.error.hidden = false; element.portalErrorMessage.textContent = error?.status === 403 ? 'Your signed-in account does not have access to the Real Estate Agent Portal.' : (error?.message || 'Try again in a moment.');
    }
  }

  function bind() {
    ['offlineBanner', 'agentSidebar', 'sidebarScrim', 'menuButton', 'sidebarClose', 'agentMain', 'portalLoading', 'portalError', 'portalErrorMessage', 'expiredState', 'accessStateEyebrow', 'accessStateTitle', 'accessStateMessage', 'accessStateInvite', 'profileAttention', 'profileAttentionMessage', 'portalContent', 'routeTitle', 'globalSearch', 'notificationBadge', 'overviewMetrics', 'overviewUpdated', 'overviewRefresh', 'overviewStale', 'priorityList', 'closingSoonList', 'appointmentList', 'openItemsList', 'activityList', 'portfolioList', 'portfolioEmpty', 'invitationFilter', 'invitationList', 'invitationEmpty', 'openInviteButton', 'inviteDialog', 'closeInviteDialog', 'cancelInviteButton', 'inviteForm', 'inviteName', 'inviteEmail', 'invitePropertyMode', 'inviteExistingField', 'inviteExistingProperty', 'invitePropertyFields', 'invitePropertyLabel', 'inviteAddress', 'inviteCity', 'inviteState', 'invitePostal', 'invitePropertyType', 'inviteTransactionLabel', 'inviteCloseDate', 'inviteView', 'inviteRequest', 'inviteDocuments', 'inviteUpload', 'inviteMessage', 'inviteDelivery', 'inviteError', 'inviteSubmit', 'transactionFilter', 'transactionList', 'transactionEmpty', 'archivedTransactionList', 'transactionWorkspaceBack', 'transactionWorkspace', 'requestForm', 'requestTransaction', 'requestPropertySummary', 'requestService', 'requestDescription', 'requestUrgency', 'requestDeadline', 'requestTiming', 'requestAccess', 'requestInspection', 'requestSupporting', 'requestFileSummary', 'requestGuidance', 'requestError', 'requestSubmit', 'requestList', 'messageOrder', 'messageList', 'messageForm', 'messageBody', 'messageError', 'messageSubmit', 'packageList', 'documentList', 'documentEmpty', 'referralMetrics', 'referralProgram', 'referralList', 'notificationList', 'notificationEmpty', 'profileCard', 'agentProfileForm', 'profileFirstName', 'profileLastName', 'profileEmail', 'profilePhone', 'profileBrokerage', 'profileLicense', 'profileReferralCode', 'profileRole', 'profileCompletionBadge', 'profileFormError', 'profileSaveButton', 'retryButton', 'logoutButton', 'toast', 'sidebarAgentName', 'sidebarBrokerage', 'agentAvatar', 'welcomeName'].forEach(id => { element[id.replace(/^agentMain$/, 'main').replace(/^agentSidebar$/, 'sidebar').replace(/^sidebarScrim$/, 'scrim').replace(/^portalLoading$/, 'loading').replace(/^portalError$/, 'error').replace(/^portalContent$/, 'content').replace(/^expiredState$/, 'expired')] = byId(id); });
    document.querySelectorAll('[data-route]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); navigate(link.dataset.route); }));
    document.querySelectorAll('[data-route-button]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.routeButton)));
    element.menuButton.addEventListener('click', openSidebar); element.sidebarClose.addEventListener('click', closeSidebar); element.scrim.addEventListener('click', closeSidebar);
    element.globalSearch.addEventListener('input', () => { state.query = element.globalSearch.value.trim().toLowerCase(); renderAll(); });
    element.profileAttention.addEventListener('click', () => navigate('account')); element.agentProfileForm.addEventListener('submit', saveAgentProfile);
    element.overviewRefresh.addEventListener('click', () => refreshOverview({ manual: true }).catch(error => showToast(error?.message || 'Could not refresh the overview.')));
    element.transactionFilter.addEventListener('change', () => { state.transactionFilter = element.transactionFilter.value; renderTransactions(); });
    element.invitationFilter.addEventListener('change', () => { state.invitationFilter = element.invitationFilter.value; renderInvitations(); });
    element.openInviteButton.addEventListener('click', openInviteDialog); element.accessStateInvite.addEventListener('click', () => { if (element.accessStateInvite.dataset.action === 'portfolio') navigate('portfolio'); else openInviteDialog(); }); element.closeInviteDialog.addEventListener('click', () => element.inviteDialog.close()); element.cancelInviteButton.addEventListener('click', () => element.inviteDialog.close());
    element.invitePropertyMode.addEventListener('change', setPropertyMode); element.inviteForm.addEventListener('submit', submitInvitation);
    element.requestForm.addEventListener('submit', submitRequest); element.requestTransaction.addEventListener('change', syncRequestContext); element.requestService.addEventListener('change', loadRequestGuidance); element.requestInspection.addEventListener('change', updateRequestFiles); element.requestSupporting.addEventListener('change', updateRequestFiles); element.messageOrder.addEventListener('change', loadMessages); element.messageForm.addEventListener('submit', submitMessage); element.retryButton.addEventListener('click', () => loadPortal({ preserveRoute: true }));
    document.addEventListener('click', async event => { const metricRoute = event.target.closest('[data-metric-route]'); if (metricRoute) navigate(metricRoute.dataset.metricRoute); const overviewAction = event.target.closest('[data-overview-kind]'); if (overviewAction) { if (overviewAction.dataset.overviewKind === 'transaction' && overviewAction.dataset.overviewTransaction) showTransaction(overviewAction.dataset.overviewTransaction); else { navigate('requests'); if (overviewAction.dataset.overviewOrder) { element.messageOrder.value = overviewAction.dataset.overviewOrder; loadMessages(); } } } const transaction = event.target.closest('[data-transaction-id]'); if (transaction) showTransaction(transaction.dataset.transactionId); const notification = event.target.closest('[data-notification-id]'); if (notification) markNotificationRead(notification.dataset.notificationId); const resend = event.target.closest('[data-invitation-resend]'); if (resend) resendInvitation(resend.dataset.invitationResend, resend); const revoke = event.target.closest('[data-invitation-revoke]'); if (revoke) revokeInvitation(revoke.dataset.invitationRevoke, revoke); const packageButton = event.target.closest('[data-package-load]'); if (packageButton) loadTransactionPackage(packageButton.dataset.packageLoad, packageButton); const tab = event.target.closest('[data-workspace-tab]'); if (tab) { document.querySelectorAll('[data-workspace-tab]').forEach(item => item.classList.toggle('is-active', item === tab)); document.querySelectorAll('[data-workspace-panel]').forEach(panel => { const active = panel.dataset.workspacePanel === tab.dataset.workspaceTab; panel.hidden = !active; panel.classList.toggle('is-active', active); }); } const request = event.target.closest('[data-workspace-request]'); if (request) { navigate('requests'); element.requestTransaction.value = request.dataset.workspaceRequest; syncRequestContext(); } if (event.target.id === 'workspaceReminder') { setBusy(event.target, true, 'Sending…'); try { await window.APIService.remindAgentTransactionHomeowner(state.workspaceTransactionId); showToast('Homeowner reminder sent.'); } catch (error) { showToast(error?.message || 'Could not send the reminder.'); } finally { setBusy(event.target, false); } } });
    document.addEventListener('submit', async event => { const form = event.target.closest('[data-workspace-message-form]'); if (!form) return; event.preventDefault(); const button = form.querySelector('button'); setBusy(button, true, 'Sending…'); try { await window.APIService.sendAgentMessage(form.dataset.workspaceMessageForm, form.elements.body.value); await showTransaction(state.workspaceTransactionId); showToast('Message sent and logged to the work item.'); } catch (error) { showToast(error?.message || 'Could not send the message.'); } finally { if (button?.isConnected) setBusy(button, false); } });
    element.transactionWorkspaceBack.addEventListener('click', () => { state.workspace = null; state.workspaceTransactionId = ''; navigate('transactions'); });
    element.inviteDialog.addEventListener('click', event => { if (event.target === element.inviteDialog) element.inviteDialog.close(); });
    element.logoutButton.addEventListener('click', async () => { try { await window.APIService.logout(); } finally { window.location.replace('/pages/login.html'); } });
    window.addEventListener('hashchange', () => { const route = location.hash.slice(1); const match = route.match(/^transactions\/([a-f0-9]{24})$/i); if (match) showTransaction(match[1]); else if (ROUTES.has(route)) navigate(route, { skipHash: true }); });
    window.addEventListener('online', () => { setOffline(false); loadPortal({ preserveRoute: true }); }); window.addEventListener('offline', () => setOffline(true)); setOffline(!navigator.onLine);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(overviewTimer); else refreshOverview().catch(() => {}); });
    const hour = new Date().getHours(); byId('dayPeriod').textContent = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  }

  document.addEventListener('DOMContentLoaded', () => { bind(); loadPortal(); });
  window.AgentPortal = { state, loadPortal, navigate, __test: { completed, escapeHtml, isRisk, normalize, readiness } };
})();
