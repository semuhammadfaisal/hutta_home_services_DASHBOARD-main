(() => {
  let orders = [];
  let workspace = null;
  let currentOrderId = '';
  let settingsPreviousFocus = null;
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const money = value => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = value => value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const inputDate = value => value ? new Date(value).toISOString().slice(0, 10) : '';
  const toast = (message, type = 'success') => window.showToast ? window.showToast(message, type) : alert(message);

  function renderOrders() {
    const ready = orders.filter(order => order.workflowStatus === 'vendor_selected').length;
    const drafts = orders.filter(order => order.outgoingQuote?.status === 'draft').length;
    const sent = orders.filter(order => order.outgoingQuote?.status === 'sent').length;
    $('outgoingReadyCount').textContent = ready; $('outgoingDraftCount').textContent = drafts; $('outgoingSentCount').textContent = sent;
    const badge = $('outgoingQuotesNavBadge'); badge.textContent = ready + drafts; badge.hidden = ready + drafts === 0;
    const list = $('outgoingQuoteOrderList');
    if (!orders.length) { list.innerHTML = '<div class="workflow-empty workflow-empty-illustrated"><span class="workflow-empty-art plane"><i class="fas fa-paper-plane"></i></span><strong>No Orders are ready for outgoing quotes.</strong><p>Build and send quotes to see them here.</p></div>'; return; }
    list.innerHTML = orders.map(order => {
      const quote = order.outgoingQuote;
      const state = quote?.status || 'ready';
      return `<article class="outgoing-order-card"><header><div><span class="workflow-reference">${escapeHtml(order.requestReference || order.orderId)}</span><h3>${escapeHtml(order.customer?.name || 'Customer')}</h3></div><span class="outgoing-state ${state === 'sent' ? 'sent' : ''}">${escapeHtml(state)}</span></header><p>${escapeHtml(order.service)} · ${escapeHtml(order.vendor?.name || 'Selected vendor')}</p><div class="outgoing-meta"><div><strong>${quote ? escapeHtml(quote.quoteReference) : 'Not converted'}</strong><span>Outgoing quote</span></div><div><strong>${quote ? money(quote.customerTotal) : 'Unquoted'}</strong><span>Customer total</span></div><div><strong>${money(order.vendorCost)}</strong><span>Vendor cost</span></div><div><strong>${quote ? date(quote.validUntil) : '—'}</strong><span>Valid until</span></div></div><footer><span class="outgoing-state">${escapeHtml(String(order.workflowStatus || '').replaceAll('_', ' '))}</span><button class="btn-primary" type="button" data-outgoing-open="${escapeHtml(order._id)}">${quote ? 'Open Workspace' : 'Prepare Quote'}</button></footer></article>`;
    }).join('');
    list.onclick = event => {
      const button = event.target.closest('[data-outgoing-open]');
      if (button) openOutgoingQuoteWorkspace(button.dataset.outgoingOpen);
    };
  }

  async function loadOutgoingQuotes() {
    try {
      $('outgoingQuoteOrderList').innerHTML = '<div class="workflow-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading outgoing quotes&hellip;</p></div>';
      orders = await window.APIService.getOutgoingQuoteOrders(); renderOrders();
      const admin = window.AuthSession?.user?.role === 'admin';
      if ($('outgoingSettingsButton')) $('outgoingSettingsButton').hidden = !admin;
      if (currentOrderId) await openOutgoingQuoteWorkspace(currentOrderId, false);
    } catch (error) { $('outgoingQuoteOrderList').innerHTML = `<div class="workflow-empty"><p>${escapeHtml(error.message)}</p></div>`; }
  }

  function quoteForm(quote) {
    if (!quote) return `<section class="outgoing-panel"><h3>Prepare customer quote</h3><p>This Order has a selected vendor quote and is ready for conversion.</p><button class="btn-primary" type="button" onclick="convertOutgoingQuote()">Create Outgoing Quote</button></section>`;
    if (quote.status !== 'draft' && quote.customerDecisionStatus === 'approved') return `<section class="outgoing-panel"><div class="outgoing-panel-head"><div><h3>${escapeHtml(quote.quoteReference)} · Approved</h3><p>This immutable quote was approved by the customer. Approval cancellation is outside Stage 4.</p></div><span class="outgoing-state sent">approved</span></div><div class="outgoing-pricing"><div><span>Vendor cost</span><strong>${money(quote.vendorCost)}</strong></div><div><span>Markup</span><strong>${money(quote.markupAmount)}</strong></div><div><span>Customer total</span><strong>${money(quote.customerTotal)}</strong></div></div><div class="outgoing-actions"><a class="btn-secondary" href="/api/outgoing-quotes/${encodeURIComponent(quote._id)}/pdf" target="_blank" rel="noopener">View PDF</a></div></section>`;
    if (quote.status !== 'draft' && quote.customerDecisionStatus === 'changes_requested') return `<section class="outgoing-panel"><div class="outgoing-panel-head"><div><h3>${escapeHtml(quote.quoteReference)} · Changes Requested</h3><p>The customer requested changes. A new revision is required before another quote can be sent.</p></div><span class="outgoing-state">changes requested</span></div><div class="outgoing-pricing"><div><span>Vendor cost</span><strong>${money(quote.vendorCost)}</strong></div><div><span>Markup</span><strong>${money(quote.markupAmount)}</strong></div><div><span>Customer total</span><strong>${money(quote.customerTotal)}</strong></div></div><div class="outgoing-actions"><a class="btn-secondary" href="/api/outgoing-quotes/${encodeURIComponent(quote._id)}/pdf" target="_blank" rel="noopener">View PDF</a><button class="btn-primary" type="button" onclick="reviseOutgoingQuote('${escapeHtml(quote._id)}')">Create Revision</button></div></section>`;
    if (quote.status !== 'draft') return `<section class="outgoing-panel"><div class="outgoing-panel-head"><div><h3>${escapeHtml(quote.quoteReference)} · Sent</h3><p>Sent ${date(quote.sentAt)} · Valid through ${date(quote.validUntil)} · Delivery ${escapeHtml(quote.deliveryStatus.replaceAll('_', ' '))}</p></div><span class="outgoing-state sent">sent</span></div><div class="outgoing-pricing"><div><span>Vendor cost</span><strong>${money(quote.vendorCost)}</strong></div><div><span>Markup</span><strong>${money(quote.markupAmount)}</strong></div><div><span>Customer total</span><strong>${money(quote.customerTotal)}</strong></div></div><div class="outgoing-actions"><a class="btn-secondary" href="/api/outgoing-quotes/${encodeURIComponent(quote._id)}/pdf" target="_blank" rel="noopener">View PDF</a><button class="btn-primary" type="button" onclick="reviseOutgoingQuote('${escapeHtml(quote._id)}')">Create Revision</button><button class="btn-secondary" type="button" onclick="resendOutgoingQuote('${escapeHtml(quote._id)}')">Rotate Link & Resend</button><button class="btn-secondary" type="button" onclick="voidOutgoingQuote('${escapeHtml(quote._id)}')">Void</button></div></section>`;
    const v = quote.vendorSnapshot || {};
    return `<form id="outgoingDraftForm" class="outgoing-panel"><div class="outgoing-panel-head"><div><h3>${escapeHtml(quote.quoteReference)} · Revision ${Number(quote.revisionNumber || 1)}</h3><p>Draft fields are a quote-only snapshot and do not overwrite CRM master data.</p></div><span class="outgoing-state">draft</span></div><div class="outgoing-form-grid"><label>Customer name<input id="oqCustomerName" value="${escapeHtml(quote.customerSnapshot?.name)}" required></label><label>Customer email<input id="oqCustomerEmail" type="email" value="${escapeHtml(quote.customerSnapshot?.email)}" required></label><label class="full">Service address<input id="oqCustomerAddress" value="${escapeHtml(quote.customerSnapshot?.address)}" required></label><label class="full">Service<input id="oqService" value="${escapeHtml(quote.jobSnapshot?.service)}" required></label><label class="full">Scope of work<textarea id="oqScope" rows="6" required>${escapeHtml(quote.scopeOfWork)}</textarea></label><label>Duration value<input id="oqDurationValue" type="number" min="0.1" step="0.1" value="${escapeHtml(quote.estimatedDuration?.value)}"></label><label>Duration unit<select id="oqDurationUnit"><option value="hours" ${quote.estimatedDuration?.unit === 'hours' ? 'selected' : ''}>Hours</option><option value="days" ${quote.estimatedDuration?.unit === 'days' ? 'selected' : ''}>Days</option><option value="weeks" ${quote.estimatedDuration?.unit === 'weeks' ? 'selected' : ''}>Weeks</option></select></label><label>Earliest availability<input id="oqEarliest" type="date" value="${inputDate(quote.earliestAvailableDate)}"></label><label>Site access<select id="oqSiteAccess"><option value="false" ${!quote.siteAccessRequired ? 'selected' : ''}>No arrangement needed</option><option value="true" ${quote.siteAccessRequired ? 'selected' : ''}>Arrangement required</option></select></label><label class="full">Access notes<textarea id="oqAccessNotes" rows="2">${escapeHtml(quote.accessNotes)}</textarea></label><label class="full">Exclusions / conditions<textarea id="oqConditions" rows="3">${escapeHtml(quote.exclusionsConditions)}</textarea></label><label>Markup type<select id="oqMarkupType"><option value="percentage" ${quote.markupType === 'percentage' ? 'selected' : ''}>Percentage</option><option value="fixed" ${quote.markupType === 'fixed' ? 'selected' : ''}>Fixed amount</option></select></label><label>Markup value<input id="oqMarkupValue" type="number" min="0" step="0.01" value="${Number(quote.markupValue || 0)}" required></label><label>Valid until<input id="oqValidUntil" type="date" value="${inputDate(quote.validUntil)}" required></label><label>Vendor company<input id="oqVendorCompany" value="${escapeHtml(v.companyName)}" required></label><label>Licensed contractor<input id="oqContractor" value="${escapeHtml(v.licensedContractorName)}" required></label><label>Contractor license number<input id="oqLicenseNumber" value="${escapeHtml(v.contractorLicenseNumber)}" required></label><label>License type<input id="oqLicenseType" value="${escapeHtml(v.licenseType)}" required></label><label>ROC number<input id="oqRoc" value="${escapeHtml(v.rocNumber)}" required></label><label class="full">Terms and conditions<textarea id="oqTerms" rows="9" required>${escapeHtml(quote.termsAndConditions)}</textarea></label></div><div class="outgoing-pricing"><div><span>Vendor cost</span><strong>${money(quote.vendorCost)}</strong></div><div><span>Markup</span><strong>${money(quote.markupAmount)}</strong></div><div><span>Customer total</span><strong>${money(quote.customerTotal)}</strong></div></div>${!quote.termsAndConditions ? '<div class="outgoing-warning">Approved terms are not configured. An admin must save terms before this quote can be sent.</div>' : ''}<div class="outgoing-actions"><button class="btn-primary" type="submit">Save Draft</button><a class="btn-secondary" href="/api/outgoing-quotes/${encodeURIComponent(quote._id)}/pdf" target="_blank" rel="noopener">Preview PDF</a><button class="btn-primary" type="button" onclick="sendOutgoingQuote('${escapeHtml(quote._id)}')">Send to Customer</button><button class="btn-secondary" type="button" onclick="voidOutgoingQuote('${escapeHtml(quote._id)}')">Void Draft</button></div></form>`;
  }

  function renderWorkspace() {
    const { order, quotes = [], emailMessages = [] } = workspace;
    $('outgoingWorkspaceTitle').textContent = `${order.requestReference || order.orderId} · ${order.customer?.name || 'Customer'}`;
    $('outgoingWorkspaceSummary').textContent = `${order.service} · ${order.vendor?.name || 'Selected vendor'} · ${String(order.workflowStatus).replaceAll('_', ' ')}`;
    const draft = quotes.find(item => item.status === 'draft');
    const current = draft || quotes.find(item => item.status === 'sent') || quotes[0];
    window.__workflowOutgoingQuote = current || null;
    $('outgoingDraftArea').innerHTML = quoteForm(current);
    const form = $('outgoingDraftForm'); if (form) form.addEventListener('submit', saveOutgoingDraft);
    const messages = new Map();
    for (const message of emailMessages) if (!messages.has(String(message.outgoingQuoteId))) messages.set(String(message.outgoingQuoteId), message);
    $('outgoingHistoryList').innerHTML = quotes.length ? quotes.map(quote => { const message = messages.get(String(quote._id)); return `<div class="outgoing-history-row"><div><strong>${escapeHtml(quote.quoteReference)} · Revision ${quote.revisionNumber}</strong><small>${escapeHtml(quote.status)} · ${date(quote.sentAt || quote.createdAt)} · Total ${money(quote.customerTotal)}</small></div><span class="outgoing-state ${quote.status === 'sent' ? 'sent' : ''}">${escapeHtml(message?.status || quote.deliveryStatus)}</span><div class="outgoing-actions">${message?.status === 'permanently_failed' ? `<button class="btn-secondary" onclick="retryOutgoingQuoteEmail('${escapeHtml(message._id)}')">Retry Email</button>` : ''}</div></div>`; }).join('') : '<p>No outgoing quote versions yet.</p>';
  }

  async function openOutgoingQuoteWorkspace(orderId, scroll = true) { try { currentOrderId = orderId; workspace = await window.APIService.getOutgoingQuoteWorkspace(orderId); $('outgoingQuoteWorkspace').hidden = false; renderWorkspace(); if (scroll) $('outgoingQuoteWorkspace').scrollIntoView({ behavior: 'smooth' }); } catch (error) { toast(error.message, 'error'); } }
  function closeOutgoingQuoteWorkspace() { currentOrderId = ''; workspace = null; $('outgoingQuoteWorkspace').hidden = true; }
  async function refresh() { if (currentOrderId) workspace = await window.APIService.getOutgoingQuoteWorkspace(currentOrderId); orders = await window.APIService.getOutgoingQuoteOrders(); renderOrders(); if (workspace) renderWorkspace(); }
  async function convertOutgoingQuote() { try { await window.APIService.convertOutgoingQuote(currentOrderId); toast('Outgoing quote draft created.'); await refresh(); } catch (error) { toast(error.message, 'error'); } }
  async function saveOutgoingDraft(event) {
    event.preventDefault(); const submitButton = event.submitter; if (submitButton) submitButton.disabled = true; const quote = workspace.quotes.find(item => item.status === 'draft');
    const payload = { customerSnapshot: { name: $('oqCustomerName').value, email: $('oqCustomerEmail').value, address: $('oqCustomerAddress').value }, jobSnapshot: { service: $('oqService').value }, scopeOfWork: $('oqScope').value, estimatedDuration: { value: Number($('oqDurationValue').value), unit: $('oqDurationUnit').value }, earliestAvailableDate: $('oqEarliest').value, siteAccessRequired: $('oqSiteAccess').value === 'true', accessNotes: $('oqAccessNotes').value, exclusionsConditions: $('oqConditions').value, markupType: $('oqMarkupType').value, markupValue: Number($('oqMarkupValue').value), validUntil: $('oqValidUntil').value, vendorSnapshot: { companyName: $('oqVendorCompany').value, licensedContractorName: $('oqContractor').value, contractorLicenseNumber: $('oqLicenseNumber').value, licenseType: $('oqLicenseType').value, rocNumber: $('oqRoc').value }, termsAndConditions: $('oqTerms').value };
    try { await window.APIService.updateOutgoingQuote(quote._id, payload); toast('Draft saved and pricing recalculated.'); await refresh(); } catch (error) { toast(error.message, 'error'); } finally { if (submitButton?.isConnected) submitButton.disabled = false; }
  }
  async function sendOutgoingQuote(id) { const confirmed = await (window.WorkflowDialog?.confirm?.({ title: 'Send customer quote?', message: 'The current quote snapshot will be frozen and sent through a secure customer link.', impact: 'Sent quotes cannot be edited. Any later change requires a new revision.', confirmLabel: 'Send to Customer' }) || Promise.resolve(false)); if (!confirmed) return; try { await window.APIService.sendOutgoingQuote(id); toast('Quote sent and customer email queued.'); await refresh(); } catch (error) { toast(error.message, 'error'); } }
  async function reviseOutgoingQuote(id) { try { await window.APIService.reviseOutgoingQuote(id); toast('Revision draft created.'); await refresh(); } catch (error) { toast(error.message, 'error'); } }
  async function resendOutgoingQuote(id) { const confirmed = await (window.WorkflowDialog?.confirm?.({ title: 'Rotate and resend secure link?', message: 'A new customer link will be generated and another email queued.', impact: 'The previous customer link will immediately stop working.', confirmLabel: 'Rotate and Resend' }) || Promise.resolve(false)); if (!confirmed) return; try { await window.APIService.resendOutgoingQuote(id); toast('New secure link queued.'); await refresh(); } catch (error) { toast(error.message, 'error'); } }
  async function voidOutgoingQuote(id) { const reason = window.WorkflowDialog ? await window.WorkflowDialog.prompt({ title: 'Void outgoing quote?', message: 'Provide a reason for the permanent audit history.', impact: 'The secure customer link will stop working and this quote cannot be sent.', placeholder: 'Reason for voiding', confirmLabel: 'Void Quote', tone: 'danger' }) : null; if (reason === null) return; try { await window.APIService.voidOutgoingQuote(id, reason); toast('Quote voided.'); await refresh(); } catch (error) { toast(error.message, 'error'); } }
  async function retryOutgoingQuoteEmail(id) { try { await window.APIService.retryOutgoingQuoteEmail(id); toast('Email retry queued.'); await refresh(); } catch (error) { toast(error.message, 'error'); } }

  async function toggleOutgoingSettings(show) {
    const panel = $('outgoingSettingsPanel');
    panel.hidden = !show;
    document.body.style.overflow = show ? 'hidden' : '';
    if (!show) {
      settingsPreviousFocus?.focus?.();
      return;
    }
    settingsPreviousFocus = document.activeElement;
    requestAnimationFrame(() => panel.querySelector('button,input,select,textarea')?.focus());
    try { const config = await window.APIService.getOutgoingQuoteSettings(); $('outgoingDefaultMarkupType').value = config.defaultMarkupType; $('outgoingDefaultMarkupValue').value = config.defaultMarkupValue; $('outgoingDefaultValidityDays').value = config.defaultValidityDays; $('outgoingCompanyName').value = config.company?.name || ''; $('outgoingCompanyAddress').value = config.company?.address || ''; $('outgoingCompanyPhone').value = config.company?.phone || ''; $('outgoingCompanyEmail').value = config.company?.email || ''; $('outgoingCompanyWebsite').value = config.company?.website || ''; $('outgoingDefaultTerms').value = config.termsAndConditions || ''; } catch (error) { toast(error.message, 'error'); }
  }
  $('outgoingSettingsPanel')?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      toggleOutgoingSettings(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...event.currentTarget.querySelectorAll('button,input,select,textarea,a[href]')].filter(node => !node.disabled && !node.hidden);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  $('outgoingSettingsForm')?.addEventListener('submit', async event => { event.preventDefault(); try { await window.APIService.updateOutgoingQuoteSettings({ defaultMarkupType: $('outgoingDefaultMarkupType').value, defaultMarkupValue: Number($('outgoingDefaultMarkupValue').value), defaultValidityDays: Number($('outgoingDefaultValidityDays').value), company: { name: $('outgoingCompanyName').value, address: $('outgoingCompanyAddress').value, phone: $('outgoingCompanyPhone').value, email: $('outgoingCompanyEmail').value, website: $('outgoingCompanyWebsite').value }, termsAndConditions: $('outgoingDefaultTerms').value }); toast('Outgoing quote settings saved.'); toggleOutgoingSettings(false); } catch (error) { toast(error.message, 'error'); } });

  Object.assign(window, { loadOutgoingQuotes, openOutgoingQuoteWorkspace, closeOutgoingQuoteWorkspace, convertOutgoingQuote, sendOutgoingQuote, reviseOutgoingQuote, resendOutgoingQuote, voidOutgoingQuote, retryOutgoingQuoteEmail, toggleOutgoingSettings });
})();
