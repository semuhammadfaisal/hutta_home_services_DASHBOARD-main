(() => {
  const $ = id => document.getElementById(id);
  const viewEndpoint = '/api/intake-completion/public/view';
  const completeEndpoint = '/api/intake-completion/public/complete';
  const requiredFieldNames = ['serviceCategory', 'serviceAddress', 'serviceDetails'];
  let token = '';

  function readToken() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    token = hash.get('token') || sessionStorage.getItem('intakeCompletionToken') || '';
    if (hash.get('token')) {
      sessionStorage.setItem('intakeCompletionToken', token);
      history.replaceState(null, '', location.pathname);
    }
    return token;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit', ...options, headers: { 'X-Intake-Completion-Token': token, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  }

  function showError(message) {
    $('intakeLoading').classList.add('hidden');
    $('intakeForm').classList.add('hidden');
    $('intakeErrorMessage').textContent = message;
    $('intakeError').classList.remove('hidden');
  }

  function showSuccess(payload) {
    $('intakeLoading').classList.add('hidden');
    $('intakeForm').classList.add('hidden');
    $('intakeSuccessReference').textContent = payload.requestReference || '';
    $('intakeSuccessMessage').textContent = payload.status === 'review_required' || payload.requiresReview
      ? 'Your job details are complete. Our team will review your customer record before vendor quote collection begins.'
      : 'Your job details are complete and your request has moved to vendor quote collection. No pricing or schedule has been approved yet.';
    $('intakeSuccess').classList.remove('hidden');
  }

  function populate(payload) {
    if (payload.completionStatus === 'completed') return showSuccess(payload);
    $('intakeCustomer').textContent = payload.customerName;
    $('intakeReference').textContent = payload.requestReference;
    $('intakeEmail').textContent = payload.customerEmail;
    $('intakePhone').textContent = payload.customerPhone;
    $('intakeExpiry').textContent = new Date(payload.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const form = $('intakeForm');
    for (const name of ['serviceCategory', 'serviceAddress', 'serviceDetails', 'propertyType', 'preferredTiming', 'accessInstructions']) {
      const field = form.elements[name];
      if (field && payload[name]) field.value = payload[name];
    }
    document.title = `${payload.requestReference} | Complete Service Request`;
    $('intakeLoading').classList.add('hidden');
    form.classList.remove('hidden');
    updateProgress();
  }

  function showSubmitError(message) {
    $('intakeSubmitError').textContent = message;
    $('intakeSubmitError').classList.remove('hidden');
  }

  function updateProgress() {
    const form = $('intakeForm');
    if (!form || !$('intakeProgressLabel') || !$('intakeProgressBar')) return;
    const completedFields = requiredFieldNames.filter(name => {
      const field = form.elements[name];
      return field && field.value.trim() && field.checkValidity();
    }).length;
    const completed = completedFields + ($('intakeAccuracy')?.checked ? 1 : 0);
    $('intakeProgressLabel').textContent = `${completed} of 4 complete`;
    $('intakeProgressBar').style.width = `${completed * 25}%`;
  }

  function updateFileStatus() {
    const form = $('intakeForm');
    const status = $('intakeFileStatus');
    if (!form || !status) return;
    const files = [...form.elements.documents.files];
    if (!files.length) {
      status.textContent = 'No files selected';
      return;
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(totalBytes >= 1024 * 1024 ? 1 : 2);
    status.textContent = `${files.length} ${files.length === 1 ? 'file' : 'files'} selected · ${totalMb} MB total`;
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const files = [...form.elements.documents.files];
    if (files.length > 6 || files.some(file => file.size > 10 * 1024 * 1024)) return showSubmitError(files.length > 6 ? 'Select no more than 6 files.' : 'Each file must be 10 MB or smaller.');
    const button = $('intakeSubmitButton');
    button.disabled = true;
    button.textContent = 'Submitting securely…';
    $('intakeSubmitError').classList.add('hidden');
    try {
      const data = new FormData(form);
      data.delete('documents');
      files.forEach(file => data.append('documents', file));
      showSuccess(await request(completeEndpoint, { method: 'POST', body: data }));
    } catch (error) {
      showSubmitError(error.message);
      button.disabled = false;
      button.textContent = 'Complete Request & Continue';
    }
  }

  async function init() {
    if (!readToken()) return showError('A secure completion token is required.');
    const form = $('intakeForm');
    form.addEventListener('submit', submit);
    form.addEventListener('input', updateProgress);
    form.addEventListener('change', event => {
      updateProgress();
      if (event.target.name === 'documents') updateFileStatus();
    });
    try { populate(await request(viewEndpoint)); } catch (error) { showError(error.message); }
  }
  init();
})();
