(() => {
  let orders = [];
  let workspace = null;
  let currentOrderId = '';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const dt = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Phoenix', dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const toast = (message, type = 'success') => window.showToast ? window.showToast(message, type) : alert(message);
  const iso = value => new Date(`${value}:00-07:00`).toISOString();
  const sentence = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

  const apiClient = window.APIService;
  const schedulingApi = {
    getOrders: () => typeof apiClient.getSchedulingOrders === 'function' ? apiClient.getSchedulingOrders() : apiClient.request('/scheduling/orders'),
    getWorkspace: id => typeof apiClient.getSchedulingWorkspace === 'function' ? apiClient.getSchedulingWorkspace(id) : apiClient.request(`/scheduling/orders/${id}`),
    sendProposal: (id, payload) => typeof apiClient.sendScheduleProposal === 'function' ? apiClient.sendScheduleProposal(id, payload) : apiClient.request(`/scheduling/orders/${id}/proposals`, { method: 'POST', body: JSON.stringify(payload) }),
    revoke: id => typeof apiClient.revokeSchedule === 'function' ? apiClient.revokeSchedule(id) : apiClient.request(`/scheduling/${id}/revoke`, { method: 'POST', body: '{}' }),
    retryEmail: id => typeof apiClient.retryScheduleEmail === 'function' ? apiClient.retryScheduleEmail(id) : apiClient.request(`/scheduling/outbox/${id}/retry`, { method: 'POST', body: '{}' })
  };

  function stateDetails(order, schedule) {
    if (order.workflowStatus === 'customer_approved') return { label: 'Ready to Schedule', tone: 'ready', message: 'Choose an Arizona date and request vendor confirmation.' };
    if (order.workflowStatus === 'schedule_changes_requested') return { label: 'Changes Requested', tone: 'changes', message: 'Review the vendor response and send a revised proposal.' };
    if (order.workflowStatus === 'scheduled') return { label: 'Confirmed', tone: 'confirmed', message: 'The confirmed schedule is active on the Calendar.' };
    if (schedule?.status === 'pending_vendor' || order.workflowStatus === 'schedule_pending_vendor') return { label: 'Awaiting Vendor', tone: 'pending', message: 'A secure proposal was sent and is awaiting a response.' };
    return { label: sentence(schedule?.status || order.workflowStatus), tone: 'neutral', message: 'Review the latest scheduling activity.' };
  }

  function renderOrders() {
    const count = status => orders.filter(order => order.workflowStatus === status).length;
    $('scheduleReadyCount').textContent = count('customer_approved');
    $('schedulePendingCount').textContent = count('schedule_pending_vendor');
    $('scheduleChangesCount').textContent = count('schedule_changes_requested');
    $('scheduleConfirmedCount').textContent = count('scheduled');

    const badge = $('schedulingNavBadge');
    const needsAttention = count('customer_approved') + count('schedule_changes_requested');
    badge.textContent = needsAttention;
    badge.hidden = !needsAttention;

    const list = $('schedulingOrderList');
    if (!orders.length) {
      list.innerHTML = '<div class="workflow-empty workflow-empty-illustrated"><span class="workflow-empty-art schedule"><i class="fas fa-calendar-check"></i></span><strong>No schedules to manage right now.</strong><p>Customer-approved Orders and confirmed schedules will appear here.</p></div>';
      return;
    }

    list.innerHTML = orders.map(order => {
      const schedule = order.currentSchedule;
      const state = stateDetails(order, schedule);
      const customerInitial = String(order.customer?.name || 'C').charAt(0).toUpperCase();
      const confirmed = Boolean(order.confirmedJobScheduleId);
      return `<article class="scheduling-card">
        <header>
          <div class="scheduling-card-identity">
            <span class="scheduling-customer-avatar">${esc(customerInitial)}</span>
            <div><span class="workflow-reference">${esc(order.requestReference || order.orderId)}</span><h3>${esc(order.customer?.name || 'Customer')}</h3><p>${esc(order.service)} <i>·</i> ${esc(order.vendor?.name || 'Selected vendor')}</p></div>
          </div>
          <span class="schedule-state ${state.tone}"><i class="fas ${state.tone === 'confirmed' ? 'fa-check-circle' : state.tone === 'changes' ? 'fa-exclamation-circle' : 'fa-clock'}"></i>${esc(state.label)}</span>
        </header>
        <div class="schedule-meta">
          <div><span class="schedule-meta-icon"><i class="far fa-calendar-alt"></i></span><p><small>Proposed start</small><strong>${schedule ? dt(schedule.proposedStart) : 'Not proposed'}</strong><em>Arizona time</em></p></div>
          <div><span class="schedule-meta-icon end"><i class="far fa-clock"></i></span><p><small>Proposed end</small><strong>${schedule ? dt(schedule.proposedEnd) : '—'}</strong><em>Arizona time</em></p></div>
          <div><span class="schedule-meta-icon reference"><i class="fas fa-hashtag"></i></span><p><small>Schedule reference</small><strong>${esc(schedule?.scheduleReference || 'Not created')}</strong><em>${schedule ? `Revision ${Number(schedule.revisionNumber || 1)}` : 'Create first proposal'}</em></p></div>
        </div>
        <footer>
          <div class="scheduling-next-step"><i class="fas ${confirmed ? 'fa-check-circle' : 'fa-info-circle'}"></i><span><strong>${confirmed ? 'Confirmed schedule retained' : 'Next action'}</strong><small>${esc(state.message)}</small></span></div>
          <button class="btn-primary" type="button" data-scheduling-open="${esc(order._id)}">${state.tone === 'ready' ? 'Create Schedule' : state.tone === 'changes' ? 'Revise Schedule' : 'Open Scheduling'} <i class="fas fa-arrow-right"></i></button>
        </footer>
      </article>`;
    }).join('');

    list.onclick = event => {
      const button = event.target.closest('[data-scheduling-open]');
      if (button) openSchedulingWorkspace(button.dataset.schedulingOpen);
    };
  }

  async function loadScheduling() {
    try {
      $('schedulingOrderList').innerHTML = '<div class="workflow-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading schedules&hellip;</p></div>';
      orders = await schedulingApi.getOrders();
      renderOrders();
      if (currentOrderId) await openSchedulingWorkspace(currentOrderId, false);
    } catch (error) {
      $('schedulingOrderList').innerHTML = `<div class="workflow-empty"><p>${esc(error.message)}</p><button type="button" class="btn-secondary" onclick="loadScheduling()">Retry</button></div>`;
    }
  }

  function renderWorkspace() {
    const { order, schedules = [], decisions = [], workOrders = [], emailMessages = [] } = workspace;
    $('schedulingWorkspaceTitle').textContent = `${order.requestReference || order.orderId} · ${order.customer?.name || 'Customer'}`;
    $('schedulingWorkspaceSummary').textContent = `${order.service} · ${order.vendor?.name || 'Selected vendor'} · Arizona time`;

    const decisionMap = new Map(decisions.map(decision => [String(decision.jobScheduleId), decision]));
    const workMap = new Map(workOrders.map(workOrder => [String(workOrder.jobScheduleId), workOrder]));
    const confirmed = schedules.find(schedule => String(schedule._id) === String(order.confirmedJobScheduleId))
      || schedules.find(schedule => schedule.status === 'accepted' && !schedule.supersededAt);

    let confirmedPanel = $('scheduleConfirmedSummary');
    if (!confirmedPanel) {
      confirmedPanel = document.createElement('section');
      confirmedPanel.id = 'scheduleConfirmedSummary';
      confirmedPanel.className = 'scheduling-panel schedule-confirmed-summary';
      $('scheduleProposalForm').before(confirmedPanel);
    }
    confirmedPanel.hidden = !confirmed;
    if (confirmed) {
      confirmedPanel.innerHTML = `<div class="schedule-confirmed-icon"><i class="fas fa-calendar-check"></i></div><div><span>Currently confirmed</span><h3>${dt(confirmed.proposedStart)} <i>to</i> ${dt(confirmed.proposedEnd)}</h3><p>America/Phoenix · This schedule remains active until a revised proposal is accepted.</p></div><span class="schedule-state confirmed"><i class="fas fa-check-circle"></i>Confirmed</span>`;
    }

    const proposalTitle = $('scheduleProposalForm').querySelector('h3');
    const proposalButton = $('scheduleProposalForm').querySelector('button[type="submit"]');
    if (proposalTitle) proposalTitle.textContent = confirmed ? 'Propose a revised schedule' : 'Send vendor schedule proposal';
    if (proposalButton) proposalButton.innerHTML = confirmed ? '<i class="fas fa-paper-plane"></i> Send Revised Proposal' : '<i class="fas fa-paper-plane"></i> Send Vendor Proposal';

    $('scheduleHistory').innerHTML = schedules.length ? schedules.map(schedule => {
      const decision = decisionMap.get(String(schedule._id));
      const workOrder = workMap.get(String(schedule._id));
      const isConfirmed = confirmed && String(confirmed._id) === String(schedule._id);
      return `<article class="schedule-row ${isConfirmed ? 'is-confirmed' : ''}">
        <div class="schedule-revision-marker"><span>${Number(schedule.revisionNumber || 1)}</span></div>
        <div class="schedule-row-content">
          <div class="schedule-row-title"><div><span>Revision ${Number(schedule.revisionNumber || 1)}</span><strong>${esc(schedule.scheduleReference)}</strong></div><span class="schedule-state ${schedule.status === 'accepted' ? 'confirmed' : schedule.status === 'changes_requested' ? 'changes' : 'pending'}">${esc(sentence(schedule.status))}</span></div>
          <p><i class="far fa-calendar-alt"></i>${dt(schedule.proposedStart)} <b>to</b> ${dt(schedule.proposedEnd)} <em>Arizona time</em></p>
          ${decision?.decision ? `<div class="schedule-vendor-decision"><i class="fas fa-user-check"></i><span><strong>Vendor response: ${esc(sentence(decision.decision))}</strong><small>${decision.vendorEnteredName ? `Submitted by ${esc(decision.vendorEnteredName)}` : 'Vendor response recorded'}</small></span></div>` : ''}
          ${decision?.changeRequestMessage ? `<div class="schedule-change-request"><strong><i class="fas fa-comment-alt"></i> Requested change</strong><span>${esc(decision.changeRequestMessage)}</span></div>` : ''}
          <div class="schedule-row-actions">${workOrder ? `<a class="btn-secondary" target="_blank" rel="noopener" href="/api/scheduling/work-orders/${workOrder._id}/pdf"><i class="fas fa-file-pdf"></i> Work Order PDF</a>` : ''}${schedule.status === 'pending_vendor' ? `<button class="btn-secondary schedule-revoke" type="button" onclick="revokeSchedule('${schedule._id}')"><i class="fas fa-ban"></i> Revoke Proposal</button>` : ''}</div>
        </div>
      </article>`;
    }).join('') : '<div class="schedule-empty-history"><i class="far fa-calendar-plus"></i><strong>No schedule proposals yet</strong><p>Complete the proposal above to send the first secure scheduling link.</p></div>';

    $('scheduleEmails').innerHTML = emailMessages.length ? emailMessages.map(message => `<div class="email-row"><span class="schedule-email-icon"><i class="fas fa-envelope"></i></span><div><strong>${esc(sentence(message.type))}</strong><small>${esc(sentence(message.status))} · ${Number(message.attempts || 0)} attempts</small></div>${message.status === 'permanently_failed' ? `<button class="btn-secondary" type="button" onclick="retryScheduleEmail('${message._id}')">Retry</button>` : `<span class="schedule-email-status ${message.status === 'sent' ? 'sent' : ''}">${esc(sentence(message.status))}</span>`}</div>`).join('') : '<div class="schedule-empty-email"><i class="far fa-envelope"></i><p>No scheduling emails have been queued.</p></div>';
  }

  async function openSchedulingWorkspace(id, scroll = true) {
    try {
      currentOrderId = id;
      workspace = await schedulingApi.getWorkspace(id);
      $('schedulingWorkspace').hidden = false;
      $('schedulingOrderList').hidden = true;
      $('scheduling')?.classList.add('is-workspace-open');
      renderWorkspace();
      updateTimePreview();
      if (scroll) $('schedulingWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function closeSchedulingWorkspace() {
    currentOrderId = '';
    workspace = null;
    $('schedulingWorkspace').hidden = true;
    $('schedulingOrderList').hidden = false;
    $('scheduling')?.classList.remove('is-workspace-open');
  }

  function updateTimePreview() {
    const preview = (inputId, outputId, emptyText) => {
      const input = $(inputId);
      const output = $(outputId);
      if (!input || !output) return;
      output.textContent = input.value ? dt(iso(input.value)) : emptyText;
      output.classList.toggle('has-value', Boolean(input.value));
    };
    preview('scheduleStartInput', 'scheduleStartPreview', 'Select a start date and time');
    preview('scheduleEndInput', 'scheduleEndPreview', 'Select an end date and time');
  }

  $('scheduleStartInput')?.addEventListener('change', updateTimePreview);
  $('scheduleEndInput')?.addEventListener('change', updateTimePreview);

  $('scheduleProposalForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = event.submitter;
    const payload = {
      proposedStart: iso($('scheduleStartInput').value),
      proposedEnd: iso($('scheduleEndInput').value),
      accessInstructions: $('scheduleAccessInput').value,
      internalNotes: $('scheduleInternalNotes').value,
      conflictAcknowledged: $('scheduleConflictAck').checked
    };
    try {
      if (submit) submit.disabled = true;
      await schedulingApi.sendProposal(currentOrderId, payload);
      toast('Secure schedule proposal queued for the vendor.');
      $('scheduleConflictBox').hidden = true;
      $('scheduleConflictAckLabel').hidden = true;
      await loadScheduling();
    } catch (error) {
      if (error.data?.conflicts?.length) {
        $('scheduleConflictAckLabel').hidden = false;
        $('scheduleConflictBox').hidden = false;
        $('scheduleConflictBox').innerHTML = `<strong><i class="fas fa-exclamation-triangle"></i> Vendor overlap detected</strong>${error.data.conflicts.map(conflict => `<div>${esc(conflict.scheduleReference)} · ${dt(conflict.proposedStart)} to ${dt(conflict.proposedEnd)}</div>`).join('')}`;
      }
      toast(error.message, 'error');
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  });

  async function revokeSchedule(id) {
    const confirmed = await (window.WorkflowDialog?.confirm?.({
      title: 'Revoke vendor proposal?',
      message: 'This pending schedule proposal will be closed.',
      impact: 'The vendor secure link will stop working. A confirmed schedule, if present, remains unchanged.',
      confirmLabel: 'Revoke Proposal',
      tone: 'danger'
    }) || Promise.resolve(false));
    if (!confirmed) return;
    try {
      await schedulingApi.revoke(id);
      toast('Proposal revoked.');
      await loadScheduling();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function retryScheduleEmail(id) {
    try {
      await schedulingApi.retryEmail(id);
      toast('Email retry queued.');
      await loadScheduling();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  Object.assign(window, { loadScheduling, openSchedulingWorkspace, closeSchedulingWorkspace, revokeSchedule, retryScheduleEmail });
})();
