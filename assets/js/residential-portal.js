(function residentialPortalApp() {
  'use strict';

  const state = {
    user: null,
    properties: [],
    orders: [],
    estimates: [],
    schedules: [],
    invoices: [],
    activity: [],
    currentPropertyId: null,
    route: 'home',
    requestMode: 'standard',
    requestSubmissionKey: null,
    orderAction: null,
    currentEstimateId: null,
    billing: null
  };

  const elements = {};
  let toastTimer = null;

  function byId(id) { return document.getElementById(id); }
  function list(payload) { return Array.isArray(payload?.data) ? payload.data : []; }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }
  function safeId(value) { return String(value || ''); }
  function normalizeStatus(value) { return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-'); }
  function titleCase(value) {
    return String(value || 'Pending').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }
  function money(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'Pending';
  }
  function date(value, options = {}) {
    if (!value) return 'Date pending';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Date pending';
    return parsed.toLocaleDateString('en-US', {
      timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: options.year ? 'numeric' : undefined
    });
  }
  function dateTime(value) {
    if (!value) return 'Schedule pending';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Schedule pending';
    return parsed.toLocaleString('en-US', {
      timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }
  function relativeTime(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const seconds = Math.round((parsed.getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const units = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (const [size, unit] of units) {
      if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
    }
    return 'just now';
  }
  function address(property) {
    const item = property?.address || {};
    return [item.line1, item.line2, item.city, item.state, item.postalCode].filter(Boolean).join(', ') || 'Address unavailable';
  }
  function currentProperty() { return state.properties.find(property => safeId(property.id) === safeId(state.currentPropertyId)) || null; }
  function propertyOrders(propertyId = state.currentPropertyId) {
    return state.orders.filter(order => safeId(order.propertyId) === safeId(propertyId));
  }
  function orderById(orderId) { return state.orders.find(order => safeId(order.id) === safeId(orderId)); }
  function isCompleted(order) {
    return ['completed', 'paid', 'closed'].includes(normalizeStatus(order.workflowStatus))
      || ['completed', 'paid', 'closed'].includes(normalizeStatus(order.status));
  }
  function isCancelled(order) {
    return /cancel|lost|void/.test(`${normalizeStatus(order.workflowStatus)} ${normalizeStatus(order.status)}`);
  }
  function activeOrders() { return propertyOrders().filter(order => !isCompleted(order) && !isCancelled(order)); }
  function currentEstimates() {
    const allowedOrderIds = new Set(propertyOrders().map(order => safeId(order.id)));
    return state.estimates.filter(estimate => allowedOrderIds.has(safeId(estimate.orderId)));
  }
  function actionEstimates() {
    return currentEstimates().filter(estimate => ['pending', 'not-requested', ''].includes(normalizeStatus(estimate.decisionStatus)));
  }
  function currentSchedules() {
    const allowedOrderIds = new Set(propertyOrders().map(order => safeId(order.id)));
    return state.schedules.filter(schedule => allowedOrderIds.has(safeId(schedule.orderId)));
  }
  function newIdempotencyKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `portal-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
  function canRequestAt(propertyId = state.currentPropertyId) {
    const property = state.properties.find(item => safeId(item.id) === safeId(propertyId));
    return property?.permissions?.requestService === true;
  }

  function setButtonBusy(button, busy, label = 'Working…') {
    if (!button) return;
    if (busy) button.dataset.originalLabel = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? label : (button.dataset.originalLabel || button.textContent);
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
  }

  function populateRequestProperties() {
    elements.requestProperty.innerHTML = state.properties.map(property =>
      `<option value="${escapeHtml(property.id)}"${canRequestAt(property.id) ? '' : ' disabled'}>${escapeHtml(property.label || property.address?.line1 || 'Property')}</option>`
    ).join('');
    elements.requestProperty.value = canRequestAt() ? state.currentPropertyId : safeId(state.properties.find(property => canRequestAt(property.id))?.id);
  }

  function openRequestDialog(mode = 'standard') {
    if (!state.properties.some(property => canRequestAt(property.id))) {
      showToast('No connected property currently allows service requests.');
      return;
    }
    state.requestMode = mode === 'emergency' ? 'emergency' : 'standard';
    state.requestSubmissionKey = newIdempotencyKey();
    elements.requestForm.reset();
    populateRequestProperties();
    const emergency = state.requestMode === 'emergency';
    elements.requestDialog.classList.toggle('is-emergency', emergency);
    elements.requestDialogEyebrow.textContent = emergency ? 'Priority assistance' : 'New service request';
    elements.requestDialogTitle.textContent = emergency ? 'Request emergency service' : 'What can we fix?';
    elements.requestDialogDescription.textContent = emergency
      ? 'Tell us what happened. We’ll review it with priority, but submission does not guarantee emergency dispatch.'
      : 'Tell us what you need and when works best.';
    elements.urgencyField.hidden = emergency;
    elements.requestUrgency.disabled = emergency;
    elements.emergencyAcknowledgement.hidden = !emergency;
    elements.emergencyAcknowledgement.querySelector('input').required = emergency;
    elements.requestFormError.hidden = true;
    elements.fileSummary.textContent = 'No files selected';
    elements.submitRequestButton.textContent = emergency ? 'Submit priority request' : 'Submit request';
    elements.requestDialog.showModal();
    elements.requestProperty.focus();
  }

  function validateSelectedFiles(files) {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    if (files.length > 5) return 'Upload no more than 5 files.';
    if ([...files].some(file => !allowed.has(file.type))) return 'Only PDF, JPG, PNG, and WebP files are allowed.';
    if ([...files].some(file => file.size > 10 * 1024 * 1024)) return 'Each file must be 10 MB or smaller.';
    if ([...files].reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) return 'Combined uploads must be 25 MB or smaller.';
    return '';
  }

  async function submitServiceRequest(event) {
    event.preventDefault();
    elements.requestFormError.hidden = true;
    const files = elements.requestDocuments.files || [];
    const fileError = validateSelectedFiles(files);
    if (fileError) {
      elements.requestFormError.textContent = fileError;
      elements.requestFormError.hidden = false;
      return;
    }
    const formData = new FormData(elements.requestForm);
    if (state.requestMode === 'emergency') {
      formData.set('urgency', 'emergency');
      formData.set('emergencyDisclaimerAccepted', String(elements.emergencyAcknowledgement.querySelector('input').checked));
    }
    setButtonBusy(elements.submitRequestButton, true, 'Submitting…');
    try {
      const response = await window.APIService.createResidentialRequest(formData, state.requestSubmissionKey, state.requestMode === 'emergency');
      closeDialog(elements.requestDialog);
      showToast(response.duplicate ? 'This request was already submitted.' : state.requestMode === 'emergency' ? 'Priority request submitted. Dispatch is not guaranteed.' : 'Service request submitted.');
      state.requestSubmissionKey = null;
      await loadPortal();
    } catch (error) {
      elements.requestFormError.textContent = error?.message || 'We could not submit your request. Please try again.';
      elements.requestFormError.hidden = false;
    } finally {
      setButtonBusy(elements.submitRequestButton, false);
    }
  }

  function openOrderAction(orderId, action) {
    const order = orderById(orderId);
    if (!order) return;
    state.orderAction = { orderId, action };
    const reschedule = action === 'reschedule';
    elements.orderActionTitle.textContent = reschedule ? 'Request a new time' : 'Request cancellation';
    elements.orderActionDescription.textContent = `${order.service || 'Service'} · ${order.requestReference || order.orderReference || ''}`;
    elements.actionTimingField.hidden = !reschedule;
    elements.actionPreferredTiming.required = reschedule;
    elements.actionReason.required = !reschedule;
    elements.actionReasonLabel.textContent = reschedule ? 'Reason or additional notes (optional)' : 'Why do you need to cancel?';
    elements.orderActionForm.reset();
    elements.orderActionError.hidden = true;
    elements.submitOrderAction.textContent = reschedule ? 'Request new time' : 'Request cancellation';
    elements.orderActionDialog.showModal();
    (reschedule ? elements.actionPreferredTiming : elements.actionReason).focus();
  }

  async function submitOrderUpdate(event) {
    event.preventDefault();
    if (!state.orderAction) return;
    elements.orderActionError.hidden = true;
    setButtonBusy(elements.submitOrderAction, true, 'Sending…');
    try {
      const { orderId, action } = state.orderAction;
      if (action === 'reschedule') {
        await window.APIService.requestResidentialReschedule(orderId, {
          preferredTiming: elements.actionPreferredTiming.value,
          reason: elements.actionReason.value
        });
      } else {
        await window.APIService.requestResidentialCancellation(orderId, elements.actionReason.value);
      }
      closeDialog(elements.orderActionDialog);
      showToast(action === 'reschedule' ? 'Schedule change requested.' : 'Cancellation requested.');
      state.orderAction = null;
      await loadPortal();
    } catch (error) {
      elements.orderActionError.textContent = error?.message || 'We could not send this request.';
      elements.orderActionError.hidden = false;
    } finally {
      setButtonBusy(elements.submitOrderAction, false);
    }
  }

  async function bookAgain(orderId, button) {
    setButtonBusy(button, true, 'Booking…');
    try {
      const response = await window.APIService.bookResidentialOrderAgain(orderId, {}, newIdempotencyKey());
      showToast(response.duplicate ? 'This repeat request was already received.' : 'Service requested again. We’ll contact you to schedule.');
      await loadPortal();
    } catch (error) {
      showToast(error?.message || 'We could not book this service again.');
      setButtonBusy(button, false);
    }
  }

  function emptyMarkup(icon, title, description, compact = false) {
    return `<div class="empty-state${compact ? ' empty-state--compact' : ''}">
      <svg aria-hidden="true"><use href="#${icon}"></use></svg>
      <strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p>
    </div>`;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 4500);
  }

  function setOffline(offline) {
    elements.offlineBanner.hidden = !offline;
    document.body.classList.toggle('is-offline', offline);
  }

  function setBusy(busy) {
    elements.loading.hidden = !busy;
    if (busy) {
      elements.error.hidden = true;
      elements.unauthorized.hidden = true;
      document.querySelectorAll('.portal-view').forEach(view => { view.hidden = true; });
    }
  }

  function showFailure(error) {
    setBusy(false);
    const unauthorized = error?.status === 401 || error?.status === 403;
    elements.unauthorized.hidden = !unauthorized;
    elements.error.hidden = unauthorized;
    if (!unauthorized) {
      elements.errorMessage.textContent = navigator.onLine
        ? (error?.message || 'Please try again in a moment.')
        : 'Your device appears to be offline. Reconnect and try again.';
    }
  }

  function routeFromHash() {
    const candidate = window.location.hash.replace(/^#/, '').split('/')[0];
    return ['home', 'properties', 'estimates', 'invoices', 'billing', 'autopilot', 'passport', 'utilities', 'messages', 'notifications', 'referrals', 'account'].includes(candidate) ? candidate : 'home';
  }

  function navigate(route, { focus = true } = {}) {
    state.route = ['home', 'properties', 'estimates', 'invoices', 'billing', 'autopilot', 'passport', 'utilities', 'messages', 'notifications', 'referrals', 'account'].includes(route) ? route : 'home';
    document.querySelectorAll('.portal-view').forEach(view => { view.hidden = view.dataset.view !== state.route; });
    document.querySelectorAll('[data-route]').forEach(link => {
      const active = link.dataset.route === state.route;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const labels = { home: 'Home dashboard', properties: 'Properties', estimates: 'Estimates', invoices: 'Invoices and receipts', billing: 'Payment methods', autopilot: 'Autopilot management', passport: 'Property Passport', utilities: 'Utility tracker', messages: 'Order messages', notifications: 'Notifications', referrals: 'Referrals and rewards', account: 'Account settings' };
    elements.headerRouteTitle.textContent = labels[state.route];
    elements.routeStatus.textContent = `${labels[state.route]} shown`;
    document.title = `${labels[state.route]} | SMPLfix`;
    if (state.route === 'billing') loadBilling();
    window.dispatchEvent(new CustomEvent('residential:route', { detail: { route: state.route } }));
    closeNavigation();
    if (focus) elements.main.focus({ preventScroll: true });
  }

  function closeNavigation() {
    elements.sidebar.classList.remove('is-open');
    elements.navScrim.hidden = true;
    elements.openNav.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  }

  function openNavigation() {
    elements.sidebar.classList.add('is-open');
    elements.navScrim.hidden = false;
    elements.openNav.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
    elements.closeNav.focus();
  }

  function renderAccount() {
    const firstName = state.user?.firstName || 'Homeowner';
    const fullName = [state.user?.firstName, state.user?.lastName].filter(Boolean).join(' ') || firstName;
    elements.welcomeName.textContent = firstName;
    elements.sidebarName.textContent = fullName;
    elements.sidebarEmail.textContent = state.user?.email || '';
    elements.sidebarAvatar.textContent = `${state.user?.firstName?.[0] || 'H'}${state.user?.lastName?.[0] || ''}`.toUpperCase();
  }

  function renderPropertySwitcher() {
    if (!state.properties.length) {
      elements.propertySwitcher.innerHTML = '<option value="">No properties connected</option>';
      elements.propertySwitcher.disabled = true;
      return;
    }
    elements.propertySwitcher.innerHTML = state.properties.map(property =>
      `<option value="${escapeHtml(property.id)}">${escapeHtml(property.label || property.address?.line1 || 'Property')}</option>`
    ).join('');
    elements.propertySwitcher.value = state.currentPropertyId;
    elements.propertySwitcher.disabled = false;
  }

  function renderEstimates() {
    const estimates = actionEstimates();
    elements.estimateCount.textContent = estimates.length;
    if (!estimates.length) {
      elements.estimateList.innerHTML = emptyMarkup('icon-file', 'You’re all caught up', 'No estimates need your review.', true);
      return;
    }
    elements.estimateList.innerHTML = estimates.slice(0, 3).map(estimate => `<article class="compact-item">
      <div><strong>${escapeHtml(estimate.job?.service || 'Service estimate')}</strong><small>${escapeHtml(estimate.quoteReference || 'Estimate ready')}</small></div>
      <div class="compact-item__amount"><strong>${escapeHtml(money(estimate.clientTotal))}</strong><span>Review needed</span></div>
    </article>`).join('');
  }

  function renderMetrics() {
    const jobs = activeOrders();
    elements.activeJobCount.textContent = jobs.length;
    elements.activeJobCaption.textContent = jobs.length ? `${jobs.length} service ${jobs.length === 1 ? 'item' : 'items'} underway` : 'Nothing in progress';
    elements.propertyCount.textContent = state.properties.length;
    const upcoming = currentSchedules()
      .filter(schedule => new Date(schedule.proposedStart).getTime() > Date.now() && !['revoked', 'superseded'].includes(normalizeStatus(schedule.status)))
      .sort((left, right) => new Date(left.proposedStart) - new Date(right.proposedStart))[0];
    elements.nextVisitDate.textContent = upcoming ? date(upcoming.proposedStart) : 'No visit';
    elements.nextVisitCaption.textContent = upcoming ? `${dateTime(upcoming.proposedStart)} · ${upcoming.vendor?.name || 'Vendor confirming'}` : 'Nothing scheduled';
  }

  function renderJobs() {
    const jobs = activeOrders();
    if (!jobs.length) {
      elements.activeJobsList.innerHTML = emptyMarkup('icon-wrench', 'No active jobs', 'When you request service, progress will appear here.');
      return;
    }
    elements.activeJobsList.innerHTML = jobs.slice(0, 5).map(order => {
      const schedule = state.schedules.find(item => safeId(item.orderId) === safeId(order.id));
      const scheduledStart = order.scheduledStart || schedule?.proposedStart;
      return `<article class="job-item">
      <span class="job-icon"><svg aria-hidden="true"><use href="#icon-wrench"></use></svg></span>
      <div><strong>${escapeHtml(order.service || 'Home service')}</strong><small>${escapeHtml(order.orderReference || order.requestReference || 'Request')} · ${escapeHtml(order.vendor?.name || 'Matching your professional')}</small></div>
      <div class="job-status"><span>${escapeHtml(titleCase(order.workflowStatus || order.status))}</span><small>${escapeHtml(scheduledStart ? dateTime(scheduledStart) : 'Date pending')}</small></div>
      <div class="job-actions"><button type="button" data-job-detail="${escapeHtml(order.id)}">View details</button>
        ${order.actions?.reschedulePending ? '<button class="is-pending" type="button" disabled>Schedule change pending</button>' : order.actions?.canReschedule ? `<button type="button" data-order-action="reschedule" data-order-id="${escapeHtml(order.id)}">Reschedule</button>` : ''}
        ${order.actions?.cancellationPending ? '<button class="is-pending" type="button" disabled>Cancellation pending</button>' : order.actions?.canCancel ? `<button type="button" data-order-action="cancel" data-order-id="${escapeHtml(order.id)}">Cancel service</button>` : ''}
      </div>
    </article>`;
    }).join('');
  }

  function renderActivity() {
    const propertyOrderIds = new Set(propertyOrders().map(order => safeId(order.id)));
    const items = state.activity.filter(item =>
      !item.propertyId && !item.orderId
      || safeId(item.propertyId) === safeId(state.currentPropertyId)
      || propertyOrderIds.has(safeId(item.orderId))
    );
    if (!items.length) {
      elements.activityList.innerHTML = emptyMarkup('icon-clock', 'No activity yet', 'Updates for this property will collect here.', true);
      return;
    }
    elements.activityList.innerHTML = items.slice(0, 6).map(item => `<li class="activity-item">
      <strong>${escapeHtml(item.title || 'Property update')}</strong><span>${escapeHtml(item.summary || '')}</span><time datetime="${escapeHtml(item.occurredAt || '')}">${escapeHtml(relativeTime(item.occurredAt))}</time>
    </li>`).join('');
  }

  function renderBookAgain() {
    const completed = propertyOrders().filter(isCompleted).sort((left, right) => new Date(right.completedAt || right.updatedAt) - new Date(left.completedAt || left.updatedAt));
    if (!completed.length) {
      elements.bookAgainList.innerHTML = emptyMarkup('icon-refresh', 'Your repeat services will appear here', 'Complete a service once, then rebook it in fewer steps.', true);
      return;
    }
    elements.bookAgainList.innerHTML = completed.slice(0, 3).map(order => `<article class="book-card">
      <strong>${escapeHtml(order.service || 'Home service')}</strong><small>Last completed ${escapeHtml(date(order.completedAt || order.updatedAt, { year: true }))}</small>
      <button type="button" data-book-again="${escapeHtml(order.id)}">Book again</button>
    </article>`).join('');
  }

  function canApproveEstimate(estimate) {
    const order = orderById(estimate.orderId);
    const property = state.properties.find(item => safeId(item.id) === safeId(order?.propertyId));
    return property?.permissions?.approveEstimates === true
      && normalizeStatus(estimate.status) === 'sent'
      && ['pending', ''].includes(normalizeStatus(estimate.decisionStatus));
  }

  function renderEstimatesPage() {
    const orderIds = new Set(propertyOrders().map(order => safeId(order.id)));
    const estimates = state.estimates.filter(item => orderIds.has(safeId(item.orderId)));
    if (!estimates.length) {
      elements.estimatesPageList.innerHTML = emptyMarkup('icon-file', 'No estimates yet', 'New estimates for this property will appear here.');
      return;
    }
    elements.estimatesPageList.innerHTML = estimates.map(estimate => `<article class="transaction-card">
      <div><strong>${escapeHtml(estimate.job?.service || 'Service estimate')}</strong><span>${escapeHtml(estimate.quoteReference || '')} · Sent ${escapeHtml(date(estimate.sentAt, { year: true }))}</span><small>${escapeHtml(titleCase(estimate.decisionStatus || estimate.status))}</small></div>
      <div class="transaction-amount"><strong>${escapeHtml(money(estimate.clientTotal))}</strong><span>Client total</span></div>
      <div class="transaction-actions"><a class="button" href="/api/residential/estimates/${encodeURIComponent(estimate.id)}/pdf" target="_blank" rel="noopener">PDF</a><button class="button button--dark" type="button" data-estimate-detail="${escapeHtml(estimate.id)}">${canApproveEstimate(estimate) ? 'Review & decide' : 'View estimate'}</button></div>
    </article>`).join('');
  }

  function renderInvoicesPage() {
    const orderIds = new Set(propertyOrders().map(order => safeId(order.id)));
    const invoices = state.invoices.filter(item => orderIds.has(safeId(item.orderId)));
    if (!invoices.length) {
      elements.invoiceList.innerHTML = emptyMarkup('icon-file', 'No invoices yet', 'Invoices and receipts for this property will appear here.');
      return;
    }
    elements.invoiceList.innerHTML = invoices.map(invoice => `<article class="transaction-card">
      <div><strong>${escapeHtml(invoice.job?.service || 'Service invoice')}</strong><span>${escapeHtml(invoice.invoiceNumber || '')} · Issued ${escapeHtml(date(invoice.issuedAt, { year: true }))}</span><small>${escapeHtml(titleCase(invoice.payment?.status || 'pending'))}</small></div>
      <div class="transaction-amount"><strong>${escapeHtml(money(invoice.amount))}</strong><span>${invoice.payment?.paymentDate ? `Paid ${escapeHtml(date(invoice.payment.paymentDate, { year: true }))}` : `Due ${escapeHtml(date(invoice.dueDate, { year: true }))}`}</span></div>
      <div class="transaction-actions"><a class="button button--dark" href="${escapeHtml(invoice.pdfUrl)}" target="_blank" rel="noopener">Invoice PDF</a>${invoice.receiptPdfUrl ? `<a class="button" href="${escapeHtml(invoice.receiptPdfUrl)}" target="_blank" rel="noopener">Receipt PDF</a>` : ''}</div>
    </article>`).join('');
  }

  function renderEstimateDialog(estimate) {
    const contractor = estimate.contractor || {};
    elements.estimateDialogTitle.textContent = estimate.job?.service || 'Estimate';
    elements.estimateDialogReference.textContent = estimate.quoteReference || '';
    elements.estimateDialogBody.innerHTML = `<div class="transaction-summary">
      <div><small>Total</small><strong>${escapeHtml(money(estimate.clientTotal))}</strong></div><div><small>Valid until</small><strong>${escapeHtml(date(estimate.validUntil, { year: true }))}</strong></div><div><small>Earliest availability</small><strong>${escapeHtml(date(estimate.earliestAvailableDate, { year: true }))}</strong></div>
    </div>
    <div class="transaction-copy"><h3>Scope of work</h3>${escapeHtml(estimate.scopeOfWork || 'Scope details pending.')}</div>
    <div class="transaction-copy"><h3>Contractor</h3>${escapeHtml(contractor.name || 'Contractor pending')}${contractor.rocNumber ? ` · ROC ${escapeHtml(contractor.rocNumber)}` : ''}</div>
    <div class="transaction-copy"><h3>Terms and conditions</h3>${escapeHtml(estimate.termsAndConditions || 'No additional terms.')}</div>
    ${contractor.disclosure ? `<div class="transaction-copy"><h3>Contractor disclosure</h3>${escapeHtml(contractor.disclosure)}</div>` : ''}`;
    const actionable = canApproveEstimate(estimate);
    elements.estimateDecisionForm.hidden = !actionable;
    elements.approveEstimateButton.hidden = false;
    elements.requestEstimateChangesButton.hidden = false;
    elements.submitEstimateDecision.hidden = true;
    elements.estimateChangesField.hidden = true;
    elements.estimateConsent.hidden = false;
    elements.estimateDecisionError.hidden = true;
    elements.estimateDecisionForm.reset();
    elements.estimateDialog.showModal();
  }

  async function openEstimate(estimateId) {
    try {
      const response = await window.APIService.getResidentialEstimate(estimateId);
      state.currentEstimateId = safeId(estimateId);
      renderEstimateDialog(response.estimate);
    } catch (error) { showToast(error?.message || 'Estimate details are unavailable.'); }
  }

  function prepareEstimateDecision(action) {
    elements.estimateDecisionAction.value = action;
    const changes = action === 'request_changes';
    elements.estimateChangesField.hidden = !changes;
    elements.estimateChanges.required = changes;
    elements.estimateConsent.hidden = changes;
    elements.estimateTermsAccepted.required = !changes;
    elements.approveEstimateButton.hidden = true;
    elements.requestEstimateChangesButton.hidden = true;
    elements.submitEstimateDecision.hidden = false;
    elements.submitEstimateDecision.textContent = changes ? 'Send change request' : 'Confirm approval';
    (changes ? elements.estimateChanges : elements.estimateTypedName).focus();
  }

  async function submitEstimateDecision(event) {
    event.preventDefault();
    elements.estimateDecisionError.hidden = true;
    setButtonBusy(elements.submitEstimateDecision, true, 'Submitting…');
    try {
      await window.APIService.decideResidentialEstimate(state.currentEstimateId, {
        action: elements.estimateDecisionAction.value,
        typedName: elements.estimateTypedName.value,
        termsAccepted: elements.estimateTermsAccepted.checked,
        changeRequestMessage: elements.estimateChanges.value
      });
      closeDialog(elements.estimateDialog);
      showToast(elements.estimateDecisionAction.value === 'approve' ? 'Estimate approved.' : 'Change request sent.');
      await loadPortal();
    } catch (error) {
      elements.estimateDecisionError.textContent = error?.message || 'We could not record your decision.';
      elements.estimateDecisionError.hidden = false;
    } finally { setButtonBusy(elements.submitEstimateDecision, false); }
  }

  function trackerMarkup(items = []) {
    const currentIndex = items.findIndex(item => item.state === 'current');
    const completedIndex = items.reduce((last, item, index) => item.state === 'complete' ? index : last, 0);
    const activeIndex = currentIndex >= 0 ? currentIndex : completedIndex;
    const active = items[activeIndex] || items.find(item => item.state === 'complete') || {};
    return `<section class="job-progress-card"><div class="job-progress-heading"><div><span>Service progress</span><strong>${escapeHtml(active.label || 'Request received')}</strong></div><small>Step ${Math.min(activeIndex + 1, items.length || 1)} of ${items.length || 1}</small></div><ol class="workflow-tracker" aria-label="Job progress">${items.map((item, index) => `<li class="workflow-step is-${escapeHtml(item.state)}" ${item.state === 'current' ? 'aria-current="step"' : ''}><span class="workflow-dot" aria-hidden="true">${item.state === 'complete' ? '<span>✓</span>' : `<span>${index + 1}</span>`}</span><span class="workflow-label">${escapeHtml(item.label)}</span></li>`).join('')}</ol></section>`;
  }

  function photoGroup(title, photos = []) {
    return `<section class="photo-group"><h3>${escapeHtml(title)}</h3><div class="photo-grid">${photos.length ? photos.map(photo => `<a href="${escapeHtml(photo.downloadUrl)}" target="_blank" rel="noopener">${escapeHtml(photo.name || 'View photo')}</a>`).join('') : '<span class="transaction-copy">No photos provided</span>'}</div></section>`;
  }

  async function openJob(orderId) {
    try {
      const detail = await window.APIService.getResidentialOrder(orderId);
      const order = detail.order || {};
      const schedule = detail.schedule;
      const completion = detail.completion;
      const vendor = order.vendor || schedule?.vendor || detail.estimate?.contractor || {};
      elements.jobDialogTitle.textContent = order.service || 'Service job';
      elements.jobDialogReference.textContent = order.requestReference || order.orderReference || '';
      elements.jobDialogBody.innerHTML = `${trackerMarkup(detail.tracker)}
        <div class="transaction-summary job-summary"><div><span class="job-summary-icon" aria-hidden="true"><svg><use href="#icon-clock"/></svg></span><span><small>Current status</small><strong>${escapeHtml(titleCase(order.workflowStatus || order.status))}</strong></span></div><div><span class="job-summary-icon" aria-hidden="true"><svg><use href="#icon-calendar"/></svg></span><span><small>Scheduled window</small><strong>${escapeHtml(schedule ? `${dateTime(schedule.proposedStart)} – ${dateTime(schedule.proposedEnd)}` : 'To be confirmed')}</strong></span></div><div><span class="job-summary-icon" aria-hidden="true"><svg><use href="#icon-wrench"/></svg></span><span><small>Service professional</small><strong>${escapeHtml(vendor.name || 'Matching in progress')}</strong>${vendor.rocNumber ? `<em>ROC ${escapeHtml(vendor.rocNumber)}</em>` : ''}</span></div></div>
        <section class="job-request-card"><div class="job-request-heading"><span>Request summary</span><h3>What you asked us to handle</h3></div><p>${escapeHtml(order.description || 'No description provided.')}</p></section>
        ${completion ? `<section class="completion-review"><div class="transaction-copy"><h3>Service notes</h3>${escapeHtml(completion.completionNotes || 'No service note was provided.')}</div><div class="completion-photos">${photoGroup('Before', completion.beforePhotos)}${photoGroup('After', completion.afterPhotos)}</div></section>` : ''}
        ${detail.invoice ? `<div class="transaction-actions"><a class="button button--dark" href="${escapeHtml(detail.invoice.pdfUrl)}" target="_blank" rel="noopener">Download invoice</a>${detail.invoice.receiptPdfUrl ? `<a class="button" href="${escapeHtml(detail.invoice.receiptPdfUrl)}" target="_blank" rel="noopener">Download receipt</a>` : ''}</div>` : ''}`;
      elements.jobDialog.showModal();
    } catch (error) { showToast(error?.message || 'Job details are unavailable.'); }
  }

  async function loadBilling() {
    if (!state.currentPropertyId) {
      elements.paymentMethodList.innerHTML = emptyMarkup('icon-file', 'No property selected', 'Select a property to manage billing.');
      return;
    }
    elements.paymentMethodList.innerHTML = emptyMarkup('icon-clock', 'Loading payment methods', 'Connecting securely to the payment provider.', true);
    try {
      state.billing = await window.APIService.getResidentialBilling(state.currentPropertyId);
      elements.addCardButton.disabled = !state.billing.configured;
      elements.manageCardsButton.disabled = !state.billing.configured;
      elements.paymentMethodList.innerHTML = !state.billing.configured
        ? emptyMarkup('icon-alert', 'Card management is not configured', 'SMPLfix must connect the hosted payment provider before cards can be managed.', true)
        : state.billing.methods.length
          ? state.billing.methods.map(method => `<article class="payment-method"><div><strong>${escapeHtml(method.brand)} ending ${escapeHtml(method.last4)}</strong><span>Expires ${escapeHtml(method.expMonth)}/${escapeHtml(method.expYear)}</span></div>${method.isExpired ? '<span class="expired">Expired</span>' : '<span>Active</span>'}</article>`).join('')
          : emptyMarkup('icon-file', 'No saved cards', 'Add a card securely through Stripe.', true);
    } catch (error) {
      elements.paymentMethodList.innerHTML = emptyMarkup('icon-alert', 'Billing unavailable', error?.message || 'Please try again later.', true);
    }
  }

  async function openHostedBilling(kind, button) {
    setButtonBusy(button, true, 'Opening…');
    try {
      const result = kind === 'setup'
        ? await window.APIService.createResidentialCardSetupSession(state.currentPropertyId)
        : await window.APIService.createResidentialBillingPortalSession(state.currentPropertyId);
      if (!/^https:\/\/(?:checkout|billing)\.stripe\.com\//.test(result.url)) throw new Error('Invalid payment-provider destination');
      window.location.assign(result.url);
    } catch (error) {
      showToast(error?.message || 'Secure card management is unavailable.');
      setButtonBusy(button, false);
    }
  }

  function renderHome() {
    const property = currentProperty();
    elements.welcomeAddress.textContent = property ? `Here’s what’s happening at ${address(property)}.` : 'Connect a property to begin managing your home.';
    renderEstimates();
    renderMetrics();
    renderJobs();
    renderActivity();
    renderBookAgain();
    renderEstimatesPage();
    renderInvoicesPage();
  }

  function renderPropertyList() {
    if (!state.properties.length) {
      elements.propertyList.innerHTML = emptyMarkup('icon-building', 'No properties connected', 'Use Add property to connect your first home. Existing account conflicts require support review.');
      elements.propertyDetail.hidden = true;
      return;
    }
    elements.propertyList.innerHTML = state.properties.map(property => `<article class="property-card${safeId(property.id) === safeId(state.currentPropertyId) ? ' is-selected' : ''}" data-property-card="${escapeHtml(property.id)}">
      <div class="property-card-heading"><span class="property-card-icon"><svg aria-hidden="true"><use href="#icon-home"></use></svg></span><small>${escapeHtml(titleCase(property.status || 'active'))}</small></div>
      <div><strong>${escapeHtml(property.label || 'Property')}</strong><span>${escapeHtml(address(property))}</span></div>
      <button type="button" data-property-detail="${escapeHtml(property.id)}" aria-controls="propertyDetail" aria-expanded="${!elements.propertyDetail.hidden && safeId(property.id) === safeId(state.currentPropertyId)}" aria-label="View ${escapeHtml(property.label || 'property')} details and service history">View property record <svg aria-hidden="true"><use href="#icon-arrow"/></svg></button>
    </article>`).join('');
  }

  async function showPropertyDetail(propertyId, { focus = true } = {}) {
    if (!state.properties.some(property => safeId(property.id) === safeId(propertyId))) return;
    state.currentPropertyId = safeId(propertyId);
    elements.propertySwitcher.value = state.currentPropertyId;
    renderPropertyList();
    renderHome();
    elements.propertyDetail.hidden = false;
    const selectedProperty = currentProperty();
    elements.propertyDetailTitle.textContent = selectedProperty?.label || 'Property details';
    elements.propertyDetailAddress.textContent = address(selectedProperty);
    renderPropertyList();
    if (focus) {
      elements.propertyDetailTitle.focus({ preventScroll: true });
      elements.propertyDetail.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
    elements.propertyDetail.setAttribute('aria-busy', 'true');
    elements.serviceHistoryList.innerHTML = emptyMarkup('icon-clock', 'Loading service history', 'Getting the latest property record.', true);
    try {
      const [detail, ordersPayload] = await Promise.all([
        window.APIService.getResidentialProperty(propertyId),
        window.APIService.getResidentialOrders(`propertyId=${encodeURIComponent(propertyId)}&limit=100`)
      ]);
      const property = detail.property || currentProperty();
      if (safeId(propertyId) !== safeId(state.currentPropertyId)) return;
      const orders = list(ordersPayload);
      elements.propertyDetailTitle.textContent = property?.label || 'Property details';
      elements.propertyDetailAddress.textContent = address(property);
      elements.propertyDetailStatus.textContent = titleCase(property?.status || 'active');
      elements.propertyOpenJobs.textContent = detail.summary?.activeOrders ?? orders.filter(order => !isCompleted(order)).length;
      elements.propertyCompletedJobs.textContent = detail.summary?.completedOrders ?? orders.filter(isCompleted).length;
      elements.propertyDocumentCount.textContent = property?.documents?.length || 0;
      const history = orders.filter(isCompleted).sort((left, right) => new Date(right.completedAt || right.updatedAt) - new Date(left.completedAt || left.updatedAt));
      elements.serviceHistoryList.innerHTML = history.length ? history.map(order => `<article class="history-item">
        <span class="job-icon"><svg aria-hidden="true"><use href="#icon-file"></use></svg></span>
        <div><strong>${escapeHtml(order.service || 'Completed service')}</strong><small>${escapeHtml(order.vendor?.name || 'SMPLfix service professional')} · ${escapeHtml(order.orderReference || '')}</small></div>
        <div class="job-status"><span>Completed</span><small>${escapeHtml(date(order.completedAt || order.updatedAt, { year: true }))}</small><button class="text-button" type="button" data-job-detail="${escapeHtml(order.id)}">View details</button></div>
      </article>`).join('') : emptyMarkup('icon-file', 'No completed services yet', 'Completed work will build the permanent history for this property.');
    } catch (error) {
      elements.serviceHistoryList.innerHTML = emptyMarkup('icon-alert', 'Service history unavailable', error?.message || 'Please try again later.');
    } finally {
      elements.propertyDetail.removeAttribute('aria-busy');
    }
  }

  function renderAll() {
    renderAccount();
    renderPropertySwitcher();
    renderHome();
    renderPropertyList();
    if (state.currentPropertyId && !elements.propertyDetail.hidden) showPropertyDetail(state.currentPropertyId, { focus: false });
  }

  async function loadPortal() {
    setBusy(true);
    try {
      await window.AuthReady;
      if (window.AuthSession?.user?.role !== 'residential') {
        const error = new Error('Residential access required');
        error.status = 403;
        throw error;
      }
      const [home, orders, estimates, schedules, invoices, activity] = await Promise.all([
        window.APIService.getResidentialHome(),
        window.APIService.getResidentialOrders('limit=100'),
        window.APIService.getResidentialEstimates('limit=50'),
        window.APIService.getResidentialSchedules('limit=50'),
        window.APIService.getResidentialInvoices('limit=100'),
        window.APIService.getResidentialActivity(50)
      ]);
      state.user = home.user || window.AuthSession.user;
      state.properties = Array.isArray(home.properties) ? home.properties : [];
      state.orders = list(orders);
      state.estimates = list(estimates);
      state.schedules = list(schedules);
      state.invoices = list(invoices);
      state.activity = list(activity);
      if (!state.properties.some(property => safeId(property.id) === safeId(state.currentPropertyId))) {
        state.currentPropertyId = safeId(state.properties[0]?.id);
      }
      setBusy(false);
      elements.error.hidden = true;
      elements.unauthorized.hidden = true;
      renderAll();
      navigate(routeFromHash(), { focus: false });
      window.dispatchEvent(new CustomEvent('residential:loaded'));
    } catch (error) {
      showFailure(error);
    }
  }

  function bindEvents() {
    byId('addPropertyButton').addEventListener('click', () => {
      byId('addPropertyForm').reset();
      byId('addPropertyError').hidden = true;
      byId('addPropertyDialog').showModal();
    });
    byId('addPropertyForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget; const button = byId('savePropertyButton');
      if (button.disabled || !form.reportValidity()) return;
      const error = byId('addPropertyError'); error.hidden = true;
      if (!navigator.onLine) { error.textContent = 'You are offline. Reconnect before adding a property.'; error.hidden = false; return; }
      button.disabled = true; button.textContent = 'Saving…'; form.setAttribute('aria-busy', 'true');
      try {
        const payload = Object.fromEntries(new FormData(form));
        payload.confirmAuthority = form.elements.confirmAuthority.checked;
        const response = await window.APIService.addResidentialProperty(payload);
        state.currentPropertyId = safeId(response.data.id);
        closeDialog(byId('addPropertyDialog'));
        await loadPortal();
        showToast(response.alreadyConnected ? 'This property is already connected.' : 'Property added.');
      } catch (cause) {
        error.textContent = cause.message || 'Could not add this property. Please try again.'; error.hidden = false;
      } finally { button.disabled = false; button.textContent = 'Add property'; form.removeAttribute('aria-busy'); }
    });
    window.addEventListener('hashchange', () => navigate(routeFromHash()));
    window.addEventListener('online', () => { setOffline(false); loadPortal(); });
    window.addEventListener('offline', () => setOffline(true));
    window.addEventListener('hutta:session-expired', () => showFailure({ status: 401 }));
    elements.retry.addEventListener('click', loadPortal);
    elements.openNav.addEventListener('click', openNavigation);
    elements.closeNav.addEventListener('click', closeNavigation);
    elements.navScrim.addEventListener('click', closeNavigation);
    elements.openRequestButton.addEventListener('click', () => openRequestDialog('standard'));
    elements.openEmergencyButton.addEventListener('click', () => openRequestDialog('emergency'));
    elements.requestForm.addEventListener('submit', submitServiceRequest);
    elements.orderActionForm.addEventListener('submit', submitOrderUpdate);
    elements.estimateDecisionForm.addEventListener('submit', submitEstimateDecision);
    elements.approveEstimateButton.addEventListener('click', () => prepareEstimateDecision('approve'));
    elements.requestEstimateChangesButton.addEventListener('click', () => prepareEstimateDecision('request_changes'));
    elements.addCardButton.addEventListener('click', () => openHostedBilling('setup', elements.addCardButton));
    elements.manageCardsButton.addEventListener('click', () => openHostedBilling('portal', elements.manageCardsButton));
    elements.requestDocuments.addEventListener('change', () => {
      const files = [...elements.requestDocuments.files];
      elements.fileSummary.textContent = files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No files selected';
    });
    elements.propertySwitcher.addEventListener('change', event => {
      const propertyId = safeId(event.target.value);
      if (!state.properties.some(property => safeId(property.id) === propertyId)) return;
      state.currentPropertyId = propertyId;
      renderHome();
      renderPropertyList();
          if (state.route === 'properties') showPropertyDetail(propertyId, { focus: false });
          if (state.route === 'billing') loadBilling();
          window.dispatchEvent(new CustomEvent('residential:property-changed', { detail: { propertyId, route: state.route } }));
    });
    elements.accountButton.addEventListener('click', () => {
      const expanded = elements.accountMenu.hidden;
      elements.accountMenu.hidden = !expanded;
      elements.accountButton.setAttribute('aria-expanded', String(expanded));
    });
    elements.logout.addEventListener('click', async () => {
      elements.logout.disabled = true;
      try { await window.APIService.logout(); } finally { window.location.replace('/pages/login.html'); }
    });
    document.addEventListener('click', event => {
      const routeButton = event.target.closest('[data-route-button]');
      if (routeButton) window.location.hash = routeButton.dataset.routeButton;
      const detailButton = event.target.closest('[data-property-detail]');
      if (detailButton) showPropertyDetail(detailButton.dataset.propertyDetail);
      const bookAgainButton = event.target.closest('[data-book-again]');
      if (bookAgainButton) bookAgain(bookAgainButton.dataset.bookAgain, bookAgainButton);
      const orderActionButton = event.target.closest('[data-order-action]');
      if (orderActionButton) openOrderAction(orderActionButton.dataset.orderId, orderActionButton.dataset.orderAction);
      const estimateButton = event.target.closest('[data-estimate-detail]');
      if (estimateButton) openEstimate(estimateButton.dataset.estimateDetail);
      const jobButton = event.target.closest('[data-job-detail]');
      if (jobButton) openJob(jobButton.dataset.jobDetail);
      const closeDialogButton = event.target.closest('[data-close-dialog]');
      if (closeDialogButton) closeDialog(byId(closeDialogButton.dataset.closeDialog));
      const comingSoon = event.target.closest('[data-coming-soon]');
      if (comingSoon) showToast(comingSoon.dataset.comingSoon);
      if (!event.target.closest('#accountButton') && !event.target.closest('#accountMenu')) {
        elements.accountMenu.hidden = true;
        elements.accountButton.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeNavigation();
        elements.accountMenu.hidden = true;
        elements.accountButton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function cacheElements() {
    Object.assign(elements, {
      main: byId('portalMain'), loading: byId('portalLoading'), error: byId('portalError'), unauthorized: byId('portalUnauthorized'),
      errorMessage: byId('portalErrorMessage'), retry: byId('retryButton'), offlineBanner: byId('offlineBanner'),
      sidebar: byId('portalSidebar'), navScrim: byId('navScrim'), openNav: byId('openNavButton'), closeNav: byId('closeNavButton'),
      propertySwitcher: byId('propertySwitcher'), headerRouteTitle: byId('residentialRouteTitle'), welcomeName: byId('welcomeName'), welcomeAddress: byId('welcomeAddress'),
      sidebarName: byId('sidebarName'), sidebarEmail: byId('sidebarEmail'), sidebarAvatar: byId('sidebarAvatar'),
      accountButton: byId('accountButton'), accountMenu: byId('accountMenu'), logout: byId('logoutButton'),
      estimateCount: byId('estimateCount'), estimateList: byId('estimateList'), activeJobCount: byId('activeJobCount'),
      activeJobCaption: byId('activeJobCaption'), nextVisitDate: byId('nextVisitDate'), nextVisitCaption: byId('nextVisitCaption'),
      propertyCount: byId('propertyCount'), activeJobsList: byId('activeJobsList'), activityList: byId('activityList'),
      bookAgainList: byId('bookAgainList'), propertyList: byId('propertyList'), propertyDetail: byId('propertyDetail'),
      propertyDetailTitle: byId('propertyDetailTitle'), propertyDetailAddress: byId('propertyDetailAddress'), propertyDetailStatus: byId('propertyDetailStatus'),
      propertyOpenJobs: byId('propertyOpenJobs'), propertyCompletedJobs: byId('propertyCompletedJobs'), propertyDocumentCount: byId('propertyDocumentCount'),
      serviceHistoryList: byId('serviceHistoryList'), toast: byId('portalToast'), routeStatus: byId('routeStatus'),
      openRequestButton: byId('openRequestButton'), openEmergencyButton: byId('openEmergencyButton'),
      requestDialog: byId('requestDialog'), requestForm: byId('requestForm'), requestProperty: byId('requestProperty'),
      requestDialogEyebrow: byId('requestDialogEyebrow'), requestDialogTitle: byId('requestDialogTitle'), requestDialogDescription: byId('requestDialogDescription'),
      requestUrgency: byId('requestUrgency'), urgencyField: byId('urgencyField'), emergencyAcknowledgement: byId('emergencyAcknowledgement'),
      requestDocuments: byId('requestDocuments'), fileSummary: byId('fileSummary'), requestFormError: byId('requestFormError'), submitRequestButton: byId('submitRequestButton'),
      orderActionDialog: byId('orderActionDialog'), orderActionForm: byId('orderActionForm'), orderActionTitle: byId('orderActionTitle'),
      orderActionDescription: byId('orderActionDescription'), actionTimingField: byId('actionTimingField'), actionPreferredTiming: byId('actionPreferredTiming'),
      actionReason: byId('actionReason'), actionReasonLabel: byId('actionReasonLabel'), orderActionError: byId('orderActionError'), submitOrderAction: byId('submitOrderAction'),
      estimatesPageList: byId('estimatesPageList'), invoiceList: byId('invoiceList'), paymentMethodList: byId('paymentMethodList'),
      addCardButton: byId('addCardButton'), manageCardsButton: byId('manageCardsButton'),
      estimateDialog: byId('estimateDialog'), estimateDialogTitle: byId('estimateDialogTitle'), estimateDialogReference: byId('estimateDialogReference'), estimateDialogBody: byId('estimateDialogBody'),
      estimateDecisionForm: byId('estimateDecisionForm'), estimateDecisionAction: byId('estimateDecisionAction'), estimateTypedName: byId('estimateTypedName'),
      estimateChangesField: byId('estimateChangesField'), estimateChanges: byId('estimateChanges'), estimateConsent: byId('estimateConsent'), estimateTermsAccepted: byId('estimateTermsAccepted'),
      estimateDecisionError: byId('estimateDecisionError'), requestEstimateChangesButton: byId('requestEstimateChangesButton'), approveEstimateButton: byId('approveEstimateButton'), submitEstimateDecision: byId('submitEstimateDecision'),
      jobDialog: byId('jobDialog'), jobDialogTitle: byId('jobDialogTitle'), jobDialogReference: byId('jobDialogReference'), jobDialogBody: byId('jobDialogBody')
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    bindEvents();
    setOffline(!navigator.onLine);
    loadPortal();
  });

  window.ResidentialPortal = { state, loadPortal, navigate, showPropertyDetail, __test: { activeOrders, actionEstimates, escapeHtml, isCompleted, normalizeStatus } };
})();
