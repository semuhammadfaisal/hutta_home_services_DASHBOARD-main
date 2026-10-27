document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('vendorSignupForm');
  const error = document.getElementById('signupError');
  const steps = Array.from(form?.querySelectorAll('[data-signup-step]') || []);
  const markers = Array.from(document.querySelectorAll('[data-step-marker]'));
  const back = document.getElementById('signupBack');
  const next = document.getElementById('signupNext');
  const submit = document.getElementById('signupSubmit');
  const review = document.getElementById('signupReview');
  let currentStep = 1;

  function showError(message) { error.textContent = message; error.hidden = !message; if (message) error.focus?.(); }
  function fieldsForStep(step) { return Array.from(steps[step - 1]?.querySelectorAll('input,select,textarea') || []); }
  function validateStep(step) {
    for (const field of fieldsForStep(step)) { if (!field.checkValidity()) { field.reportValidity(); field.focus(); return false; } }
    if (step === 2 && form.elements.licensedTrade.checked && !String(form.elements.rocLicenseNumber.value || '').trim()) { showError('An Arizona ROC number is required for licensed trades.'); form.elements.rocLicenseNumber.focus(); return false; }
    showError(''); return true;
  }
  function addReviewRow(label, value) { const row = document.createElement('div'); const key = document.createElement('span'); const answer = document.createElement('strong'); key.textContent = label; answer.textContent = value || 'Not provided'; row.append(key, answer); review.append(row); }
  function updateReview() {
    review.replaceChildren();
    addReviewRow('Company', form.elements.companyName.value.trim()); addReviewRow('Contact', form.elements.contactName.value.trim()); addReviewRow('Email', form.elements.email.value.trim()); addReviewRow('Trades', form.elements.trades.value.trim()); addReviewRow('Service area', `${form.elements.basePostalCode.value.trim() || 'Base ZIP not provided'} · ${form.elements.radiusMiles.value || 0} miles`); addReviewRow('Licensed work', form.elements.licensedTrade.checked ? `Yes · ROC ${form.elements.rocLicenseNumber.value.trim()}` : 'No');
  }
  function showStep(step, focus = true) {
    currentStep = Math.max(1, Math.min(3, step));
    steps.forEach((fieldset, index) => { fieldset.hidden = index + 1 !== currentStep; });
    markers.forEach((marker, index) => { marker.classList.toggle('is-active', index + 1 === currentStep); marker.classList.toggle('is-complete', index + 1 < currentStep); marker.setAttribute('aria-current', index + 1 === currentStep ? 'step' : 'false'); });
    back.hidden = currentStep === 1; next.hidden = currentStep === 3; submit.hidden = currentStep !== 3;
    if (currentStep === 3) updateReview();
    if (focus) steps[currentStep - 1]?.querySelector('legend')?.focus?.();
  }

  next?.addEventListener('click', () => { if (validateStep(currentStep)) showStep(currentStep + 1); });
  back?.addEventListener('click', () => { showError(''); showStep(currentStep - 1); });
  form?.addEventListener('keydown', event => { if (event.key === 'Enter' && currentStep < 3 && event.target.tagName !== 'TEXTAREA') { event.preventDefault(); next.click(); } });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!validateStep(1) || !validateStep(2)) return;
    showError(''); const data = new FormData(form); const licensedTrade = data.get('licensedTrade') === 'on';
    const payload = { companyName: data.get('companyName'), legalBusinessName: data.get('legalBusinessName'), contactName: data.get('contactName'), phone: data.get('phone'), email: data.get('email'), password: data.get('password'), entityType: data.get('entityType'), businessAddress: data.get('businessAddress'), tradeClassifications: String(data.get('trades') || '').split(',').map(value => value.trim()).filter(Boolean), licensedTrade, rocLicenseNumber: data.get('rocLicenseNumber'), rocClassification: data.get('rocClassification'), serviceArea: { basePostalCode: data.get('basePostalCode'), radiusMiles: Number(data.get('radiusMiles') || 0) } };
    submit.disabled = true; submit.textContent = 'Creating secure account…';
    try { const response = await window.APIService.signupVendor(payload); window.APIService.setSession(response); window.location.replace(response.destination || '/pages/vendor-portal.html#overview'); }
    catch (cause) { showError(cause.message || 'Vendor registration failed.'); }
    finally { submit.disabled = false; submit.textContent = 'Create secure vendor account'; }
  });
  showStep(1, false);
});
