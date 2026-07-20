(() => {
  let orders = [];
  let vendors = [];
  let workspace = null;
  let currentOrderId = '';
  let editingQuoteId = '';

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

  function vendorOptions(selected = '') {
    return `<option value="">Select vendor</option>${vendors.map(vendor => `<option value="${escapeHtml(vendor._id)}" ${String(vendor._id) === String(selected) ? 'selected' : ''}>${escapeHtml(vendor.name)} · ${escapeHtml(vendor.category || 'Uncategorized')} · ${escapeHtml(vendor.compliance?.status || 'missing')}</option>`).join('')}`;
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
      list.innerHTML = '<div class="workflow-empty"><i class="fas fa-file-invoice-dollar"></i><p>No Orders are collecting vendor quotes.</p></div>';
      return;
    }
    list.innerHTML = orders.map(order => `<article class="incoming-order-card">
      <header><div><span class="workflow-reference">${escapeHtml(order.requestReference || order.orderId)}</span><h3>${escapeHtml(order.customer?.name || 'Customer')}</h3></div><span class="incoming-state ${order.workflowStatus === 'vendor_selected' ? 'selected' : ''}">${escapeHtml(order.workflowStatus.replaceAll('_', ' '))}</span></header>
      <p>${escapeHtml(order.service)} · ${escapeHtml(order.customer?.address || 'No address')}</p>
      <div class="incoming-order-meta"><div><strong>${Number(order.quoteCount || 0)}</strong><span>Submitted quotes</span></div><div><strong>${Number(order.awaitingVendorCount || 0)}</strong><span>Awaiting vendors</span></div><div><strong>${order.lowestQuote == null ? '—' : money(order.lowestQuote)}</strong><span>Lowest quote</span></div><div><strong>${date(order.earliestAvailability)}</strong><span>Earliest date</span></div></div>
      <footer><span class="${order.complianceWarningCount ? 'workflow-badge warning' : 'workflow-badge success'}">${Number(order.complianceWarningCount || 0)} compliance warning${Number(order.complianceWarningCount || 0) === 1 ? '' : 's'}</span><button type="button" class="btn-primary" onclick="openIncomingQuoteWorkspace('${escapeHtml(order._id)}')">Open Workspace</button></footer>
    </article>`).join('');
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
    const { order, quotes = [], invitations = [], emailMessages = [] } = workspace;
    $('incomingWorkspaceTitle').textContent = `${order.requestReference || order.orderId} · ${order.customer?.name || 'Customer'}`;
    $('incomingWorkspaceSummary').textContent = `${order.service} · ${order.customer?.address || 'No address'} · ${order.workflowStatus.replaceAll('_', ' ')}`;
    $('incomingInviteVendor').innerHTML = vendorOptions();
    $('incomingStaffVendor').innerHTML = vendorOptions();
    const body = $('incomingComparisonBody');
    if (!quotes.length) {
      body.innerHTML = '<tr><td colspan="11" class="incoming-empty-cell">No vendor quotes have been added yet.</td></tr>';
    } else {
      body.innerHTML = quotes.map(quote => {
        const vendor = quote.vendorId || {};
        const compliance = quote.vendorSnapshot?.complianceStatus || 'missing';
        const warnings = quote.vendorSnapshot?.complianceWarnings || [];
        const docs = (quote.documents || []).filter(document => document.status !== 'archived');
        const actionAllowed = quote.status === 'submitted' && order.workflowStatus === 'quote_collection';
        return `<tr class="${quote.status === 'selected' ? 'is-selected' : ''}">
          <td><strong>${escapeHtml(vendor.name || quote.vendorSnapshot?.name || 'Vendor')}</strong><small> ${escapeHtml(quote.quoteReference)} · Rev ${Number(quote.revisionNumber || 1)} · ${escapeHtml(quote.source)}</small>${docs.length ? `<div class="incoming-documents">${docs.map(doc => `<a href="/api/attachments/incoming-quote/${encodeURIComponent(quote._id)}/${encodeURIComponent(doc.documentId)}" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i> ${escapeHtml(doc.name)}</a>`).join('')}</div>` : ''}</td>
          <td><span class="incoming-compliance ${escapeHtml(compliance)}" title="${escapeHtml(warnings.join('; '))}">${escapeHtml(compliance)}</span></td>
          <td>${money(quote.laborAmount)}</td><td>${money(quote.materialsAmount)}</td><td><strong>${money(quote.total)}</strong></td>
          <td>${escapeHtml(quote.estimatedDuration?.value || '—')} ${escapeHtml(quote.estimatedDuration?.unit || '')}</td><td>${date(quote.earliestAvailableDate)}</td>
          <td>${quote.siteAccessRequired ? `Required${quote.accessNotes ? `<small> ${escapeHtml(quote.accessNotes)}</small>` : ''}` : 'Not required'}</td>
          <td>${escapeHtml(quote.exclusionsConditions || '—')}</td><td>${escapeHtml(quote.status.replaceAll('_', ' '))}</td>
          <td><div class="incoming-quote-actions">${actionAllowed ? `<button class="incoming-mini-btn primary" onclick="selectIncomingQuote('${escapeHtml(quote._id)}',${warnings.length ? 'true' : 'false'})">Select</button><button class="incoming-mini-btn" onclick="requestIncomingQuoteRevision('${escapeHtml(quote._id)}','${escapeHtml(quote.vendorSnapshot?.email || '')}')">Request Vendor Revision</button><button class="incoming-mini-btn" onclick="createStaffIncomingQuoteRevision('${escapeHtml(quote._id)}')">Revise Internally</button>` : ''}${quote.status === 'draft' && quote.source === 'staff' ? `<button class="incoming-mini-btn" onclick="editIncomingQuoteDraft('${escapeHtml(quote._id)}')">Edit Draft</button><button class="incoming-mini-btn primary" onclick="submitIncomingQuoteDraft('${escapeHtml(quote._id)}')">Submit Draft</button>` : ''}</div></td>
        </tr>`;
      }).join('');
    }
    const inviteList = $('incomingInvitationList');
    inviteList.innerHTML = invitations.length ? invitations.map(invite => `<div class="incoming-invitation-row"><div><strong>${escapeHtml(invite.vendorId?.name || invite.email)}</strong><small>${escapeHtml(invite.email)} · expires ${date(invite.expiresAt)}</small></div><span class="incoming-state">${escapeHtml(invite.displayStatus || invite.status)}</span><div class="incoming-quote-actions">${['sent', 'delivery_failed', 'expired'].includes(invite.displayStatus || invite.status) ? `<button class="incoming-mini-btn" onclick="resendIncomingQuoteInvitation('${escapeHtml(invite._id)}')">Resend</button><button class="incoming-mini-btn" onclick="rotateIncomingQuoteInvitation('${escapeHtml(invite._id)}')">Rotate Link</button>` : ''}${!['submitted', 'revoked'].includes(invite.status) ? `<button class="incoming-mini-btn" onclick="revokeIncomingQuoteInvitation('${escapeHtml(invite._id)}')">Revoke</button>` : ''}</div></div>`).join('') : '<p>No vendor invitations for this Order.</p>';
    const deliveryList = $('incomingEmailDeliveryList');
    deliveryList.innerHTML = emailMessages.length ? emailMessages.map(message => `<div class="incoming-invitation-row"><div><strong>${escapeHtml(message.type.replaceAll('_', ' '))}</strong><small>${escapeHtml((message.recipients || []).join(', '))} · ${Number(message.attempts || 0)} attempt${Number(message.attempts || 0) === 1 ? '' : 's'}</small></div><span class="incoming-state">${escapeHtml(message.status.replaceAll('_', ' '))}</span><div>${message.status === 'permanently_failed' ? `<button class="incoming-mini-btn" onclick="retryIncomingQuoteEmail('${escapeHtml(message._id)}')">Retry</button>` : ''}</div></div>`).join('') : '<p>No quote emails have been queued for this Order.</p>';
  }

  async function openIncomingQuoteWorkspace(orderId, scroll = true) {
    try {
      if (currentOrderId && String(currentOrderId) !== String(orderId)) {
        editingQuoteId = '';
        $('incomingStaffQuoteForm')?.reset();
        if ($('incomingStaffVendor')) $('incomingStaffVendor').disabled = false;
      }
      currentOrderId = orderId;
      workspace = await window.APIService.getIncomingQuoteWorkspace(orderId);
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
    workspace = await window.APIService.getIncomingQuoteWorkspace(currentOrderId);
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

  $('incomingInvitationForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;
    try {
      await window.APIService.sendIncomingQuoteInvitation(currentOrderId, { vendorId: $('incomingInviteVendor').value, email: $('incomingInviteEmail').value.trim(), personalMessage: $('incomingInviteMessage').value.trim() });
      event.currentTarget.reset();
      $('incomingInviteVendor').innerHTML = vendorOptions();
      toast('Secure vendor quote invitation queued.');
      await refreshWorkspace();
    } catch (error) { toast(error.message, 'error'); }
    finally { if (submitButton?.isConnected) submitButton.disabled = false; }
  });

  $('incomingStaffQuoteForm')?.addEventListener('submit', async event => {
    event.preventDefault();
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
      event.currentTarget.reset();
      editingQuoteId = '';
      $('incomingStaffVendor').disabled = false;
      $('incomingStaffVendor').innerHTML = vendorOptions();
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
