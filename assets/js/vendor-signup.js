document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('vendorSignupForm'); const error = document.getElementById('signupError');
  form?.addEventListener('submit', async event => {
    event.preventDefault(); error.hidden = true; const data = new FormData(form); const licensedTrade = data.get('licensedTrade') === 'on';
    const payload = { companyName: data.get('companyName'), legalBusinessName: data.get('legalBusinessName'), contactName: data.get('contactName'), phone: data.get('phone'), email: data.get('email'), password: data.get('password'), entityType: data.get('entityType'), businessAddress: data.get('businessAddress'), tradeClassifications: String(data.get('trades') || '').split(',').map(value => value.trim()).filter(Boolean), licensedTrade, rocLicenseNumber: data.get('rocLicenseNumber'), rocClassification: data.get('rocClassification'), serviceArea: { basePostalCode: data.get('basePostalCode'), radiusMiles: Number(data.get('radiusMiles') || 0) } };
    if (licensedTrade && !String(payload.rocLicenseNumber || '').trim()) { error.textContent = 'An Arizona ROC number is required for licensed trades.'; error.hidden = false; return; }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try { const response = await window.APIService.signupVendor(payload); window.APIService.setSession(response); window.location.replace(response.destination || '/pages/vendor-portal.html'); }
    catch (cause) { error.textContent = cause.message || 'Vendor registration failed.'; error.hidden = false; }
    finally { button.disabled = false; }
  });
});
