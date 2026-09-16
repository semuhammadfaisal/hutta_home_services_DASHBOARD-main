(function homeownerInvitationApp() {
  'use strict';
  const element = {}; let token = ''; let createMode = false; let preview = null;
  const byId = id => document.getElementById(id);
  const show = id => ['loadingState', 'authState', 'reviewState', 'successState', 'terminalState'].forEach(name => { element[name].hidden = name !== id; });
  const cleanDate = value => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Not available' : parsed.toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'long', day: 'numeric', year: 'numeric' }); };
  const address = property => [property?.address?.line1, property?.address?.line2, property?.address?.city, property?.address?.state, property?.address?.postalCode].filter(Boolean).join(', ');
  function terminal(title, message) { element.terminalTitle.textContent = title; element.terminalMessage.textContent = message; show('terminalState'); }
  function setBusy(button, busy, label) { if (busy) button.dataset.label = button.textContent; button.disabled = busy; button.textContent = busy ? label : (button.dataset.label || button.textContent); }
  function setAuthMode(next) {
    createMode = next; element.signInTab.setAttribute('aria-selected', String(!next)); element.createTab.setAttribute('aria-selected', String(next)); element.nameField.hidden = !next; element.accountName.required = next; element.accountPassword.autocomplete = next ? 'new-password' : 'current-password'; element.authSubmit.textContent = next ? 'Create my homeowner account' : 'Sign in securely'; element.authError.hidden = true;
  }
  async function silentSession() {
    const response = await fetch('/api/auth/session', { credentials: 'include', headers: { Accept: 'application/json' } });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('We could not check your account.');
    const payload = await response.json(); window.APIService.setSession(payload); return payload;
  }
  function renderPreview(payload) {
    preview = payload; const invitation = payload.invitation; const permissions = invitation.permissions || {};
    element.agentSummary.textContent = `${payload.agent.displayName}${payload.agent.brokerageName ? ` at ${payload.agent.brokerageName}` : ''} invited you to connect this property for a real estate transaction.`;
    element.propertyLabel.textContent = invitation.property?.label || 'Property'; element.propertyAddress.textContent = address(invitation.property); element.transactionLabel.textContent = invitation.transactionLabel; element.closeDate.textContent = cleanDate(invitation.closeDate); element.accessEnds.textContent = cleanDate(invitation.accessEndsAt); element.consentText.textContent = payload.consent.text;
    [['Request', 'requestService'], ['Documents', 'viewDocuments'], ['Upload', 'uploadInspection'], ['Message', 'message']].forEach(([suffix, permission]) => { const input = element[`permission${suffix}`]; const row = element[`permission${suffix}Row`]; row.hidden = permissions[permission] !== true; input.checked = permissions[permission] === true; });
    element.typedName.value = ''; element.propertyConfirmed.checked = false; element.consentAccepted.checked = false; element.consentError.hidden = true; show('reviewState');
  }
  async function loadPreview() {
    try { renderPreview(await window.APIService.previewAgentClientInvitation(token)); }
    catch (error) { const status = error?.data?.status; terminal(status ? `This invitation is ${status}` : 'Invitation unavailable', error?.message || 'Ask your agent to send a new secure link.'); }
  }
  async function start() {
    token = new URLSearchParams(location.hash.slice(1)).get('invitation') || '';
    if (!/^[A-Za-z0-9_-]{32,512}$/.test(token)) return terminal('Invalid invitation link', 'This link is incomplete. Ask your agent to send a new invitation.');
    try {
      const session = await silentSession();
      if (!session) { show('authState'); return; }
      if (session.user?.role !== 'residential') return terminal('Homeowner account required', 'Sign out and open this link with your residential SMPLfix account.');
      await loadPreview();
    } catch (error) { terminal('Could not open invitation', error.message || 'Please try again.'); }
  }
  async function submitAuth(event) {
    event.preventDefault(); element.authError.hidden = true; setBusy(element.authSubmit, true, createMode ? 'Creating account…' : 'Signing in…');
    try {
      const email = element.accountEmail.value.trim(); const password = element.accountPassword.value;
      const response = createMode ? await window.APIService.createResidentialInviteAccount({ name: element.accountName.value.trim(), email, password, token }) : await window.APIService.login(email, password, '/pages/agent-invitation.html');
      if (response.user?.role !== 'residential') throw Object.assign(new Error('This invitation requires a residential homeowner account.'), { status: 403 });
      await loadPreview();
    } catch (error) {
      if (error?.data?.code === 'EXISTING_ACCOUNT') { setAuthMode(false); element.authError.textContent = 'An account already exists for this email. Sign in to continue.'; }
      else element.authError.textContent = error?.message || 'Could not continue securely.';
      element.authError.hidden = false;
    } finally { setBusy(element.authSubmit, false); }
  }
  async function accept(event) {
    event.preventDefault(); element.consentError.hidden = true; setBusy(element.acceptButton, true, 'Connecting…');
    try {
      await window.APIService.acceptAgentClientInvitation(token, { typedName: element.typedName.value, propertyConfirmed: element.propertyConfirmed.checked, consentAccepted: element.consentAccepted.checked, permissions: { viewStatus: true, requestService: element.permissionRequest.checked, viewDocuments: element.permissionDocuments.checked, uploadInspection: element.permissionUpload.checked, message: element.permissionMessage.checked } });
      history.replaceState(null, '', location.pathname); show('successState');
    } catch (error) { element.consentError.textContent = error?.message || 'Could not approve this invitation.'; element.consentError.hidden = false; }
    finally { setBusy(element.acceptButton, false); }
  }
  function bind() {
    ['loadingState', 'authState', 'reviewState', 'successState', 'terminalState', 'terminalTitle', 'terminalMessage', 'signInTab', 'createTab', 'authForm', 'nameField', 'accountName', 'accountEmail', 'accountPassword', 'authError', 'authSubmit', 'agentSummary', 'propertyLabel', 'propertyAddress', 'transactionLabel', 'closeDate', 'accessEnds', 'consentForm', 'permissionView', 'permissionRequestRow', 'permissionRequest', 'permissionDocumentsRow', 'permissionDocuments', 'permissionUploadRow', 'permissionUpload', 'permissionMessageRow', 'permissionMessage', 'propertyConfirmed', 'consentAccepted', 'consentText', 'typedName', 'consentError', 'acceptButton'].forEach(id => { element[id] = byId(id); });
    element.signInTab.addEventListener('click', () => setAuthMode(false)); element.createTab.addEventListener('click', () => setAuthMode(true)); element.authForm.addEventListener('submit', submitAuth); element.consentForm.addEventListener('submit', accept);
  }
  document.addEventListener('DOMContentLoaded', () => { bind(); start(); });
})();
