(function residentialFeatureApp() {
  'use strict';

  const featureState = { autopilot: null, passport: null, utilities: [], notifications: [], account: null, referrals: null, messages: [], agentAccess: [] };
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const propertyId = () => window.ResidentialPortal?.state?.currentPropertyId;
  const orders = () => window.ResidentialPortal?.state?.orders || [];
  const date = value => value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not set';
  const money = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const empty = (title, detail) => `<div class="feature-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
  function toast(message) { const node = $('portalToast'); node.textContent = message; node.hidden = false; window.setTimeout(() => { node.hidden = true; }, 3500); }
  function busy(form, value) { form?.querySelectorAll('button, input, select, textarea').forEach(control => { control.disabled = value; }); }

  async function loadAutopilot() {
    if (!propertyId()) return;
    const [plan, calendar, seasonal] = await Promise.all([window.APIService.getResidentialAutopilot(propertyId()), window.APIService.getResidentialMaintenance(propertyId()), window.APIService.getResidentialSeasonalRecommendations(propertyId())]);
    featureState.autopilot = plan.autopilot;
    $('autopilotEnabled').checked = plan.autopilot.enabled;
    $('autoApprovalEnabled').checked = plan.autopilot.autoApprovalEnabled;
    $('autoApprovalThreshold').value = plan.autopilot.autoApprovalThreshold || '';
    $('autopilotConsentText').textContent = plan.consentText;
    $('autopilotServices').innerHTML = plan.autopilot.services.map(service => `<label class="service-toggle"><span><strong>${escapeHtml(service.label)}</strong><small>Every ${service.frequencyMonths} months</small></span><input type="checkbox" data-service-key="${escapeHtml(service.key)}" data-frequency="${service.frequencyMonths}"${service.enabled ? ' checked' : ''}></label>`).join('');
    $('maintenanceCalendar').innerHTML = calendar.items.length ? calendar.items.map(item => `<article class="compact-item"><div><strong>${escapeHtml(item.title)}</strong><small>Every ${item.frequencyMonths} months</small></div><span>${escapeHtml(date(item.dueAt))}</span></article>`).join('') : empty('No services scheduled', 'Enable a service to add it to your maintenance calendar.');
    $('seasonalRecommendations').innerHTML = seasonal.recommendations.length ? seasonal.recommendations.map(item => `<article class="recommendation-card"><small>${escapeHtml(seasonal.region)} seasonal care</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p><button class="text-button" type="button" data-seasonal-service="${escapeHtml(item.serviceKey)}">Add to Autopilot</button></article>`).join('') : empty('You are season-ready', 'New Arizona recommendations will appear at the right time of year.');
  }

  async function saveAutopilot(event) {
    event.preventDefault(); const form = event.currentTarget; busy(form, true); $('autopilotError').hidden = true;
    try {
      const payload = { enabled: $('autopilotEnabled').checked, autoApprovalEnabled: $('autoApprovalEnabled').checked, autoApprovalThreshold: $('autoApprovalThreshold').value, typedName: $('autopilotTypedName').value, consentAccepted: $('autopilotConsent').checked, services: [...form.querySelectorAll('[data-service-key]')].map(input => ({ key: input.dataset.serviceKey, enabled: input.checked, frequencyMonths: Number(input.dataset.frequency) })) };
      await window.APIService.updateResidentialAutopilot(propertyId(), payload); toast('Autopilot settings saved with an audit record.'); $('autopilotTypedName').value = ''; $('autopilotConsent').checked = false; await loadAutopilot();
    } catch (error) { $('autopilotError').textContent = error.message || 'Autopilot settings could not be saved.'; $('autopilotError').hidden = false; } finally { busy(form, false); }
  }

  function renderPassport() {
    const passport = featureState.passport || { entries: [], documents: [] };
    $('passportEntries').innerHTML = passport.entries.length ? passport.entries.map(item => `<article class="record-item"><div><small>${escapeHtml(item.category)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.value)}</span></div></article>`).join('') : empty('No property details yet', 'Add information that will be useful on the next service visit.');
    $('passportDocuments').innerHTML = passport.documents.length ? passport.documents.map(item => `<article class="record-item"><div><small>${escapeHtml(item.category)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.name)} · ${Math.ceil(item.size / 1024)} KB</span></div><a class="button" href="${escapeHtml(item.downloadUrl)}" target="_blank" rel="noopener">View</a></article>`).join('') : empty('No documents yet', 'Warranties, permits, and appliance documents will appear here.');
  }
  async function loadPassport() { if (!propertyId()) return; featureState.passport = await window.APIService.getResidentialPassport(propertyId()); renderPassport(); }
  async function addPassportEntry(event) { event.preventDefault(); const form = event.currentTarget; busy(form, true); try { featureState.passport = await window.APIService.addResidentialPassportEntry(propertyId(), Object.fromEntries(new FormData(form))); form.reset(); renderPassport(); toast('Property Passport detail added.'); } catch (error) { toast(error.message || 'Detail could not be added.'); } finally { busy(form, false); } }
  async function uploadPassport(event) { event.preventDefault(); const form = event.currentTarget; busy(form, true); try { featureState.passport = await window.APIService.uploadResidentialPassportDocument(propertyId(), new FormData(form)); form.reset(); renderPassport(); toast('Document uploaded to the secure vault.'); } catch (error) { toast(error.message || 'Document could not be uploaded.'); } finally { busy(form, false); } }

  function renderUtilities() { $('utilityReadings').innerHTML = featureState.utilities.length ? featureState.utilities.map(item => `<article class="record-item"><div><small>${escapeHtml(item.utilityType)} · ${escapeHtml(date(item.periodEnd))}</small><strong>${escapeHtml(item.usage)} ${escapeHtml(item.unit)}</strong><span>${item.cost == null ? 'Cost not entered' : money(item.cost)}</span></div></article>`).join('') : empty('No readings yet', 'Add a utility bill to begin building a baseline.'); }
  async function loadUtilities() { if (!propertyId()) return; featureState.utilities = (await window.APIService.getResidentialUtilities(propertyId())).data || []; renderUtilities(); }
  async function addUtility(event) { event.preventDefault(); const form = event.currentTarget; busy(form, true); try { await window.APIService.addResidentialUtility(propertyId(), Object.fromEntries(new FormData(form))); form.reset(); await loadUtilities(); toast('Utility reading saved.'); } catch (error) { toast(error.message || 'Reading could not be saved.'); } finally { busy(form, false); } }

  function populateMessageOrders() { $('messageOrder').innerHTML = orders().map(order => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.service || 'Service')} · ${escapeHtml(order.orderReference || order.requestReference || '')}</option>`).join('') || '<option value="">No service orders</option>'; }
  function renderMessages() { $('messageThread').innerHTML = featureState.messages.length ? featureState.messages.map(item => `<article class="relay-message ${item.sender === 'You' ? 'is-client' : ''}"><strong>${escapeHtml(item.sender)}</strong><p>${escapeHtml(item.body)}</p><time>${escapeHtml(date(item.createdAt))}</time></article>`).join('') : empty('No messages on this order', 'Use this private relay when you need to discuss the service.'); }
  async function loadMessages() { populateMessageOrders(); const orderId = $('messageOrder').value; if (!orderId) { featureState.messages = []; return renderMessages(); } featureState.messages = (await window.APIService.getResidentialMessages(orderId)).data || []; renderMessages(); }
  async function sendMessage(event) { event.preventDefault(); const form = event.currentTarget; const orderId = $('messageOrder').value; if (!orderId) return; busy(form, true); try { await window.APIService.sendResidentialMessage(orderId, new FormData(form).get('body')); form.reset(); await loadMessages(); toast('Message sent through SMPLfix.'); } catch (error) { toast(error.message || 'Message could not be sent.'); } finally { busy(form, false); } }

  function renderNotifications(payload) { featureState.notifications = payload.data || []; $('notificationBadge').textContent = payload.unreadCount || 0; $('notificationBadge').hidden = !payload.unreadCount; $('notificationBadge').setAttribute('aria-label', `${payload.unreadCount || 0} unread notifications`); $('notificationList').innerHTML = featureState.notifications.length ? featureState.notifications.map(item => `<article class="transaction-card${item.isRead ? '' : ' is-unread'}"><div><small>${escapeHtml(item.type)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div><div class="transaction-actions">${item.isRead ? '<span>Read</span>' : `<button class="button" type="button" data-read-notification="${escapeHtml(item.id)}">Mark read</button>`}</div></article>`).join('') : empty('You are all caught up', 'Important updates will appear here.'); }
  async function loadNotifications() { renderNotifications(await window.APIService.getResidentialNotifications()); }

  async function loadReferrals() { featureState.referrals = await window.APIService.getResidentialReferrals(); $('referralUrl').textContent = `${location.origin}${featureState.referrals.referralUrl}`; const totals = featureState.referrals.totals; $('referralSummary').innerHTML = `<article class="metric-card"><div><small>Invited</small><strong>${totals.invited}</strong></div></article><article class="metric-card"><div><small>Joined</small><strong>${totals.joined}</strong></div></article><article class="metric-card"><div><small>Rewards earned</small><strong>${money(totals.rewards)}</strong></div></article>`; $('referralHistory').innerHTML = featureState.referrals.history.length ? featureState.referrals.history.map(item => `<article class="record-item"><div><strong>${escapeHtml(item.displayName || 'Referral')}</strong><span>${escapeHtml(item.status)} · ${money(item.rewardAmount)}</span></div></article>`).join('') : empty('No referrals yet', 'Copy your personal link to get started.'); }

  const preferenceLabels = { portal: 'Portal notifications', email: 'Email notifications', upcomingVisits: 'Upcoming visit reminders', jobUpdates: 'Job status updates', invoices: 'Invoice and receipt alerts', seasonalRecommendations: 'Arizona seasonal recommendations' };
  function renderAgentAccess() {
    $('agentAccessList').innerHTML = featureState.agentAccess.length ? featureState.agentAccess.map(item => { const transaction = item.transaction || {}; const agent = item.agent || {}; return `<article class="transaction-card"><div><small>${escapeHtml(transaction.status || 'active')} · access ends ${escapeHtml(date(transaction.accessEndsAt))}</small><strong>${escapeHtml(agent.displayName || 'Real estate agent')}</strong><span>${escapeHtml(agent.brokerageName || transaction.label || '')} · ${escapeHtml(transaction.property?.label || 'Property')}</span><small>Cannot approve estimates or manage payment.</small></div><div class="transaction-actions">${item.capabilities?.canRevoke ? `<button class="button" type="button" data-revoke-agent="${escapeHtml(transaction.id)}">Revoke access</button>` : `<span>${escapeHtml(transaction.status || 'ended')}</span>`}</div></article>`; }).join('') : empty('No agent access', 'Active and recently ended real estate transaction access will appear here.');
  }
  async function loadAccount() { const [account, access] = await Promise.all([window.APIService.getResidentialAccount(), window.APIService.getResidentialAgentAccess()]); featureState.account = account; featureState.agentAccess = access.data || []; $('accountEmail').value = featureState.account.account.email || ''; $('accountPreferredName').value = featureState.account.account.preferredName || ''; $('accountPhone').value = featureState.account.account.phone || ''; $('notificationPreferences').innerHTML = Object.entries(preferenceLabels).map(([key, label]) => `<label class="check-label"><input type="checkbox" data-preference="${key}"${featureState.account.notificationPreferences[key] ? ' checked' : ''}><span>${escapeHtml(label)}</span></label>`).join(''); renderAgentAccess(); }
  async function saveAccount(event) { event.preventDefault(); const form = event.currentTarget; busy(form, true); try { await window.APIService.updateResidentialAccount({ preferredName: $('accountPreferredName').value, phone: $('accountPhone').value, notificationPreferences: Object.fromEntries([...form.querySelectorAll('[data-preference]')].map(input => [input.dataset.preference, input.checked])) }); toast('Account settings saved.'); await loadAccount(); } catch (error) { toast(error.message || 'Settings could not be saved.'); } finally { busy(form, false); } }

  const loaders = { autopilot: loadAutopilot, passport: loadPassport, utilities: loadUtilities, messages: loadMessages, notifications: loadNotifications, referrals: loadReferrals, account: loadAccount };
  async function loadRoute(route) { if (!loaders[route]) return; try { await loaders[route](); } catch (error) { toast(error.message || `${route} could not be loaded.`); } }

  document.addEventListener('DOMContentLoaded', () => {
    $('autopilotForm').addEventListener('submit', saveAutopilot);
    $('passportEntryForm').addEventListener('submit', addPassportEntry);
    $('passportDocumentForm').addEventListener('submit', uploadPassport);
    $('utilityForm').addEventListener('submit', addUtility);
    $('messageOrder').addEventListener('change', loadMessages);
    $('messageForm').addEventListener('submit', sendMessage);
    $('accountForm').addEventListener('submit', saveAccount);
    $('openNotificationsButton').addEventListener('click', () => { location.hash = 'notifications'; });
    $('copyReferralButton').addEventListener('click', async () => { await navigator.clipboard.writeText($('referralUrl').textContent); toast('Referral link copied.'); });
    document.addEventListener('click', async event => {
      const seasonal = event.target.closest('[data-seasonal-service]'); if (seasonal) { const input = document.querySelector(`[data-service-key="${CSS.escape(seasonal.dataset.seasonalService)}"]`); if (input) { input.checked = true; $('autopilotEnabled').checked = true; input.focus(); toast('Service added. Save your settings to confirm.'); } }
      const read = event.target.closest('[data-read-notification]'); if (read) { await window.APIService.readResidentialNotification(read.dataset.readNotification); await loadNotifications(); }
      const revoke = event.target.closest('[data-revoke-agent]'); if (revoke) { const reason = window.prompt('Why are you revoking this agent’s property access?'); if (!reason) return; revoke.disabled = true; try { await window.APIService.revokeResidentialAgentAccess(revoke.dataset.revokeAgent, reason); toast('Agent access revoked immediately.'); await loadAccount(); } catch (error) { toast(error.message || 'Agent access could not be revoked.'); revoke.disabled = false; } }
    });
    window.addEventListener('residential:route', event => loadRoute(event.detail.route));
    window.addEventListener('residential:loaded', () => { loadNotifications(); loadRoute(window.ResidentialPortal.state.route); });
    window.addEventListener('residential:property-changed', event => loadRoute(event.detail.route));
  });

  window.ResidentialFeatures = { loadRoute, __test: { escapeHtml, preferenceLabels } };
})();
