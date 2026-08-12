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
      return `<article class="outgoing-order-card"><header><div class="outgoing-order-identity"><span class="outgoing-customer-avatar">${escapeHtml(String(order.customer?.name || 'C').charAt(0).toUpperCase())}</span><div><span class="workflow-reference">${escapeHtml(order.requestReference || order.orderId)}</span><h3>${escapeHtml(order.customer?.name || 'Customer')}</h3><p>${escapeHtml(order.service)} <i>·</i> ${escapeHtml(order.vendor?.name || 'Selected vendor')}</p></div></div><span class="outgoing-state ${state === 'sent' ? 'sent' : ''}">${escapeHtml(state)}</span></header><div class="outgoing-meta"><div><span>Quote</span><strong>${quote ? escapeHtml(quote.quoteReference) : 'Not created'}</strong></div><div><span>Customer total</span><strong>${quote ? money(quote.customerTotal) : 'Unquoted'}</strong></div><div class="internal"><span><i class="fas fa-lock"></i> Vendor cost</span><strong>${money(order.vendorCost)}</strong></div><div><span>Valid until</span><strong>${quote ? date(quote.validUntil) : '—'}</strong></div></div><footer><span class="outgoing-workflow-label"><i class="fas fa-check-circle"></i>${escapeHtml(String(order.workflowStatus || '').replaceAll('_', ' '))}</span><button class="btn-primary" type="button" data-outgoing-open="${escapeHtml(order._id)}">${quote ? 'Open Quote' : 'Prepare Customer Quote'} <i class="fas fa-arrow-right"></i></button></footer></article>`;
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
    if (!quote) {
      const order = workspace?.order || {};
      return `<section class="outgoing-panel outgoing-convert-panel">
        <div class="outgoing-convert-main">
          <span class="outgoing-convert-icon"><i class="fas fa-file-invoice-dollar"></i></span>
          <span class="outgoing-kicker">Ready for conversion</span>
          <h3>Prepare the customer quote</h3>
          <p>Build a customer-facing draft from the selected vendor quote. Customer, job, scope, and contractor details will be copied automatically.</p>
          <div class="outgoing-convert-flow"><div class="complete"><span><i class="fas fa-check"></i></span><p><strong>Vendor selected</strong><small>${escapeHtml(order.vendor?.name || 'Selected vendor')}</small></p></div><i class="fas fa-chevron-right"></i><div><span>2</span><p><strong>Apply markup</strong><small>Review customer pricing</small></p></div><i class="fas fa-chevron-right"></i><div><span>3</span><p><strong>Review & send</strong><small>Preview final PDF</small></p></div></div>
          <button class="btn-primary outgoing-create-quote" type="button" onclick="convertOutgoingQuote()"><i class="fas fa-plus"></i> Create Customer Quote</button>
        </div>
        <aside class="outgoing-convert-sidebar">
          <div class="outgoing-selected-cost"><span><i class="fas fa-lock"></i> Internal vendor cost</span><strong>${money(order.vendorCost)}</strong><small>Markup and customer total are calculated after conversion.</small></div>
          <div class="outgoing-readiness"><h4>Conversion readiness</h4><div><i class="fas fa-check-circle"></i><span><strong>Selected vendor quote</strong><small>Commercial source is locked</small></span></div><div><i class="fas fa-check-circle"></i><span><strong>Customer and job details</strong><small>Ready to auto-fill</small></span></div><div><i class="fas fa-check-circle"></i><span><strong>Vendor information</strong><small>Ready for disclosure review</small></span></div></div>
          <p class="outgoing-private-note"><i class="fas fa-eye-slash"></i> Vendor cost and markup remain internal and are never shown to the customer.</p>
        </aside>
      </section>`;
    }
    if (quote.status !== 'draft' && quote.customerDecisionStatus === 'approved') return `<section class="outgoing-panel"><div class="outgoing-panel-head"><div><h3>${escapeHtml(quote.quoteReference)} · Approved</h3><p>This immutable quote was approved by the customer. Approval cancellation is outside Stage 4.</p></div><span class="outgoing-state sent">approved</span></div><div class="outgoing-pricing"><div><span>Vendor cost</span><strong>${money(quote.vendorCost)}</strong></div><div><span>Markup</span><strong>${money(quote.markupAmount)}</strong></div><div><span>Customer total</span><strong>${money(quote.customerTotal)}</strong></div></div><div class="outgoing-actions"><a class="btn-secondary" href="/api/outgoing-quotes/${encodeURIComponent(quote._id)}/pdf" target="_blank" rel="noopener">View PDF</a></div></section>`;
    if (quote.status !== 'draft' && quote.customerDecisionStatus === 'changes_requested') return `<section class="outgoing-panel"><div class="outgoing-panel-head"><div><h3>${escapeHtml(quote.quoteReference)} · Changes Requested</h3><p>The customer requested changes. A new revision is required before another quote can be sent.</p></div><span class="outgoing-state">changes requested</span></div><div class="outgoing-pricing"><div><span>Vendor cost</span><strong>${money(quote.vendorCost)}</strong></div><div><span>Markup</span><strong>${money(quote.markupAmount)}</strong></div><div><span>Customer total</span><strong>${money(quote.customerTotal)}</strong></div></div><div class="outgoing-actions"><a class="btn-secondary" href="/api/outgoing-quotes/${encodeURIComponent(quote._id)}/pdf" target="_blank" rel="noopener">View PDF</a><button class="btn-primary" type="button" onclick="reviseOutgoingQuote('${escapeHtml(quote._id)}')">Create Revision</button></div></section>`;
    if (quote.status !== 'draft') {
      const deliveryStatus = String(quote.deliveryStatus || 'pending').replaceAll('_', ' ');
      return `<section class="outgoing-panel outgoing-sent-summary">
        <header class="outgoing-sent-head">
          <div class="outgoing-sent-identity">
            <span class="outgoing-sent-icon"><i class="fas fa-paper-plane"></i></span>
            <div>
              <span class="outgoing-kicker">Customer quote sent</span>
              <h3>${escapeHtml(quote.quoteReference)} <small>Revision ${Number(quote.revisionNumber || 1)}</small></h3>
              <p>The quote snapshot is locked. Create a revision to make changes.</p>
            </div>
          </div>
          <span class="outgoing-state sent"><i class="fas fa-check-circle"></i> Sent</span>
        </header>
        <div class="outgoing-sent-details">
          <div><span class="outgoing-detail-icon"><i class="far fa-calendar-check"></i></span><p><small>Sent on</small><strong>${date(quote.sentAt)}</strong></p></div>
          <div><span class="outgoing-detail-icon"><i class="far fa-clock"></i></span><p><small>Valid through</small><strong>${date(quote.validUntil)}</strong></p></div>
          <div><span class="outgoing-detail-icon delivery"><i class="fas fa-envelope"></i></span><p><small>Email delivery</small><strong>${escapeHtml(deliveryStatus)}</strong></p></div>
          <div><span class="outgoing-detail-icon decision"><i class="fas fa-user-check"></i></span><p><small>Customer decision</small><strong>${escapeHtml(String(quote.customerDecisionStatus || 'pending').replaceAll('_', ' '))}</strong></p></div>
        </div>
        <div class="outgoing-sent-pricing">
          <div class="internal"><span><i class="fas fa-lock"></i> Vendor cost <small>Internal</small></span><strong>${money(quote.vendorCost)}</strong></div>
          <div class="internal"><span><i class="fas fa-lock"></i> Markup <small>Internal</small></span><strong>${money(quote.markupAmount)}</strong></div>
          <div class="customer"><span>Customer total <small>Customer-facing</small></span><strong>${money(quote.customerTotal)}</strong></div>
        </div>
        <footer class="outgoing-sent-actions">
          <div class="outgoing-sent-note"><i class="fas fa-shield-alt"></i><span><strong>Secure quote link is active</strong><small>Rotating the link immediately invalidates the previous one.</small></span></div>
          <a class="btn-secondary" href="/api/outgoing-quotes/${encodeURIComponent(quote._id)}/pdf" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> View PDF</a>
          <button class="btn-secondary" type="button" onclick="resendOutgoingQuote('${escapeHtml(quote._id)}')"><i class="fas fa-sync-alt"></i> Rotate Link & Resend</button>
          <button class="btn-secondary outgoing-void-button" type="button" onclick="voidOutgoingQuote('${escapeHtml(quote._id)}')"><i class="fas fa-ban"></i> Void</button>
          <button class="btn-primary" type="button" onclick="reviseOutgoingQuote('${escapeHtml(quote._id)}')"><i class="fas fa-copy"></i> Create Revision</button>
        </footer>
      </section>`;
    }
    const v = quote.vendorSnapshot || {};
    const readiness = [
      ['Customer email', Boolean(quote.customerSnapshot?.email), 'Required for secure delivery'],
      ['Terms and conditions', Boolean(quote.termsAndConditions), 'Approved terms must be included'],
      ['Contractor disclosure', Boolean(v.companyName && v.licensedContractorName && v.contractorLicenseNumber && v.licenseType && v.rocNumber), 'License and ROC details required'],
      ['Quote expiration', Boolean(inputDate(quote.validUntil)), 'A future valid-until date is required']
    ];
    const readyCount = readiness.filter(item => item[1]).length;
    return `<form id="outgoingDraftForm" class="outgoing-panel outgoing-draft-form">
      <div class="outgoing-draft-head"><div><span class="outgoing-kicker">Editable customer quote</span><h3>${escapeHtml(quote.quoteReference)} <small>Revision ${Number(quote.revisionNumber || 1)}</small></h3><p>Changes apply only to this quote snapshot and do not overwrite CRM master records.</p></div><span class="outgoing-state">Draft</span></div>
      <div class="outgoing-editor-layout">
        <div class="outgoing-editor-main">
          <section class="outgoing-editor-section"><div class="outgoing-section-heading"><span><svg class="outgoing-heading-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg></span><div><h4>Customer &amp; Service</h4><p>Information displayed on the customer quote.</p></div></div><div class="outgoing-form-grid"><label>Customer name<input id="oqCustomerName" value="${escapeHtml(quote.customerSnapshot?.name)}" required></label><label>Customer email<input id="oqCustomerEmail" type="email" value="${escapeHtml(quote.customerSnapshot?.email)}" required></label><label class="full">Service address<input id="oqCustomerAddress" value="${escapeHtml(quote.customerSnapshot?.address)}" required></label><label class="full">Service<input id="oqService" value="${escapeHtml(quote.jobSnapshot?.service)}" required></label></div></section>
          <section class="outgoing-editor-section"><div class="outgoing-section-heading"><span><svg class="outgoing-heading-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"></path></svg></span><div><h4>Scope &amp; Job Details</h4><p>Edit the customer-facing description, timing, access, and conditions.</p></div></div><div class="outgoing-form-grid"><label class="full">Scope of work<textarea id="oqScope" rows="6" required>${escapeHtml(quote.scopeOfWork)}</textarea></label><label>Duration value<input id="oqDurationValue" type="number" min="0.1" step="0.1" value="${escapeHtml(quote.estimatedDuration?.value)}"></label><label>Duration unit<select id="oqDurationUnit"><option value="hours" ${quote.estimatedDuration?.unit === 'hours' ? 'selected' : ''}>Hours</option><option value="days" ${quote.estimatedDuration?.unit === 'days' ? 'selected' : ''}>Days</option><option value="weeks" ${quote.estimatedDuration?.unit === 'weeks' ? 'selected' : ''}>Weeks</option></select></label><label>Earliest availability<input id="oqEarliest" type="date" value="${inputDate(quote.earliestAvailableDate)}"></label><label>Site access<select id="oqSiteAccess"><option value="false" ${!quote.siteAccessRequired ? 'selected' : ''}>No arrangement needed</option><option value="true" ${quote.siteAccessRequired ? 'selected' : ''}>Arrangement required</option></select></label><label class="full">Access notes<textarea id="oqAccessNotes" rows="2">${escapeHtml(quote.accessNotes)}</textarea></label><label class="full">Exclusions / conditions<textarea id="oqConditions" rows="3">${escapeHtml(quote.exclusionsConditions)}</textarea></label></div></section>
          <details class="outgoing-editor-section outgoing-disclosure" open><summary><span><i class="fas fa-shield-alt"></i><strong>Contractor Disclosure</strong></span><small>Required legal information</small><i class="fas fa-chevron-down"></i></summary><div class="outgoing-form-grid"><label>Vendor company<input id="oqVendorCompany" value="${escapeHtml(v.companyName)}" required></label><label>Licensed contractor<input id="oqContractor" value="${escapeHtml(v.licensedContractorName)}" required></label><label>Contractor license number<input id="oqLicenseNumber" value="${escapeHtml(v.contractorLicenseNumber)}" required></label><label>License type<input id="oqLicenseType" value="${escapeHtml(v.licenseType)}" required></label><label>ROC number<input id="oqRoc" value="${escapeHtml(v.rocNumber)}" required></label></div><div class="outgoing-disclosure-preview"><i class="fas fa-info-circle"></i><span>Trade and specialty work performed by <strong>${escapeHtml(v.companyName || 'the selected vendor')}</strong>, ROC #${escapeHtml(v.rocNumber || 'required')}, a licensed and insured contractor operating independently.</span></div></details>
          <section class="outgoing-editor-section"><div class="outgoing-section-heading"><span><svg class="outgoing-heading-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6"></path></svg></span><div><h4>Terms &amp; Conditions</h4><p>These approved terms appear above the contractor disclosure.</p></div></div><label class="outgoing-full-label">Terms and conditions<textarea id="oqTerms" rows="9" required>${escapeHtml(quote.termsAndConditions)}</textarea></label>${!quote.termsAndConditions ? '<div class="outgoing-warning"><i class="fas fa-exclamation-triangle"></i><span><strong>Approved terms are missing</strong>An admin must configure and save terms before this quote can be sent.</span></div>' : ''}</section>
        </div>
        <aside class="outgoing-editor-sidebar">
          <section class="outgoing-sidebar-card outgoing-price-card"><div class="outgoing-sidebar-title"><span><i class="fas fa-lock"></i> Internal pricing</span><small>Not shown to customer</small></div><div class="outgoing-price-stack"><div><span>Vendor cost</span><strong>${money(quote.vendorCost)}</strong></div><div><span>Markup</span><strong>${money(quote.markupAmount)}</strong></div><div class="customer-total"><span>Customer total</span><strong>${money(quote.customerTotal)}</strong></div></div><div class="outgoing-sidebar-fields"><label>Markup type<select id="oqMarkupType"><option value="percentage" ${quote.markupType === 'percentage' ? 'selected' : ''}>Percentage</option><option value="fixed" ${quote.markupType === 'fixed' ? 'selected' : ''}>Fixed amount</option></select></label><label>Markup value<input id="oqMarkupValue" type="number" min="0" step="0.01" value="${Number(quote.markupValue || 0)}" required></label><label>Valid until<input id="oqValidUntil" type="date" value="${inputDate(quote.validUntil)}" required></label></div><p><i class="fas fa-sync-alt"></i> Save the draft to recalculate server-confirmed pricing.</p></section>
          <section class="outgoing-sidebar-card outgoing-readiness-card"><div class="outgoing-sidebar-title"><span><i class="fas fa-tasks"></i> Send readiness</span><strong>${readyCount}/${readiness.length}</strong></div><div class="outgoing-send-checks">${readiness.map(item => `<div class="${item[1] ? 'ready' : 'blocked'}"><i class="fas ${item[1] ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i><span><strong>${escapeHtml(item[0])}</strong><small>${escapeHtml(item[2])}</small></span></div>`).join('')}</div></section>
          <section class="outgoing-sidebar-card outgoing-delivery-card"><div class="outgoing-sidebar-title"><span><i class="fas fa-paper-plane"></i> Delivery</span></div><p>The customer receives one final total, terms, contractor disclosure, and a secure PDF link.</p><a class="btn-secondary" href="/api/outgoing-quotes/${encodeURIComponent(quote._id)}/pdf" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> Preview PDF</a></section>
        </aside>
      </div>
      <div class="outgoing-sticky-actions"><div><span>Draft changes are not automatic</span><small>Save before previewing or sending.</small></div><button class="btn-secondary outgoing-void-button" type="button" onclick="voidOutgoingQuote('${escapeHtml(quote._id)}')"><i class="fas fa-ban"></i> Void</button><a class="btn-secondary" href="/api/outgoing-quotes/${encodeURIComponent(quote._id)}/pdf" target="_blank" rel="noopener"><i class="fas fa-eye"></i> Preview</a><button class="btn-secondary" type="submit"><i class="fas fa-save"></i> Save Draft</button><button class="btn-primary" type="button" onclick="sendOutgoingQuote('${escapeHtml(quote._id)}')"><i class="fas fa-paper-plane"></i> Send to Customer</button></div>
    </form>`;
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

  async function openOutgoingQuoteWorkspace(orderId, scroll = true) { try { currentOrderId = orderId; workspace = await window.APIService.getOutgoingQuoteWorkspace(orderId); $('outgoingQuoteWorkspace').hidden = false; $('outgoingQuoteOrderList').hidden = true; $('outgoing-quotes')?.classList.add('is-workspace-open'); if ($('outgoingSettingsButton')) $('outgoingSettingsButton').closest('.outgoing-toolbar').hidden = true; renderWorkspace(); if (scroll) $('outgoingQuoteWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (error) { toast(error.message, 'error'); } }
  function closeOutgoingQuoteWorkspace() { currentOrderId = ''; workspace = null; $('outgoingQuoteWorkspace').hidden = true; $('outgoingQuoteOrderList').hidden = false; $('outgoing-quotes')?.classList.remove('is-workspace-open'); if ($('outgoingSettingsButton')) $('outgoingSettingsButton').closest('.outgoing-toolbar').hidden = false; }
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
