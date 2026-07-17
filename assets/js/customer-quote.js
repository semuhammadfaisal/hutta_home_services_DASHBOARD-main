(() => {
  const $ = id => document.getElementById(id);
  const token = new URLSearchParams(location.search).get('token') || '';
  const money = value => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = value => value ? new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not specified';
  const set = (id, value) => { $(id).textContent = value || '—'; };
  async function load() {
    try {
      if (!token) throw new Error('The secure quote token is missing.');
      const response = await fetch(`/api/outgoing-quotes/public/view?token=${encodeURIComponent(token)}`, { credentials: 'omit', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load this quote.');
      set('quoteReference', data.quoteReference); set('quoteMeta', `Revision ${data.revisionNumber} · Sent ${date(data.sentAt)} · Valid through ${date(data.validUntil)}`);
      set('quoteCustomer', data.customer?.name); set('quoteAddress', data.customer?.address); set('quoteService', data.job?.service); set('quoteRequest', `Request ${data.job?.requestReference || data.job?.orderReference || '—'}`);
      set('quoteScope', data.scopeOfWork); set('quoteDuration', `Estimated duration: ${data.estimatedDuration?.value || '—'} ${data.estimatedDuration?.unit || ''}`); set('quoteAvailability', `Earliest availability: ${date(data.earliestAvailableDate)}`);
      set('quoteAccess', data.siteAccessRequired ? `Site access required${data.accessNotes ? `: ${data.accessNotes}` : ''}` : 'No special site access required');
      set('quoteConditions', data.exclusionsConditions ? `Exclusions / conditions: ${data.exclusionsConditions}` : ''); set('quoteTotal', money(data.customerTotal)); set('quoteTerms', data.termsAndConditions);
      set('quoteContractor', data.vendorDisclosure?.licensedContractorName); set('quoteLicenseType', data.vendorDisclosure?.licenseType); set('quoteRoc', data.vendorDisclosure?.rocNumber); set('quoteLegal', data.vendorDisclosure?.legalDisclosure);
      $('quotePdfLink').href = `/api/outgoing-quotes/public/pdf?token=${encodeURIComponent(token)}`;
      $('quoteLoading').hidden = true; $('quoteDocument').hidden = false;
    } catch (error) { $('quoteLoading').hidden = true; $('quoteErrorMessage').textContent = error.message; $('quoteError').hidden = false; }
  }
  load();
})();
