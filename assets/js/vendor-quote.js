(() => {
  const $ = id => document.getElementById(id);
  const endpoint = '/api/incoming-quotes/public/form';
  let token = '';

  function readToken() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    token = hash.get('token') || sessionStorage.getItem('vendorQuoteToken') || '';
    if (hash.get('token')) {
      sessionStorage.setItem('vendorQuoteToken', token);
      history.replaceState(null, '', location.pathname);
    }
    return token;
  }

  async function request(options = {}) {
    const response = await fetch(endpoint, { ...options, headers: { 'X-Vendor-Quote-Token': token, ...(options.headers || {}) } });
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

  function updateTotal() {
    const labor = Number(document.querySelector('[name="laborAmount"]').value || 0);
    const materials = Number(document.querySelector('[name="materialsAmount"]').value || 0);
    $('quoteTotal').textContent = `$${(labor + materials).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function updateAccess() {
    const required = $('siteAccessRequired').value === 'true';
    $('accessNotes').required = required;
    $('accessNotes').placeholder = required ? 'Describe how access should be arranged' : 'Optional access information';
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
      button.textContent = 'Submit Quote Securely';
    }
  }

  function showSubmitError(message) {
    $('quoteSubmitError').textContent = message;
    $('quoteSubmitError').classList.remove('hidden');
  }

  document.querySelectorAll('[name="laborAmount"],[name="materialsAmount"]').forEach(input => input.addEventListener('input', updateTotal));
  $('siteAccessRequired').addEventListener('change', updateAccess);
  $('vendorQuoteForm').addEventListener('submit', submit);
  updateAccess();
  if (!readToken()) return showError('The secure quote token is missing. Open the complete link from your latest invitation email.');
  request().then(populate).catch(error => showError(error.message));
})();
