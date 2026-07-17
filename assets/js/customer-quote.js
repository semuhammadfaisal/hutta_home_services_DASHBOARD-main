(() => {
  const $ = id => document.getElementById(id);
  const searchToken = new URLSearchParams(location.search).get('token');
  const hashToken = new URLSearchParams(location.hash.replace(/^#/, '')).get('token');
  const token = searchToken || hashToken || '';
  const money = value => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = value => value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified';
  const dateTime = value => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : 'Not specified';
  const set = (id, value) => { $(id).textContent = value || '—'; };
  let quote;

  function showDecision(decision) {
    const status = decision?.decision || quote?.customerDecisionStatus || 'pending';
    if (status === 'pending' || status === 'not_requested') return;
    $('quoteDecisionPending').hidden = true;
    $('quoteDecisionComplete').hidden = false;
    const approved = status === 'approved';
    $('quoteDecisionComplete').classList.toggle('changes-requested', !approved);
    $('quoteDecisionIcon').textContent = approved ? '✓' : '!';
    $('quoteDecisionTitle').textContent = approved ? 'Quote approved' : 'Changes requested';
    $('quoteDecisionSummary').textContent = approved
      ? `Approved by ${decision?.typedName || 'customer'} on ${dateTime(decision?.decisionAt)}. Approval does not confirm scheduling.`
      : `Your change request was received on ${dateTime(decision?.decisionAt)}. The Huttas team will prepare a new quote revision.`;
  }

  function setBusy(busy) {
    ['quoteApproveButton', 'quoteRequestChangesToggle', 'quoteSubmitChanges', 'quoteCancelChanges'].forEach(id => { $(id).disabled = busy; });
  }

  function showError(message) {
    $('quoteDecisionError').textContent = message;
    $('quoteDecisionError').hidden = !message;
  }

  async function submitDecision(action) {
    const typedName = $('quoteSignerName').value.trim();
    const termsAccepted = $('quoteTermsAccepted').checked;
    const changeRequestMessage = $('quoteChangeMessage').value.trim();
    showError('');
    if (!typedName) return showError('Please enter your full name.');
    if (action === 'approve' && !termsAccepted) return showError('Please read and accept the agreement before approving.');
    if (action === 'request_changes' && (changeRequestMessage.length < 10 || changeRequestMessage.length > 3000)) {
      return showError('Please describe the requested changes in 10 to 3,000 characters.');
    }
    setBusy(true);
    try {
      const response = await fetch('/api/outgoing-quotes/public/decision', {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, typedName, termsAccepted, changeRequestMessage })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to record your decision.');
      showDecision({ decision: data.status, typedName, decisionAt: data.decisionAt });
    } catch (error) {
      showError(error.message);
      setBusy(false);
    }
  }

  async function load() {
    try {
      if (!token) throw new Error('The secure quote token is missing.');
      const response = await fetch(`/api/outgoing-quotes/public/view?token=${encodeURIComponent(token)}`, { credentials: 'omit', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load this quote.');
      quote = data;
      set('quoteReference', data.quoteReference);
      set('quoteMeta', `Revision ${data.revisionNumber} · Sent ${date(data.sentAt)} · Valid through ${date(data.validUntil)}`);
      set('quoteCustomer', data.customer?.name);
      set('quoteAddress', data.customer?.address);
      set('quoteService', data.job?.service);
      set('quoteRequest', `Request ${data.job?.requestReference || data.job?.orderReference || '—'}`);
      set('quoteScope', data.scopeOfWork);
      set('quoteDuration', `Estimated duration: ${data.estimatedDuration?.value || '—'} ${data.estimatedDuration?.unit || ''}`);
      set('quoteAvailability', `Earliest availability: ${date(data.earliestAvailableDate)}`);
      set('quoteAccess', data.siteAccessRequired ? `Site access required${data.accessNotes ? `: ${data.accessNotes}` : ''}` : 'No special site access required');
      set('quoteConditions', data.exclusionsConditions ? `Exclusions / conditions: ${data.exclusionsConditions}` : '');
      set('quoteTotal', money(data.customerTotal));
      set('quoteTerms', data.termsAndConditions);
      set('quoteContractor', data.vendorDisclosure?.licensedContractorName);
      set('quoteLicenseType', data.vendorDisclosure?.licenseType);
      set('quoteRoc', data.vendorDisclosure?.rocNumber);
      set('quoteLegal', data.vendorDisclosure?.legalDisclosure);
      set('quoteConsentText', data.approvalConsentText);
      $('quotePdfLink').href = `/api/outgoing-quotes/public/pdf?token=${encodeURIComponent(token)}`;
      showDecision(data.customerDecision);
      $('quoteLoading').hidden = true;
      $('quoteDocument').hidden = false;
    } catch (error) {
      $('quoteLoading').hidden = true;
      $('quoteErrorMessage').textContent = error.message;
      $('quoteError').hidden = false;
    }
  }

  $('quoteApproveButton').addEventListener('click', () => submitDecision('approve'));
  $('quoteRequestChangesToggle').addEventListener('click', () => { $('quoteChangesPanel').hidden = false; $('quoteTermsAccepted').checked = false; showError(''); });
  $('quoteCancelChanges').addEventListener('click', () => { $('quoteChangesPanel').hidden = true; showError(''); });
  $('quoteSubmitChanges').addEventListener('click', () => submitDecision('request_changes'));
  load();
})();
