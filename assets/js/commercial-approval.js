window.chooseCommercialOrganization = async function () {
  const response = await window.APIService.request('/users/commercial-organizations');
  const organizations = response.data || [];
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'detail-dialog commercial-approval-dialog';
    dialog.setAttribute('aria-label', 'Approve commercial organization access');
    const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    dialog.innerHTML = `<form class="dialog-body form-stack"><h2>Commercial account access</h2><p>Link only the organization this user is authorized to access. This does not create properties or agreements.</p><label>Organization<select name="organization"><option value="">Keep existing active membership</option>${organizations.map(item => `<option value="${esc(item._id)}">${esc(item.name)}</option>`).join('')}<option value="new">Create a new organization</option></select></label><label>New organization name<input name="name" maxlength="180"></label><label>Initial role<select name="role"><option value="viewer">Viewer</option><option value="operations_manager">Operations manager</option><option value="billing_admin">Billing administrator</option><option value="organization_admin">Organization administrator</option></select></label><p role="alert" hidden></p><button type="submit" class="btn-primary">Approve access</button><button type="button" class="btn-secondary">Cancel</button></form>`;
    document.body.append(dialog); const form = dialog.querySelector('form');
    const close = value => { dialog.close(); dialog.remove(); resolve(value); };
    form.querySelector('[type="button"]').onclick = () => close(null);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(null); });
    form.onsubmit = event => { event.preventDefault(); const chosen = form.elements.organization.value; if (chosen === 'new' && form.elements.name.value.trim().length < 2) { const alert = form.querySelector('[role="alert"]'); alert.textContent = 'Enter the new organization name.'; alert.hidden = false; return; } close({ ...(chosen === 'new' ? { newOrganizationName: form.elements.name.value.trim() } : chosen ? { organizationId: chosen } : {}), commercialMembershipRole: form.elements.role.value }); };
    dialog.showModal();
  });
};
