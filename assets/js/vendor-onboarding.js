(() => {
  const $ = (id) => document.getElementById(id);
  const apiUrl = '/api/vendor-onboarding/public/form';
  let token = '';

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
    remove.textContent = 'Remove';
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

  function populate(payload) {
    const vendor = payload.vendor || {};
    $('inviteEmailDisplay').textContent = payload.email;
    $('email').value = payload.email;
    $('categoryDisplay').textContent = payload.categoryLabel;
    $('expiryDisplay').textContent = new Date(payload.expiresAt).toLocaleString();
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
      title.textContent = 'Previously submitted documents';
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
    $('onboardingForm').classList.remove('hidden');
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = $('submitButton');
    const error = $('submitError');
    error.classList.add('hidden');
    button.disabled = true;
    button.querySelector('span').textContent = 'Submitting securely…';
    try {
      const data = new FormData(form);
      data.set('additionalEmails', JSON.stringify(collectRows('additionalEmails', 'address')));
      data.set('additionalPhones', JSON.stringify(collectRows('additionalPhones', 'number')));
      data.set('additionalAddresses', JSON.stringify(collectRows('additionalAddresses', 'address')));
      const payload = await apiRequest({ method: 'POST', body: data });
      sessionStorage.removeItem('vendorInviteToken');
      form.classList.add('hidden');
      $('submissionReference').textContent = `Reference: ${payload.vendorReference}`;
      $('successState').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submissionError) {
      error.textContent = submissionError.message;
      error.classList.remove('hidden');
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = 'Submit Vendor Application';
    }
  }

  document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => addRepeatRow(button.dataset.add)));
  $('onboardingForm').addEventListener('submit', submit);
  if (!readToken()) return showError('The secure invitation token is missing. Please use the complete link from your invitation email.');
  apiRequest().then(populate).catch(error => showError(error.message));
})();
