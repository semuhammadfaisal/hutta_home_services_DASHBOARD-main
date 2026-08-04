(() => {
  const escapeHtml = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const request = (endpoint, options = {}) => window.APIService.request(`/vendor-onboarding${endpoint}`, options);
  const reviewState = { page: 1, pages: 1, limit: 25, status: 'pending_review', search: '', currentVendorId: null };
  const inviteState = { page: 1, pages: 1, limit: 25, status: 'all', search: '' };
  let latestInvitations = [];
  const reviewStatusLabels = { pending_review: 'Pending Review', changes_requested: 'Changes Requested', rejected: 'Rejected' };
  const inviteStatusLabels = {
    all: 'All Invitations',
    sent: 'Sent',
    delivery_failed: 'Delivery Failed',
    processing: 'Processing',
    submitted: 'Submitted',
    expired: 'Expired',
    revoked: 'Revoked'
  };

  const displayValue = (value, fallback = 'Not provided') => value === undefined || value === null || value === '' ? fallback : String(value);
  const displayDate = (value, includeTime = false) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return includeTime ? date.toLocaleString() : date.toLocaleDateString();
  };

  function currentUserEmail() {
    return window.AuthSession?.user?.email || '';
  }

  function prefillVendorUpdateEmail(force = false) {
    const input = document.getElementById('vendorInviteUpdateEmail');
    if (!input) return;
    if (force || !input.value) input.value = currentUserEmail();
  }

  function activateReviewNavigation(section = 'vendor-reviews') {
    window.dashboard?.showSection?.(section);
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-section="${section === 'vendor-review-detail' ? 'vendor-reviews' : section}"]`)?.parentElement?.classList.add('active');
  }

  function updateReviewCounts(counts = {}) {
    const pending = Number(counts.pending_review || 0);
    const mapping = {
      vendorReviewsPendingCount: pending,
      vendorReviewsChangesCount: Number(counts.changes_requested || 0),
      vendorReviewsRejectedCount: Number(counts.rejected || 0)
    };
    Object.entries(mapping).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
    const badge = document.getElementById('vendorReviewNavBadge');
    if (badge) {
      badge.textContent = pending > 99 ? '99+' : String(pending);
      badge.hidden = pending === 0;
    }
    document.querySelectorAll('[data-review-status-card]').forEach(card => card.classList.toggle('active', card.dataset.reviewStatusCard === reviewState.status));
  }

  function reviewQuery() {
    const query = new URLSearchParams({
      status: reviewState.status,
      page: String(reviewState.page),
      limit: String(reviewState.limit)
    });
    if (reviewState.search) query.set('search', reviewState.search);
    return query.toString();
  }

  function invitationQuery() {
    const query = new URLSearchParams({
      status: inviteState.status,
      page: String(inviteState.page),
      limit: String(inviteState.limit)
    });
    if (inviteState.search) query.set('search', inviteState.search);
    return query.toString();
  }

  function duplicateWarningsHtml(warnings = []) {
    if (!warnings.length) return '';
    return `<div class="vendor-duplicate-warning" role="status">
      <strong><i class="fas fa-triangle-exclamation"></i> Possible duplicate found</strong>
      <p>Review these matches before approving so duplicate vendor records are not created.</p>
      <ul>${warnings.map(item => `<li><span>${escapeHtml(item.vendorName || item.email || 'Existing record')}</span><small>${escapeHtml((item.reasons || []).join(', ') || item.status || 'Possible match')}</small></li>`).join('')}</ul>
    </div>`;
  }

  function middleTruncate(value, head = 14, tail = 10) {
    const text = String(value || '').trim();
    if (text.length <= head + tail + 3) return text;
    return `${text.slice(0, head)}...${text.slice(-tail)}`;
  }

  function renderReviewRows(reviews) {
    const body = document.getElementById('vendorReviewsTableBody');
    if (!body) return;
    if (!reviews.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="vendor-review-empty"><span><i class="fas fa-inbox"></i></span><strong>No applications found</strong><p>There are no vendor applications matching this status and search.</p></div></td></tr>';
      return;
    }
    body.innerHTML = reviews.map(vendor => `
      <tr>
        <td><div class="vendor-review-company"><strong>${escapeHtml(vendor.name || 'Unnamed Vendor')}</strong><span>#${escapeHtml(String(vendor._id).slice(-8).toUpperCase())}</span></div></td>
        <td>${vendor.email ? `<a class="vendor-review-email" href="mailto:${escapeHtml(vendor.email)}">${escapeHtml(vendor.email)}</a>` : '<span class="table-muted">Not provided</span>'}</td>
        <td><span class="vendor-review-category">${escapeHtml(displayValue(vendor.category))}</span></td>
        <td>${vendor.requestedCategory ? `<span class="vendor-review-requested">${escapeHtml(vendor.requestedCategory)}</span>` : '<span class="table-muted">No change</span>'}</td>
        <td>${escapeHtml(displayDate(vendor.submittedAt || vendor.createdAt))}</td>
        <td><span class="vendor-review-missing ${vendor.missingDocumentCount ? '' : 'complete'}">${vendor.missingDocumentCount ? `${vendor.missingDocumentCount} missing` : 'Complete'}</span></td>
        <td><span class="onboarding-status-badge ${escapeHtml(vendor.onboardingStatus)}">${escapeHtml(reviewStatusLabels[vendor.onboardingStatus] || vendor.onboardingStatus)}</span></td>
        <td><button type="button" class="btn-secondary vendor-review-open" onclick="openVendorReview('${vendor._id}')"><i class="fas fa-eye"></i> Open review <i class="fas fa-arrow-right"></i></button></td>
      </tr>`).join('');
  }

  window.loadVendorReviews = async function(force = false) {
    const body = document.getElementById('vendorReviewsTableBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="8"><div class="vendor-review-loading"><span class="vendor-review-spinner"></span><strong>Loading applications</strong><small>Refreshing the review queue...</small></div></td></tr>';
    if (force) window.APIService.clearCache();
    try {
      const payload = await request(`/reviews?${reviewQuery()}`);
      reviewState.pages = payload.pagination?.pages || 1;
      reviewState.page = payload.pagination?.page || 1;
      renderReviewRows(payload.data || []);
      updateReviewCounts(payload.counts);
      const label = document.getElementById('vendorReviewPageLabel');
      const previous = document.getElementById('vendorReviewPrevious');
      const next = document.getElementById('vendorReviewNext');
      if (label) label.textContent = `Page ${reviewState.page} of ${reviewState.pages}`;
      if (previous) previous.disabled = reviewState.page <= 1;
      if (next) next.disabled = reviewState.page >= reviewState.pages;
    } catch (error) {
      body.innerHTML = `<tr><td colspan="8" class="table-muted">${escapeHtml(error.message)}</td></tr>`;
    }
  };

  window.refreshVendorReviewCount = async function() {
    try {
      const payload = await request('/reviews?status=pending_review&page=1&limit=1');
      updateReviewCounts(payload.counts);
    } catch (_error) {}
  };

  window.setVendorReviewStatus = function(status) {
    reviewState.status = status;
    reviewState.page = 1;
    const filter = document.getElementById('vendorReviewStatusFilter');
    if (filter) filter.value = status;
    window.loadVendorReviews(true);
  };

  window.changeVendorReviewPage = function(direction) {
    const nextPage = reviewState.page + Number(direction || 0);
    if (nextPage < 1 || nextPage > reviewState.pages) return;
    reviewState.page = nextPage;
    window.loadVendorReviews();
  };

  function fieldsHtml(fields) {
    return `<div class="vendor-review-fields">${fields.map(([label, value, raw = false]) => `<div class="vendor-review-field"><span>${escapeHtml(label)}</span><strong>${raw ? value : escapeHtml(displayValue(value))}</strong></div>`).join('')}</div>`;
  }

  function listHtml(items, formatter) {
    if (!items?.length) return '<p class="table-muted">None provided.</p>';
    return `<ul class="vendor-review-list">${items.map(item => `<li>${formatter(item)}</li>`).join('')}</ul>`;
  }

  function renderReviewDetail(vendor) {
    reviewState.currentVendorId = vendor._id;
    reviewState.currentVendorName = vendor.name || 'Vendor Application';
    document.getElementById('vendorReviewDetailTitle').textContent = vendor.name || 'Vendor Application';
    const meta = document.getElementById('vendorReviewDetailMeta');
    const actions = document.getElementById('vendorReviewDetailActions');
    const alert = document.getElementById('vendorReviewDetailAlert');
    const canDecide = vendor.onboardingStatus === 'pending_review';
    const failedChangeInvitation = (vendor.invitationHistory || []).find(invitation => invitation.purpose === 'changes_requested' && invitation.status === 'delivery_failed');
    actions.innerHTML = canDecide
      ? `<button type="button" class="approve" onclick="decideVendorReview('${vendor._id}','approve')"><i class="fas fa-check"></i> Approve</button><button type="button" class="changes" onclick="decideVendorReview('${vendor._id}','request_changes')"><i class="fas fa-edit"></i> Request Changes</button><button type="button" class="reject" onclick="decideVendorReview('${vendor._id}','reject')"><i class="fas fa-times"></i> Reject</button>`
      : failedChangeInvitation
        ? `<button type="button" class="changes" onclick="retryVendorChangeRequest('${failedChangeInvitation._id}','${vendor._id}')"><i class="fas fa-paper-plane"></i> Retry Changes Email</button>`
      : vendor.onboardingEmailStatus === 'failed'
        ? `<button type="button" class="changes" onclick="retryVendorReviewEmail('${vendor._id}')"><i class="fas fa-paper-plane"></i> Retry Email</button>`
        : '';
    if (vendor.onboardingEmailStatus === 'failed' || failedChangeInvitation) {
      alert.textContent = vendor.onboardingEmailStatus === 'failed'
        ? `The review decision was saved, but email delivery failed: ${vendor.onboardingEmailError || 'Unknown delivery error'}`
        : `The changes request was saved, but email delivery failed: ${failedChangeInvitation.lastDeliveryError || 'Unknown delivery error'}`;
      alert.hidden = false;
    } else {
      alert.hidden = true;
      alert.textContent = '';
    }
    const isAdmin = window.RBAC?.getRole?.() === 'admin';
    const taxValue = vendor.einTaxIdMasked
      ? `<span class="vendor-review-tax">${escapeHtml(vendor.einTaxIdMasked)}${isAdmin ? `<button type="button" onclick="revealVendorTaxId('${vendor._id}')">Reveal</button>` : ''}</span>`
      : 'Not provided';
    const activeTypes = new Set((vendor.documents || []).filter(document => document.status !== 'archived').map(document => document.complianceDocumentType));
    const complianceTypes = (vendor.requiredDocuments?.length ? vendor.requiredDocuments.map(item => [item.type, item.label]) : [['huttasContract','Contract'],['w9','W-9'],['certificateOfInsurance','Insurance'],['workersCompInsurance','Workers Comp'],['huttasAdditionalInsured','Additional Insured']]);
    const history = (vendor.onboardingHistory || []).slice().reverse();
    const invitations = vendor.invitationHistory || [];
    const activeDocuments = (vendor.documents || []).filter(document => document.status !== 'archived');
    const missingCount = complianceTypes.filter(([type]) => !activeTypes.has(type)).length;
    const statusLabel = reviewStatusLabels[vendor.onboardingStatus] || displayValue(vendor.onboardingStatus).replace(/_/g, ' ');
    if (meta) meta.innerHTML = `<span class="onboarding-status-badge ${escapeHtml(vendor.onboardingStatus)}">${escapeHtml(statusLabel)}</span><span><i class="fas fa-calendar-alt"></i> Submitted ${escapeHtml(displayDate(vendor.submittedAt, true))}</span><span><i class="fas fa-lock"></i> Read-only</span>`;
    const content = document.getElementById('vendorReviewDetailContent');
    content.innerHTML = `
      <section class="vendor-review-overview full">
        <div class="vendor-review-overview-identity"><div><p>Vendor Application</p><h2>${escapeHtml(vendor.name || 'Unnamed Vendor')}</h2><a href="mailto:${escapeHtml(vendor.email || '')}">${escapeHtml(displayValue(vendor.email))}</a></div></div>
        <div class="vendor-review-overview-metrics"><div><span><i class="fas fa-tags"></i></span><strong>${escapeHtml(displayValue(vendor.category))}</strong><small>Assigned category</small></div><div class="${missingCount ? 'attention' : 'complete'}"><span><i class="fas ${missingCount ? 'fa-exclamation-triangle' : 'fa-check'}"></i></span><strong>${missingCount ? `${missingCount} missing` : 'Complete'}</strong><small>Compliance documents</small></div><div><span><i class="fas fa-folder-open"></i></span><strong>${activeDocuments.length}</strong><small>Active documents</small></div></div>
        ${vendor.requestedCategory ? `<div class="vendor-review-category-request"><i class="fas fa-info-circle"></i><span><strong>Category change requested</strong>The vendor requested <b>${escapeHtml(vendor.requestedCategory)}</b>. Approval keeps the assigned category unless staff updates it later.</span></div>` : ''}
      </section>
      ${duplicateWarningsHtml(vendor.duplicateWarnings || [])}
      <section class="vendor-review-card"><h2><i class="fas fa-building"></i> Company and Primary Contact</h2>${fieldsHtml([
        ['Company Name', vendor.name], ['Primary Email', vendor.email], ['Primary Phone', vendor.phone], ['Primary Address', vendor.address]
      ])}</section>
      <section class="vendor-review-card"><h2><i class="fas fa-briefcase"></i> Legal Business Details</h2>${fieldsHtml([
        ['Legal Name', vendor.legalBusinessName], ['Entity Type', vendor.businessEntityType], ['Owner / Operator', vendor.primaryOwnerName], ['Business Address', vendor.businessAddress], ['Tax ID', taxValue, true]
      ])}</section>
      <section class="vendor-review-card"><h2><i class="fas fa-certificate"></i> Category and License</h2>${fieldsHtml([
        ['Assigned Category', vendor.category], ['Requested Category', vendor.requestedCategory, false], ['ROC License', vendor.rocLicenseNumber], ['Classification', vendor.rocLicenseTypeClassification], ['Expiration', displayDate(vendor.rocLicenseExpirationDate)]
      ])}</section>
      <section class="vendor-review-card"><h2><i class="fas fa-clipboard-check"></i> Review Status</h2>${fieldsHtml([
        ['Status', reviewStatusLabels[vendor.onboardingStatus] || vendor.onboardingStatus], ['Submitted', displayDate(vendor.submittedAt, true)], ['Last Reviewed', displayDate(vendor.reviewedAt, true)], ['Review Message', vendor.reviewMessage]
      ])}</section>
      <section class="vendor-review-card"><h2><i class="fas fa-envelope"></i> Additional Emails</h2>${listHtml(vendor.emails, item => `<strong>${escapeHtml(item.label || 'Email')}:</strong> ${escapeHtml(item.address || '')}`)}</section>
      <section class="vendor-review-card"><h2><i class="fas fa-address-book"></i> Phones and Addresses</h2>${listHtml([...(vendor.phones || []).map(item => ({...item, kind:'phone'})), ...(vendor.addresses || []).map(item => ({...item, kind:'address'}))], item => `<strong>${escapeHtml(item.label || 'Contact')}:</strong> ${escapeHtml(item.kind === 'phone' ? item.number : item.address)}`)}</section>
      <section class="vendor-review-card full"><h2><i class="fas fa-shield-alt"></i> Compliance Checklist</h2><div class="vendor-review-checklist">${complianceTypes.map(([type,label]) => `<span class="${activeTypes.has(type) ? '' : 'missing'}"><i class="fas ${activeTypes.has(type) ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${activeTypes.has(type) ? 'Complete' : 'Missing'}: ${escapeHtml(label)}</span>`).join('')}</div></section>
      <section class="vendor-review-card full"><h2><i class="fas fa-folder-open"></i> Permanent Documents</h2><div id="vendorReviewDocuments" class="documents-list"></div></section>
      <section class="vendor-review-card"><h2><i class="fas fa-history"></i> Review History</h2><div class="vendor-review-history">${history.length ? history.map(item => `<article><strong>${escapeHtml(displayValue(item.action).replace(/_/g,' '))}</strong><span>${escapeHtml(displayValue(item.message, 'No message'))}</span><small>${escapeHtml(item.performedByEmail || '')} ${escapeHtml(displayDate(item.createdAt, true))}</small></article>`).join('') : '<p class="table-muted">No review history.</p>'}</div></section>
      <section class="vendor-review-card"><h2><i class="fas fa-paper-plane"></i> Invitation History</h2><div class="vendor-review-history">${invitations.length ? invitations.map(item => `<article><strong>${escapeHtml(displayValue(item.purpose).replace(/_/g,' '))}</strong><span>${escapeHtml(displayValue(item.status).replace(/_/g,' '))}</span>${item.updateRecipientEmail ? `<span>Updates: ${escapeHtml(item.updateRecipientEmail)}</span>` : ''}<small>${escapeHtml(displayDate(item.createdAt, true))}</small></article>`).join('') : '<p class="table-muted">No invitation history.</p>'}</div></section>`;
    window.renderAttachmentList?.(document.getElementById('vendorReviewDocuments'), vendor.documents || [], {
      entityType: 'vendor', entityId: vendor._id, allowArchive: false
    });
  }

  window.openVendorReview = async function(vendorId) {
    activateReviewNavigation('vendor-review-detail');
    const content = document.getElementById('vendorReviewDetailContent');
    content.innerHTML = '<p class="table-muted">Loading application...</p>';
    try {
      window.APIService.clearCache();
      renderReviewDetail(await request(`/reviews/${vendorId}`));
    } catch (error) {
      content.innerHTML = `<p class="table-muted">${escapeHtml(error.message)}</p>`;
    }
  };

  window.backToVendorReviews = function() {
    activateReviewNavigation('vendor-reviews');
    window.loadVendorReviews(true);
  };

  let decisionTrigger = null;

  function decisionConfig(action) {
    return {
      approve: {
        title: 'Approve Vendor', icon: 'fa-check', button: 'Approve & Add Vendor', tone: 'approve', requiresMessage: false,
        description: 'Approve this application and add the company to your active Vendors list.',
        impact: '<strong>After approval</strong><span>The vendor becomes active immediately and receives an approval confirmation email.</span>'
      },
      request_changes: {
        title: 'Request Changes', icon: 'fa-pen', button: 'Send Changes Request', tone: 'changes', requiresMessage: true,
        description: 'Return the application to the vendor with clear instructions for the required updates.',
        label: 'Instructions for the vendor', placeholder: 'Explain exactly what information or documents need to be updated...',
        impact: '<strong>What happens next</strong><span>A new secure seven-day edit link is sent. Existing information and documents remain retained.</span>'
      },
      reject: {
        title: 'Reject Application', icon: 'fa-times', button: 'Reject Application', tone: 'reject', requiresMessage: true,
        description: 'Reject this application while permanently retaining its information, documents, and review history.',
        label: 'Reason for rejection', placeholder: 'Enter the reason this application is being rejected...',
        impact: '<strong>Permanent review archive</strong><span>The vendor will remain inactive and the retained application can still be audited.</span>'
      }
    }[action];
  }

  window.decideVendorReview = function(vendorId, action) {
    const config = decisionConfig(action);
    if (!config) return;
    const modal = document.getElementById('vendorReviewDecisionModal');
    const form = document.getElementById('vendorReviewDecisionForm');
    const field = document.getElementById('vendorDecisionMessageField');
    const message = document.getElementById('vendorDecisionMessage');
    const confirmButton = document.getElementById('vendorDecisionConfirm');
    decisionTrigger = document.activeElement;
    form.dataset.vendorId = vendorId;
    form.dataset.action = action;
    modal.dataset.tone = config.tone;
    document.getElementById('vendorDecisionTitle').textContent = config.title;
    document.getElementById('vendorDecisionDescription').textContent = config.description;
    document.getElementById('vendorDecisionVendorName').textContent = reviewState.currentVendorName || 'Vendor Application';
    document.querySelector('#vendorDecisionIcon i').className = `fas ${config.icon}`;
    document.getElementById('vendorDecisionImpact').innerHTML = config.impact;
    document.getElementById('vendorDecisionMessageLabel').textContent = config.label || 'Optional message';
    message.placeholder = config.placeholder || '';
    message.value = '';
    message.required = config.requiresMessage;
    field.hidden = !config.requiresMessage;
    document.getElementById('vendorDecisionMessageCount').textContent = '0';
    document.getElementById('vendorDecisionError').hidden = true;
    confirmButton.className = `vendor-decision-confirm ${config.tone}`;
    confirmButton.querySelector('i').className = `fas ${config.icon}`;
    confirmButton.querySelector('span').textContent = config.button;
    modal.hidden = false;
    document.body.classList.add('vendor-decision-open');
    requestAnimationFrame(() => (config.requiresMessage ? message : confirmButton).focus());
  };

  window.closeVendorReviewDecision = function() {
    const modal = document.getElementById('vendorReviewDecisionModal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('vendor-decision-open');
    document.getElementById('vendorReviewDecisionForm')?.removeAttribute('aria-busy');
    decisionTrigger?.focus?.();
  };

  async function executeVendorReviewDecision(vendorId, action, message = '') {
    const buttons = document.querySelectorAll('#vendorReviewDetailActions button');
    buttons.forEach(button => { button.disabled = true; });
    try {
      const payload = await request(`/vendors/${vendorId}/decision`, { method: 'POST', body: JSON.stringify({ action, message }) });
      if (payload.inviteUrl) await copyText(payload.inviteUrl).catch(() => {});
      window.APIService.clearCache();
      await Promise.all([window.refreshVendorReviewCount(), window.refreshVendorInvitations(), refreshVendors()]);
      if (action === 'approve') {
        window.closeVendorReviewDecision();
        activateReviewNavigation('vendors');
        await loadVendorsSection();
        window.showToast?.('Vendor approved and added to Vendors.', 'success');
      } else {
        window.closeVendorReviewDecision();
        window.backToVendorReviews();
        window.showToast?.(action === 'reject' ? 'Application rejected and retained in the review archive.' : 'Changes requested from the vendor.', 'success');
      }
    } catch (error) {
      const inlineError = document.getElementById('vendorDecisionError');
      if (inlineError) { inlineError.textContent = error.message; inlineError.hidden = false; }
      window.showToast?.(error.message, 'error');
      buttons.forEach(button => { button.disabled = false; });
      throw error;
    }
  }

  window.retryVendorReviewEmail = async function(vendorId) {
    try {
      await request(`/vendors/${vendorId}/retry-email`, { method: 'POST', body: '{}' });
      window.APIService.clearCache();
      await window.openVendorReview(vendorId);
      window.showToast?.('Review email sent.', 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  window.retryVendorChangeRequest = async function(invitationId, vendorId) {
    try {
      await request(`/invitations/${invitationId}/resend`, { method: 'POST', body: '{}' });
      window.APIService.clearCache();
      await window.openVendorReview(vendorId);
      window.showToast?.('Changes-request email resent.', 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  function syncVendorInviteCategories() {
    const source = document.getElementById('vendorCategory');
    const target = document.getElementById('vendorInviteCategory');
    if (!source || !target) return;
    const current = target.value;
    const categories = [...source.options]
      .filter(option => option.value && option.value !== '__add_new__')
      .map(option => ({ value: option.value, label: option.textContent.trim() }));
    target.replaceChildren(new Option('Select Category', ''));
    categories.forEach(category => target.add(new Option(category.label, category.value)));
    if (categories.some(category => category.value === current)) target.value = current;
  }

  function updateVendorModalHeading({ title, subtitle, eyebrow = 'Vendor Management', icon = 'fa-user-plus' }) {
    const titleElement = document.getElementById('vendorModalTitle');
    const subtitleElement = document.getElementById('vendorModalSubtitle');
    const eyebrowElement = document.getElementById('vendorModalEyebrow');
    const iconElement = document.querySelector('#vendorModalHeadingIcon i');
    if (titleElement) titleElement.textContent = title;
    if (subtitleElement) subtitleElement.textContent = subtitle;
    if (eyebrowElement) eyebrowElement.textContent = eyebrow;
    if (iconElement) iconElement.className = `fas ${icon}`;
  }

  function updateInviteMessageCount() {
    const message = document.getElementById('vendorInviteMessage');
    const counter = document.getElementById('vendorInviteMessageCount');
    if (message && counter) counter.textContent = `${message.value.length} / ${message.maxLength || 1000}`;
  }

  window.setVendorEntryMode = function(mode, resetResult = false) {
    const selectedMode = mode === 'invite' ? 'invite' : 'manual';
    const manual = selectedMode === 'manual';
    const modal = document.getElementById('vendorModal');
    const manualForm = document.getElementById('vendorForm');
    const inviteForm = document.getElementById('vendorInviteForm');
    const manualButton = document.getElementById('vendorManualSaveButton');
    const inviteButton = document.getElementById('vendorInviteSendButton');
    const footerHint = document.querySelector('#vendorModalFooterHint span');
    if (modal) modal.dataset.vendorMode = selectedMode;
    document.querySelectorAll('#vendorEntryModeSwitch [data-vendor-mode]').forEach(button => {
      const active = button.dataset.vendorMode === selectedMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    manualForm.hidden = !manual;
    manualForm.setAttribute('aria-hidden', String(!manual));
    inviteForm.hidden = manual;
    inviteForm.setAttribute('aria-hidden', String(manual));
    manualButton.hidden = !manual;
    manualButton.disabled = !manual;
    inviteButton.hidden = manual;
    inviteButton.disabled = manual;
    manualButton.style.removeProperty('display');
    inviteButton.style.removeProperty('display');
    if (manual) {
      updateVendorModalHeading({ title: 'Add New Vendor', subtitle: 'Create a complete vendor profile directly in the dashboard.', icon: 'fa-user-plus' });
      manualButton.innerHTML = '<i class="fas fa-check"></i> Save Vendor';
      if (footerHint) footerHint.textContent = 'Vendor details can be updated later.';
      const intro = document.querySelector('#vendorManualIntro div');
      if (intro) intro.innerHTML = '<strong>Create vendor manually</strong><p>Enter the information you already have. Required fields are marked with an asterisk.</p>';
    } else {
      syncVendorInviteCategories();
      prefillVendorUpdateEmail();
      updateVendorModalHeading({ title: 'Invite Vendor', subtitle: 'Send a secure form so the vendor can provide their own details and documents.', icon: 'fa-paper-plane' });
      if (footerHint) footerHint.textContent = 'The invitation link expires after seven days.';
    }
    if (resetResult) {
      const result = document.getElementById('vendorInviteResult');
      result.hidden = true;
      result.classList.remove('warning', 'error');
      result.replaceChildren();
    }
    updateInviteMessageCount();
    const body = modal?.querySelector('.modal-body');
    if (body) body.scrollTop = 0;
    requestAnimationFrame(() => {
      if (!modal?.classList.contains('show')) return;
      document.getElementById(manual ? 'vendorName' : 'vendorInviteEmail')?.focus();
    });
  };

  window.prepareVendorEditMode = function() {
    window.setVendorEntryMode('manual');
    document.getElementById('vendorEntryModeSwitch').hidden = true;
    updateVendorModalHeading({ title: 'Edit Vendor', subtitle: 'Update this vendor profile, compliance information, and retained documents.', icon: 'fa-pen-to-square' });
    const intro = document.querySelector('#vendorManualIntro div');
    if (intro) intro.innerHTML = '<strong>Update vendor profile</strong><p>Changes save to the existing vendor record. Previously uploaded documents remain retained.</p>';
    const saveButton = document.getElementById('vendorManualSaveButton');
    if (saveButton) saveButton.innerHTML = '<i class="fas fa-check"></i> Save Changes';
    const footerHint = document.querySelector('#vendorModalFooterHint span');
    if (footerHint) footerHint.textContent = 'Existing documents are preserved unless archived separately.';
  };

  async function copyText(text) {
    await navigator.clipboard.writeText(text);
    window.showToast?.('Secure invitation link copied.', 'success');
  }

  window.sendVendorInvitation = async function() {
    const form = document.getElementById('vendorInviteForm');
    if (!form.reportValidity()) return;
    const button = document.getElementById('vendorInviteSendButton');
    const categorySelect = document.getElementById('vendorInviteCategory');
    const result = document.getElementById('vendorInviteResult');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending Invitation...';
    result.hidden = true;
    result.classList.remove('warning', 'error');
    result.replaceChildren();
    try {
      const payload = await request('/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('vendorInviteEmail').value.trim(),
          companyName: document.getElementById('vendorInviteCompanyName').value.trim(),
          category: categorySelect.value,
          categoryLabel: categorySelect.selectedOptions[0]?.textContent,
          updateRecipientEmail: document.getElementById('vendorInviteUpdateEmail').value.trim(),
          personalMessage: document.getElementById('vendorInviteMessage').value.trim()
        })
      });
      const failed = payload.invitation.status === 'delivery_failed';
      const text = document.createElement('span');
      const icon = document.createElement('i');
      icon.className = `fas ${failed ? 'fa-triangle-exclamation' : 'fa-circle-check'}`;
      text.append(icon, document.createTextNode(failed ? ' Invitation saved, but email delivery failed.' : ' Secure invitation sent.'));
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy Link';
      copy.addEventListener('click', () => copyText(payload.inviteUrl));
      result.append(text, copy);
      if (payload.duplicateWarnings?.length) {
        const warning = document.createElement('div');
        warning.innerHTML = duplicateWarningsHtml(payload.duplicateWarnings);
        result.append(...warning.childNodes);
      }
      result.classList.toggle('warning', failed);
      result.hidden = false;
      form.reset();
      prefillVendorUpdateEmail(true);
      updateInviteMessageCount();
      await window.refreshVendorInvitations();
      window.showToast?.(text.textContent.trim(), failed ? 'warning' : 'success');
      if (!failed) {
        window.closeVendorModal?.();
      }
    } catch (error) {
      const text = document.createElement('span');
      const icon = document.createElement('i');
      icon.className = 'fas fa-circle-exclamation';
      text.append(icon, document.createTextNode(` ${error.message}`));
      result.replaceChildren(text);
      result.classList.add('error');
      result.hidden = false;
      window.showToast?.('Failed to send invitation: ' + error.message, 'error');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = '<i class="fas fa-paper-plane"></i> Send Secure Form';
    }
  };

  function invitationActions(invitation) {
    const id = escapeHtml(invitation._id);
    const actions = [];
    if (!['submitted','revoked'].includes(invitation.displayStatus)) {
      actions.push(`<button type="button" onclick="resendVendorInvitation('${id}')" title="Resend email"><i class="fas fa-paper-plane"></i></button>`);
      actions.push(`<button type="button" onclick="copyNewVendorInviteLink('${id}')" title="Generate and copy a new secure link"><i class="fas fa-link"></i></button>`);
      actions.push(`<button type="button" data-clear-invitation-id="${id}" onclick="revokeVendorInvitation('${id}')" title="Revoke"><i class="fas fa-ban"></i></button>`);
    }
    if (invitation.updateRecipientNotificationError && invitation.updateRecipientEmail) {
      actions.push(`<button type="button" onclick="retryVendorUpdateRecipient('${id}')" title="Retry update-recipient notice"><i class="fas fa-bell"></i></button>`);
    }
    return actions.length ? `<div class="invitation-actions">${actions.join('')}</div>` : '<span class="table-muted">No actions</span>';
  }

  function invitationDeliveryDetails(invitation) {
    const error = invitation.lastDeliveryError || invitation.updateRecipientNotificationError || invitation.confirmationDeliveryError || invitation.staffNotificationError || invitation.submissionError;
    if (error) return `<small class="invitation-delivery-detail error" title="${escapeHtml(error)}"><i class="fas fa-triangle-exclamation"></i>${escapeHtml(middleTruncate(error, 38, 18))}</small>`;
    if (invitation.lastDeliveryMessageId) {
      const id = String(invitation.lastDeliveryMessageId);
      return `<small class="invitation-delivery-detail" title="Message ID: ${escapeHtml(id)}"><i class="fas fa-envelope-circle-check"></i>Delivery ID: ${escapeHtml(middleTruncate(id, 16, 12))}</small>`;
    }
    return '';
  }

  window.refreshVendorInvitations = async function() {
    const body = document.getElementById('vendorInvitationsTableBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="7"><div class="vendor-review-loading"><span class="vendor-review-spinner"></span><strong>Loading invitations</strong><small>Checking delivery and expiry status...</small></div></td></tr>';
    try {
      const payload = await request(`/invitations?${invitationQuery()}`);
      const invitations = Array.isArray(payload) ? payload : (payload.data || []);
      latestInvitations = invitations;
      inviteState.page = payload.pagination?.page || inviteState.page;
      inviteState.pages = payload.pagination?.pages || 1;
      const label = document.getElementById('vendorInvitationPageLabel');
      const previous = document.getElementById('vendorInvitationPrevious');
      const next = document.getElementById('vendorInvitationNext');
      if (label) label.textContent = `Page ${inviteState.page} of ${inviteState.pages}`;
      if (previous) previous.disabled = inviteState.page <= 1;
      if (next) next.disabled = inviteState.page >= inviteState.pages;
      body.innerHTML = invitations.length ? invitations.map(invitation => `
        <tr data-invitation-id="${escapeHtml(invitation._id)}" data-invitation-status="${escapeHtml(invitation.displayStatus || invitation.status || '')}">
          <td><div class="vendor-review-company"><strong>${escapeHtml(invitation.companyName || invitation.vendor?.name || 'Unnamed Vendor')}</strong><span>${escapeHtml(invitation.purpose === 'changes_requested' ? 'Changes request' : 'Initial invitation')}</span></div></td>
          <td>${escapeHtml(invitation.email)}</td>
          <td>${invitation.updateRecipientEmail ? `<a class="vendor-review-email" href="mailto:${escapeHtml(invitation.updateRecipientEmail)}">${escapeHtml(invitation.updateRecipientEmail)}</a>` : '<span class="table-muted">Not set</span>'}</td>
          <td>${escapeHtml(invitation.categoryLabel || invitation.category)}</td>
          <td><div class="invitation-status-stack"><span class="invite-status ${escapeHtml(invitation.displayStatus)}">${escapeHtml(inviteStatusLabels[invitation.displayStatus] || invitation.displayStatus.replace(/_/g,' '))}</span>${invitationDeliveryDetails(invitation)}</div></td>
          <td>${new Date(invitation.expiresAt).toLocaleDateString()}</td>
          <td>${invitationActions(invitation)}</td>
        </tr>`).join('') : '<tr><td colspan="7"><div class="vendor-review-empty"><span><i class="fas fa-paper-plane"></i></span><strong>No invitations found</strong><p>Try a different search/filter or use Add Vendor → Email Vendor Form to send your first secure invitation.</p></div></td></tr>';
    } catch (error) {
      body.innerHTML = `<tr><td colspan="7"><div class="vendor-review-empty"><span><i class="fas fa-triangle-exclamation"></i></span><strong>Could not load invitations</strong><p>${escapeHtml(error.message)}</p></div></td></tr>`;
    }
  };

  window.changeVendorInvitationPage = function(direction) {
    const nextPage = inviteState.page + Number(direction || 0);
    if (nextPage < 1 || nextPage > inviteState.pages) return;
    inviteState.page = nextPage;
    window.refreshVendorInvitations();
  };

  window.refreshVendorEmailStatus = async function() {
    const banner = document.getElementById('vendorEmailDeliveryWarning');
    if (!banner) return;
    try {
      const status = await request('/email-status');
      const ready = status.provider === 'resend' || status.provider === 'gmail';
      banner.classList.toggle('is-ready', ready);
      banner.innerHTML = ready
        ? `<strong><i class="fas fa-circle-check"></i> Email delivery ready</strong>${escapeHtml(status.provider === 'resend' ? 'Resend' : 'Gmail')} is sending from ${escapeHtml(status.sender || 'the configured Hutta mailbox')} with replies routed to ${escapeHtml(status.replyTo || 'the Hutta team')}.`
        : `<strong><i class="fas fa-triangle-exclamation"></i> Email delivery unavailable</strong>${escapeHtml(status.warning || 'Email delivery is not fully configured.')}`;
      banner.hidden = false;
    } catch (error) {
      banner.classList.remove('is-ready');
      banner.innerHTML = `<strong><i class="fas fa-triangle-exclamation"></i> Email status unavailable</strong>${escapeHtml(error.message)}`;
      banner.hidden = false;
    }
  };

  window.resendVendorInvitation = async function(id) {
    try {
      const payload = await request(`/invitations/${id}/resend`, { method: 'POST', body: '{}' });
      await window.refreshVendorInvitations();
      window.showToast?.(payload.invitation.status === 'delivery_failed' ? 'Link refreshed, but email delivery failed.' : 'Invitation resent.', payload.invitation.status === 'delivery_failed' ? 'warning' : 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  window.copyNewVendorInviteLink = async function(id) {
    if (!confirm('Generate a new link? The previous invitation link will stop working.')) return;
    try {
      const payload = await request(`/invitations/${id}/rotate-link`, { method: 'POST', body: '{}' });
      await copyText(payload.inviteUrl);
      await window.refreshVendorInvitations();
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  window.revokeVendorInvitation = async function(id) {
    if (!confirm('Revoke this invitation link?')) return;
    try {
      await request(`/invitations/${id}/revoke`, { method: 'POST', body: '{}' });
      await window.refreshVendorInvitations();
      window.showToast?.('Invitation revoked.', 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  function closeVendorClearMenu() {
    const menu = document.getElementById('vendorClearMenu');
    const button = document.getElementById('vendorClearMenuButton');
    if (menu) menu.hidden = true;
    if (button) button.setAttribute('aria-expanded', 'false');
  }

  window.toggleVendorClearMenu = function(event) {
    event?.stopPropagation();
    const menu = document.getElementById('vendorClearMenu');
    const button = document.getElementById('vendorClearMenuButton');
    if (!menu) return;
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    if (button) button.setAttribute('aria-expanded', String(willOpen));
  };

  async function clearVendorInvitationsFallback(mode) {
    const eligibleStatuses = new Set(['sent', 'delivery_failed', 'processing', 'expired']);
    const normalizeStatus = (status) => String(status || '').trim().toLowerCase().replace(/\s+/g, '_');
    const statusMatchesMode = (status) => {
      status = normalizeStatus(status);
      if (mode === 'active') return ['sent', 'delivery_failed', 'processing'].includes(status);
      if (mode === 'delivery_failed') return status === 'delivery_failed';
      if (mode === 'expired') return status === 'expired';
      return eligibleStatuses.has(status);
    };
    const actionIds = [...document.querySelectorAll('#vendorInvitationsTableBody [data-clear-invitation-id]')]
      .filter(button => {
        const status = button.closest('tr')?.dataset.invitationStatus || '';
        return mode === 'current' || mode === 'all' || statusMatchesMode(status);
      })
      .map(button => button.dataset.clearInvitationId)
      .filter(Boolean);

    if (actionIds.length) {
      let revoked = 0;
      for (const id of [...new Set(actionIds)]) {
        await request(`/invitations/${id}/revoke`, { method: 'POST', body: '{}' });
        revoked += 1;
      }
      return { revoked };
    }

    const rowIds = [...document.querySelectorAll('#vendorInvitationsTableBody tr[data-invitation-id]')]
      .filter(row => statusMatchesMode(row.dataset.invitationStatus || ''))
      .map(row => row.dataset.invitationId)
      .filter(Boolean);

    if (rowIds.length) {
      let revoked = 0;
      for (const id of [...new Set(rowIds)]) {
        await request(`/invitations/${id}/revoke`, { method: 'POST', body: '{}' });
        revoked += 1;
      }
      return { revoked };
    }

    const visibleIds = latestInvitations
      .filter(invitation => statusMatchesMode(invitation.displayStatus || invitation.status))
      .map(invitation => invitation._id)
      .filter(Boolean);

    if (visibleIds.length) {
      let revoked = 0;
      for (const id of visibleIds) {
        await request(`/invitations/${id}/revoke`, { method: 'POST', body: '{}' });
        revoked += 1;
      }
      return { revoked };
    }

    const buildQueries = () => {
      if (mode === 'current') return [{ status: inviteState.status, search: inviteState.search }];
      if (mode === 'active') return [{ status: 'sent' }, { status: 'delivery_failed' }, { status: 'processing' }];
      if (mode === 'delivery_failed') return [{ status: 'delivery_failed' }];
      if (mode === 'expired') return [{ status: 'expired' }];
      return [{ status: 'all' }];
    };

    let revoked = 0;
    for (const query of buildQueries()) {
      const ids = [];
      let page = 1;
      let pages = 1;
      do {
        const params = new URLSearchParams({
          status: query.status || 'all',
          page: String(page),
          limit: '100',
          _: String(Date.now())
        });
        if (query.search) params.set('search', query.search);
        const payload = await request(`/invitations?${params.toString()}`);
        const invitations = Array.isArray(payload) ? payload : (payload.data || []);
        pages = payload.pagination?.pages || 1;

        for (const invitation of invitations) {
          if (['submitted', 'revoked'].includes(invitation.displayStatus || invitation.status)) continue;
          ids.push(invitation._id);
        }
        page += 1;
      } while (page <= pages);

      for (const id of ids) {
        await request(`/invitations/${id}/revoke`, { method: 'POST', body: '{}' });
        revoked += 1;
      }
    }
    return { revoked };
  }

  window.clearVendorInvitations = async function(mode = 'current') {
    const labels = {
      current: `Current filter (${inviteStatusLabels[inviteState.status] || inviteState.status}${inviteState.search ? ', current search' : ''})`,
      active: 'Active invitations',
      delivery_failed: 'Delivery failed invitations',
      expired: 'Expired invitations',
      all: 'All invitations'
    };
    const label = labels[mode];
    closeVendorClearMenu();
    if (!label) {
      window.showToast?.('Clear cancelled: invalid option.', 'warning');
      return;
    }
    if (!confirm(`Clear ${label.toLowerCase()} from the invitations list? Active links will be revoked first.`)) return;
    try {
      window.APIService?.clearCache?.();
      let payload;
      try {
        payload = await request('/invitations/clear', {
          method: 'POST',
          body: JSON.stringify({
            mode,
            status: inviteState.status,
            search: mode === 'current' ? inviteState.search : ''
          })
        });
      } catch (error) {
        if (!/404|Cannot POST|not found/i.test(error.message || '')) throw error;
        const fallback = await clearVendorInvitationsFallback(mode);
        if (!Number(fallback.revoked || 0)) {
          throw new Error('Restart the backend server to clear submitted or revoked invitations from this list.');
        }
        payload = fallback;
      }
      inviteState.page = 1;
      await window.refreshVendorInvitations();
      const count = Number(payload.cleared ?? payload.revoked ?? 0);
      window.showToast?.(
        count ? `Cleared ${count} invitation${count === 1 ? '' : 's'}.` : 'No invitations matched this clear option.',
        count ? 'success' : 'warning'
      );
    } catch (error) {
      window.showToast?.(error.message, 'error');
    }
  };

  window.retryVendorUpdateRecipient = async function(id) {
    try {
      await request(`/invitations/${id}/retry-update-recipient`, { method: 'POST', body: '{}' });
      await window.refreshVendorInvitations();
      window.showToast?.('Update-recipient notice sent.', 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  const complianceFields = [
    ['huttasContract','Contract'],['w9','W-9'],['certificateOfInsurance','Insurance'],
    ['workersCompInsurance','Workers Comp'],['huttasAdditionalInsured','Additional Insured']
  ];

  window.renderVendorOnboardingReview = function(vendor) {
    const banner = document.getElementById('vendorOnboardingReviewBanner');
    if (!banner) return;
    if (vendor.onboardingSource !== 'invitation' || (vendor.onboardingStatus === 'approved' && vendor.onboardingEmailStatus !== 'failed')) {
      banner.hidden = true;
      banner.replaceChildren();
      return;
    }
    const activeTypes = new Set((vendor.documents || []).filter(doc => doc.status !== 'archived').map(doc => doc.complianceDocumentType));
    const history = (vendor.onboardingHistory || []).slice().reverse();
    const finalDecision = ['approved','rejected'].includes(vendor.onboardingStatus);
    const actions = finalDecision
      ? vendor.onboardingEmailStatus === 'failed' ? `<button class="changes" onclick="retryVendorDecisionEmail('${vendor._id}')">Retry Confirmation Email</button>` : ''
      : `<button class="approve" onclick="decideVendorOnboarding('${vendor._id}','approve')">Approve</button><button class="changes" onclick="decideVendorOnboarding('${vendor._id}','request_changes')">Request Changes</button><button class="reject" onclick="decideVendorOnboarding('${vendor._id}','reject')">Reject</button>`;
    banner.innerHTML = `<div class="vendor-review-banner-head"><div><h2>Status: ${escapeHtml(vendor.onboardingStatus.replace(/_/g,' '))}</h2><p>${vendor.onboardingEmailStatus === 'failed' ? `Email delivery failed: ${escapeHtml(vendor.onboardingEmailError || 'Unknown delivery error')}` : vendor.requestedCategory ? `Requested category: <strong>${escapeHtml(vendor.requestedCategory)}</strong>` : 'Assigned category confirmed.'}</p></div><div class="vendor-review-actions">${actions}</div></div><div class="compliance-checklist">${complianceFields.map(([key,label]) => `<span class="${activeTypes.has(key) ? '' : 'missing'}">${activeTypes.has(key) ? '✓' : 'Missing'} ${label}</span>`).join('')}</div>${history.length ? `<details class="vendor-review-history"><summary>Onboarding history (${history.length})</summary>${history.map(item => `<div><strong>${escapeHtml(String(item.action || '').replace(/_/g,' '))}</strong><span>${escapeHtml(item.message || '')}</span><small>${item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</small></div>`).join('')}</details>` : ''}`;
  };

  window.decideVendorOnboarding = async function(vendorId, action) {
    const labels = { approve: 'Approve this vendor?', request_changes: 'What changes should the vendor make?', reject: 'Why is this application being rejected?' };
    let message = '';
    if (action === 'approve') {
      if (!confirm(labels[action])) return;
    } else {
      message = prompt(labels[action], '') ?? '';
      if (!message.trim()) return window.showToast?.('A message is required.', 'warning');
    }
    try {
      const payload = await request(`/vendors/${vendorId}/decision`, { method: 'POST', body: JSON.stringify({ action, message }) });
      if (payload.inviteUrl) await copyText(payload.inviteUrl).catch(() => {});
      window.APIService.clearCache();
      await refreshVendors();
      await showVendorDetail(vendorId);
      await window.refreshVendorInvitations();
      window.showToast?.(`Vendor ${action.replace('_',' ')} completed.`, 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  window.revealVendorTaxId = async function(vendorId) {
    if (!confirm('Reveal this sensitive Tax ID? This action will be recorded in the security audit log.')) return;
    try {
      const payload = await request(`/vendors/${vendorId}/tax-id`);
      alert(`Vendor Tax ID: ${payload.taxId}\n\nThis access has been audited.`);
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  window.retryVendorDecisionEmail = async function(vendorId) {
    try {
      await request(`/vendors/${vendorId}/retry-email`, { method: 'POST', body: '{}' });
      window.APIService.clearCache();
      await showVendorDetail(vendorId);
      window.showToast?.('Confirmation email sent.', 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    try { await window.AuthReady; } catch (_error) { return; }
    window.refreshVendorInvitations();
    window.refreshVendorEmailStatus();
    window.refreshVendorReviewCount();
    const statusFilter = document.getElementById('vendorReviewStatusFilter');
    const searchInput = document.getElementById('vendorReviewSearch');
    const invitationStatusFilter = document.getElementById('vendorInvitationStatusFilter');
    const invitationSearchInput = document.getElementById('vendorInvitationSearch');
    const inviteMessage = document.getElementById('vendorInviteMessage');
    const modeTabs = [...document.querySelectorAll('#vendorEntryModeSwitch [role="tab"]')];
    const decisionModal = document.getElementById('vendorReviewDecisionModal');
    const decisionForm = document.getElementById('vendorReviewDecisionForm');
    const decisionMessage = document.getElementById('vendorDecisionMessage');
    inviteMessage?.addEventListener('input', updateInviteMessageCount);
    decisionMessage?.addEventListener('input', () => {
      document.getElementById('vendorDecisionMessageCount').textContent = String(decisionMessage.value.length);
      document.getElementById('vendorDecisionError').hidden = true;
    });
    decisionForm?.addEventListener('submit', async event => {
      event.preventDefault();
      if (!decisionForm.reportValidity()) return;
      const button = document.getElementById('vendorDecisionConfirm');
      const original = button.innerHTML;
      button.disabled = true;
      decisionForm.setAttribute('aria-busy', 'true');
      button.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Saving Decision...</span>';
      try {
        await executeVendorReviewDecision(decisionForm.dataset.vendorId, decisionForm.dataset.action, decisionMessage.value.trim());
      } catch (_error) {
        button.disabled = false;
        button.innerHTML = original;
        decisionForm.removeAttribute('aria-busy');
      }
    });
    decisionModal?.addEventListener('click', event => {
      if (event.target === decisionModal) window.closeVendorReviewDecision();
    });
    document.addEventListener('click', event => {
      if (!event.target.closest?.('.vendor-clear-dropdown')) closeVendorClearMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeVendorClearMenu();
      if (!decisionModal || decisionModal.hidden) return;
      if (event.key === 'Escape') return window.closeVendorReviewDecision();
      if (event.key !== 'Tab') return;
      const focusable = [...decisionModal.querySelectorAll('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    modeTabs.forEach((tab, index) => tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = modeTabs[(index + direction + modeTabs.length) % modeTabs.length];
      window.setVendorEntryMode(next.dataset.vendorMode);
      next.focus();
    }));
    statusFilter?.addEventListener('change', () => {
      reviewState.status = statusFilter.value;
      reviewState.page = 1;
      window.loadVendorReviews(true);
    });
    let searchTimer;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        reviewState.search = searchInput.value.trim();
        reviewState.page = 1;
        window.loadVendorReviews(true);
      }, 250);
    });
    invitationStatusFilter?.addEventListener('change', () => {
      inviteState.status = invitationStatusFilter.value;
      inviteState.page = 1;
      window.refreshVendorInvitations();
    });
    let invitationSearchTimer;
    invitationSearchInput?.addEventListener('input', () => {
      clearTimeout(invitationSearchTimer);
      invitationSearchTimer = setTimeout(() => {
        inviteState.search = invitationSearchInput.value.trim();
        inviteState.page = 1;
        window.refreshVendorInvitations();
      }, 250);
    });
  });
})();
