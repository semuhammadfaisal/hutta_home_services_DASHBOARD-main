(() => {
  const $ = (id) => document.getElementById(id);
  const token = new URLSearchParams(location.search).get('token') || '';
  const dt = (value) => new Date(value).toLocaleString('en-US', {
    timeZone: 'America/Phoenix',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  let schedule;

  const setError = (message) => {
    $('decisionError').textContent = message;
    $('decisionError').hidden = !message;
  };

  const setBusy = (busy, activeButton) => {
    document.querySelectorAll('.schedule-decision button').forEach((button) => {
      button.disabled = busy;
    });
    if (!activeButton) return;
    if (!activeButton.dataset.label) activeButton.dataset.label = activeButton.textContent.trim();
    activeButton.textContent = busy ? 'Recording response…' : activeButton.dataset.label;
  };

  function complete(decision) {
    $('decisionPending').hidden = true;
    $('decisionComplete').hidden = false;
    const accepted = (decision?.decision || decision?.status || schedule.status) === 'accepted';
    $('decisionTitle').textContent = accepted ? 'Schedule accepted' : 'Changes requested';
    $('decisionSummary').textContent = accepted
      ? 'The job is now scheduled. Your confirmed work order will be sent by email.'
      : 'Your request has been recorded. Hutta Home Services will send a revised schedule proposal.';
    $('scheduleStatus').textContent = accepted ? 'Confirmed' : 'Changes requested';
    $('scheduleStatus').dataset.tone = accepted ? 'success' : 'neutral';
  }

  async function decide(action, activeButton) {
    const typedName = $('vendorTypedName').value.trim();
    const changeRequestMessage = $('changeMessage').value.trim();
    setError('');
    if (typedName.length < 2) {
      setError('Please enter your full name.');
      $('vendorTypedName').focus();
      return;
    }
    if (action === 'request_changes' && changeRequestMessage.length < 10) {
      setError('Please describe the requested changes in at least 10 characters.');
      $('changeMessage').focus();
      return;
    }
    setBusy(true, activeButton);
    try {
      const response = await fetch('/api/scheduling/public/decision', {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, typedName, changeRequestMessage })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to record decision');
      complete(data);
    } catch (error) {
      setError(error.message);
      setBusy(false, activeButton);
    }
  }

  async function load() {
    try {
      if (!token) throw new Error('Secure schedule token is missing.');
      const response = await fetch(`/api/scheduling/public/view?token=${encodeURIComponent(token)}`, {
        credentials: 'omit',
        cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load schedule');
      schedule = data;
      $('scheduleReference').textContent = data.scheduleReference;
      $('scheduleRevision').textContent = `Revision ${data.revisionNumber}`;
      $('scheduleStatus').textContent = data.status.replaceAll('_', ' ');
      $('scheduleStatus').dataset.tone = data.status === 'accepted' ? 'success' : '';
      $('scheduleStart').textContent = dt(data.proposedStart);
      $('scheduleEnd').textContent = dt(data.proposedEnd);
      $('customerName').textContent = data.customer?.name || 'Not provided';
      $('customerPhone').textContent = data.customer?.phone || 'Not provided';
      $('customerEmail').textContent = data.customer?.email || 'Not provided';
      $('customerAddress').textContent = data.customer?.address || 'Address not provided';
      $('serviceName').textContent = data.job?.service || 'Service';
      $('scopeOfWork').textContent = data.job?.scopeOfWork || '';
      $('accessInstructions').textContent = data.accessInstructions || 'No special access instructions.';
      if (data.decision || data.status !== 'pending_vendor') complete(data.decision);
      $('scheduleLoading').hidden = true;
      $('scheduleDocument').hidden = false;
    } catch (error) {
      $('scheduleLoading').hidden = true;
      $('scheduleErrorMessage').textContent = error.message;
      $('scheduleError').hidden = false;
    }
  }

  $('acceptSchedule').addEventListener('click', (event) => decide('accept', event.currentTarget));
  $('showChanges').addEventListener('click', () => {
    $('changesPanel').hidden = false;
    $('primaryDecisionActions').hidden = true;
    $('showChanges').setAttribute('aria-expanded', 'true');
    $('changeMessage').focus();
  });
  $('cancelChanges').addEventListener('click', () => {
    $('changesPanel').hidden = true;
    $('primaryDecisionActions').hidden = false;
    $('showChanges').setAttribute('aria-expanded', 'false');
    $('showChanges').focus();
  });
  $('submitChanges').addEventListener('click', (event) => decide('request_changes', event.currentTarget));
  load();
})();
