(() => {
  const $ = (id) => document.getElementById(id);
  const apiUrl = '/api/vendor-onboarding/public/form';
  const MAX_FILE_BYTES = 50 * 1024 * 1024;
  const MAX_BATCH_BYTES = 500 * 1024 * 1024;
  const MAX_FILE_LABEL = '50 MB';
  const MAX_BATCH_LABEL = '500 MB';
  let token = '';
  let formDirty = false;

  function readToken() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    token = hash.get('token') || sessionStorage.getItem('vendorInviteToken') || '';
    if (hash.get('token')) {
      sessionStorage.setItem('vendorInviteToken', token);
      history.replaceState(null, '', window.location.pathname);
    }
    return token;
  }

  async function apiRequest(options = {}) {
    const response = await fetch(apiUrl, {
      ...options,
      headers: { 'X-Vendor-Invite-Token': token, ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload;
  }

  function showError(message) {
    $('loadingState').classList.add('hidden');
    $('onboardingForm').classList.add('hidden');
    $('successState').classList.add('hidden');
    $('errorMessage').textContent = message;
    $('errorState').classList.remove('hidden');
  }

  function value(id, data, key = id) {
    const element = $(id);
    if (element && data?.[key] !== undefined && data[key] !== null) element.value = data[key];
  }

  function addRepeatRow(type, initial = {}) {
    const config = {
      email: { container: 'additionalEmails', valueType: 'email', placeholder: 'email@example.com' },
      phone: { container: 'additionalPhones', valueType: 'tel', placeholder: 'Phone number' },
      address: { container: 'additionalAddresses', valueType: 'text', placeholder: 'Address' }
    }[type];
    const row = document.createElement('div');
    row.className = 'repeat-row';
    const label = document.createElement('input');
    label.placeholder = 'Label';
    label.maxLength = 40;
    label.value = initial.label || 'Additional';
    label.dataset.role = 'label';
    const field = document.createElement('input');
    field.type = config.valueType;
    field.placeholder = config.placeholder;
    field.maxLength = type === 'address' ? 500 : 160;
    field.value = initial.address || initial.number || '';
    field.dataset.role = 'value';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.innerHTML = '<span aria-hidden="true">×</span> Remove';
    remove.setAttribute('aria-label', `Remove additional ${type}`);
    remove.addEventListener('click', () => row.remove());
    row.append(label, field, remove);
    $(config.container).appendChild(row);
  }

  function collectRows(containerId, valueKey) {
    return [...$(containerId).querySelectorAll('.repeat-row')].map(row => ({
      label: row.querySelector('[data-role="label"]').value.trim(),
      [valueKey]: row.querySelector('[data-role="value"]').value.trim()
    })).filter(item => item[valueKey]);
  }

  function setProgress(step) {
    const current = Math.max(1, Math.min(4, Number(step) || 1));
    const percent = current * 25;
    $('formProgressBar').style.width = `${percent}%`;
    $('progressLabel').textContent = `Step ${current} of 4`;
    $('progressPercent').textContent = `${percent}%`;
    document.querySelectorAll('[data-progress-step]').forEach(link => {
      const linkStep = Number(link.dataset.progressStep);
      link.classList.toggle('active', linkStep === current);
      link.classList.toggle('complete', linkStep < current);
      if (linkStep === current) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
  }

  function initializeProgress() {
    document.querySelectorAll('[data-progress-step]').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      const section = document.querySelector(link.getAttribute('href'));
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setProgress(link.dataset.progressStep);
    }));
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setProgress(visible.target.dataset.formStep);
    }, { rootMargin: '-22% 0px -58% 0px', threshold: [0, .15, .4] });
    document.querySelectorAll('[data-form-step]').forEach(section => observer.observe(section));
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function updateFileSelection(input) {
    const card = input.closest('.upload-field');
    const status = card?.querySelector('.file-status');
    if (!card || !status) return;
    card.classList.remove('has-files', 'file-error');
    const files = [...input.files];
    if (!files.length) {
      status.textContent = input.multiple ? 'Choose files' : 'Choose file';
      return;
    }
    const total = files.reduce((sum, file) => sum + file.size, 0);
    const batchTotal = [...document.querySelectorAll('.upload-field input[type="file"]')]
      .flatMap(fileInput => [...fileInput.files])
      .reduce((sum, file) => sum + file.size, 0);
    const oversized = files.find(file => file.size > MAX_FILE_BYTES);
    const tooMany = input.multiple && files.length > 5;
    if (oversized || batchTotal > MAX_BATCH_BYTES || tooMany) {
      card.classList.add('file-error');
      status.textContent = oversized ? `${oversized.name} exceeds ${MAX_FILE_LABEL}` : tooMany ? 'Choose no more than five files' : `Selected files exceed the ${MAX_BATCH_LABEL} batch limit`;
      input.value = '';
      return;
    }
    card.classList.add('has-files');
    status.textContent = files.length === 1 ? `${files[0].name} · ${formatBytes(files[0].size)}` : `${files.length} files selected · ${formatBytes(total)}`;
  }

  function focusFirstInvalid(form) {
    const invalid = form.querySelector(':invalid');
    if (!invalid) return;
    const container = invalid.closest('.field, .check-row');
    container?.classList.add('field-error');
    container?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => invalid.focus({ preventScroll: true }), 300);
  }

  function populate(payload) {
    const vendor = payload.vendor || {};
    $('inviteEmailDisplay').textContent = payload.email;
    $('email').value = payload.email;
    $('categoryDisplay').textContent = payload.categoryLabel;
    $('categoryInlineDisplay').textContent = payload.categoryLabel;
    const expiry = new Date(payload.expiresAt);
    $('expiryDisplay').textContent = Number.isNaN(expiry.getTime()) ? 'Unavailable' : expiry.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    document.title = `${payload.companyName || 'Vendor'} Onboarding | Hutta Home Services`;
    value('name', { name: vendor.name || payload.companyName });
    ['phone','address','legalBusinessName','businessEntityType','primaryOwnerName','businessAddress','rocLicenseNumber','rocLicenseTypeClassification','requestedCategory'].forEach(id => value(id, vendor));
    if (vendor.rocLicenseExpirationDate) $('rocLicenseExpirationDate').value = String(vendor.rocLicenseExpirationDate).slice(0, 10);
    if (vendor.einTaxIdMasked) $('einTaxId').placeholder = vendor.einTaxIdMasked;
    (vendor.emails || []).filter(item => !item.isPrimary && item.address !== payload.email).forEach(item => addRepeatRow('email', item));
    (vendor.phones || []).filter(item => !item.isPrimary).forEach(item => addRepeatRow('phone', item));
    (vendor.addresses || []).filter(item => !item.isPrimary).forEach(item => addRepeatRow('address', item));
    if (vendor.documents?.length) {
      const box = $('existingDocuments');
      const title = document.createElement('h3');
      title.textContent = 'Previously submitted documents retained on your application';
      const list = document.createElement('ul');
      vendor.documents.filter(item => item.status !== 'archived').forEach(item => {
        const row = document.createElement('li');
        row.textContent = item.name;
        list.appendChild(row);
      });
      box.replaceChildren(title, list);
      box.classList.remove('hidden');
    }
    $('loadingState').classList.add('hidden');
    $('errorState').classList.add('hidden');
    $('onboardingForm').classList.remove('hidden');
    setProgress(1);
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    form.querySelectorAll('.field-error').forEach(element => element.classList.remove('field-error'));
    if (!form.reportValidity()) {
      focusFirstInvalid(form);
      return;
    }
    const button = $('submitButton');
    const error = $('submitError');
    error.classList.add('hidden');
    button.disabled = true;
    button.classList.add('loading');
    button.setAttribute('aria-busy', 'true');
    button.querySelector('span').textContent = 'Submitting securely…';
    button.querySelector('small').textContent = 'Please keep this page open';
    try {
      const data = new FormData(form);
      data.set('additionalEmails', JSON.stringify(collectRows('additionalEmails', 'address')));
      data.set('additionalPhones', JSON.stringify(collectRows('additionalPhones', 'number')));
      data.set('additionalAddresses', JSON.stringify(collectRows('additionalAddresses', 'address')));
      const payload = await apiRequest({ method: 'POST', body: data });
      sessionStorage.removeItem('vendorInviteToken');
      formDirty = false;
      form.classList.add('hidden');
      $('submissionReference').textContent = `Reference: ${payload.vendorReference}`;
      $('successState').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submissionError) {
      error.textContent = submissionError.message;
      error.classList.remove('hidden');
      error.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      button.disabled = false;
      button.classList.remove('loading');
      button.removeAttribute('aria-busy');
      button.querySelector('span').textContent = 'Submit Vendor Application';
      button.querySelector('small').textContent = 'Securely send for review';
    }
  }

  document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => addRepeatRow(button.dataset.add)));
  document.querySelectorAll('.upload-field input[type="file"]').forEach(input => input.addEventListener('change', () => updateFileSelection(input)));
  $('onboardingForm').addEventListener('input', event => {
    formDirty = true;
    event.target.closest('.field-error')?.classList.remove('field-error');
  });
  $('onboardingForm').addEventListener('submit', submit);
  window.addEventListener('beforeunload', event => {
    if (!formDirty || $('onboardingForm').classList.contains('hidden')) return;
    event.preventDefault();
    event.returnValue = '';
  });
  initializeProgress();
  if (!readToken()) return showError('The secure invitation token is missing. Please use the complete link from your invitation email.');
  apiRequest().then(populate).catch(error => showError(error.message));
})();
