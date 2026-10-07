(() => {
  let orders = [];
  let vendors = [];
  let workspace = null;
  let currentOrderId = '';
  let editingQuoteId = '';
  let leadCandidates = [];
  let requirementApprovals = [];
  let canApproveRequirements = false;
  let pendingRequirementAction = null;
  const leadSubmissionKeys = new Map();

  const $ = id => document.getElementById(id);
  const escapeHtml = value => typeof window.escapePaymentHtml === 'function'
    ? window.escapePaymentHtml(value)
    : String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const money = value => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = value => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const toast = (message, type = 'success') => typeof window.showToast === 'function' ? window.showToast(message, type) : alert(message);

  function vendorIdsForAction(action, payload) {
    return action === 'quote_invitation' ? [payload.vendorId] : (payload.vendorIds || []);
  }

  function requirementIssueMarkup(issues = []) {
    return issues.map(item => `<article><strong>${escapeHtml(item.vendorName || 'Vendor')}</strong><ul>${(item.requirements || item.reasons || []).map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></article>`).join('');
  }

  function ensureRequirementDialog() {
    if ($('vendorRequirementGateDialog')) return $('vendorRequirementGateDialog');
    const dialog = document.createElement('dialog');
    dialog.id = 'vendorRequirementGateDialog';
    dialog.className = 'vendor-requirement-dialog';
    dialog.innerHTML = `<form method="dialog" class="vendor-requirement-card"><button class="vendor-requirement-close" value="cancel" aria-label="Close"><i class="fas fa-times"></i></button><div class="vendor-requirement-icon"><i class="fas fa-shield-alt"></i></div><p class="workflow-eyebrow">Vendor requirements</p><h2>Information is required before sending</h2><p class="vendor-requirement-intro">Choose how to continue. The order stays paused while the vendor updates their portal profile.</p><div id="vendorRequirementIssues" class="vendor-requirement-issues"></div><div class="vendor-requirement-options"><button type="button" class="vendor-requirement-option" id="emailVendorUpdateButton"><i class="fas fa-envelope"></i><span><strong>Email vendor to update</strong><small>Sends the Vendor Portal login link and keeps this action waiting.</small></span></button><button type="button" class="vendor-requirement-option danger" id="sendVendorAnywayButton"><i class="fas fa-exclamation-triangle"></i><span><strong>Send anyway</strong><small>Requires recorded admin approval before anything is sent.</small></span></button></div><p id="vendorRequirementStatus" class="vendor-requirement-status" role="status"></p></form>`;
    document.body.appendChild(dialog);
    $('emailVendorUpdateButton').addEventListener('click', emailVendorForUpdate);
    $('sendVendorAnywayButton').addEventListener('click', requestSendAnyway);
    return dialog;
  }

  function openRequirementGate(action, payload, idempotencyKey, issues) {
    pendingRequirementAction = { action, payload, idempotencyKey: idempotencyKey || '' };
    const dialog = ensureRequirementDialog();
    $('vendorRequirementIssues').innerHTML = requirementIssueMarkup(issues);
    $('vendorRequirementStatus').textContent = '';
    dialog.showModal();
  }

  async function emailVendorForUpdate() {
    if (!pendingRequirementAction) return;
    const button = $('emailVendorUpdateButton'); button.disabled = true;
    try {
      const vendorIds = vendorIdsForAction(pendingRequirementAction.action, pendingRequirementAction.payload);
      await window.APIService.requestVendorProfileUpdate(currentOrderId, vendorIds);
      $('vendorRequirementGateDialog').close();
      toast('Vendor update email queued. This send is waiting for the vendor to update their portal profile.');
    } catch (error) { $('vendorRequirementStatus').textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function requestSendAnyway() {
    if (!pendingRequirementAction) return;
    // A native <dialog> is rendered in the browser's top layer. The shared
    // WorkflowDialog is a regular fixed-position element, so it cannot receive
    // clicks while this modal remains open, regardless of its z-index.
    const requirementDialog = $('vendorRequirementGateDialog');
    requirementDialog?.close();
    const confirmed = await (window.WorkflowDialog?.confirm?.({ title: 'Request permission to send anyway?', message: 'Vendor requirements are missing or expired.', impact: 'An admin must approve this exact send. The exception and final send are written to the audit history.', confirmLabel: 'Request Admin Approval', danger: true }) || Promise.resolve(false));
    if (!confirmed) {
      if (pendingRequirementAction && requirementDialog && !requirementDialog.open) requirementDialog.showModal();
      return;
    }
    const button = $('sendVendorAnywayButton'); button.disabled = true;
    try {
      const response = await window.APIService.requestVendorRequirementApproval(currentOrderId, { ...pendingRequirementAction, workspace: window.ServiceRequestsActive ? 'service-requests' : 'workflow-center' });
      if (response.canApprove) {
        const approval = response.approval.status === 'approved'
          ? response.approval
          : (await window.APIService.approveVendorRequirement(response.approval._id, 'Approved from vendor requirement confirmation.')).approval;
        await executeApprovedRequirement(approval);
      } else {
        toast('Admin approval requested. Sending is paused until an admin approves it.');
        await refreshWorkspace();
      }
    } catch (error) {
      $('vendorRequirementStatus').textContent = error.message;
      if (requirementDialog && !requirementDialog.open) requirementDialog.showModal();
    }
    finally { button.disabled = false; }
  }

  async function executeApprovedRequirement(approval) {
    if (!await ensureResidentialReviewBeforeSend()) {
      toast('The exception is approved. Confirm the coordinator and scope to finish sending.', 'warning');
      return false;
    }
    const payload = { ...(approval.actionPayload || {}), requirementApprovalId: approval._id };
    if (approval.action === 'lead_distribution') {
      await window.APIService.distributeIncomingLead(approval.orderId, payload, approval.idempotencyKey);
    } else {
      await window.APIService.sendIncomingQuoteInvitation(approval.orderId, payload);
    }
    toast('Admin approved the exception and the vendor item was sent.');
    await refreshWorkspace();
    return true;
  }

  function renderRequirementApprovals() {
    const panel = $('incomingRequirementApprovals');
    if (!panel) return;
    const active = requirementApprovals.filter(item => ['pending', 'approved'].includes(item.status));
    panel.hidden = !active.length;
    if (!active.length) { panel.innerHTML = ''; return; }
    panel.innerHTML = `<div class="incoming-panel-heading"><span><i class="fas fa-user-shield"></i></span><div><h3>Vendor Send Approvals</h3><p>Exceptions remain paused until an admin approves and sends them.</p></div></div><div class="vendor-approval-list">${active.map(item => `<article><div><strong>${escapeHtml(item.action.replaceAll('_', ' '))}</strong><small>${escapeHtml((item.issues || []).map(issue => issue.vendorName).join(', '))} · ${escapeHtml(item.status)}</small></div><div class="vendor-approval-actions">${item.status === 'approved' ? `<button type="button" class="btn-primary" data-requirement-send="${escapeHtml(item._id)}">Send approved</button>` : canApproveRequirements ? `<button type="button" class="btn-secondary" data-requirement-reject="${escapeHtml(item._id)}">Reject</button><button type="button" class="btn-danger" data-requirement-approve="${escapeHtml(item._id)}">Approve &amp; send</button>` : '<span class="workflow-badge warning">Waiting for admin</span>'}</div></article>`).join('')}</div>`;
    panel.onclick = async event => {
      const approve = event.target.closest('[data-requirement-approve]');
      const reject = event.target.closest('[data-requirement-reject]');
      const send = event.target.closest('[data-requirement-send]');
      const id = approve?.dataset.requirementApprove || reject?.dataset.requirementReject || send?.dataset.requirementSend;
      if (!id) return;
      const item = requirementApprovals.find(entry => String(entry._id) === String(id));
      try {
        if (reject) {
          const confirmed = await (window.WorkflowDialog?.confirm?.({ title: 'Reject send exception?', message: 'The requested vendor send will remain blocked.', confirmLabel: 'Reject Request', danger: true }) || Promise.resolve(false));
          if (!confirmed) return;
          await window.APIService.rejectVendorRequirement(id, 'Rejected from vendor send approvals.');
          toast('Send exception rejected.'); await refreshWorkspace(); return;
        }
        if (approve) {
          const confirmed = await (window.WorkflowDialog?.confirm?.({ title: 'Approve and send anyway?', message: 'This vendor is missing required information.', impact: 'This exception is recorded. The exact pending item will be sent immediately.', confirmLabel: 'Approve & Send', danger: true }) || Promise.resolve(false));
          if (!confirmed) return;
          const response = await window.APIService.approveVendorRequirement(id, 'Approved from the order workspace.');
          await executeApprovedRequirement(response.approval); return;
        }
        await executeApprovedRequirement(item);
      } catch (error) { toast(error.message, 'error'); }
    };
  }

  function vendorOptions(selected = '') {
    return `<option value="">Select vendor</option>${vendors.map(vendor => `<option value="${escapeHtml(vendor._id)}" ${String(vendor._id) === String(selected) ? 'selected' : ''}>${escapeHtml(vendor.name)} · ${escapeHtml(vendor.category || 'Uncategorized')} · ${escapeHtml(vendor.compliance?.status || 'missing')}</option>`).join('')}`;
  }

  function renderVendorCompliance(selectId) {
    const select = $(selectId);
    const label = select?.closest('label');
    if (!select || !label) return;
    const form = select.closest('form');
    let panel = form?.querySelector(`.incoming-vendor-compliance[data-compliance-for="${selectId}"]`);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'incoming-vendor-compliance';
      panel.dataset.complianceFor = selectId;
      label.after(panel);
    }
    const vendor = vendors.find(item => String(item._id) === String(select.value));
    if (!vendor) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }
    const compliance = vendor.compliance || {};
    const warnings = compliance.warnings || [];
    panel.hidden = false;
    panel.innerHTML = `<div><span>Vendor compliance</span><strong class="incoming-compliance ${escapeHtml(compliance.status || 'missing')}">${escapeHtml(compliance.status || 'missing')}</strong></div>
      <dl><div><dt>License</dt><dd>${escapeHtml(vendor.contractorLicenseNumber || 'Missing')}</dd></div><div><dt>ROC</dt><dd>${escapeHtml(vendor.rocLicenseNumber || 'Missing')}</dd></div><div><dt>COI</dt><dd>${vendor.certificateOfInsuranceOnFile ? 'On file' : 'Missing'}</dd></div><div><dt>Insurance</dt><dd>${date(vendor.insuranceExpirationDate)}</dd></div></dl>
      ${warnings.length ? `<p><i class="fas fa-exclamation-triangle"></i>${escapeHtml(warnings.join(' · '))}</p>` : '<p class="is-clear"><i class="fas fa-check-circle"></i>Compliance information is current.</p>'}`;
  }

  function renderEligible(eligible) {
    const select = $('incomingEligibleOrder');
    if (!select) return;
    select.innerHTML = `<option value="">Select ready Order</option>${eligible.map(order => `<option value="${escapeHtml(order._id)}">${escapeHtml(order.requestReference || order.orderId)} · ${escapeHtml(order.customer?.name || 'Customer')} · ${escapeHtml(order.service)}</option>`).join('')}`;
  }

  function renderOrders() {
    const list = $('incomingQuoteOrderList');
    if (!list) return;
    const collecting = orders.filter(order => order.workflowStatus === 'quote_collection');
    $('incomingOrderCount').textContent = collecting.length.toLocaleString();
    $('incomingSubmittedCount').textContent = orders.reduce((sum, order) => sum + Number(order.quoteCount || 0), 0).toLocaleString();
    $('incomingAwaitingCount').textContent = orders.reduce((sum, order) => sum + Number(order.awaitingVendorCount || 0), 0).toLocaleString();
    const badge = $('incomingQuotesNavBadge');
    if (badge) {
      badge.textContent = collecting.length.toLocaleString();
      badge.hidden = collecting.length === 0;
    }
    if (!orders.length) {
      list.innerHTML = '<div class="workflow-empty workflow-empty-illustrated"><span class="workflow-empty-art"><i class="fas fa-file-invoice-dollar"></i></span><strong>No Orders are collecting vendor quotes.</strong><p>Start collecting quotes to see them here.</p></div>';
      return;
    }
    list.innerHTML = orders.map(order => `<article class="incoming-order-card">
      <header><div><span class="workflow-reference">${escapeHtml(order.requestReference || order.orderId)}</span><h3>${escapeHtml(order.customer?.name || 'Customer')}</h3></div><span class="incoming-state ${order.workflowStatus === 'vendor_selected' ? 'selected' : ''}">${escapeHtml(order.workflowStatus.replaceAll('_', ' '))}</span></header>
      <p>${escapeHtml(order.service)} · ${escapeHtml(order.customer?.address || 'No address')}</p>
      <div class="incoming-order-meta"><div><strong>${Number(order.quoteCount || 0)}</strong><span>Submitted quotes</span></div><div><strong>${Number(order.awaitingVendorCount || 0)}</strong><span>Awaiting vendors</span></div><div><strong>${order.lowestQuote == null ? '—' : money(order.lowestQuote)}</strong><span>Lowest quote</span></div><div><strong>${date(order.earliestAvailability)}</strong><span>Earliest date</span></div></div>
      <footer><span class="${order.complianceWarningCount ? 'workflow-badge warning' : 'workflow-badge success'}">${Number(order.complianceWarningCount || 0)} compliance warning${Number(order.complianceWarningCount || 0) === 1 ? '' : 's'}</span><button type="button" class="btn-primary" data-incoming-open="${escapeHtml(order._id)}">Open Workspace</button></footer>
    </article>`).join('');
    list.onclick = event => {
      const button = event.target.closest('[data-incoming-open]');
      if (button) openIncomingQuoteWorkspace(button.dataset.incomingOpen);
    };
  }

  async function loadIncomingQuotes() {
    const list = $('incomingQuoteOrderList');
    if (list) list.innerHTML = '<div class="workflow-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading incoming quotes&hellip;</p></div>';
    try {
      const [loadedOrders, eligible, loadedVendors] = await Promise.all([
        window.APIService.getIncomingQuoteOrders(),
        window.APIService.getIncomingQuoteEligibleOrders(),
        window.APIService.getIncomingQuoteVendors()
      ]);
      orders = loadedOrders || [];
      vendors = loadedVendors || [];
      renderEligible(eligible || []);
      renderOrders();
      if (currentOrderId) await openIncomingQuoteWorkspace(currentOrderId, false);
    } catch (error) {
      if (list) list.innerHTML = `<div class="workflow-empty"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(error.message || 'Unable to load incoming quotes')}</p></div>`;
    }
  }

  async function startIncomingQuoteOrder() {
    const orderId = $('incomingEligibleOrder')?.value;
    if (!orderId) return toast('Select a ready Order first.', 'error');
    try {
      await window.APIService.startIncomingQuotes(orderId);
      toast('Stage 2 quote collection started.');
      currentOrderId = orderId;
      await loadIncomingQuotes();
      await openIncomingQuoteWorkspace(orderId);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderWorkspace() {
    if (!workspace) return;
    const { order, quotes = [], invitations = [], emailMessages = [], estimateDrafts = [] } = workspace;
    $('incomingWorkspaceTitle').textContent = `${order.requestReference || order.orderId} · ${order.customer?.name || 'Customer'}`;
    $('incomingWorkspaceSummary').textContent = `${order.service} · ${order.customer?.address || 'No address'} · ${order.workflowStatus.replaceAll('_', ' ')}`;
    $('incomingInviteVendor').innerHTML = vendorOptions();
    $('incomingStaffVendor').innerHTML = vendorOptions();
    renderVendorCompliance('incomingInviteVendor');
    renderVendorCompliance('incomingStaffVendor');
    renderLeadCandidates();
    renderResidentialReview(order);
    renderRequirementApprovals();
    const body = $('incomingComparisonBody');
    const comparableQuotes = quotes.filter(quote => ['submitted', 'selected'].includes(quote.status));
    const lowestTotal = comparableQuotes.length ? Math.min(...comparableQuotes.map(quote => Number(quote.total || 0))) : null;
    const validAvailability = comparableQuotes.map(quote => new Date(quote.earliestAvailableDate).getTime()).filter(value => Number.isFinite(value));
    const earliestAvailability = validAvailability.length ? Math.min(...validAvailability) : null;
    const complianceRiskCount = comparableQuotes.filter(quote => (quote.vendorSnapshot?.complianceWarnings || []).length > 0 || ['expired', 'missing'].includes(quote.vendorSnapshot?.complianceStatus)).length;
    if ($('incomingComparisonCount')) $('incomingComparisonCount').textContent = `${quotes.length} quote${quotes.length === 1 ? '' : 's'}`;
    if ($('incomingComparisonInsights')) {
      $('incomingComparisonInsights').innerHTML = `<div><span class="incoming-insight-icon cost"><i class="fas fa-dollar-sign"></i></span><span><small>Lowest submitted</small><strong>${lowestTotal == null ? '—' : money(lowestTotal)}</strong></span></div>
        <div><span class="incoming-insight-icon date"><i class="fas fa-calendar-check"></i></span><span><small>Earliest availability</small><strong>${earliestAvailability == null ? '—' : date(earliestAvailability)}</strong></span></div>
        <div class="${complianceRiskCount ? 'has-risk' : ''}"><span class="incoming-insight-icon compliance"><i class="fas fa-shield-alt"></i></span><span><small>Compliance review</small><strong>${complianceRiskCount ? `${complianceRiskCount} risk${complianceRiskCount === 1 ? '' : 's'}` : comparableQuotes.length ? 'All current' : '—'}</strong></span></div>`;
    }
    if (!quotes.length) {
      body.innerHTML = '<tr><td colspan="7" class="incoming-empty-cell">No vendor quotes have been added yet.</td></tr>';
    } else {
      body.innerHTML = quotes.map(quote => {
        const vendor = quote.vendorId || {};
        const compliance = quote.vendorSnapshot?.complianceStatus || 'missing';
        const warnings = quote.vendorSnapshot?.complianceWarnings || [];
        const docs = (quote.documents || []).filter(document => document.status !== 'archived');
        const estimateDraft = estimateDrafts.find(draft => String(draft.quoteId) === String(quote._id));
        const estimateSources = estimateDraft?.attachments || [];
        const actionAllowed = quote.status === 'submitted' && order.workflowStatus === 'quote_collection';
        const isLowest = comparableQuotes.length > 1 && Number(quote.total || 0) === lowestTotal && ['submitted', 'selected'].includes(quote.status);
        const quoteAvailability = new Date(quote.earliestAvailableDate).getTime();
        const isEarliest = comparableQuotes.length > 1 && Number.isFinite(quoteAvailability) && quoteAvailability === earliestAvailability && ['submitted', 'selected'].includes(quote.status);
        const statusClass = quote.status === 'selected' ? 'selected' : quote.status === 'submitted' ? 'submitted' : quote.status === 'draft' ? 'draft' : 'historical';
        return `<tr class="${quote.status === 'selected' ? 'is-selected' : ''}">
          <td data-label="Vendor"><div class="incoming-vendor-cell"><span class="incoming-vendor-avatar">${escapeHtml(String(vendor.name || quote.vendorSnapshot?.name || 'V').charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(vendor.name || quote.vendorSnapshot?.name || 'Vendor')}</strong><small>${escapeHtml(quote.quoteReference)} · Revision ${Number(quote.revisionNumber || 1)}</small><small>${escapeHtml(quote.source === 'vendor' ? 'Vendor submitted' : 'Staff entered')}</small></span></div>${docs.length ? `<div class="incoming-documents">${docs.map(doc => `<a href="/api/attachments/incoming-quote/${encodeURIComponent(quote._id)}/${encodeURIComponent(doc.documentId)}" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i> ${escapeHtml(doc.name)}</a>`).join('')}</div>` : ''}${estimateSources.length ? `<div class="incoming-documents"><small>Original vendor estimate · parser ${escapeHtml(estimateDraft.parser?.status || 'not requested')}</small>${estimateSources.map(doc => `<a href="${escapeHtml(doc.downloadUrl)}" target="_blank" rel="noopener"><i class="fas fa-file-shield"></i> ${escapeHtml(doc.name)}</a>`).join('')}</div>` : ''}</td>
          <td data-label="Compliance"><span class="incoming-compliance ${escapeHtml(compliance)}" title="${escapeHtml(warnings.join('; '))}"><i class="fas ${warnings.length ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>${escapeHtml(compliance)}</span>${warnings.length ? `<small class="incoming-risk-copy">${escapeHtml(warnings[0])}</small>` : ''}</td>
          <td data-label="Pricing"><div class="incoming-pricing-summary"><span class="incoming-primary-value">${money(quote.total)}</span>${isLowest ? '<em class="incoming-best-badge"><i class="fas fa-arrow-down"></i> Lowest</em>' : ''}<span class="incoming-supporting-value">Labor ${money(quote.laborAmount)} <i>·</i> Materials ${money(quote.materialsAmount)}</span></div></td>
          <td data-label="Schedule"><div class="incoming-schedule-summary"><span class="incoming-primary-value">${date(quote.earliestAvailableDate)}</span>${isEarliest ? '<em class="incoming-best-badge fastest"><i class="fas fa-bolt"></i> Earliest</em>' : ''}<span class="incoming-supporting-value">${escapeHtml(quote.estimatedDuration?.value || '—')} ${escapeHtml(quote.estimatedDuration?.unit || '')} estimated</span></div></td>
          <td data-label="Access & Conditions"><div class="incoming-terms-cell"><span class="incoming-access ${quote.siteAccessRequired ? 'required' : ''}">${quote.siteAccessRequired ? '<i class="fas fa-key"></i> Arrange access' : '<i class="fas fa-check"></i> No arrangement'}</span>${quote.accessNotes ? `<span class="incoming-detail-line"><small>Access note</small>${escapeHtml(quote.accessNotes)}</span>` : ''}<span class="incoming-detail-line" title="${escapeHtml(quote.exclusionsConditions || 'No exclusions or conditions')}"><small>Conditions</small>${escapeHtml(quote.exclusionsConditions || 'None stated')}</span></div></td>
          <td data-label="Status"><span class="incoming-quote-status ${statusClass}">${quote.status === 'selected' ? '<i class="fas fa-trophy"></i>' : ''}${escapeHtml(quote.status.replaceAll('_', ' '))}</span></td>
          <td data-label="Decision"><div class="incoming-quote-actions">${actionAllowed ? `<button class="incoming-mini-btn primary incoming-select-quote" onclick="selectIncomingQuote('${escapeHtml(quote._id)}',${warnings.length ? 'true' : 'false'})"><i class="fas fa-check"></i> Select Winning Quote</button><button class="incoming-mini-btn" onclick="requestIncomingQuoteRevision('${escapeHtml(quote._id)}','${escapeHtml(quote.vendorSnapshot?.email || '')}')"><i class="fas fa-redo"></i> Request Revision</button><button class="incoming-mini-btn" onclick="createStaffIncomingQuoteRevision('${escapeHtml(quote._id)}')"><i class="fas fa-edit"></i> Revise Internally</button>` : ''}${quote.status === 'draft' && quote.source === 'staff' ? `<button class="incoming-mini-btn" onclick="editIncomingQuoteDraft('${escapeHtml(quote._id)}')"><i class="fas fa-edit"></i> Edit Draft</button><button class="incoming-mini-btn primary" onclick="submitIncomingQuoteDraft('${escapeHtml(quote._id)}')"><i class="fas fa-paper-plane"></i> Submit Draft</button>` : ''}${!actionAllowed && quote.status !== 'draft' ? '<span class="incoming-no-action">No action required</span>' : ''}</div></td>
        </tr>`;
      }).join('');
    }
    const inviteList = $('incomingInvitationList');
    inviteList.innerHTML = invitations.length ? invitations.map(invite => `<div class="incoming-invitation-row"><div><strong>${escapeHtml(invite.vendorId?.name || invite.email)}</strong><small>${escapeHtml(invite.email)} · sent ${Number(invite.sendCount || 1)} time${Number(invite.sendCount || 1) === 1 ? '' : 's'} · expires ${date(invite.expiresAt)}</small></div><span class="incoming-state">${escapeHtml(invite.displayStatus || invite.status)}</span><div class="incoming-quote-actions">${['sent', 'delivery_failed', 'expired'].includes(invite.displayStatus || invite.status) ? `<button class="incoming-mini-btn" onclick="resendIncomingQuoteInvitation('${escapeHtml(invite._id)}')">Resend</button><button class="incoming-mini-btn" onclick="rotateIncomingQuoteInvitation('${escapeHtml(invite._id)}')">Rotate Link</button>` : ''}${!['submitted', 'revoked'].includes(invite.status) ? `<button class="incoming-mini-btn" onclick="revokeIncomingQuoteInvitation('${escapeHtml(invite._id)}')">Revoke</button>` : ''}</div></div>`).join('') : '<p>No vendor invitations for this Order.</p>';
    const deliveryList = $('incomingEmailDeliveryList');
    deliveryList.innerHTML = emailMessages.length ? emailMessages.map(message => `<div class="incoming-invitation-row"><div><strong>${escapeHtml(message.type.replaceAll('_', ' '))}</strong><small>${escapeHtml((message.recipients || []).join(', '))} · ${Number(message.attempts || 0)} attempt${Number(message.attempts || 0) === 1 ? '' : 's'}</small></div><span class="incoming-state">${escapeHtml(message.status.replaceAll('_', ' '))}</span><div>${message.status === 'permanently_failed' ? `<button class="incoming-mini-btn" onclick="retryIncomingQuoteEmail('${escapeHtml(message._id)}')">Retry</button>` : ''}</div></div>`).join('') : '<p>No quote emails have been queued for this Order.</p>';
  }

  function renderLeadCandidates() {
    const node = $('incomingLeadCandidates'); if (!node) return;
    if (!leadCandidates.length) { node.innerHTML = '<p>No vendors are available for qualification.</p>'; return; }
    node.innerHTML = leadCandidates.map(vendor => `<label class="incoming-lead-candidate ${vendor.sendableWithApproval ? 'needs-approval' : vendor.eligible ? '' : 'is-blocked'}"><input type="checkbox" name="leadVendor" value="${escapeHtml(vendor.id)}" ${vendor.eligible || vendor.sendableWithApproval ? '' : 'disabled'}><span><strong>${escapeHtml(vendor.name)}</strong><small>${escapeHtml((vendor.tradeClassifications || []).join(', ') || vendor.category || 'No trade')}</small><small>${vendor.eligible ? `Rating ${Number(vendor.qualification?.rating || 0).toFixed(1)} · Performance ${Number(vendor.qualification?.performanceScore || 0)}` : vendor.sendableWithApproval ? `Update required · ${escapeHtml((vendor.requirements || []).join(' · '))}` : escapeHtml((vendor.reasons || []).join(' · '))}</small></span></label>`).join('');
  }

  function renderResidentialReview(order) {
    let panel = $('incomingResidentialReview');
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'incomingResidentialReview'; panel.className = 'incoming-panel';
      $('incomingLeadDistributionForm').prepend(panel);
    }
    panel.hidden = order.source !== 'residential_portal';
    panel.style.display = panel.hidden ? 'none' : '';
    if (panel.hidden) return;
    const reviewed = Boolean(order.employee && order.residentialStaffReview?.reviewedAt);
    panel.innerHTML = `<h3>Review residential request</h3><p>${escapeHtml(order.description || '')}</p><p>Urgency: ${escapeHtml(order.residentialRequest?.urgency || 'normal')} · Preferred timing: ${escapeHtml(order.customerIntake?.preferredTiming || 'Not specified')}</p><p>${reviewed ? 'Review confirmed. Select qualified vendors and send the lead below.' : 'Choose the coordinator and check the scope once. Clicking confirm records your review; sending an invitation will also confirm these completed fields automatically.'}</p>${order.workflowStatus === 'request_received' ? `<label>Coordinator<select id="incomingResidentialCoordinator"><option value="">Loading coordinators…</option></select></label><label>Reviewed scope<textarea id="incomingResidentialScope" rows="4" maxlength="5000">${escapeHtml(order.residentialStaffReview?.scope || order.description || order.service)}</textarea></label><button type="button" class="btn-secondary" id="incomingResidentialReviewSave">Confirm review &amp; continue</button><p id="incomingResidentialReviewStatus" role="status"></p>` : ''}`;
    if ($('incomingResidentialCoordinator')) {
      window.APIService.getEmployees().then(employees => {
        if (String(currentOrderId) !== String(order._id)) return;
        const select = $('incomingResidentialCoordinator'); if (!select) return;
        const list = Array.isArray(employees) ? employees : employees.data || [];
        select.innerHTML = '<option value="">Select coordinator</option>' + list.filter(item => item.isActive !== false).map(item => `<option value="${escapeHtml(item._id)}">${escapeHtml(item.name)}</option>`).join('');
        select.value = String(order.employee?._id || order.employee || '');
      }).catch(error => { if ($('incomingResidentialReviewStatus')) $('incomingResidentialReviewStatus').textContent = error.message; });
      $('incomingResidentialReviewSave').addEventListener('click', async event => {
        const button = event.currentTarget; button.disabled = true;
        try {
          if (await ensureResidentialReviewBeforeSend()) {
            await refreshWorkspace(); toast('Review confirmed. You can send the invitation now.');
          }
        } finally { if (button.isConnected) button.disabled = false; }
      });
    }
    $('incomingLeadScope').value = order.residentialStaffReview?.scope || order.description || order.service;
    $('incomingLeadWindow').value = order.customerIntake?.preferredTiming || '';
  }

  async function ensureResidentialReviewBeforeSend() {
    const order = workspace?.order;
    if (!order || order.source !== 'residential_portal' || (order.employee && order.residentialStaffReview?.reviewedAt)) return true;
    const panel = $('incomingResidentialReview');
    const coordinator = $('incomingResidentialCoordinator');
    const scope = $('incomingResidentialScope');
    const employeeId = coordinator?.value || '';
    const reviewedScope = scope?.value.trim() || '';
    if (!employeeId || !reviewedScope) {
      const missing = !employeeId ? coordinator : scope;
      toast(!employeeId ? 'Choose a coordinator to continue.' : 'Add the reviewed scope to continue.', 'error');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      missing?.focus();
      return false;
    }
    const status = $('incomingResidentialReviewStatus');
    if (status) status.textContent = 'Confirming review…';
    try {
      await window.APIService.reviewResidentialRequest(currentOrderId, { employeeId, scope: reviewedScope, confirmReviewed: true });
      order.employee = { _id: employeeId };
      order.residentialStaffReview = { ...(order.residentialStaffReview || {}), scope: reviewedScope, reviewedAt: new Date().toISOString() };
      if (status) status.textContent = 'Review confirmed.';
      return true;
    } catch (error) {
      if (status) status.textContent = error.message;
      toast(error.message, 'error');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
  }

  async function openIncomingQuoteWorkspace(orderId, scroll = true) {
    try {
      if (currentOrderId && String(currentOrderId) !== String(orderId)) {
        editingQuoteId = '';
        $('incomingStaffQuoteForm')?.reset();
        if ($('incomingStaffVendor')) $('incomingStaffVendor').disabled = false;
      }
      currentOrderId = orderId;
      const [loadedWorkspace, candidates, approvals] = await Promise.all([window.APIService.getIncomingQuoteWorkspace(orderId), window.APIService.getIncomingLeadCandidates(orderId), window.APIService.getVendorRequirementApprovals(orderId)]);
      workspace = loadedWorkspace; leadCandidates = candidates.candidates || []; requirementApprovals = approvals.approvals || []; canApproveRequirements = approvals.canApprove === true;
      $('incomingQuoteWorkspace').hidden = false;
      renderWorkspace();
      if (scroll) $('incomingQuoteWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function closeIncomingQuoteWorkspace() {
    currentOrderId = '';
    workspace = null;
    editingQuoteId = '';
    $('incomingStaffQuoteForm')?.reset();
    if ($('incomingStaffVendor')) $('incomingStaffVendor').disabled = false;
    $('incomingQuoteWorkspace').hidden = true;
  }

  async function refreshWorkspace() {
    if (!currentOrderId) return;
    const [loadedWorkspace, candidates, approvals] = await Promise.all([window.APIService.getIncomingQuoteWorkspace(currentOrderId), window.APIService.getIncomingLeadCandidates(currentOrderId), window.APIService.getVendorRequirementApprovals(currentOrderId)]);
    workspace = loadedWorkspace; leadCandidates = candidates.candidates || []; requirementApprovals = approvals.approvals || []; canApproveRequirements = approvals.canApprove === true;
    renderWorkspace();
    const loaded = await window.APIService.getIncomingQuoteOrders();
    orders = loaded || [];
    renderOrders();
  }

  async function selectIncomingQuote(quoteId, hasWarnings) {
    const acknowledged = !hasWarnings || await (window.WorkflowDialog?.confirm?.({ title: 'Acknowledge compliance warning', message: 'This vendor has missing, expiring, or expired compliance information.', impact: 'Selection is allowed, but your acknowledgement will be recorded for this quote.', confirmLabel: 'Acknowledge and Continue' }) || Promise.resolve(false));
    if (!acknowledged) return;
    const confirmed = await (window.WorkflowDialog?.confirm?.({ title: 'Select winning vendor quote?', message: 'This quote will become the selected vendor cost for the Order.', impact: 'Other submitted quotes will be marked not selected and outstanding invitations will close.', confirmLabel: 'Select Winning Quote' }) || Promise.resolve(false));
    if (!confirmed) return;
    try {
      await window.APIService.selectIncomingQuote(quoteId, hasWarnings ? true : false);
      toast('Vendor quote selected. The Order is ready for Stage 3.');
      await refreshWorkspace();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function requestIncomingQuoteRevision(quoteId, email) {
    const message = window.WorkflowDialog ? await window.WorkflowDialog.prompt({ title: 'Request vendor revision', message: 'Explain exactly what the vendor should update.', impact: 'A new secure revision link will be generated; the submitted version remains in history.', placeholder: 'Revision instructions', confirmLabel: 'Send Revision Request' }) : null;
    if (message === null || !message.trim()) return;
    try {
      await window.APIService.requestIncomingQuoteRevision(quoteId, { email, message: message.trim() });
      toast('Revision request queued for the vendor.');
      await refreshWorkspace();
    } catch (error) { toast(error.message, 'error'); }
  }

  function editIncomingQuoteDraft(quoteId) {
    const quote = workspace?.quotes?.find(item => String(item._id) === String(quoteId));
    if (!quote) return;
    editingQuoteId = quoteId;
    $('incomingStaffVendor').value = quote.vendorId?._id || quote.vendorId;
    $('incomingStaffVendor').disabled = true;
    $('incomingScope').value = quote.scopeOfWork || '';
    $('incomingLabor').value = quote.laborAmount ?? '';
    $('incomingMaterials').value = quote.materialsAmount ?? '';
    $('incomingDurationValue').value = quote.estimatedDuration?.value ?? '';
    $('incomingDurationUnit').value = quote.estimatedDuration?.unit || 'days';
    $('incomingEarliestDate').value = quote.earliestAvailableDate ? String(quote.earliestAvailableDate).slice(0, 10) : '';
    $('incomingAccessRequired').value = quote.siteAccessRequired ? 'true' : 'false';
    $('incomingAccessNotes').value = quote.accessNotes || '';
    $('incomingExclusions').value = quote.exclusionsConditions || '';
    $('incomingStaffQuoteForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`Editing draft ${quote.quoteReference}.`);
  }

  async function submitIncomingQuoteDraft(quoteId) {
    const confirmed = await (window.WorkflowDialog?.confirm?.({ title: 'Submit vendor quote?', message: 'Review the quote before submitting it.', impact: 'Submitted quote versions are immutable. Corrections require a new revision.', confirmLabel: 'Submit Quote' }) || Promise.resolve(false));
    if (!confirmed) return;
    try {
      await window.APIService.submitIncomingQuote(quoteId);
      toast('Draft submitted.');
      await refreshWorkspace();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function createStaffIncomingQuoteRevision(quoteId) {
    const confirmed = await (window.WorkflowDialog?.confirm?.({ title: 'Create internal revision?', message: 'A new editable draft will be created from this submitted quote.', impact: 'The current submitted version remains in history and becomes superseded.', confirmLabel: 'Create Revision' }) || Promise.resolve(false));
    if (!confirmed) return;
    try {
      const revision = await window.APIService.createStaffIncomingQuoteRevision(quoteId);
      await refreshWorkspace();
      editIncomingQuoteDraft(revision._id);
    } catch (error) { toast(error.message, 'error'); }
  }

  async function invitationAction(action, invitationId) {
    try {
      const result = await window.APIService[action](invitationId);
      if (result?.inviteUrl && action === 'rotateIncomingQuoteInvitation') {
        await navigator.clipboard?.writeText(result.inviteUrl).catch(() => {});
        toast('A new secure link was generated and copied.');
      } else toast(action.includes('revoke') ? 'Invitation revoked.' : 'Invitation email queued.');
      await refreshWorkspace();
    } catch (error) { toast(error.message, 'error'); }
  }

  $('incomingInviteVendor')?.addEventListener('change', event => {
    const vendor = vendors.find(item => String(item._id) === String(event.target.value));
    $('incomingInviteEmail').value = vendor?.primaryEmail || '';
  });

  $('incomingLeadDistributionForm')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const button = event.submitter;
    const vendorIds = [...form.querySelectorAll('[name="leadVendor"]:checked')].map(input => input.value);
    if (!vendorIds.length) return toast('Select at least one qualified vendor.', 'error');
    const responseDueAt = new Date($('incomingLeadResponseDue').value); const bidDueAt = new Date($('incomingLeadBidDue').value);
    if (Number.isNaN(responseDueAt.getTime()) || Number.isNaN(bidDueAt.getTime())) return toast('Enter valid response and estimate deadlines.', 'error');
    if (button) button.disabled = true;
    let payload;
    let idempotencyKey;
    try {
      if (!await ensureResidentialReviewBeforeSend()) return;
      const submissionSignature = `${currentOrderId}:${[...vendorIds].sort().join(',')}:${responseDueAt.toISOString()}:${bidDueAt.toISOString()}`;
      if (!leadSubmissionKeys.has(submissionSignature)) leadSubmissionKeys.set(submissionSignature, globalThis.crypto?.randomUUID?.() || `lead-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      idempotencyKey = leadSubmissionKeys.get(submissionSignature);
      payload = { vendorIds, responseDueAt: responseDueAt.toISOString(), bidDueAt: bidDueAt.toISOString(), requestedWindow: $('incomingLeadWindow').value.trim(), scope: $('incomingLeadScope').value.trim(), relevantNotes: $('incomingLeadNotes').value.trim() };
      const result = await window.APIService.distributeIncomingLead(currentOrderId, payload, idempotencyKey);
      form.reset(); toast(`Lead sent to ${result.leads?.length || vendorIds.length} qualified vendor${vendorIds.length === 1 ? '' : 's'}.`); await refreshWorkspace();
    } catch (error) {
      if (error.data?.code === 'VENDOR_REQUIREMENTS_BLOCKED') openRequirementGate('lead_distribution', payload, idempotencyKey, error.data.details?.issues || []);
      else toast(error.message, 'error');
    }
    finally { if (button?.isConnected) button.disabled = false; }
  });

  $('incomingInvitationForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = event.submitter;
    const payload = { vendorId: $('incomingInviteVendor').value, email: $('incomingInviteEmail').value.trim(), personalMessage: $('incomingInviteMessage').value.trim() };
    if (submitButton) submitButton.disabled = true;
    try {
      if (!await ensureResidentialReviewBeforeSend()) return;
      const result = await window.APIService.sendIncomingQuoteInvitation(currentOrderId, payload);
      form.reset();
      $('incomingInviteVendor').innerHTML = vendorOptions();
      renderVendorCompliance('incomingInviteVendor');
      toast(result?.reusedInvitation ? 'Invitation sent again to this vendor using the active quote request.' : 'Secure vendor quote invitation queued.');
      await refreshWorkspace();
    } catch (error) {
      if (error.data?.code === 'VENDOR_REQUIREMENTS_BLOCKED') openRequirementGate('quote_invitation', payload, '', error.data.details?.issues || []);
      else toast(error.message, 'error');
    }
    finally { if (submitButton?.isConnected) submitButton.disabled = false; }
  });
  $('incomingInviteVendor')?.addEventListener('change', () => renderVendorCompliance('incomingInviteVendor'));
  $('incomingStaffVendor')?.addEventListener('change', () => renderVendorCompliance('incomingStaffVendor'));

  $('incomingStaffQuoteForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;
    try {
      const shouldSubmit = event.submitter?.value !== 'draft';
      const payload = {
        vendorId: $('incomingStaffVendor').value,
        scopeOfWork: $('incomingScope').value.trim(),
        laborAmount: Number($('incomingLabor').value),
        materialsAmount: Number($('incomingMaterials').value),
        estimatedDuration: { value: Number($('incomingDurationValue').value), unit: $('incomingDurationUnit').value },
        earliestAvailableDate: $('incomingEarliestDate').value,
        siteAccessRequired: $('incomingAccessRequired').value === 'true',
        accessNotes: $('incomingAccessNotes').value.trim(),
        exclusionsConditions: $('incomingExclusions').value.trim()
      };
      const quote = editingQuoteId
        ? await window.APIService.updateIncomingQuote(editingQuoteId, payload)
        : await window.APIService.createIncomingQuote(currentOrderId, { ...payload, submit: false });
      const files = [...($('incomingStaffDocuments').files || [])];
      if (files.length && typeof window.uploadEntityAttachments === 'function') await window.uploadEntityAttachments('incoming-quote', quote._id, files);
      if (shouldSubmit) await window.APIService.submitIncomingQuote(quote._id);
      form.reset();
      editingQuoteId = '';
      $('incomingStaffVendor').disabled = false;
      $('incomingStaffVendor').innerHTML = vendorOptions();
      renderVendorCompliance('incomingStaffVendor');
      toast(shouldSubmit ? 'Vendor quote recorded and submitted.' : 'Vendor quote draft saved.');
      await refreshWorkspace();
    } catch (error) { toast(error.message, 'error'); }
    finally { if (submitButton?.isConnected) submitButton.disabled = false; }
  });

  window.loadIncomingQuotes = loadIncomingQuotes;
  window.startIncomingQuoteOrder = startIncomingQuoteOrder;
  window.openIncomingQuoteWorkspace = openIncomingQuoteWorkspace;
  window.closeIncomingQuoteWorkspace = closeIncomingQuoteWorkspace;
  window.selectIncomingQuote = selectIncomingQuote;
  window.requestIncomingQuoteRevision = requestIncomingQuoteRevision;
  window.editIncomingQuoteDraft = editIncomingQuoteDraft;
  window.submitIncomingQuoteDraft = submitIncomingQuoteDraft;
  window.createStaffIncomingQuoteRevision = createStaffIncomingQuoteRevision;
  window.resendIncomingQuoteInvitation = id => invitationAction('resendIncomingQuoteInvitation', id);
  window.rotateIncomingQuoteInvitation = id => invitationAction('rotateIncomingQuoteInvitation', id);
  window.revokeIncomingQuoteInvitation = id => invitationAction('revokeIncomingQuoteInvitation', id);
  window.retryIncomingQuoteEmail = async id => {
    try { await window.APIService.retryIncomingQuoteEmail(id); toast('Email queued for retry.'); await refreshWorkspace(); }
    catch (error) { toast(error.message, 'error'); }
  };
})();
