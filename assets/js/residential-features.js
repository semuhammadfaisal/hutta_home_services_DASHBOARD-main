(function residentialFeatureApp() {
  'use strict';

  const featureState = { autopilot: null, maintenance: [], passport: null, passportEntryFilter: 'all', passportDocumentFilter: 'all', utilities: [], utilityFilter: 'all', notifications: [], account: null, referrals: null, messages: [], agentAccess: [] };
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const propertyId = () => window.ResidentialPortal?.state?.currentPropertyId;
  const orders = () => window.ResidentialPortal?.state?.orders || [];
  const date = value => value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not set';
  const propertyAddress = property => [property?.address?.line1, property?.address?.line2, property?.address?.city, property?.address?.state, property?.address?.postalCode].filter(Boolean).join(', ');
  const money = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const empty = (title, detail) => `<div class="feature-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
  function toast(message) { const node = $('portalToast'); node.textContent = message; node.hidden = false; window.setTimeout(() => { node.hidden = true; }, 3500); }
  function busy(form, value) {
    form?.querySelectorAll('button, input, select, textarea').forEach(control => {
      if (value) {
        control.dataset.disabledBeforeBusy = control.disabled ? 'true' : 'false';
        control.disabled = true;
      } else {
        control.disabled = control.dataset.disabledBeforeBusy === 'true';
        delete control.dataset.disabledBeforeBusy;
      }
    });
  }

  async function loadAutopilot() {
    if (!propertyId()) return;
    const [plan, calendar, seasonal] = await Promise.all([window.APIService.getResidentialAutopilot(propertyId()), window.APIService.getResidentialMaintenance(propertyId()), window.APIService.getResidentialSeasonalRecommendations(propertyId())]);
    featureState.autopilot = plan.autopilot;
    featureState.maintenance = calendar.items || [];
    $('autopilotEnabled').checked = plan.autopilot.enabled;
    $('autoApprovalEnabled').checked = plan.autopilot.autoApprovalEnabled;
    $('autoApprovalThreshold').value = plan.autopilot.autoApprovalThreshold || '';
    $('autopilotConsentText').textContent = plan.consentText;
    $('autopilotRequestNote').value = plan.autopilot.requestNote || '';
    const portalState = window.ResidentialPortal?.state;
    $('autopilotPropertyOptions').innerHTML = (portalState?.properties || []).map(property => `<label><input type="checkbox" data-autopilot-property="${escapeHtml(property.id)}"${String(property.id) === String(propertyId()) ? ' checked' : ''}><span><strong>${escapeHtml(property.label || 'Property')}</strong><small>${escapeHtml(propertyAddress(property) || 'Address unavailable')}</small></span></label>`).join('');
    $('autopilotServices').innerHTML = plan.autopilot.services.map(service => `<article class="autopilot-service-row${service.enabled ? ' is-enabled' : ''}"><label><input type="checkbox" data-service-key="${escapeHtml(service.key)}"${service.enabled ? ' checked' : ''}><span class="autopilot-service-icon"><svg aria-hidden="true"><use href="#icon-wrench"/></svg></span><span><strong>${escapeHtml(service.label)}</strong><small>${service.enabled ? 'Requested from SMPLfix' : 'Not currently requested'}</small></span></label><label><span>Frequency</span><select data-service-frequency aria-label="${escapeHtml(service.label)} frequency">${[3, 6, 12, 18, 24].map(months => `<option value="${months}"${Number(service.frequencyMonths) === months ? ' selected' : ''}>Every ${months} months</option>`).join('')}</select></label></article>`).join('');
    $('maintenanceCalendar').innerHTML = featureState.maintenance.length ? featureState.maintenance.map(item => `<article class="autopilot-calendar-item"><span><svg aria-hidden="true"><use href="#icon-calendar"/></svg></span><div><strong>${escapeHtml(item.title)}</strong><small>Every ${item.frequencyMonths} months</small></div><time>${escapeHtml(date(item.dueAt))}</time></article>`).join('') : `<div class="autopilot-side-empty"><span><svg aria-hidden="true"><use href="#icon-calendar"/></svg></span><strong>No services scheduled</strong><p>Enable a recurring service to begin building your calendar.</p></div>`;
    $('seasonalRecommendations').innerHTML = seasonal.recommendations.length ? seasonal.recommendations.map(item => `<article class="autopilot-recommendation"><span>${escapeHtml(seasonal.region)} seasonal care</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p><button type="button" data-seasonal-service="${escapeHtml(item.serviceKey)}"><svg aria-hidden="true"><use href="#icon-plus"/></svg> Request this service</button></article>`).join('') : `<div class="autopilot-side-empty"><span><svg aria-hidden="true"><use href="#icon-check"/></svg></span><strong>You are season-ready</strong><p>New Arizona recommendations will appear at the right time of year.</p></div>`;
    $('autopilotAuditHistory').innerHTML = plan.autopilot.auditHistory?.length ? plan.autopilot.auditHistory.slice(0, 4).map(item => `<article><span></span><div><strong>${escapeHtml(String(item.action || '').replaceAll('_', ' '))}</strong><p>${escapeHtml(item.summary || 'Autopilot service requests updated.')}</p><time>${escapeHtml(date(item.occurredAt))}</time></div></article>`).join('') : `<div class="autopilot-side-empty is-compact"><strong>No request changes yet</strong><p>Your saved Autopilot activity will appear here.</p></div>`;
    updateAutopilotSummary();
  }

  function updateAutopilotSummary() {
    const serviceInputs = [...document.querySelectorAll('#autopilotServices [data-service-key]')];
    const activeCount = serviceInputs.filter(input => input.checked).length;
    const enabled = $('autopilotEnabled').checked && activeCount > 0;
    const approval = $('autoApprovalEnabled').checked;
    const selectedProperties = document.querySelectorAll('[data-autopilot-property]:checked').length;
    const approvalNeedsConsent = approval && (selectedProperties > 1 || !featureState.autopilot?.autoApprovalEnabled || Number($('autoApprovalThreshold').value || 0) !== Number(featureState.autopilot?.autoApprovalThreshold || 0));
    const next = featureState.maintenance.map(item => item.dueAt).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0];
    $('autopilotSummaryStatus').textContent = enabled ? 'Active' : 'Paused';
    $('autopilotSummaryServices').textContent = `${activeCount} of ${serviceInputs.length || 5}`;
    $('autopilotSummaryNext').textContent = next ? date(next) : 'Not scheduled';
    $('autopilotSummaryApproval').textContent = approval ? 'On' : 'Off';
    $('autopilotSummaryApprovalMeta').textContent = approval ? `Up to ${money($('autoApprovalThreshold').value)} per service` : 'You approve each estimate';
    $('autopilotStatusPill').classList.toggle('is-active', enabled);
    $('autopilotStatusPill').innerHTML = `<span aria-hidden="true"></span> ${enabled ? 'Requests active' : 'Requests paused'}`;
    document.querySelectorAll('.autopilot-service-row').forEach(row => row.classList.toggle('is-enabled', row.querySelector('[data-service-key]').checked));
    document.querySelector('.autopilot-consent-card')?.classList.toggle('is-enabled', approval);
    $('autoApprovalThreshold').required = approval;
    $('autopilotTypedName').required = approvalNeedsConsent;
    $('autopilotConsent').required = approvalNeedsConsent;
  }

  async function saveAutopilot(event) {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; $('autopilotError').hidden = true;
    const selectedPropertyIds = [...form.querySelectorAll('[data-autopilot-property]:checked')].map(input => input.dataset.autopilotProperty);
    if (!selectedPropertyIds.length) { $('autopilotError').textContent = 'Select at least one property for these services.'; $('autopilotError').hidden = false; return; }
    const payload = { enabled: $('autopilotEnabled').checked, requestNote: $('autopilotRequestNote').value, autoApprovalEnabled: $('autoApprovalEnabled').checked, autoApprovalThreshold: $('autoApprovalThreshold').value, typedName: $('autopilotTypedName').value, consentAccepted: $('autopilotConsent').checked, services: [...form.querySelectorAll('[data-service-key]')].map(input => ({ key: input.dataset.serviceKey, enabled: input.checked, frequencyMonths: Number(input.closest('.autopilot-service-row').querySelector('[data-service-frequency]').value) })) };
    busy(form, true);
    try {
      await Promise.all(selectedPropertyIds.map(id => window.APIService.updateResidentialAutopilot(id, payload))); toast(`Service requests saved for ${selectedPropertyIds.length} ${selectedPropertyIds.length === 1 ? 'property' : 'properties'} and sent to SMPLfix.`); $('autopilotTypedName').value = ''; $('autopilotConsent').checked = false; await loadAutopilot();
    } catch (error) { $('autopilotError').textContent = error.message || 'Autopilot settings could not be saved.'; $('autopilotError').hidden = false; } finally { busy(form, false); }
  }

  const passportCategoryLabels = { appliance: 'Appliance', paint: 'Paint', filter: 'Filter', warranty: 'Warranty', permit: 'Permit', inspection: 'Inspection', floor_plan: 'Floor plan', deed: 'Deed', tax_record: 'Tax record', survey: 'Survey', disclosure: 'Disclosure', hoa: 'HOA', proof_of_ownership: 'Proof of ownership', other: 'Other' };
  const passportPropertyDocumentCategories = new Set(['floor_plan', 'deed', 'tax_record', 'survey', 'disclosure', 'hoa', 'proof_of_ownership', 'cover_photo', 'property_photo', 'property_video']);
  const passportCategoryLabel = value => passportCategoryLabels[value] || String(value || 'Other').replaceAll('_', ' ').replace(/^./, character => character.toUpperCase());
  const fileSize = bytes => { const value = Number(bytes || 0); return value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(value / 1024))} KB`; };
  function renderPassport() {
    const passport = featureState.passport || { entries: [], documents: [] };
    const entries = passport.entries || [];
    const documents = passport.documents || [];
    const filteredEntries = featureState.passportEntryFilter === 'all' ? entries : entries.filter(item => item.category === featureState.passportEntryFilter);
    const filteredDocuments = featureState.passportDocumentFilter === 'all' ? documents : documents.filter(item => featureState.passportDocumentFilter === 'property' ? passportPropertyDocumentCategories.has(item.category) : item.category === featureState.passportDocumentFilter);
    $('passportDetailCount').textContent = String(entries.length);
    $('passportDocumentCount').textContent = String(documents.length);
    $('passportCategoryCount').textContent = String(new Set([...entries, ...documents].map(item => item.category)).size);
    $('passportEntries').innerHTML = filteredEntries.length ? filteredEntries.map(item => `<article class="passport-record"><span class="passport-record-icon"><svg aria-hidden="true"><use href="#icon-wrench"/></svg></span><div class="passport-record-content"><div class="passport-record-heading"><div><small>${escapeHtml(passportCategoryLabel(item.category))}</small><strong>${escapeHtml(item.title)}</strong></div><time>${escapeHtml(date(item.createdAt))}</time></div><p>${escapeHtml(item.value)}</p>${item.notes ? `<span class="passport-record-note">${escapeHtml(item.notes)}</span>` : ''}</div></article>`).join('') : `<div class="passport-empty"><span><svg aria-hidden="true"><use href="#icon-building"/></svg></span><strong>${entries.length ? 'No details in this category' : 'Build your home reference'}</strong><p>${entries.length ? 'Choose another category to see saved information.' : 'Add appliance models, paint colors, filter sizes, warranties, or permits.'}</p></div>`;
    $('passportDocuments').innerHTML = filteredDocuments.length ? filteredDocuments.map(item => `<article class="passport-record passport-document-record"><span class="passport-record-icon"><svg aria-hidden="true"><use href="#icon-file"/></svg></span><div class="passport-record-content"><div class="passport-record-heading"><div><small>${escapeHtml(passportCategoryLabel(item.category))}</small><strong>${escapeHtml(item.title)}</strong></div><time>${escapeHtml(date(item.uploadedAt))}</time></div><div class="passport-file-meta"><span>${escapeHtml(item.name)}</span><span>${escapeHtml(fileSize(item.size))}</span></div></div><a class="passport-view-file" href="${escapeHtml(item.downloadUrl)}" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#icon-file"/></svg><span>Open</span></a></article>`).join('') : `<div class="passport-empty"><span><svg aria-hidden="true"><use href="#icon-file"/></svg></span><strong>${documents.length ? 'No documents in this category' : 'Your secure vault is empty'}</strong><p>${documents.length ? 'Choose another filter to see uploaded files.' : 'Upload a warranty, permit, inspection, or other property record.'}</p></div>`;
  }
  async function loadPassport() { if (!propertyId()) return; featureState.passport = await window.APIService.getResidentialPassport(propertyId()); renderPassport(); }
  async function addPassportEntry(event) {
    event.preventDefault(); const form = event.currentTarget; const error = $('passportEntryError');
    if (!form.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(form)); error.hidden = true; busy(form, true);
    try { featureState.passport = await window.APIService.addResidentialPassportEntry(propertyId(), payload); form.reset(); renderPassport(); toast('Property detail added to your Passport.'); }
    catch (requestError) { error.textContent = requestError.message || 'Detail could not be added.'; error.hidden = false; }
    finally { busy(form, false); }
  }
  function updatePassportFile() {
    const input = $('passportDocumentFile'); const selected = input.files?.[0]; const error = $('passportDocumentError');
    error.hidden = true; input.setCustomValidity('');
    if (!selected) { $('passportFileName').textContent = 'Choose a document'; $('passportFileMeta').textContent = 'PDF, JPG, PNG, or WebP · 10 MB maximum'; return; }
    $('passportFileName').textContent = selected.name;
    $('passportFileMeta').textContent = `${fileSize(selected.size)} · Ready to upload`;
    if (!$('passportDocumentTitle').value.trim()) $('passportDocumentTitle').value = selected.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    if (selected.size > 10 * 1024 * 1024) { error.textContent = 'Choose a file smaller than 10 MB.'; error.hidden = false; input.setCustomValidity('Choose a file smaller than 10 MB.'); }
    else input.setCustomValidity('');
  }
  async function uploadPassport(event) {
    event.preventDefault(); const form = event.currentTarget; const error = $('passportDocumentError');
    if (!form.reportValidity()) return;
    const payload = new FormData(form); error.hidden = true; busy(form, true);
    try { featureState.passport = await window.APIService.uploadResidentialPassportDocument(propertyId(), payload); form.reset(); updatePassportFile(); renderPassport(); toast('Document uploaded to the secure vault.'); }
    catch (requestError) { error.textContent = requestError.message || 'Document could not be uploaded.'; error.hidden = false; }
    finally { busy(form, false); }
  }

  const utilityDefinitions = {
    electricity: { label: 'Electricity', unit: 'kWh', icon: 'icon-bolt' },
    water: { label: 'Water', unit: 'gallons', icon: 'icon-drop' },
    gas: { label: 'Natural gas', unit: 'therms', icon: 'icon-flame' }
  };
  const utilityNumber = value => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const utilityDate = value => value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date not set';
  function utilityTrend(item) {
    const comparable = featureState.utilities.filter(reading => reading.utilityType === item.utilityType);
    const index = comparable.findIndex(reading => String(reading.id) === String(item.id));
    const previous = index >= 0 ? comparable[index + 1] : null;
    if (!previous || !Number(previous.usage)) return null;
    const change = ((Number(item.usage) - Number(previous.usage)) / Number(previous.usage)) * 100;
    return { change, label: `${Math.abs(change).toFixed(0)}% ${change > 0 ? 'higher' : change < 0 ? 'lower' : 'unchanged'}` };
  }
  function renderUtilities() {
    const readings = featureState.utilities;
    const filtered = featureState.utilityFilter === 'all' ? readings : readings.filter(item => item.utilityType === featureState.utilityFilter);
    const latestWithCost = readings.find(item => item.cost != null);
    const typeCount = new Set(readings.map(item => item.utilityType)).size;
    $('utilityTotalReadings').textContent = String(readings.length);
    $('utilityLatestBill').textContent = latestWithCost ? money(latestWithCost.cost) : '—';
    $('utilityLatestBillMeta').textContent = latestWithCost ? `${utilityDefinitions[latestWithCost.utilityType]?.label || latestWithCost.utilityType} · ${utilityDate(latestWithCost.periodEnd)}` : 'No bill amount yet';
    $('utilityTrackedTypes').textContent = `${typeCount} of 3`;
    $('utilityHistoryCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'reading' : 'readings'}`;
    $('utilityHistorySummary').textContent = readings.length ? 'Compare billing periods and identify unusual changes.' : 'Your saved readings will appear here.';
    document.querySelectorAll('[data-utility-filter]').forEach(button => {
      const active = button.dataset.utilityFilter === featureState.utilityFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('utilityReadings').innerHTML = filtered.length ? filtered.map(item => {
      const definition = utilityDefinitions[item.utilityType] || { label: item.utilityType, icon: 'icon-chart' };
      const trend = utilityTrend(item);
      return `<article class="utility-reading"><span class="utility-reading-icon utility-reading-icon--${escapeHtml(item.utilityType)}"><svg aria-hidden="true"><use href="#${definition.icon}"/></svg></span><div class="utility-reading-main"><div class="utility-reading-title"><div><small>${escapeHtml(definition.label)}</small><strong>${escapeHtml(utilityNumber(item.usage))} <span>${escapeHtml(item.unit)}</span></strong></div>${trend ? `<span class="utility-trend ${trend.change > 0 ? 'is-up' : trend.change < 0 ? 'is-down' : ''}">${escapeHtml(trend.label)}</span>` : '<span class="utility-trend">First reading</span>'}</div><div class="utility-reading-meta"><span><svg aria-hidden="true"><use href="#icon-calendar"/></svg>${escapeHtml(utilityDate(item.periodStart))} – ${escapeHtml(utilityDate(item.periodEnd))}</span><strong>${item.cost == null ? 'Bill not entered' : money(item.cost)}</strong></div>${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ''}</div></article>`;
    }).join('') : `<div class="utility-empty"><span><svg aria-hidden="true"><use href="#icon-chart"/></svg></span><strong>${readings.length ? `No ${escapeHtml(utilityDefinitions[featureState.utilityFilter]?.label || '')} readings` : 'Start your utility baseline'}</strong><p>${readings.length ? 'Choose another utility or add a new reading.' : 'Add your latest bill to begin tracking usage and cost over time.'}</p></div>`;
  }
  async function loadUtilities() { if (!propertyId()) return; featureState.utilities = (await window.APIService.getResidentialUtilities(propertyId())).data || []; renderUtilities(); }
  function updateUtilityUnit() { const definition = utilityDefinitions[$('utilityType').value]; $('utilityUsageUnit').textContent = definition?.unit || ''; }
  function setUtilityDateDefaults() {
    const format = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 30);
    if (!$('utilityPeriodEnd').value) $('utilityPeriodEnd').value = format(end);
    if (!$('utilityPeriodStart').value) $('utilityPeriodStart').value = format(start);
  }
  async function addUtility(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const error = $('utilityFormError');
    if (!form.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(form));
    if (new Date(payload.periodStart) >= new Date(payload.periodEnd)) {
      error.textContent = 'Billing period end must be after the start date.'; error.hidden = false; $('utilityPeriodEnd').focus(); return;
    }
    error.hidden = true;
    busy(form, true);
    try {
      await window.APIService.addResidentialUtility(propertyId(), payload);
      form.reset(); updateUtilityUnit(); setUtilityDateDefaults(); await loadUtilities(); toast('Utility reading saved to this property.');
    } catch (requestError) { error.textContent = requestError.message || 'Reading could not be saved.'; error.hidden = false; }
    finally { busy(form, false); }
  }

  const messageTime = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  function selectedMessageOrder() { return orders().find(order => String(order.id) === String($('messageOrder').value)); }
  function populateMessageOrders() {
    const selected = $('messageOrder').value;
    $('messageOrder').innerHTML = orders().map(order => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.service || 'Service')} · ${escapeHtml(order.orderReference || order.requestReference || '')}</option>`).join('') || '<option value="">No service orders available</option>';
    if (selected && orders().some(order => String(order.id) === String(selected))) $('messageOrder').value = selected;
  }
  function renderMessageOrderContext() {
    const order = selectedMessageOrder();
    const form = $('messageForm');
    form.querySelectorAll('textarea, button').forEach(control => { control.disabled = !order; });
    if (!order) {
      $('messageConversationTitle').textContent = 'Order support';
      $('messageConversationMeta').textContent = 'Select an order to start a conversation.';
      $('messageOrderContext').innerHTML = empty('No order selected', 'Your service order details will appear here.');
      return;
    }
    const reference = order.orderReference || order.requestReference || 'Service order';
    const status = String(order.workflowStatus || order.status || 'active').replaceAll('_', ' ');
    $('messageConversationTitle').textContent = order.service || 'Service conversation';
    $('messageConversationMeta').textContent = `${reference} · ${status}`;
    $('messageOrderContext').innerHTML = `<span class="message-context-kicker">Selected order</span><h3>${escapeHtml(order.service || 'Service order')}</h3><dl><div><dt>Reference</dt><dd>${escapeHtml(reference)}</dd></div><div><dt>Status</dt><dd><span class="message-status-pill">${escapeHtml(status)}</span></dd></div><div><dt>Requested</dt><dd>${escapeHtml(date(order.createdAt))}</dd></div></dl>`;
  }
  function renderMessages() {
    $('messageThread').innerHTML = featureState.messages.length ? featureState.messages.map(item => {
      const mine = item.sender === 'You';
      const initials = mine ? 'YO' : String(item.sender || 'SM').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
      return `<article class="relay-message ${mine ? 'is-client' : ''}"><span class="relay-avatar" aria-hidden="true">${escapeHtml(initials)}</span><div><header><strong>${escapeHtml(item.sender)}</strong><time>${escapeHtml(messageTime(item.createdAt))}</time></header><p>${escapeHtml(item.body)}</p></div></article>`;
    }).join('') : `<div class="message-empty"><span aria-hidden="true"><svg><use href="#icon-arrow"/></svg></span><strong>No messages yet</strong><p>Start the conversation and the SMPLfix team will follow up on this order.</p></div>`;
    $('messageThread').scrollTop = $('messageThread').scrollHeight;
  }
  async function loadMessages() {
    populateMessageOrders();
    renderMessageOrderContext();
    const orderId = $('messageOrder').value;
    if (!orderId) { featureState.messages = []; return renderMessages(); }
    $('messageThread').setAttribute('aria-busy', 'true');
    try { featureState.messages = (await window.APIService.getResidentialMessages(orderId)).data || []; renderMessages(); }
    finally { $('messageThread').removeAttribute('aria-busy'); }
  }
  async function sendMessage(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const orderId = $('messageOrder').value;
    if (!orderId || !form.reportValidity()) return;
    const body = String(new FormData(form).get('body') || '').trim();
    if (!body) {
      $('messageBody').setCustomValidity('Enter a message before sending.');
      $('messageBody').reportValidity();
      return;
    }
    $('messageBody').setCustomValidity('');
    busy(form, true);
    try {
      await window.APIService.sendResidentialMessage(orderId, body);
      form.reset();
      $('messageCharacterCount').textContent = '0';
      await loadMessages();
      toast('Message sent, added to the order notes, and shared with SMPLfix.');
    } catch (error) { toast(error.message || 'Message could not be sent.'); }
    finally { busy(form, false); }
  }

  function renderNotifications(payload) { featureState.notifications = payload.data || []; $('notificationBadge').textContent = payload.unreadCount || 0; $('notificationBadge').hidden = !payload.unreadCount; $('notificationBadge').setAttribute('aria-label', `${payload.unreadCount || 0} unread notifications`); $('notificationList').innerHTML = featureState.notifications.length ? featureState.notifications.map(item => `<article class="transaction-card${item.isRead ? '' : ' is-unread'}"><div><small>${escapeHtml(item.type)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span></div><div class="transaction-actions">${item.isRead ? '<span>Read</span>' : `<button class="button" type="button" data-read-notification="${escapeHtml(item.id)}">Mark read</button>`}</div></article>`).join('') : empty('You are all caught up', 'Important updates will appear here.'); }
  async function loadNotifications() { renderNotifications(await window.APIService.getResidentialNotifications()); }

  async function loadReferrals() { featureState.referrals = await window.APIService.getResidentialReferrals(); $('referralUrl').textContent = `${location.origin}${featureState.referrals.referralUrl}`; const totals = featureState.referrals.totals; $('referralSummary').innerHTML = `<article class="metric-card"><div><small>Invited</small><strong>${totals.invited}</strong></div></article><article class="metric-card"><div><small>Joined</small><strong>${totals.joined}</strong></div></article><article class="metric-card"><div><small>Rewards earned</small><strong>${money(totals.rewards)}</strong></div></article>`; $('referralHistory').innerHTML = featureState.referrals.history.length ? featureState.referrals.history.map(item => `<article class="record-item"><div><strong>${escapeHtml(item.displayName || 'Referral')}</strong><span>${escapeHtml(item.status)} · ${money(item.rewardAmount)}</span></div></article>`).join('') : empty('No referrals yet', 'Copy your personal link to get started.'); }

  const preferenceLabels = { portal: 'Portal notifications', email: 'Email notifications', upcomingVisits: 'Upcoming visit reminders', jobUpdates: 'Job status updates', invoices: 'Invoice and receipt alerts', seasonalRecommendations: 'Arizona seasonal recommendations' };
  function updateProfileCompletion() {
    const fields = ['accountFirstName', 'accountLastName', 'accountPhone', 'accountAddressLine1', 'accountCity', 'accountState', 'accountPostalCode'];
    const completed = fields.filter(id => $(id)?.value.trim()).length;
    const percentage = Math.round((completed / fields.length) * 100);
    const badge = $('profileCompletionBadge');
    if (!badge) return;
    badge.style.setProperty('--profile-completion', `${percentage}%`);
    badge.innerHTML = `<strong>${percentage}%</strong><span>complete</span>`;
    badge.setAttribute('aria-label', `Profile ${percentage}% complete`);
  }
  function renderAgentAccess() {
    $('agentAccessList').innerHTML = featureState.agentAccess.length ? featureState.agentAccess.map(item => { const transaction = item.transaction || {}; const agent = item.agent || {}; return `<article class="transaction-card"><div><small>${escapeHtml(transaction.status || 'active')} · access ends ${escapeHtml(date(transaction.accessEndsAt))}</small><strong>${escapeHtml(agent.displayName || 'Real estate agent')}</strong><span>${escapeHtml(agent.brokerageName || transaction.label || '')} · ${escapeHtml(transaction.property?.label || 'Property')}</span><small>Cannot approve estimates or manage payment.</small></div><div class="transaction-actions">${item.capabilities?.canRevoke ? `<button class="button" type="button" data-revoke-agent="${escapeHtml(transaction.id)}">Revoke access</button>` : `<span>${escapeHtml(transaction.status || 'ended')}</span>`}</div></article>`; }).join('') : empty('No agent access', 'Active and recently ended real estate transaction access will appear here.');
  }
  function populateAccountForm(account) {
    $('accountFirstName').value = account.firstName || '';
    $('accountLastName').value = account.lastName || '';
    $('accountEmail').value = account.email || '';
    $('accountPreferredName').value = account.preferredName || '';
    $('accountPhone').value = account.phone || '';
    $('accountAddressLine1').value = account.addressLine1 || '';
    $('accountCity').value = account.city || '';
    $('accountState').value = account.state || '';
    $('accountPostalCode').value = account.postalCode || '';
    updateProfileCompletion();
  }
  async function loadAccount() {
    const [account, access] = await Promise.all([window.APIService.getResidentialAccount(), window.APIService.getResidentialAgentAccess()]);
    featureState.account = account;
    featureState.agentAccess = access.data || [];
    populateAccountForm(account.account);
    $('notificationPreferences').innerHTML = Object.entries(preferenceLabels).map(([key, label]) => `<label class="check-label"><input type="checkbox" data-preference="${key}"${featureState.account.notificationPreferences[key] ? ' checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('');
    renderAgentAccess();
  }
  async function saveAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    $('accountFormError').hidden = true;
    busy(form, true);
    try {
      const response = await window.APIService.updateResidentialAccount({
        firstName: $('accountFirstName').value,
        lastName: $('accountLastName').value,
        preferredName: $('accountPreferredName').value,
        phone: $('accountPhone').value,
        addressLine1: $('accountAddressLine1').value,
        city: $('accountCity').value,
        state: $('accountState').value,
        postalCode: $('accountPostalCode').value,
        notificationPreferences: Object.fromEntries([...form.querySelectorAll('[data-preference]')].map(input => [input.dataset.preference, input.checked]))
      });
      featureState.account = response;
      populateAccountForm(response.account);
      window.ResidentialPortal?.updateUser?.(response.account);
      toast('Profile saved and synced with the SMPLfix CRM.');
    } catch (error) {
      $('accountFormError').textContent = error.message || 'Profile could not be saved.';
      $('accountFormError').hidden = false;
    } finally { busy(form, false); }
  }

  const loaders = { autopilot: loadAutopilot, passport: loadPassport, utilities: loadUtilities, messages: loadMessages, notifications: loadNotifications, referrals: loadReferrals, account: loadAccount };
  async function loadRoute(route) { if (!loaders[route]) return; try { await loaders[route](); } catch (error) { toast(error.message || `${route} could not be loaded.`); } }

  document.addEventListener('DOMContentLoaded', () => {
    $('autopilotForm').addEventListener('submit', saveAutopilot);
    $('autopilotForm').addEventListener('change', updateAutopilotSummary);
    $('autoApprovalThreshold').addEventListener('input', updateAutopilotSummary);
    $('passportEntryForm').addEventListener('submit', addPassportEntry);
    $('passportDocumentForm').addEventListener('submit', uploadPassport);
    $('passportDocumentFile').addEventListener('change', updatePassportFile);
    $('passportEntryFilter').addEventListener('change', event => { featureState.passportEntryFilter = event.currentTarget.value; renderPassport(); });
    $('passportDocumentFilter').addEventListener('change', event => { featureState.passportDocumentFilter = event.currentTarget.value; renderPassport(); });
    $('utilityForm').addEventListener('submit', addUtility);
    $('utilityType').addEventListener('change', updateUtilityUnit);
    setUtilityDateDefaults();
    $('messageOrder').addEventListener('change', loadMessages);
    $('messageForm').addEventListener('submit', sendMessage);
    $('messageBody').addEventListener('input', event => { event.currentTarget.setCustomValidity(''); $('messageCharacterCount').textContent = String(event.currentTarget.value.length); });
    $('accountForm').addEventListener('submit', saveAccount);
    $('accountForm').addEventListener('input', updateProfileCompletion);
    $('openNotificationsButton').addEventListener('click', () => { location.hash = 'notifications'; });
    $('copyReferralButton').addEventListener('click', async () => { await navigator.clipboard.writeText($('referralUrl').textContent); toast('Referral link copied.'); });
    document.addEventListener('click', async event => {
      const utilityFilter = event.target.closest('[data-utility-filter]'); if (utilityFilter) { featureState.utilityFilter = utilityFilter.dataset.utilityFilter; renderUtilities(); }
      const seasonal = event.target.closest('[data-seasonal-service]'); if (seasonal) { const input = document.querySelector(`[data-service-key="${CSS.escape(seasonal.dataset.seasonalService)}"]`); if (input) { input.checked = true; $('autopilotEnabled').checked = true; updateAutopilotSummary(); input.focus(); toast('Service added. Save your settings to confirm.'); } }
      const read = event.target.closest('[data-read-notification]'); if (read) { await window.APIService.readResidentialNotification(read.dataset.readNotification); await loadNotifications(); }
      const revoke = event.target.closest('[data-revoke-agent]'); if (revoke) { const reason = window.prompt('Why are you revoking this agent’s property access?'); if (!reason) return; revoke.disabled = true; try { await window.APIService.revokeResidentialAgentAccess(revoke.dataset.revokeAgent, reason); toast('Agent access revoked immediately.'); await loadAccount(); } catch (error) { toast(error.message || 'Agent access could not be revoked.'); revoke.disabled = false; } }
    });
    window.addEventListener('residential:route', event => loadRoute(event.detail.route));
    window.addEventListener('residential:loaded', () => { loadNotifications(); loadRoute(window.ResidentialPortal.state.route); });
    window.addEventListener('residential:property-changed', event => loadRoute(event.detail.route));
  });

  window.ResidentialFeatures = { loadRoute, __test: { escapeHtml, preferenceLabels } };
})();
