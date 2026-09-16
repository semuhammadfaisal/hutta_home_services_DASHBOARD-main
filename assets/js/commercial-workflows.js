(function () {
  'use strict';
  const core = window.CommercialPortal, api = window.APIService;
  const esc = core.escapeHtml;
  const dialog = document.createElement('dialog');
  dialog.className = 'detail-dialog commercial-workflow-dialog';
  dialog.setAttribute('aria-labelledby', 'commercialWorkflowTitle');
  dialog.innerHTML = '<div class="dialog-header"><h2 id="commercialWorkflowTitle"></h2><button type="button" class="icon-button" aria-label="Close dialog">×</button></div><div class="dialog-body"></div>';
  document.body.append(dialog);
  const body = dialog.querySelector('.dialog-body');
  dialog.querySelector('button').onclick = () => dialog.close();
  function open(title) { dialog.querySelector('h2').textContent = title; body.innerHTML = '<p role="status">Loading…</p>'; if (!dialog.open) dialog.showModal(); }
  function error(message) { body.innerHTML = `<p role="alert">${esc(message)}</p>`; }
  async function estimate(orderId, quoteId) {
    open('Review estimate');
    try {
      const response = await api.request(`/commercial/orders/${encodeURIComponent(orderId)}/estimates/${encodeURIComponent(quoteId)}`);
      const quote = response.estimate;
      body.innerHTML = `<p class="eyebrow">${esc(quote.quoteReference)}</p><h3>${esc(quote.service)} · ${esc(core.money(quote.amount))}</h3><p>${esc(quote.scopeOfWork)}</p><p>Contractor: ${esc(quote.contractor?.name || 'Pending')} ${esc(quote.contractor?.rocNumber || '')}</p><h3>Terms</h3><p class="preserve-lines">${esc(quote.terms || 'No additional terms')}</p><p>${esc(quote.exclusions || '')}</p><p>Valid until ${esc(core.date(quote.validUntil))}</p>${quote.canApprove ? `<form class="form-stack"><label>Your full name<input name="typedName" required minlength="2" maxlength="160" autocomplete="name"></label><label>Decision<select name="action"><option value="approve">Approve estimate</option><option value="request_changes">Request changes</option></select></label><label>Requested changes<textarea name="changeRequestMessage" maxlength="3000"></textarea></label><label class="workflow-check"><input name="termsAccepted" type="checkbox"> ${esc(quote.consentText)}</label><p role="alert" hidden></p><button class="primary-button" type="submit">Submit decision</button></form>` : '<p>This estimate is read-only or no longer available for approval.</p>'}`;
      const form = body.querySelector('form');
      if (form) {
        const validateDecision = () => {
          form.elements.termsAccepted.required = form.elements.action.value === 'approve';
          form.elements.changeRequestMessage.required = form.elements.action.value === 'request_changes';
          form.elements.changeRequestMessage.minLength = form.elements.action.value === 'request_changes' ? 10 : 0;
        };
        form.elements.action.onchange = validateDecision; validateDecision();
      }
      if (form) form.onsubmit = async event => {
        event.preventDefault(); const button = form.querySelector('[type="submit"]'); if (button.disabled) return;
        const fields = new FormData(form), action = fields.get('action');
        const payload = { action, typedName: fields.get('typedName'), termsAccepted: fields.has('termsAccepted'), changeRequestMessage: fields.get('changeRequestMessage') };
        const alert = form.querySelector('[role="alert"]'); alert.hidden = true; button.disabled = true;
        try { await api.decideCommercialEstimate(orderId, quoteId, payload); dialog.close(); core.showToast('Estimate decision saved.'); api.clearCache(); await core.loadScope(); }
        catch (err) { alert.textContent = err.message; alert.hidden = false; }
        finally { button.disabled = false; }
      };
    } catch (err) { error(err.message); }
  }
  async function job(orderId) {
    open('Job details and completion');
    try {
      const [work, result] = await Promise.all([api.request(`/commercial/orders/${encodeURIComponent(orderId)}`), api.request(`/commercial/orders/${encodeURIComponent(orderId)}/completion`)]);
      const order = work.order, completions = result.completions || (result.completion ? [result.completion] : []);
      const photos = (phase, items) => `<h3>${phase} photos</h3><div class="completion-photo-grid">${items.map(item => `<a href="${esc(item.url)}" target="_blank" rel="noopener"><img src="${esc(item.url)}" alt="${esc(item.name || `${phase} completion photo`)}" loading="lazy"></a>`).join('') || '<p>No photos recorded.</p>'}</div>`;
      body.innerHTML = `<h3>${esc(order.service)}</h3><p>${esc(order.description || '')}</p><p>Status: ${esc(order.workflowStatus || order.status)} · Scheduled: ${esc(core.date(order.scheduledStart))}</p>${completions.length ? completions.map(completion => `<section class="detail-section"><h3>Service notes · ${esc(completion.reference)}</h3><p class="preserve-lines">${esc(completion.serviceNotes || 'No service notes recorded.')}</p><p>Completed ${esc(core.date(completion.completedAt))}</p>${photos('Before', completion.beforePhotos)}${photos('After', completion.afterPhotos)}</section>`).join('') : '<p>No completed visit is recorded yet.</p>'}`;
    } catch (err) { error(err.message); }
  }
  async function access(userId) {
    open('Edit account-user access');
    const state = core.state, member = state.users.find(item => item.user?.id === userId);
    if (!member || userId === state.profile.user.id) return error('You cannot edit your own access.');
    const org = state.profile.organizations.find(item => item.id === state.organizationId);
    const properties = (state.dashboard?.properties || []).filter(item => item.capabilities?.canManageUsers);
    const scopes = org?.membership?.permissions?.manageUsers ? [{ type: 'organization', id: org.id, name: org.name }] : [];
    scopes.push(...properties.map(item => ({ type: 'property', id: item.propertyId, name: item.label })));
    scopes.push(...state.portfolios.filter(item => properties.some(property => property.portfolioId === item.id)).map(item => ({ type: 'portfolio', id: item.id, name: item.name })));
    if (!scopes.length) return error('You do not have user-management permission in this scope.');
    const permissions = ['view', 'requestService', 'approveEstimates', 'viewInvoices', 'makePayments', 'viewReports', 'manageUsers'];
    body.innerHTML = `<p>${esc(member.user.displayName)}</p><form class="form-stack"><label>Scope<select name="scope">${scopes.map((item, i) => `<option value="${i}">${esc(item.type)} — ${esc(item.name)}</option>`).join('')}</select></label><label>Role<select name="role"></select></label><fieldset><legend>Permissions</legend>${permissions.map(key => `<label class="workflow-check"><input type="checkbox" name="${key}" ${key === 'view' ? 'checked disabled' : ''}>${esc(key.replace(/([A-Z])/g, ' $1'))}</label>`).join('')}</fieldset><p role="alert" hidden></p><button type="submit" class="primary-button">Save access</button></form>`;
    const form = body.querySelector('form');
    const refresh = () => {
      const scope = scopes[Number(form.elements.scope.value)];
      const grant = scope.type === 'organization' ? member : scope.type === 'portfolio' ? member.portfolioRoles.find(item => item.portfolioId === scope.id) : member.propertyRoles.find(item => item.propertyId === scope.id);
      const roles = scope.type === 'organization' ? ['organization_admin', 'billing_admin', 'operations_manager', 'viewer'] : scope.type === 'portfolio' ? ['portfolio_admin', 'approver', 'billing', 'coordinator', 'viewer'] : ['property_admin', 'approver', 'billing', 'coordinator', 'viewer'];
      form.elements.role.innerHTML = roles.map(role => `<option value="${role}">${esc(role.replaceAll('_', ' '))}</option>`).join('');
      form.elements.role.value = roles.includes(grant?.role) ? grant.role : 'viewer';
      permissions.filter(key => key !== 'view').forEach(key => { form.elements[key].checked = grant?.permissions?.[key] === true; });
    };
    form.elements.scope.onchange = refresh; refresh();
    form.onsubmit = async event => {
      event.preventDefault(); const button = form.querySelector('[type="submit"]'); if (button.disabled) return;
      const scope = scopes[Number(form.elements.scope.value)];
      const selected = Object.fromEntries(permissions.map(key => [key, key === 'view' || form.elements[key].checked]));
      button.disabled = true;
      try { await api.updateCommercialUserAccess(state.organizationId, userId, { scopeType: scope.type, scopeId: scope.id, role: form.elements.role.value, permissions: selected }); dialog.close(); api.clearCache(); await core.loadScope(); core.showToast('User access updated.'); }
      catch (err) { const alert = form.querySelector('[role="alert"]'); alert.textContent = err.message; alert.hidden = false; }
      finally { button.disabled = false; }
    };
  }
  document.addEventListener('click', event => {
    const review = event.target.closest('[data-estimate-order]'); if (review) estimate(review.dataset.estimateOrder, review.dataset.estimateId);
    const order = event.target.closest('[data-order-id]'); if (order) job(order.dataset.orderId);
    const edit = event.target.closest('[data-edit-user-id]'); if (edit) access(edit.dataset.editUserId);
  });
})();
