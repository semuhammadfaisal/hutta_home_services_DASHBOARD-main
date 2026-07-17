(() => {
  let approvals = [];
  let currentOrderId = '';
  let workspace = null;
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const money = value => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dateTime = value => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const toast = (message, type = 'success') => window.showToast ? window.showToast(message, type) : alert(message);
  const decisionStatus = item => item.decision?.decision || item.outgoingQuote?.customerDecisionStatus || 'pending';
  const failedEmails = item => (item.emailMessages || []).filter(message => message.status === 'permanently_failed');

  function renderList() {
    const pending = approvals.filter(item => decisionStatus(item) === 'pending').length;
    const approved = approvals.filter(item => decisionStatus(item) === 'approved').length;
    const changes = approvals.filter(item => decisionStatus(item) === 'changes_requested').length;
    const issues = approvals.reduce((total, item) => total + failedEmails(item).length, 0);
    $('approvalPendingCount').textContent = pending;
    $('approvalApprovedCount').textContent = approved;
    $('approvalChangesCount').textContent = changes;
    $('approvalEmailIssueCount').textContent = issues;
    const badge = $('customerApprovalsNavBadge');
    badge.textContent = pending + changes;
    badge.hidden = pending + changes === 0;
    const list = $('customerApprovalList');
    if (!approvals.length) {
      list.innerHTML = '<div class="workflow-empty"><i class="fas fa-clipboard-check"></i><p>No customer quotes are awaiting or have recorded a decision.</p></div>';
      return;
    }
    list.innerHTML = approvals.map(item => {
      const quote = item.outgoingQuote || {};
      const status = decisionStatus(item);
      const customer = item.customer?.name || quote.customerSnapshot?.name || 'Customer';
      return `<article class="approval-card"><header><div><span class="approval-reference">${escapeHtml(item.requestReference || item.orderId)} · ${escapeHtml(quote.quoteReference || 'Quote')}</span><h3>${escapeHtml(customer)}</h3><p>${escapeHtml(item.service || quote.jobSnapshot?.service || 'Service request')}</p></div><span class="approval-status ${escapeHtml(status)}">${escapeHtml(status.replaceAll('_', ' '))}</span></header><div class="approval-meta"><div><strong>Revision ${Number(quote.revisionNumber || 1)}</strong><span>Quote revision</span></div><div><strong>${money(quote.customerTotal || item.amount)}</strong><span>Customer total</span></div><div><strong>${dateTime(quote.sentAt)}</strong><span>Sent</span></div><div><strong>${dateTime(item.decision?.decisionAt || quote.validUntil)}</strong><span>${item.decision ? 'Decision received' : 'Expires'}</span></div></div><footer><span class="approval-email-warning">${failedEmails(item).length ? `${failedEmails(item).length} email delivery issue(s)` : ''}</span><button class="btn-primary" type="button" onclick="openCustomerApproval('${escapeHtml(item._id)}')">Open Approval</button></footer></article>`;
    }).join('');
  }

  function renderWorkspace() {
    const { order, outgoingQuote: quote, decision, emailMessages = [] } = workspace;
    const status = decision?.decision || quote.customerDecisionStatus || 'pending';
    $('customerApprovalWorkspaceTitle').textContent = `${quote.quoteReference} · Revision ${quote.revisionNumber}`;
    $('customerApprovalWorkspaceSummary').textContent = `${order.requestReference || order.orderId} · ${quote.customerSnapshot?.name || 'Customer'} · ${money(quote.customerTotal)}`;
    const audit = decision ? `<section class="approval-panel"><div class="approval-panel-head"><div><h3>Immutable customer decision</h3><p><span class="approval-status ${escapeHtml(status)}">${escapeHtml(status.replaceAll('_', ' '))}</span></p></div><strong>${dateTime(decision.decisionAt)}</strong></div><div class="approval-audit"><div><strong>${escapeHtml(decision.typedName)}</strong><span>Customer-entered name</span></div><div><strong>${decision.termsAccepted ? 'Confirmed' : 'Not applicable'}</strong><span>Terms agreement</span></div><div><strong>${escapeHtml(decision.termsHash)}</strong><span>Terms SHA-256</span></div><div><strong>${escapeHtml(decision.quoteSnapshotHash)}</strong><span>Quote snapshot SHA-256</span></div>${decision.ipAddress !== undefined ? `<div><strong>${escapeHtml(decision.ipAddress || 'Unavailable')}</strong><span>Request IP (admin/manager)</span></div><div><strong>${escapeHtml(decision.userAgent || 'Unavailable')}</strong><span>Truncated user agent</span></div>` : ''}</div>${decision.changeRequestMessage ? `<h4>Requested changes</h4><div class="approval-message">${escapeHtml(decision.changeRequestMessage)}</div>` : ''}</section>` : '<section class="approval-panel"><h3>Awaiting customer decision</h3><p>The current secure quote is still pending.</p></section>';
    const consentEvidence = decision ? `<section class="approval-panel"><h3>Consent statement shown</h3><p class="approval-message">${escapeHtml(decision.consentText)}</p></section>` : '';
    const emailRows = emailMessages.length ? emailMessages.map(message => `<div class="approval-email-row"><div><strong>${escapeHtml(message.type.replaceAll('_', ' '))}</strong><small>${escapeHtml(message.status)} · Attempts ${Number(message.attempts || 0)}${message.lastErrorCategory ? ` · ${escapeHtml(message.lastErrorCategory)}` : ''}</small></div>${message.status === 'permanently_failed' ? `<button class="btn-secondary" onclick="retryCustomerApprovalEmail('${escapeHtml(message._id)}')">Retry Email</button>` : ''}</div>`).join('') : '<p>No Stage 4 email records yet.</p>';
    const revision = status === 'changes_requested' ? `<button class="btn-primary" onclick="createApprovalRevision('${escapeHtml(quote._id)}')">Create Revision</button>` : '';
    $('customerApprovalDetails').innerHTML = `${audit}${consentEvidence}<section class="approval-panel"><h3>Email delivery</h3>${emailRows}</section><div class="approval-actions"><button class="btn-secondary" onclick="openWorkflowOrder('${escapeHtml(order._id)}')">Open Order</button><button class="btn-secondary" onclick="openApprovalOutgoingQuote('${escapeHtml(order._id)}')">Open Outgoing Quote</button>${revision}</div>`;
  }

  async function loadCustomerApprovals() {
    try {
      $('customerApprovalList').innerHTML = '<div class="workflow-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading customer approvals&hellip;</p></div>';
      approvals = await window.APIService.getCustomerApprovals();
      renderList();
      if (currentOrderId) await openCustomerApproval(currentOrderId, false);
    } catch (error) {
      $('customerApprovalList').innerHTML = `<div class="workflow-empty"><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  async function openCustomerApproval(orderId, scroll = true) {
    try {
      currentOrderId = orderId;
      workspace = await window.APIService.getCustomerApproval(orderId);
      $('customerApprovalWorkspace').hidden = false;
      renderWorkspace();
      if (scroll) $('customerApprovalWorkspace').scrollIntoView({ behavior: 'smooth' });
    } catch (error) { toast(error.message, 'error'); }
  }
  function closeCustomerApprovalWorkspace() { currentOrderId = ''; workspace = null; $('customerApprovalWorkspace').hidden = true; }
  async function retryCustomerApprovalEmail(id) { try { await window.APIService.retryCustomerApprovalEmail(id); toast('Decision email retry queued.'); await loadCustomerApprovals(); } catch (error) { toast(error.message, 'error'); } }
  async function createApprovalRevision(quoteId) { try { await window.APIService.reviseOutgoingQuote(quoteId); toast('New quote revision created.'); openApprovalOutgoingQuote(currentOrderId); } catch (error) { toast(error.message, 'error'); } }
  function openApprovalOutgoingQuote(orderId) {
    window.dashboard?.showSection('outgoing-quotes');
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    document.querySelector('[data-section="outgoing-quotes"]')?.parentElement?.classList.add('active');
    location.hash = 'outgoing-quotes';
    window.loadOutgoingQuotes?.().then(() => window.openOutgoingQuoteWorkspace?.(orderId));
  }

  Object.assign(window, { loadCustomerApprovals, openCustomerApproval, closeCustomerApprovalWorkspace, retryCustomerApprovalEmail, createApprovalRevision, openApprovalOutgoingQuote });
})();
