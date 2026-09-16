(() => {
  const $ = id => document.getElementById(id);
  const endpoint = '/api/incoming-quotes/public/form';
  const leadEndpoint = '/api/incoming-quotes/public/lead';
  let token = '';
  let currentStep = 1;
  let highestStep = 1;
  const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function readToken() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    token = hash.get('token') || sessionStorage.getItem('vendorQuoteToken') || '';
    if (hash.get('token')) {
      sessionStorage.setItem('vendorQuoteToken', token);
      history.replaceState(null, '', location.pathname);
    }
    return token;
  }

  async function request(options = {}, url = endpoint) {
    const response = await fetch(url, { ...options, headers: { 'X-Vendor-Quote-Token': token, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  }

  function showError(message) {
    $('quoteLoading').classList.add('hidden');
    $('vendorQuoteForm').classList.add('hidden');
    $('quoteErrorMessage').textContent = message;
    $('quoteError').classList.remove('hidden');
  }

  function populate(payload) {
    $('quoteVendor').textContent = payload.vendorName;
    $('quoteRequest').textContent = payload.requestReference;
    $('quoteReference').textContent = `${payload.quoteReference} · Revision ${payload.revisionNumber}`;
    $('quoteService').textContent = payload.service;
    $('quoteAddress').textContent = payload.serviceAddress;
    $('quoteDetails').textContent = payload.serviceDetails || 'No additional details provided.';
    $('quoteExpiry').textContent = new Date(payload.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    document.title = `${payload.quoteReference} | Secure Vendor Quote`;
    $('quoteLoading').classList.add('hidden');
    $('vendorQuoteForm').classList.remove('hidden');
  }

  function showLeadDecision(lead) {
    $('quoteLoading').classList.add('hidden'); $('leadDecision').classList.remove('hidden');
    $('leadService').textContent = lead.service || 'Service request'; $('leadAddress').textContent = lead.propertyAddress || 'Provided after acceptance'; $('leadWindow').textContent = lead.requestedWindow || 'Not specified'; $('leadScope').textContent = lead.scope || 'No additional scope supplied.';
    $('leadResponseDue').textContent = lead.responseDueAt ? new Date(lead.responseDueAt).toLocaleString() : 'Not specified'; $('leadBidDue').textContent = lead.bidDueAt ? new Date(lead.bidDueAt).toLocaleString() : 'Not specified';
  }

  function showPortalHandoff() { $('quoteLoading').classList.add('hidden'); $('leadDecision').classList.add('hidden'); $('leadAccepted').classList.remove('hidden'); }

  async function initialize() {
    const { lead } = await request({}, leadEndpoint);
    if (!lead.responseRequired) return request().then(populate);
    if (lead.status === 'accepted_to_bid') return showPortalHandoff();
    showLeadDecision(lead);
  }

  function updateTotal() {
    const labor = Number(document.querySelector('[name="laborAmount"]').value || 0);
    const materials = Number(document.querySelector('[name="materialsAmount"]').value || 0);
    $('quoteTotal').textContent = `$${(labor + materials).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function updateAccess() {
    const required = $('siteAccessRequired').value === 'true';
    $('accessNotes').required = required;
    $('accessNotes').placeholder = required ? 'Describe how access should be arranged' : 'Optional access information';
    $('accessNotesLabel')?.classList.toggle('is-required', required);
    if ($('accessNotesRequirement')) $('accessNotesRequirement').textContent = required ? 'Required' : 'Optional';
    if ($('accessNotesHint')) $('accessNotesHint').textContent = required
      ? 'Explain exactly how site access should be arranged before work begins.'
      : 'Add gate, key, escort, parking, or scheduling instructions when relevant.';
  }

  function fieldsForStep(step) {
    return [...document.querySelectorAll(`.secure-step[data-step="${step}"] input, .secure-step[data-step="${step}"] select, .secure-step[data-step="${step}"] textarea`)];
  }

  function validateStep(step) {
    for (const field of fieldsForStep(step)) {
      if (!field.checkValidity()) { field.reportValidity(); field.focus(); return false; }
    }
    return true;
  }

  function reviewMarkup() {
    const value = name => document.querySelector(`[name="${name}"]`)?.value || 'Not provided';
    const access = value('siteAccessRequired') === 'true' ? 'Arrangement required' : 'No arrangement needed';
    const exclusions = value('exclusionsConditions');
    $('vendorQuoteReview').innerHTML = `<div><span>Labor</span><strong>$${Number(value('laborAmount') || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div><div><span>Materials</span><strong>$${Number(value('materialsAmount') || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div><div><span>Total</span><strong>${escapeHtml($('quoteTotal').textContent)}</strong></div><div><span>Earliest date</span><strong>${escapeHtml(formatReviewDate(value('earliestAvailableDate')))}</strong></div><div><span>Duration</span><strong>${escapeHtml(value('durationValue'))} ${escapeHtml(value('durationUnit'))}</strong></div><div><span>Site access</span><strong>${escapeHtml(access)}</strong></div><div class="wide"><span>Scope of work</span><strong>${escapeHtml(value('scopeOfWork'))}</strong></div>${exclusions !== 'Not provided' ? `<div class="wide"><span>Exclusions or conditions</span><strong>${escapeHtml(exclusions)}</strong></div>` : ''}`;
  }

  function formatReviewDate(value) {
    if (!value || value === 'Not provided') return value;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { dateStyle: 'medium' });
  }

  function updateFileCount() {
    const files = [...($('quoteDocuments')?.files || [])];
    $('quoteFileCount').textContent = files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No files selected';
  }

  function showStep(next, validate = true) {
    if (next > currentStep && validate && !validateStep(currentStep)) return;
    currentStep = Math.max(1, Math.min(3, Number(next)));
    highestStep = Math.max(highestStep, currentStep);
    document.querySelectorAll('.secure-step').forEach(section => { section.hidden = Number(section.dataset.step) !== currentStep; });
    document.querySelectorAll('.secure-progress-step').forEach(button => {
      const step = Number(button.dataset.stepTarget);
      button.toggleAttribute('aria-current', step === currentStep);
      if (step === currentStep) button.setAttribute('aria-current', 'step');
      button.classList.toggle('is-complete', step < currentStep);
      button.disabled = step > highestStep;
    });
    if (currentStep === 3) reviewMarkup();
    const currentSection = document.querySelector(`.secure-step[data-step="${currentStep}"]`);
    currentSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    currentSection?.querySelector('h2')?.focus({ preventScroll: true });
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const files = [...form.querySelector('[name="documents"]').files];
    if (files.length > 10 || files.some(file => file.size > 50 * 1024 * 1024)) return showSubmitError(files.length > 10 ? 'Select no more than 10 files.' : 'Each file must be 50 MB or smaller.');
    const button = $('quoteSubmitButton');
    button.disabled = true;
    button.textContent = 'Submitting securely…';
    $('quoteSubmitError').classList.add('hidden');
    try {
      const data = new FormData(form);
      const payload = await request({ method: 'POST', body: data });
      sessionStorage.removeItem('vendorQuoteToken');
      form.classList.add('hidden');
      $('quoteSuccessReference').textContent = `Reference: ${payload.quoteReference}`;
      $('quoteSuccess').classList.remove('hidden');
      scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      showSubmitError(error.message);
      button.disabled = false;
      button.innerHTML = 'Submit Quote Securely <span aria-hidden="true">&#128274;</span>';
    }
  }

  function showSubmitError(message) {
    $('quoteSubmitError').textContent = message;
    $('quoteSubmitError').classList.remove('hidden');
  }

  document.querySelectorAll('[name="laborAmount"],[name="materialsAmount"]').forEach(input => input.addEventListener('input', updateTotal));
  $('siteAccessRequired').addEventListener('change', updateAccess);
  $('quoteDocuments').addEventListener('change', updateFileCount);
  document.querySelectorAll('[data-next-step]').forEach(button => button.addEventListener('click', () => showStep(button.dataset.nextStep)));
  document.querySelectorAll('.secure-progress-step').forEach(button => button.addEventListener('click', () => { const next=Number(button.dataset.stepTarget); if(next<=highestStep)showStep(next,next>currentStep); }));
  $('vendorQuoteForm').addEventListener('submit', submit);
  $('declineLeadToggle').addEventListener('click', () => { $('declineLeadForm').hidden = !$('declineLeadForm').hidden; });
  $('acceptLead').addEventListener('click', async () => { const button = $('acceptLead'); button.disabled = true; try { await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: 'accept' }) }, `${leadEndpoint}/respond`); showPortalHandoff(); } catch (error) { button.disabled = false; showError(error.message); } });
  $('declineLeadForm').addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); try { await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: 'decline', declineReasonCode: data.declineReasonCode, declineReason: data.declineReason }) }, `${leadEndpoint}/respond`); $('leadDecision').classList.add('hidden'); $('quoteSuccess').classList.remove('hidden'); $('quoteSuccess').querySelector('h2').textContent = 'Lead declined'; $('quoteSuccess').querySelector('p').textContent = 'Your response was recorded. No estimate is required.'; } catch (error) { showError(error.message); } });
  const earliestDate = document.querySelector('[name="earliestAvailableDate"]');
  if (earliestDate) earliestDate.min = new Date().toISOString().slice(0, 10);
  updateAccess();
  showStep(1, false);
  if (!readToken()) return showError('The secure quote token is missing. Open the complete link from your latest invitation email.');
  initialize().catch(error => showError(error.message));
})();
