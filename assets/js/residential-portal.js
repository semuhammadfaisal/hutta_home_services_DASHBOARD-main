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
    currentInvoiceId: null,
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

  function initializePropertyDetailForms() {
    const template = byId('propertyExtendedDetailsTemplate');
    for (const targetId of ['addPropertyExtendedDetails', 'editPropertyExtendedDetails']) {
      const target = byId(targetId);
      if (template && target && !target.children.length) target.append(template.content.cloneNode(true));
    }
  }

  function setPropertyDetailsExpanded(targetId, expanded) {
    const target = byId(targetId);
    const button = document.querySelector(`[data-expand-property-details="${targetId}"]`);
    if (!target || !button) return;
    target.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    button.innerHTML = `<span>${expanded ? '−' : '＋'}</span> ${expanded ? 'Hide Additional Details' : (targetId.startsWith('edit') ? 'Edit All Details' : 'Add All Details')}`;
  }

  function propertyFormPayload(form) {
    const payload = {};
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach(input => {
      if (input.type === 'file' || input.disabled) return;
      payload[input.name] = input.type === 'checkbox' ? input.checked : input.value;
    });
    return payload;
  }

  function propertyUploadInputs(form) {
    return [...form.querySelectorAll('[data-property-upload-category]')];
  }

  function validatePropertyUploads(form) {
    const files = propertyUploadInputs(form).flatMap(input => [...input.files]);
    if (files.length > 20) throw new Error('Upload no more than 20 property files at one time.');
    const oversized = files.find(file => file.size > 50 * 1024 * 1024);
    if (oversized) throw new Error(`${oversized.name} is larger than 50 MB.`);
  }

  async function uploadPropertyFiles(propertyId, form) {
    const failures = [];
    let uploaded = 0;
    for (const input of propertyUploadInputs(form)) {
      for (const file of [...input.files]) {
        const data = new FormData();
        data.append('category', input.dataset.propertyUploadCategory || 'other');
        data.append('title', `${input.dataset.propertyUploadTitle || 'Property file'}${input.multiple ? ` — ${file.name}` : ''}`);
        data.append('document', file, file.name);
        try { await window.APIService.uploadResidentialPassportDocument(propertyId, data); uploaded += 1; }
        catch (error) { failures.push(`${file.name}: ${error?.message || 'upload failed'}`); }
      }
    }
    return { uploaded, failures };
  }

  function setFormControl(form, name, value) {
    const input = form.elements[name];
    if (!input) return;
    if (input.type === 'checkbox') input.checked = value === true;
    else input.value = value ?? '';
  }

  function populateExtendedPropertyForm(form, property) {
    const values = {
      propertySubtype: property.details?.subtype, propertyTitle: property.details?.title, propertyDescription: property.details?.description,
      yearBuilt: property.details?.yearBuilt, bedrooms: property.details?.bedrooms, fullBathrooms: property.details?.fullBathrooms,
      halfBathrooms: property.details?.halfBathrooms, livingAreaSqFt: property.details?.livingAreaSqFt, lotSize: property.details?.lotSize,
      lotSizeUnit: property.details?.lotSizeUnit || 'sq_ft', stories: property.details?.stories, garageSpaces: property.details?.garageSpaces,
      parkingSpaces: property.details?.parkingSpaces, propertyCondition: property.details?.condition,
      county: property.addressDetails?.county, parcelNumber: property.addressDetails?.parcelNumber, latitude: property.addressDetails?.latitude, longitude: property.addressDetails?.longitude,
      interiorFlooring: property.interior?.flooring, interiorKitchen: property.interior?.kitchen, interiorAppliances: property.interior?.appliances,
      interiorHeating: property.interior?.heating, interiorCooling: property.interior?.cooling, interiorFireplace: property.interior?.fireplace,
      interiorLaundry: property.interior?.laundry, interiorBasement: property.interior?.basement, interiorAttic: property.interior?.attic,
      interiorFurnishing: property.interior?.furnishing, exteriorType: property.exterior?.exteriorType, roofType: property.exterior?.roofType,
      exteriorGarage: property.exterior?.garage, driveway: property.exterior?.driveway, yard: property.exterior?.yard, patioDeck: property.exterior?.patioDeck,
      balcony: property.exterior?.balcony, pool: property.exterior?.pool, fence: property.exterior?.fence, landscaping: property.exterior?.landscaping,
      utilityElectricity: property.utilities?.electricity, utilityGas: property.utilities?.gas, utilityWater: property.utilities?.water,
      utilitySewerSeptic: property.utilities?.sewerSeptic, utilityInternet: property.utilities?.internet, utilitySolar: property.utilities?.solar,
      utilityWaterHeater: property.utilities?.waterHeater, hasHoa: property.hoa?.hasHoa, hoaName: property.hoa?.name, hoaFee: property.hoa?.fee,
      hoaFrequency: property.hoa?.frequency, hoaWebsiteContact: property.hoa?.websiteContact, virtualTourUrl: property.media?.virtualTourUrl,
      ownerName: property.ownerInformation?.name, ownerEmail: property.ownerInformation?.email, ownerPhone: property.ownerInformation?.phone,
      ownerMailingAddress: property.ownerInformation?.mailingAddress, ownerType: property.ownerInformation?.ownerType,
      ownerDeclaration: property.ownershipVerification?.declarationConfirmed
    };
    Object.entries(values).forEach(([name, value]) => setFormControl(form, name, value));
    setFormControl(form, 'ownershipVerificationStatus', titleCase(property.ownershipVerification?.status || 'unverified'));
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
    const labels = { home: 'Home dashboard', properties: 'Properties', estimates: 'Estimates', invoices: 'Invoices and receipts', billing: 'Payment methods', autopilot: 'Autopilot service requests', passport: 'Property Passport', utilities: 'Utility tracker', messages: 'Order messages', notifications: 'Notifications', referrals: 'Referrals and rewards', account: 'Account settings' };
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
    elements.invoiceList.innerHTML = invoices.map(invoice => {
      const status = requestedServicePaymentLabel(invoice);
      const paid = status === 'Paid';
      return `<article class="transaction-card invoice-list-card">
      <span class="invoice-list-icon" aria-hidden="true"><svg><use href="#icon-file"/></svg></span>
      <div><span class="invoice-card-kicker">${escapeHtml(invoice.invoiceNumber || 'Invoice')}</span><strong>${escapeHtml(invoice.job?.service || 'Service invoice')}</strong><span>Issued ${escapeHtml(date(invoice.issuedAt, { year: true }))}</span><small class="invoice-status is-${paid ? 'paid' : 'open'}">${escapeHtml(status)}</small></div>
      <div class="transaction-amount"><strong>${escapeHtml(money(invoice.amount))}</strong><span>${invoice.payment?.paymentDate ? `Paid ${escapeHtml(date(invoice.payment.paymentDate, { year: true }))}` : `Due ${escapeHtml(date(invoice.dueDate, { year: true }))}`}</span></div>
      <div class="transaction-actions"><button class="button button--dark" type="button" data-invoice-detail="${escapeHtml(invoice.id)}">View details</button>${!paid ? `<button class="button" type="button" data-pay-invoice="${escapeHtml(invoice.id)}">Pay invoice</button>` : `<a class="button" href="${escapeHtml(invoice.receiptPdfUrl)}" target="_blank" rel="noopener">Receipt</a>`}</div>
    </article>`;
    }).join('');
  }

  function invoicePaymentInstructions(invoice) {
    const instructions = invoice.paymentInstructions || {};
    const methods = Array.isArray(instructions.paymentMethods) ? instructions.paymentMethods : [];
    if (!methods.length && !instructions.remittanceContact && !instructions.proofUploadInstructions) return '';
    return `<section class="invoice-detail-section"><div class="invoice-section-heading"><span>Payment information</span><h3>Other payment instructions</h3></div><div class="invoice-instruction-list">${methods.map(method => `<div><strong>${escapeHtml(method.label || 'Payment method')}</strong><p>${escapeHtml(method.instructions || 'Contact SMPLfix for instructions.')}</p></div>`).join('')}${instructions.remittanceContact ? `<div><strong>Remittance contact</strong><p>${escapeHtml(instructions.remittanceContact)}</p></div>` : ''}${instructions.proofUploadInstructions ? `<div><strong>Payment proof</strong><p>${escapeHtml(instructions.proofUploadInstructions)}</p></div>` : ''}</div></section>`;
  }

  function renderInvoiceDialog(invoice) {
    const paymentStatus = requestedServicePaymentLabel(invoice);
    const paid = paymentStatus === 'Paid';
    const payment = invoice.payment || {};
    const company = invoice.company || {};
    const customer = invoice.customer || {};
    const job = invoice.job || {};
    const contractor = invoice.contractor || {};
    elements.invoiceDialogTitle.textContent = job.service || 'Service invoice';
    elements.invoiceDialogReference.textContent = invoice.invoiceNumber || '';
    elements.invoiceDialogBody.innerHTML = `<section class="invoice-amount-hero ${paid ? 'is-paid' : ''}"><div><span>${paid ? 'Payment complete' : 'Amount due'}</span><strong>${escapeHtml(money(invoice.amount))}</strong><p>${paid ? `Paid ${escapeHtml(date(payment.paymentDate, { year: true }))}` : `Due ${escapeHtml(date(invoice.dueDate, { year: true }))} · ${escapeHtml(invoice.terms || 'Due on receipt')}`}</p></div><span class="invoice-status-badge"><svg aria-hidden="true"><use href="#icon-${paid ? 'check' : 'clock'}"/></svg>${escapeHtml(paymentStatus)}</span></section>
      <section class="invoice-detail-grid"><article><span>Invoice number</span><strong>${escapeHtml(invoice.invoiceNumber || 'Pending')}</strong></article><article><span>Issued</span><strong>${escapeHtml(date(invoice.issuedAt, { year: true }))}</strong></article><article><span>Due date</span><strong>${escapeHtml(date(invoice.dueDate, { year: true }))}</strong></article><article><span>Payment reference</span><strong>${escapeHtml(payment.paymentReference || (paid ? 'Recorded' : 'Pending'))}</strong></article></section>
      <section class="invoice-detail-section"><div class="invoice-section-heading"><span>Service details</span><h3>${escapeHtml(job.service || 'Home service')}</h3></div><dl class="invoice-service-details"><div><dt>Order</dt><dd>${escapeHtml(job.orderReference || job.requestReference || 'Service order')}</dd></div>${customer.address ? `<div><dt>Service property</dt><dd>${escapeHtml(customer.address)}</dd></div>` : ''}<div><dt>Scope</dt><dd>${escapeHtml(job.scopeOfWork || job.description || 'See the invoice PDF for the complete scope of work.')}</dd></div>${contractor.name ? `<div><dt>Service professional</dt><dd>${escapeHtml(contractor.name)}${contractor.rocNumber ? ` · ROC ${escapeHtml(contractor.rocNumber)}` : ''}</dd></div>` : ''}</dl></section>
      <section class="invoice-billing-card"><div><span>Billed by</span><strong>${escapeHtml(company.name || 'SMPLfix')}</strong><p>${escapeHtml([company.email, company.phone].filter(Boolean).join(' · ') || 'Contact SMPLfix with invoice questions.')}</p>${company.address ? `<p>${escapeHtml(company.address)}</p>` : ''}</div><span class="invoice-secure-note"><svg aria-hidden="true"><use href="#icon-check"/></svg> Secure payment is completed on Stripe. SMPLfix never sees your full card details.</span></section>
      ${invoicePaymentInstructions(invoice)}`;
    elements.invoiceDialogPdf.href = invoice.pdfUrl;
    elements.invoiceDialogReceipt.hidden = !invoice.receiptPdfUrl;
    if (invoice.receiptPdfUrl) elements.invoiceDialogReceipt.href = invoice.receiptPdfUrl;
    elements.payInvoiceButton.hidden = paid;
    elements.payInvoiceButton.disabled = false;
    elements.payInvoiceButton.textContent = 'Pay securely';
  }

  async function openInvoice(invoiceId) {
    const cached = state.invoices.find(invoice => safeId(invoice.id) === safeId(invoiceId));
    if (cached) {
      state.currentInvoiceId = safeId(invoiceId);
      renderInvoiceDialog(cached);
      elements.invoiceDialog.showModal();
      return;
    }
    try {
      const result = await window.APIService.getResidentialInvoice(invoiceId);
      state.currentInvoiceId = safeId(invoiceId);
      renderInvoiceDialog(result.invoice);
      elements.invoiceDialog.showModal();
    } catch (error) { showToast(error?.message || 'Invoice details are unavailable.'); }
  }

  async function payInvoice(invoiceId, button = elements.payInvoiceButton) {
    if (!invoiceId || button.disabled) return;
    setButtonBusy(button, true, 'Opening secure checkout…');
    try {
      const result = await window.APIService.createResidentialInvoiceCheckout(invoiceId);
      if (!/^https:\/\/checkout\.stripe\.com\//.test(result.url)) throw new Error('Invalid payment-provider destination');
      window.location.assign(result.url);
    } catch (error) {
      showToast(error?.message || 'Secure invoice payment is unavailable.');
      setButtonBusy(button, false);
    }
  }

  function replaceInvoice(updated) {
    const index = state.invoices.findIndex(invoice => safeId(invoice.id) === safeId(updated?.id));
    if (index >= 0) state.invoices.splice(index, 1, updated);
    else if (updated) state.invoices.unshift(updated);
  }

  async function confirmReturnedInvoicePayment() {
    const params = new URL(window.location.href).searchParams;
    const outcome = params.get('payment');
    const invoiceId = params.get('invoice');
    const sessionId = params.get('session_id');
    if (!outcome) return;
    const cleanUrl = `${window.location.pathname}${window.location.hash || '#invoices'}`;
    window.history.replaceState({}, '', cleanUrl);
    if (outcome === 'cancelled') {
      showToast('Payment was cancelled. Your invoice is still available.');
      if (invoiceId) openInvoice(invoiceId);
      return;
    }
    if (outcome !== 'success' || !invoiceId || !sessionId) return showToast('Payment confirmation could not be verified.');
    try {
      const result = await window.APIService.confirmResidentialInvoicePayment(invoiceId, sessionId);
      replaceInvoice(result.invoice);
      renderHome();
      showToast('Payment received. Your receipt is ready.');
      openInvoice(invoiceId);
    } catch (error) { showToast(error?.message || 'Payment is processing. Refresh this page in a moment.'); }
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

  function jobDetailStage(detail) {
    const order = detail.order || {};
    const payment = normalizeStatus(detail.invoice?.payment?.status);
    const estimateDecision = normalizeStatus(detail.estimate?.decisionStatus);
    const orderStatus = normalizeStatus(order.status);
    const scheduleStatus = normalizeStatus(detail.schedule?.status);
    if (isCancelled(order)) return { label: 'Cancelled', note: 'This service request is no longer active.', tone: 'neutral' };
    if (order.actions?.cancellationPending) return { label: 'Cancellation requested', note: 'SMPLfix is reviewing your cancellation request.', tone: 'action' };
    if (order.actions?.reschedulePending) return { label: 'Schedule change requested', note: 'SMPLfix is coordinating a new service window.', tone: 'action' };
    if (['received', 'completed', 'paid'].includes(payment)) return { label: 'Paid', note: 'Payment received and this service record is complete.', tone: 'complete' };
    if (payment === 'failed') return { label: 'Payment failed', note: 'Update the saved payment method so this invoice can be completed.', tone: 'alert' };
    if (payment === 'refunded') return { label: 'Payment refunded', note: 'The recorded payment was refunded.', tone: 'neutral' };
    if (detail.invoice) return { label: 'Payment pending', note: 'The invoice is ready and payment has not been completed.', tone: 'action' };
    if (detail.completion) return { label: 'Work completed', note: 'Review the service notes and completion photos below.', tone: 'complete' };
    if (orderStatus === 'in-progress') return { label: 'Work in progress', note: 'The service professional is currently completing the work.', tone: 'active' };
    if (orderStatus === 'en-route') return { label: 'Service professional en route', note: 'The service professional is traveling to the property.', tone: 'active' };
    if (detail.schedule?.acceptedAt || ['accepted', 'confirmed', 'scheduled'].includes(scheduleStatus)) return { label: 'Scheduled', note: `Your confirmed service window is ${dateTime(detail.schedule.proposedStart)}.`, tone: 'active' };
    if (detail.schedule) return { label: 'Schedule proposed', note: `A service window beginning ${dateTime(detail.schedule.proposedStart)} is being coordinated.`, tone: 'action' };
    if (estimateDecision === 'approved') return { label: 'Estimate approved', note: 'SMPLfix is coordinating the service schedule.', tone: 'active' };
    if (estimateDecision === 'request-changes' || estimateDecision === 'changes-requested') return { label: 'Estimate changes requested', note: 'SMPLfix is reviewing your requested changes.', tone: 'action' };
    if (detail.estimate) return { label: 'Estimate ready', note: 'Review the estimate and approve it or request changes.', tone: 'action' };
    return { label: 'Request under review', note: 'SMPLfix is reviewing the request and coordinating qualified service professionals.', tone: 'neutral' };
  }

  function jobDetailActions(detail) {
    const order = detail.order || {};
    const actions = [];
    if (detail.estimate) actions.push(`<button class="button button--dark" type="button" data-estimate-detail="${escapeHtml(detail.estimate.id)}">${canApproveEstimate(detail.estimate) ? 'Review estimate' : 'View estimate'}</button>`);
    if (detail.invoice?.pdfUrl) actions.push(`<a class="button" href="${escapeHtml(detail.invoice.pdfUrl)}" target="_blank" rel="noopener">Invoice PDF</a>`);
    if (detail.invoice?.receiptPdfUrl) actions.push(`<a class="button" href="${escapeHtml(detail.invoice.receiptPdfUrl)}" target="_blank" rel="noopener">Receipt PDF</a>`);
    if (detail.invoice && !detail.invoice.receiptPdfUrl) actions.push('<button class="button" type="button" data-route-button="billing">Manage payment method</button>');
    if (order.actions?.reschedulePending) actions.push('<button class="button is-pending" type="button" disabled>Schedule change pending</button>');
    else if (order.actions?.canReschedule) actions.push(`<button class="button" type="button" data-order-action="reschedule" data-order-id="${escapeHtml(order.id)}">Request reschedule</button>`);
    if (order.actions?.cancellationPending) actions.push('<button class="button is-pending" type="button" disabled>Cancellation pending</button>');
    else if (order.actions?.canCancel) actions.push(`<button class="button button--danger" type="button" data-order-action="cancel" data-order-id="${escapeHtml(order.id)}">Request cancellation</button>`);
    if (isCompleted(order)) actions.push(`<button class="button" type="button" data-book-again="${escapeHtml(order.id)}">Book again</button>`);
    actions.push('<button class="button" type="button" data-route-button="messages">Message SMPLfix</button>');
    return `<div class="job-detail-actions">${actions.join('')}</div>`;
  }

  function photoGroup(title, photos = []) {
    return `<section class="photo-group"><h3>${escapeHtml(title)}</h3><div class="photo-grid">${photos.length ? photos.map(photo => `<a class="job-photo" href="${escapeHtml(photo.downloadUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(photo.downloadUrl)}" alt="${escapeHtml(`${title} service photo`)}" loading="lazy"><span>${escapeHtml(photo.name || 'Open photo')}</span></a>`).join('') : '<span class="transaction-copy">No photos provided</span>'}</div></section>`;
  }

  async function openJob(orderId) {
    try {
      const detail = await window.APIService.getResidentialOrder(orderId);
      const order = detail.order || {};
      const schedule = detail.schedule;
      const completion = detail.completion;
      const assignedVendor = order.vendor || schedule?.vendor;
      const vendor = assignedVendor || detail.estimate?.contractor || {};
      const estimate = detail.estimate;
      const invoice = detail.invoice;
      const payment = invoice?.payment;
      const stage = jobDetailStage(detail);
      const estimateStatus = estimate ? requestedServiceEstimateLabel(estimate) : 'Not issued';
      const paymentStatus = requestedServicePaymentLabel(invoice);
      const issues = order.request?.issueChips || [];
      elements.jobDialogTitle.textContent = order.service || 'Service job';
      elements.jobDialogReference.textContent = order.requestReference || order.orderReference || '';
      elements.jobDialogBody.innerHTML = `<section class="job-next-step is-${escapeHtml(stage.tone)}"><span>Current status</span><h3>${escapeHtml(stage.label)}</h3><p>${escapeHtml(stage.note)}</p></section>
        ${trackerMarkup(detail.tracker)}
        <div class="job-detail-status-grid">
          <div><span>Estimate</span><strong>${escapeHtml(estimateStatus)}</strong><small>${estimate ? money(estimate.clientTotal) : 'SMPLfix preparing pricing'}</small></div>
          <div><span>Invoice</span><strong>${escapeHtml(invoice ? 'Issued' : 'Not issued')}</strong><small>${invoice ? `${invoice.invoiceNumber || ''} · ${money(invoice.amount)}` : 'Created after completion'}</small></div>
          <div class="${paymentStatus === 'Paid' ? 'is-complete' : ['Failed', 'Disputed'].includes(paymentStatus) ? 'is-alert' : ''}"><span>Payment</span><strong>${escapeHtml(paymentStatus)}</strong><small>${payment?.paymentDate ? `Recorded ${date(payment.paymentDate, { year: true })}` : invoice?.dueDate ? `Due ${date(invoice.dueDate, { year: true })}` : 'No payment due yet'}</small></div>
          <div><span>Completion</span><strong>${escapeHtml(completion ? 'Submitted' : 'Pending')}</strong><small>${completion?.completedAt ? date(completion.completedAt, { year: true }) : 'Photos and notes will appear here'}</small></div>
        </div>
        <div class="transaction-summary job-summary"><div><span class="job-summary-icon" aria-hidden="true"><svg><use href="#icon-calendar"/></svg></span><span><small>${schedule?.acceptedAt ? 'Confirmed window' : 'Scheduling'}</small><strong>${escapeHtml(schedule ? `${dateTime(schedule.proposedStart)} – ${dateTime(schedule.proposedEnd)}` : 'To be confirmed')}</strong>${schedule?.status ? `<em>${escapeHtml(titleCase(schedule.status))}</em>` : ''}</span></div><div><span class="job-summary-icon" aria-hidden="true"><svg><use href="#icon-wrench"/></svg></span><span><small>${assignedVendor ? 'Assigned service professional' : estimate ? 'Contractor on estimate' : 'Service professional'}</small><strong>${escapeHtml(vendor.name || 'Matching in progress')}</strong>${vendor.rocNumber ? `<em>ROC ${escapeHtml(vendor.rocNumber)}</em>` : ''}</span></div><div><span class="job-summary-icon" aria-hidden="true"><svg><use href="#icon-home"/></svg></span><span><small>Request priority</small><strong>${escapeHtml(titleCase(order.request?.urgency || order.priority || 'routine'))}</strong><em>${escapeHtml(order.request?.preferredTiming || 'Timing not specified')}</em></span></div></div>
        <section class="job-request-card"><div class="job-request-heading"><span>Request summary</span><h3>What you asked us to handle</h3></div><p>${escapeHtml(order.description || 'No description provided.')}</p>${issues.length ? `<div class="job-detail-chips">${issues.map(issue => `<span>${escapeHtml(issue)}</span>`).join('')}</div>` : ''}<dl class="job-request-details"><div><dt>Submitted</dt><dd>${escapeHtml(date(order.createdAt, { year: true }))}</dd></div><div><dt>Preferred timing</dt><dd>${escapeHtml(order.request?.preferredTiming || 'Not specified')}</dd></div><div><dt>Access instructions</dt><dd>${escapeHtml(order.request?.accessInstructions || 'None provided')}</dd></div></dl></section>
        ${estimate ? `<section class="job-financial-card"><div><span>Customer estimate</span><h3>${escapeHtml(money(estimate.clientTotal))}</h3><p>${escapeHtml(estimate.scopeOfWork || 'Open the estimate to review the full scope and terms.')}</p></div><button class="button" type="button" data-estimate-detail="${escapeHtml(estimate.id)}">View estimate</button></section>` : ''}
        ${completion ? `<section class="completion-review"><div class="transaction-copy"><h3>Service notes</h3>${escapeHtml(completion.completionNotes || 'No service note was provided.')}</div><div class="completion-photos">${photoGroup('Before', completion.beforePhotos)}${photoGroup('After', completion.afterPhotos)}</div></section>` : ''}
        ${jobDetailActions(detail)}`;
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

  function propertyEmpty(message) {
    return `<div class="property-record-empty">${escapeHtml(message)}</div>`;
  }

  function propertyRecordRow(title, detail, status = '', action = '') {
    return `<div class="property-record-row"><div><strong>${escapeHtml(title)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div><div class="property-record-row-actions">${status ? `<span class="record-status">${escapeHtml(status)}</span>` : ''}${action}</div></div>`;
  }

  function requestedServiceEstimateLabel(estimate) {
    if (!estimate) return 'Preparing estimate';
    const decision = normalizeStatus(estimate.decisionStatus);
    if (decision === 'approved') return 'Approved';
    if (decision === 'request-changes' || decision === 'changes-requested') return 'Changes requested';
    if (normalizeStatus(estimate.status) === 'superseded') return 'Updated estimate pending';
    return 'Awaiting approval';
  }

  function requestedServicePaymentLabel(invoice) {
    if (!invoice) return 'Not due';
    const payment = normalizeStatus(invoice.payment?.status);
    if (['received', 'completed', 'paid'].includes(payment)) return 'Paid';
    if (payment === 'failed') return 'Failed';
    if (payment === 'disputed') return 'Disputed';
    if (payment === 'refunded') return 'Refunded';
    return 'Pending';
  }

  function requestedServiceCard(order, estimates, invoices, schedules) {
    const estimate = estimates.find(item => safeId(item.orderId) === safeId(order.id));
    const invoice = invoices.find(item => safeId(item.orderId) === safeId(order.id));
    const schedule = schedules.find(item => safeId(item.orderId) === safeId(order.id));
    const completed = isCompleted(order);
    const cancelled = isCancelled(order);
    const category = completed ? 'Recent job' : cancelled ? 'Past request' : 'Active job';
    const stage = titleCase(order.workflowStatus || order.status || 'request received');
    const estimateLabel = requestedServiceEstimateLabel(estimate);
    const invoiceLabel = invoice ? `Issued · ${money(invoice.amount)}` : 'Not issued';
    const paymentLabel = requestedServicePaymentLabel(invoice);
    const paymentClass = paymentLabel === 'Paid' ? 'is-complete' : ['Failed', 'Disputed'].includes(paymentLabel) ? 'is-alert' : '';
    return `<article class="requested-service-card">
      <header><div><span class="requested-service-type ${completed ? 'is-recent' : cancelled ? 'is-past' : 'is-active'}">${escapeHtml(category)}</span><h4>${escapeHtml(order.service || order.request?.serviceCategory || 'Service request')}</h4><small>${escapeHtml(order.requestReference || order.orderReference || '')} · ${escapeHtml(date(order.createdAt, { year: true }))}</small></div><button class="button" type="button" data-job-detail="${escapeHtml(order.id)}">View full details</button></header>
      <div class="requested-service-progress">
        <div><span>Current stage</span><strong>${escapeHtml(stage)}</strong></div>
        <div><span>Estimate</span><strong>${escapeHtml(estimateLabel)}</strong>${estimate ? `<small>${escapeHtml(money(estimate.clientTotal))}</small>` : ''}</div>
        <div><span>Invoice</span><strong>${escapeHtml(invoiceLabel)}</strong>${invoice?.invoiceNumber ? `<small>${escapeHtml(invoice.invoiceNumber)}</small>` : ''}</div>
        <div class="${paymentClass}"><span>Payment</span><strong>${escapeHtml(paymentLabel)}</strong>${invoice?.payment?.paymentDate ? `<small>${escapeHtml(date(invoice.payment.paymentDate, { year: true }))}</small>` : ''}</div>
        <div><span>Schedule</span><strong>${escapeHtml(schedule ? dateTime(schedule.proposedStart) : (completed ? date(order.completedAt || order.updatedAt, { year: true }) : 'Pending'))}</strong></div>
      </div>
    </article>`;
  }

  function openEditProperty() {
    const property = currentProperty();
    if (!property?.permissions?.manageProperty) return showToast('You do not have permission to edit this property.');
    const form = elements.editPropertyForm;
    form.reset();
    form.elements.label.value = property.label || '';
    form.elements.propertyType.value = property.propertyType || '';
    form.elements.addressLine1.value = property.address?.line1 || '';
    form.elements.addressLine2.value = property.address?.line2 || '';
    form.elements.city.value = property.address?.city || '';
    form.elements.state.value = property.address?.state || '';
    form.elements.postalCode.value = property.address?.postalCode || '';
    form.elements.country.value = property.address?.country || 'US';
    populateExtendedPropertyForm(form, property);
    form.elements.confirmAuthority.checked = false;
    setPropertyDetailsExpanded('editPropertyExtendedDetails', false);
    elements.editPropertyError.hidden = true;
    elements.editPropertyDialog.showModal();
  }

  async function submitPropertyEdit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (elements.updatePropertyButton.disabled || !form.reportValidity()) return;
    elements.editPropertyError.hidden = true;
    setButtonBusy(elements.updatePropertyButton, true, 'Saving…');
    try {
      validatePropertyUploads(form);
      const payload = propertyFormPayload(form);
      const response = await window.APIService.updateResidentialProperty(state.currentPropertyId, payload);
      const updated = response.property;
      const uploads = await uploadPropertyFiles(updated.id, form);
      state.properties = state.properties.map(property => safeId(property.id) === safeId(updated.id) ? updated : property);
      closeDialog(elements.editPropertyDialog);
      renderPropertySwitcher();
      renderHome();
      renderPropertyList();
      await showPropertyDetail(updated.id, { focus: false });
      showToast(uploads.failures.length ? `Property updated. ${uploads.failures.length} file upload${uploads.failures.length === 1 ? '' : 's'} need to be retried.` : `Property details updated${uploads.uploaded ? ` with ${uploads.uploaded} file${uploads.uploaded === 1 ? '' : 's'}` : ''}.`);
    } catch (error) {
      elements.editPropertyError.textContent = error?.message || 'Could not update this property.';
      elements.editPropertyError.hidden = false;
    } finally {
      setButtonBusy(elements.updatePropertyButton, false);
    }
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
    const recordTargets = [elements.propertyCoreDetails, elements.requestedServicesList, elements.propertyRequestsList, elements.propertyJobsList, elements.propertyAppointmentsList, elements.serviceHistoryList, elements.propertyCompletionPhotos, elements.propertyServiceNotes, elements.propertyInvoicesList, elements.propertyDocumentsList, elements.propertyMaintenanceList, elements.propertyUtilitiesList, elements.propertyAutopilotSummary];
    recordTargets.forEach(target => { target.innerHTML = propertyEmpty('Loading property record…'); });
    try {
      const [detail, ordersPayload, schedulesPayload, invoicesPayload, passportResult, maintenanceResult, utilitiesResult, autopilotResult] = await Promise.all([
        window.APIService.getResidentialProperty(propertyId),
        window.APIService.getResidentialOrders(`propertyId=${encodeURIComponent(propertyId)}&limit=100`),
        window.APIService.getResidentialSchedules(`propertyId=${encodeURIComponent(propertyId)}&limit=100`),
        window.APIService.getResidentialInvoices(`propertyId=${encodeURIComponent(propertyId)}&limit=100`),
        window.APIService.getResidentialPassport(propertyId).catch(() => ({ entries: [], documents: [] })),
        window.APIService.getResidentialMaintenance(propertyId).catch(() => ({ items: [] })),
        window.APIService.getResidentialUtilities(propertyId).catch(() => ({ data: [] })),
        window.APIService.getResidentialAutopilot(propertyId).catch(() => ({ autopilot: null }))
      ]);
      const property = detail.property || currentProperty();
      if (safeId(propertyId) !== safeId(state.currentPropertyId)) return;
      state.properties = state.properties.map(item => safeId(item.id) === safeId(property.id) ? property : item);
      const orders = list(ordersPayload);
      const completedOrders = orders.filter(isCompleted).sort((left, right) => new Date(right.completedAt || right.updatedAt) - new Date(left.completedAt || left.updatedAt));
      const active = orders.filter(order => !isCompleted(order) && !isCancelled(order));
      const schedules = list(schedulesPayload).sort((left, right) => new Date(right.proposedStart) - new Date(left.proposedStart));
      const orderIds = new Set(orders.map(order => safeId(order.id)));
      const invoices = list(invoicesPayload).filter(invoice => orderIds.has(safeId(invoice.orderId))).sort((left, right) => new Date(right.issuedAt || right.createdAt) - new Date(left.issuedAt || left.createdAt));
      const completedDetailResults = await Promise.allSettled(completedOrders.slice(0, 25).map(order => window.APIService.getResidentialOrder(order.id)));
      const completedDetails = completedDetailResults.filter(result => result.status === 'fulfilled').map(result => result.value);
      elements.propertyDetailTitle.textContent = property?.label || 'Property details';
      elements.propertyDetailAddress.textContent = address(property);
      elements.propertyDetailStatus.textContent = titleCase(property?.status || 'active');
      elements.editPropertyButton.hidden = property?.permissions?.manageProperty !== true;
      elements.propertyOpenJobs.textContent = detail.summary?.activeOrders ?? active.length;
      elements.propertyCompletedJobs.textContent = detail.summary?.completedOrders ?? completedOrders.length;
      elements.propertyAppointmentCount.textContent = schedules.length;
      elements.propertyInvoiceCount.textContent = invoices.length;
      const propertyDocuments = [...(property?.documents || []), ...(passportResult.documents || [])];
      elements.propertyDocumentCount.textContent = propertyDocuments.length;

        const display = value => value === false ? 'No' : value === true ? 'Yes' : String(value);
      const facts = [
        ['Property name', property?.label], ['Property type', property?.propertyType], ['Property subtype', property?.details?.subtype],
        ['Property title', property?.details?.title], ['Description', property?.details?.description], ['Year built', property?.details?.yearBuilt],
        ['Bedrooms', property?.details?.bedrooms], ['Full bathrooms', property?.details?.fullBathrooms], ['Half bathrooms', property?.details?.halfBathrooms],
        ['Living area', property?.details?.livingAreaSqFt ? `${property.details.livingAreaSqFt} sq ft` : ''],
        ['Lot size', property?.details?.lotSize ? `${property.details.lotSize} ${property.details.lotSizeUnit === 'acres' ? 'acres' : 'sq ft'}` : ''],
        ['Stories', property?.details?.stories], ['Garage spaces', property?.details?.garageSpaces], ['Parking spaces', property?.details?.parkingSpaces],
        ['Property condition', property?.details?.condition], ['Complete address', address(property)], ['County', property?.addressDetails?.county],
        ['APN / Parcel number', property?.addressDetails?.parcelNumber], ['Map location', property?.addressDetails?.latitude != null && property?.addressDetails?.longitude != null ? `${property.addressDetails.latitude}, ${property.addressDetails.longitude}` : ''],
        ['Flooring', property?.interior?.flooring], ['Kitchen', property?.interior?.kitchen], ['Appliances', property?.interior?.appliances],
        ['Heating', property?.interior?.heating], ['Cooling / AC', property?.interior?.cooling], ['Fireplace', property?.interior?.fireplace],
        ['Laundry', property?.interior?.laundry], ['Basement', property?.interior?.basement], ['Attic', property?.interior?.attic],
        ['Furnishing', property?.interior?.furnishing ? titleCase(property.interior.furnishing) : ''], ['Exterior type', property?.exterior?.exteriorType],
        ['Roof type', property?.exterior?.roofType], ['Garage', property?.exterior?.garage], ['Driveway', property?.exterior?.driveway],
        ['Yard', property?.exterior?.yard], ['Patio / Deck', property?.exterior?.patioDeck], ['Balcony', property?.exterior?.balcony],
        ['Pool', property?.exterior?.pool], ['Fence', property?.exterior?.fence], ['Landscaping', property?.exterior?.landscaping],
        ['Electricity', property?.utilities?.electricity], ['Gas', property?.utilities?.gas], ['Water', property?.utilities?.water],
        ['Sewer / Septic', property?.utilities?.sewerSeptic], ['Internet', property?.utilities?.internet], ['Solar', property?.utilities?.solar],
        ['Water heater', property?.utilities?.waterHeater], ['Has HOA', property?.hoa?.hasHoa], ['HOA name', property?.hoa?.name],
        ['HOA fee', property?.hoa?.fee != null ? money(property.hoa.fee) : ''], ['HOA frequency', property?.hoa?.frequency ? titleCase(property.hoa.frequency) : ''],
        ['HOA website / contact', property?.hoa?.websiteContact], ['Virtual tour', property?.media?.virtualTourUrl], ['Owner name', property?.ownerInformation?.name],
        ['Owner email', property?.ownerInformation?.email], ['Owner phone', property?.ownerInformation?.phone], ['Owner mailing address', property?.ownerInformation?.mailingAddress],
        ['Owner type', property?.ownerInformation?.ownerType ? titleCase(property.ownerInformation.ownerType) : ''],
        ['Ownership verification', titleCase(property?.ownershipVerification?.status || 'unverified')],
        ['Owner declaration', property?.ownershipVerification?.declarationConfirmed === true], ['Relationship', titleCase(property?.relationship || 'owner')],
        ['Status', titleCase(property?.status || 'active')], ['Added', date(property?.createdAt, { year: true })]
      ];
        const providedFacts = facts.filter(([, value]) =>
            value === true || value === false || value === 0 ||
            (String(value ?? '').trim() && !['Not provided', 'Date pending'].includes(String(value)))
        );
        elements.propertyCoreDetails.innerHTML = providedFacts.length
            ? providedFacts.map(([label, value]) => `<div class="property-fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display(value))}</strong></div>`).join('')
            : propertyEmpty('Add property details to build this profile.');

      const estimates = state.estimates
        .filter(estimate => orderIds.has(safeId(estimate.orderId)))
        .sort((left, right) => new Date(right.sentAt || right.createdAt) - new Date(left.sentAt || left.createdAt));
      const requestedServices = [...active, ...completedOrders, ...orders.filter(isCancelled)]
        .filter((order, index, items) => items.findIndex(item => safeId(item.id) === safeId(order.id)) === index);
      elements.requestedServicesList.innerHTML = requestedServices.length
        ? requestedServices.map(order => requestedServiceCard(order, estimates, invoices, schedules)).join('')
        : propertyEmpty('No requested services for this property yet.');

      elements.propertyRequestsList.innerHTML = orders.length ? orders.map(order => propertyRecordRow(
        order.service || order.request?.serviceCategory || 'Service request',
        `${order.requestReference || order.orderReference || ''} · ${date(order.createdAt, { year: true })}`,
        titleCase(order.workflowStatus || order.status),
        `<button class="text-button" type="button" data-job-detail="${escapeHtml(order.id)}">View</button>`
      )).join('') : propertyEmpty('No service requests for this property yet.');

      elements.propertyJobsList.innerHTML = orders.length ? [...active, ...completedOrders].map(order => propertyRecordRow(
        order.service || 'Service job',
        order.vendor?.name || (isCompleted(order) ? 'Completed service' : 'SMPLfix coordinating'),
        isCompleted(order) ? 'Completed' : titleCase(order.status || order.workflowStatus),
        `<button class="text-button" type="button" data-job-detail="${escapeHtml(order.id)}">Details</button>`
      )).join('') : propertyEmpty('No jobs connected to this property.');

      elements.propertyAppointmentsList.innerHTML = schedules.length ? schedules.map(schedule => propertyRecordRow(
        schedule.job?.service || 'Service appointment',
        `${dateTime(schedule.proposedStart)} – ${dateTime(schedule.proposedEnd)}`,
        titleCase(schedule.status),
        `<button class="text-button" type="button" data-job-detail="${escapeHtml(schedule.orderId)}">Job</button>`
      )).join('') : propertyEmpty('No appointments scheduled.');

      elements.serviceHistoryList.innerHTML = completedOrders.length ? completedOrders.map(order => `<article class="history-item">
        <span class="job-icon"><svg aria-hidden="true"><use href="#icon-file"></use></svg></span>
        <div><strong>${escapeHtml(order.service || 'Completed service')}</strong><small>${escapeHtml(order.vendor?.name || 'SMPLfix service professional')} · ${escapeHtml(order.orderReference || '')}</small></div>
        <div class="job-status"><span>Completed</span><small>${escapeHtml(date(order.completedAt || order.updatedAt, { year: true }))}</small><button class="text-button" type="button" data-job-detail="${escapeHtml(order.id)}">View details</button></div>
      </article>`).join('') : emptyMarkup('icon-file', 'No completed services yet', 'Completed work will build the permanent history for this property.');

      const photos = completedDetails.flatMap(item => [
        ...(item.completion?.beforePhotos || []).map(photo => ({ ...photo, phase: 'Before', service: item.order?.service })),
        ...(item.completion?.afterPhotos || []).map(photo => ({ ...photo, phase: 'After', service: item.order?.service }))
      ]);
      elements.propertyCompletionPhotos.innerHTML = photos.length ? photos.map(photo => `<a class="property-photo" href="${escapeHtml(photo.downloadUrl)}" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#icon-file"></use></svg><strong>${escapeHtml(photo.name || 'Completion photo')}</strong><small>${escapeHtml(`${photo.phase} · ${photo.service || 'Service'}`)}</small></a>`).join('') : propertyEmpty('No completion photos available yet.');

      const notes = completedDetails.flatMap(item => {
        const rows = [];
        if (item.completion?.completionNotes) rows.push({ title: item.order?.service || 'Completion note', text: item.completion.completionNotes, date: item.completion.completedAt });
        if (item.order?.request?.accessInstructions) rows.push({ title: `${item.order?.service || 'Service'} access note`, text: item.order.request.accessInstructions, date: item.order.createdAt });
        return rows;
      });
      elements.propertyServiceNotes.innerHTML = notes.length ? notes.map(note => propertyRecordRow(note.title, `${note.text} · ${date(note.date, { year: true })}`)).join('') : propertyEmpty('No service notes recorded yet.');

      elements.propertyInvoicesList.innerHTML = invoices.length ? invoices.map(invoice => propertyRecordRow(
        invoice.invoiceNumber || 'Invoice',
        `${money(invoice.amount)} · ${date(invoice.issuedAt, { year: true })}`,
        invoice.payment?.status ? titleCase(invoice.payment.status) : 'Open',
        `<a href="${escapeHtml(invoice.pdfUrl)}" target="_blank" rel="noopener">Invoice</a>${invoice.receiptPdfUrl ? `<a href="${escapeHtml(invoice.receiptPdfUrl)}" target="_blank" rel="noopener">Receipt</a>` : ''}`
      )).join('') : propertyEmpty('No invoices or receipts yet.');

      elements.propertyDocumentsList.innerHTML = propertyDocuments.length ? propertyDocuments.map(document => propertyRecordRow(
        document.title || document.name || 'Property document',
        `${titleCase(document.category || document.source || 'document')} · ${date(document.uploadedAt, { year: true })}`,
        '', `<a href="${escapeHtml(document.downloadUrl)}" target="_blank" rel="noopener">Open</a>`
      )).join('') : propertyEmpty('No property documents uploaded.');

      const maintenance = maintenanceResult.items || [];
      elements.propertyMaintenanceList.innerHTML = maintenance.length ? maintenance.map(item => propertyRecordRow(item.title, `Every ${item.frequencyMonths} months · ${date(item.dueAt, { year: true })}`, titleCase(item.status))).join('') : propertyEmpty('No maintenance items enabled.');

      const utilities = list(utilitiesResult);
      elements.propertyUtilitiesList.innerHTML = utilities.length ? utilities.slice(0, 12).map(item => propertyRecordRow(titleCase(item.utilityType), `${item.usage} ${item.unit} · ${date(item.periodEnd, { year: true })}${item.cost != null ? ` · ${money(item.cost)}` : ''}`)).join('') : propertyEmpty('No utility readings recorded.');

      const autopilot = autopilotResult.autopilot;
      const enabledServices = (autopilot?.services || []).filter(service => service.enabled);
      elements.propertyAutopilotSummary.innerHTML = autopilot ? [
        propertyRecordRow('Autopilot', autopilot.enabled ? `${enabledServices.length} recurring service request${enabledServices.length === 1 ? '' : 's'}` : 'Recurring service requests are paused', autopilot.enabled ? 'Active' : 'Paused'),
        propertyRecordRow('Automatic approval', autopilot.autoApprovalEnabled ? `Up to ${money(autopilot.autoApprovalThreshold)} per service` : 'Manual approval required', autopilot.autoApprovalEnabled ? 'On' : 'Off')
      ].join('') : propertyEmpty('Autopilot settings are unavailable.');
    } catch (error) {
      recordTargets.forEach(target => { target.innerHTML = propertyEmpty(error?.message || 'Property record is temporarily unavailable.'); });
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
      await confirmReturnedInvoicePayment();
      window.dispatchEvent(new CustomEvent('residential:loaded'));
    } catch (error) {
      showFailure(error);
    }
  }

  function bindEvents() {
    byId('addPropertyButton').addEventListener('click', () => {
      byId('addPropertyForm').reset();
      setPropertyDetailsExpanded('addPropertyExtendedDetails', false);
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
        validatePropertyUploads(form);
        const payload = propertyFormPayload(form);
        const response = await window.APIService.addResidentialProperty(payload);
        const uploads = await uploadPropertyFiles(response.data.id, form);
        state.currentPropertyId = safeId(response.data.id);
        closeDialog(byId('addPropertyDialog'));
        await loadPortal();
        showToast(uploads.failures.length ? `Property added. ${uploads.failures.length} file upload${uploads.failures.length === 1 ? '' : 's'} need to be retried.` : response.alreadyConnected ? 'This property is already connected.' : `Property added${uploads.uploaded ? ` with ${uploads.uploaded} file${uploads.uploaded === 1 ? '' : 's'}` : ''}.`);
      } catch (cause) {
        error.textContent = cause.message || 'Could not add this property. Please try again.'; error.hidden = false;
      } finally { button.disabled = false; button.textContent = 'Add property'; form.removeAttribute('aria-busy'); }
    });
    elements.editPropertyButton.addEventListener('click', openEditProperty);
    elements.editPropertyForm.addEventListener('submit', submitPropertyEdit);
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
    elements.payInvoiceButton.addEventListener('click', () => payInvoice(state.currentInvoiceId, elements.payInvoiceButton));
    elements.invoiceDialog.querySelectorAll('[data-close-dialog="invoiceDialog"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        closeDialog(elements.invoiceDialog);
      });
    });
    elements.invoiceDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeDialog(elements.invoiceDialog);
    });
    elements.invoiceDialog.addEventListener('click', event => {
      if (event.target === elements.invoiceDialog) closeDialog(elements.invoiceDialog);
    });
    elements.invoiceDialog.querySelectorAll('[data-close-dialog="invoiceDialog"]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        closeDialog(elements.invoiceDialog);
      });
    });
    elements.invoiceDialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeDialog(elements.invoiceDialog);
    });
    elements.invoiceDialog.addEventListener('click', event => {
      if (event.target === elements.invoiceDialog) closeDialog(elements.invoiceDialog);
    });
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
      const closeDialogButton = event.target.closest('[data-close-dialog]');
      if (closeDialogButton) {
        closeDialog(byId(closeDialogButton.dataset.closeDialog));
        return;
      }
      const routeButton = event.target.closest('[data-route-button]');
      if (routeButton) { closeDialog(elements.jobDialog); closeDialog(elements.invoiceDialog); window.location.hash = routeButton.dataset.routeButton; }
      const detailButton = event.target.closest('[data-property-detail]');
      if (detailButton) showPropertyDetail(detailButton.dataset.propertyDetail);
      const propertyRouteButton = event.target.closest('[data-property-route]');
      if (propertyRouteButton) window.location.hash = propertyRouteButton.dataset.propertyRoute;
      const propertyDetailsToggle = event.target.closest('[data-expand-property-details]');
      if (propertyDetailsToggle) setPropertyDetailsExpanded(propertyDetailsToggle.dataset.expandPropertyDetails, propertyDetailsToggle.getAttribute('aria-expanded') !== 'true');
      const bookAgainButton = event.target.closest('[data-book-again]');
      if (bookAgainButton) { closeDialog(elements.jobDialog); bookAgain(bookAgainButton.dataset.bookAgain, bookAgainButton); }
      const orderActionButton = event.target.closest('[data-order-action]');
      if (orderActionButton) { closeDialog(elements.jobDialog); openOrderAction(orderActionButton.dataset.orderId, orderActionButton.dataset.orderAction); }
      const estimateButton = event.target.closest('[data-estimate-detail]');
      if (estimateButton) { closeDialog(elements.jobDialog); openEstimate(estimateButton.dataset.estimateDetail); }
      const jobButton = event.target.closest('[data-job-detail]');
      if (jobButton) openJob(jobButton.dataset.jobDetail);
      const invoiceButton = event.target.closest('[data-invoice-detail]');
      if (invoiceButton) openInvoice(invoiceButton.dataset.invoiceDetail);
      const invoicePayButton = event.target.closest('[data-pay-invoice]');
      if (invoicePayButton) payInvoice(invoicePayButton.dataset.payInvoice, invoicePayButton);
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
      editPropertyButton: byId('editPropertyButton'), editPropertyDialog: byId('editPropertyDialog'), editPropertyForm: byId('editPropertyForm'),
      editPropertyError: byId('editPropertyError'), updatePropertyButton: byId('updatePropertyButton'),
      propertyOpenJobs: byId('propertyOpenJobs'), propertyCompletedJobs: byId('propertyCompletedJobs'), propertyAppointmentCount: byId('propertyAppointmentCount'),
      propertyInvoiceCount: byId('propertyInvoiceCount'), propertyDocumentCount: byId('propertyDocumentCount'), propertyCoreDetails: byId('propertyCoreDetails'),
      requestedServicesList: byId('requestedServicesList'), propertyRequestsList: byId('propertyRequestsList'), propertyJobsList: byId('propertyJobsList'), propertyAppointmentsList: byId('propertyAppointmentsList'),
      serviceHistoryList: byId('serviceHistoryList'), propertyCompletionPhotos: byId('propertyCompletionPhotos'), propertyServiceNotes: byId('propertyServiceNotes'),
      propertyInvoicesList: byId('propertyInvoicesList'), propertyDocumentsList: byId('propertyDocumentsList'), propertyMaintenanceList: byId('propertyMaintenanceList'),
      propertyUtilitiesList: byId('propertyUtilitiesList'), propertyAutopilotSummary: byId('propertyAutopilotSummary'), toast: byId('portalToast'), routeStatus: byId('routeStatus'),
      openRequestButton: byId('openRequestButton'), openEmergencyButton: byId('openEmergencyButton'),
      requestDialog: byId('requestDialog'), requestForm: byId('requestForm'), requestProperty: byId('requestProperty'),
      requestDialogTitle: byId('requestDialogTitle'), requestDialogDescription: byId('requestDialogDescription'),
      requestUrgency: byId('requestUrgency'), urgencyField: byId('urgencyField'), emergencyAcknowledgement: byId('emergencyAcknowledgement'),
      requestDocuments: byId('requestDocuments'), fileSummary: byId('fileSummary'), requestFormError: byId('requestFormError'), submitRequestButton: byId('submitRequestButton'),
      orderActionDialog: byId('orderActionDialog'), orderActionForm: byId('orderActionForm'), orderActionTitle: byId('orderActionTitle'),
      orderActionDescription: byId('orderActionDescription'), actionTimingField: byId('actionTimingField'), actionPreferredTiming: byId('actionPreferredTiming'),
      actionReason: byId('actionReason'), actionReasonLabel: byId('actionReasonLabel'), orderActionError: byId('orderActionError'), submitOrderAction: byId('submitOrderAction'),
      estimatesPageList: byId('estimatesPageList'), invoiceList: byId('invoiceList'), paymentMethodList: byId('paymentMethodList'),
      addCardButton: byId('addCardButton'), manageCardsButton: byId('manageCardsButton'),
      invoiceDialog: byId('invoiceDialog'), invoiceDialogTitle: byId('invoiceDialogTitle'), invoiceDialogReference: byId('invoiceDialogReference'),
      invoiceDialogBody: byId('invoiceDialogBody'), invoiceDialogPdf: byId('invoiceDialogPdf'), invoiceDialogReceipt: byId('invoiceDialogReceipt'), payInvoiceButton: byId('payInvoiceButton'),
      estimateDialog: byId('estimateDialog'), estimateDialogTitle: byId('estimateDialogTitle'), estimateDialogReference: byId('estimateDialogReference'), estimateDialogBody: byId('estimateDialogBody'),
      estimateDecisionForm: byId('estimateDecisionForm'), estimateDecisionAction: byId('estimateDecisionAction'), estimateTypedName: byId('estimateTypedName'),
      estimateChangesField: byId('estimateChangesField'), estimateChanges: byId('estimateChanges'), estimateConsent: byId('estimateConsent'), estimateTermsAccepted: byId('estimateTermsAccepted'),
      estimateDecisionError: byId('estimateDecisionError'), requestEstimateChangesButton: byId('requestEstimateChangesButton'), approveEstimateButton: byId('approveEstimateButton'), submitEstimateDecision: byId('submitEstimateDecision'),
      jobDialog: byId('jobDialog'), jobDialogTitle: byId('jobDialogTitle'), jobDialogReference: byId('jobDialogReference'), jobDialogBody: byId('jobDialogBody')
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initializePropertyDetailForms();
    cacheElements();
    bindEvents();
    setOffline(!navigator.onLine);
    loadPortal();
  });

  function updateUser(account) {
    state.user = { ...state.user, firstName: account.firstName, lastName: account.lastName, phone: account.phone };
    renderAccount();
  }

  window.ResidentialPortal = { state, loadPortal, navigate, showPropertyDetail, updateUser, __test: { activeOrders, actionEstimates, escapeHtml, isCompleted, jobDetailStage, normalizeStatus, requestedServicePaymentLabel } };
})();
