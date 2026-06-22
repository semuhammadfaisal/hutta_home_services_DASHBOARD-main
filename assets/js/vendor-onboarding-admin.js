(() => {
  const escapeHtml = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const request = (endpoint, options = {}) => window.APIService.request(`/vendor-onboarding${endpoint}`, options);

  window.setVendorEntryMode = function(mode, resetResult = false) {
    const manual = mode !== 'invite';
    document.querySelectorAll('[data-vendor-mode]').forEach(button => button.classList.toggle('active', button.dataset.vendorMode === mode));
    document.getElementById('vendorForm').hidden = !manual;
    document.getElementById('vendorInviteForm').hidden = manual;
    document.getElementById('vendorManualSaveButton').hidden = !manual;
    document.getElementById('vendorInviteSendButton').hidden = manual;
    document.getElementById('vendorModalTitle').textContent = manual ? 'Add New Vendor' : 'Invite Vendor';
    if (resetResult) document.getElementById('vendorInviteResult').hidden = true;
  };

  window.prepareVendorEditMode = function() {
    window.setVendorEntryMode('manual');
    document.getElementById('vendorEntryModeSwitch').hidden = true;
    document.getElementById('vendorModalTitle').textContent = 'Edit Vendor';
  };

  async function copyText(text) {
    await navigator.clipboard.writeText(text);
    window.showToast?.('Secure invitation link copied.', 'success');
  }

  window.sendVendorInvitation = async function() {
    const form = document.getElementById('vendorInviteForm');
    if (!form.reportValidity()) return;
    const button = document.getElementById('vendorInviteSendButton');
    const categorySelect = document.getElementById('vendorInviteCategory');
    button.disabled = true;
    try {
      const payload = await request('/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('vendorInviteEmail').value,
          companyName: document.getElementById('vendorInviteCompanyName').value,
          category: categorySelect.value,
          categoryLabel: categorySelect.selectedOptions[0]?.textContent,
          personalMessage: document.getElementById('vendorInviteMessage').value
        })
      });
      const result = document.getElementById('vendorInviteResult');
      result.replaceChildren();
      const text = document.createElement('span');
      text.textContent = payload.invitation.status === 'delivery_failed' ? 'Invitation saved, but email delivery failed.' : 'Secure invitation sent successfully.';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy Link';
      copy.addEventListener('click', () => copyText(payload.inviteUrl));
      result.append(text, copy);
      result.hidden = false;
      form.reset();
      await window.refreshVendorInvitations();
      window.showToast?.(text.textContent, payload.invitation.status === 'delivery_failed' ? 'warning' : 'success');
    } catch (error) {
      window.showToast?.('Failed to send invitation: ' + error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };

  function invitationActions(invitation) {
    if (['submitted','revoked'].includes(invitation.displayStatus)) return '<span class="table-muted">No actions</span>';
    return `<div class="invitation-actions">
      <button type="button" onclick="resendVendorInvitation('${invitation._id}')" title="Resend email"><i class="fas fa-paper-plane"></i></button>
      <button type="button" onclick="copyNewVendorInviteLink('${invitation._id}')" title="Generate and copy a new secure link"><i class="fas fa-link"></i></button>
      <button type="button" onclick="revokeVendorInvitation('${invitation._id}')" title="Revoke"><i class="fas fa-ban"></i></button>
    </div>`;
  }

  window.refreshVendorInvitations = async function() {
    const body = document.getElementById('vendorInvitationsTableBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6" class="table-muted">Loading invitations…</td></tr>';
    try {
      const invitations = await request('/invitations');
      body.innerHTML = invitations.length ? invitations.map(invitation => `
        <tr>
          <td>${escapeHtml(invitation.companyName || invitation.vendor?.name || '—')}</td>
          <td>${escapeHtml(invitation.email)}</td>
          <td>${escapeHtml(invitation.categoryLabel || invitation.category)}</td>
          <td><span class="invite-status ${escapeHtml(invitation.displayStatus)}">${escapeHtml(invitation.displayStatus.replace(/_/g,' '))}</span></td>
          <td>${new Date(invitation.expiresAt).toLocaleDateString()}</td>
          <td>${invitationActions(invitation)}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="table-muted">No invitations yet.</td></tr>';
    } catch (error) {
      body.innerHTML = `<tr><td colspan="6" class="table-muted">${escapeHtml(error.message)}</td></tr>`;
    }
  };

  window.refreshVendorEmailStatus = async function() {
    const banner = document.getElementById('vendorEmailDeliveryWarning');
    if (!banner) return;
    try {
      const status = await request('/email-status');
      if (!status.warning) {
        banner.hidden = true;
        banner.replaceChildren();
        return;
      }
      const heading = document.createElement('strong');
      heading.textContent = status.provider === 'gmail' ? 'Temporary Gmail delivery' : 'Email delivery unavailable';
      const message = document.createElement('span');
      message.textContent = `${status.warning} Secure links use ${status.publicAppUrl}.`;
      banner.replaceChildren(heading, message);
      banner.hidden = false;
    } catch (_error) {
      banner.hidden = true;
    }
  };

  window.resendVendorInvitation = async function(id) {
    try {
      const payload = await request(`/invitations/${id}/resend`, { method: 'POST', body: '{}' });
      await window.refreshVendorInvitations();
      window.showToast?.(payload.invitation.status === 'delivery_failed' ? 'Link refreshed, but email delivery failed.' : 'Invitation resent.', payload.invitation.status === 'delivery_failed' ? 'warning' : 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  window.copyNewVendorInviteLink = async function(id) {
    if (!confirm('Generate a new link? The previous invitation link will stop working.')) return;
    try {
      const payload = await request(`/invitations/${id}/rotate-link`, { method: 'POST', body: '{}' });
      await copyText(payload.inviteUrl);
      await window.refreshVendorInvitations();
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  window.revokeVendorInvitation = async function(id) {
    if (!confirm('Revoke this invitation link?')) return;
    try {
      await request(`/invitations/${id}/revoke`, { method: 'POST', body: '{}' });
      await window.refreshVendorInvitations();
      window.showToast?.('Invitation revoked.', 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  const complianceFields = [
    ['huttasContract','Contract'],['w9','W-9'],['certificateOfInsurance','Insurance'],
    ['workersCompInsurance','Workers Comp'],['huttasAdditionalInsured','Additional Insured']
  ];

  window.renderVendorOnboardingReview = function(vendor) {
    const banner = document.getElementById('vendorOnboardingReviewBanner');
    if (!banner) return;
    if (vendor.onboardingSource !== 'invitation' || (vendor.onboardingStatus === 'approved' && vendor.onboardingEmailStatus !== 'failed')) {
      banner.hidden = true;
      banner.replaceChildren();
      return;
    }
    const activeTypes = new Set((vendor.documents || []).filter(doc => doc.status !== 'archived').map(doc => doc.complianceDocumentType));
    const history = (vendor.onboardingHistory || []).slice().reverse();
    const finalDecision = ['approved','rejected'].includes(vendor.onboardingStatus);
    const actions = finalDecision
      ? vendor.onboardingEmailStatus === 'failed' ? `<button class="changes" onclick="retryVendorDecisionEmail('${vendor._id}')">Retry Confirmation Email</button>` : ''
      : `<button class="approve" onclick="decideVendorOnboarding('${vendor._id}','approve')">Approve</button><button class="changes" onclick="decideVendorOnboarding('${vendor._id}','request_changes')">Request Changes</button><button class="reject" onclick="decideVendorOnboarding('${vendor._id}','reject')">Reject</button>`;
    banner.innerHTML = `<div class="vendor-review-banner-head"><div><h2>Vendor Onboarding: ${escapeHtml(vendor.onboardingStatus.replace(/_/g,' '))}</h2><p>${vendor.onboardingEmailStatus === 'failed' ? `Email delivery failed: ${escapeHtml(vendor.onboardingEmailError || 'Unknown delivery error')}` : vendor.requestedCategory ? `Requested category: <strong>${escapeHtml(vendor.requestedCategory)}</strong>` : 'Assigned category confirmed.'}</p></div><div class="vendor-review-actions">${actions}</div></div><div class="compliance-checklist">${complianceFields.map(([key,label]) => `<span class="${activeTypes.has(key) ? '' : 'missing'}">${activeTypes.has(key) ? '✓' : 'Missing'} ${label}</span>`).join('')}</div>${history.length ? `<details class="vendor-review-history"><summary>Onboarding history (${history.length})</summary>${history.map(item => `<div><strong>${escapeHtml(String(item.action || '').replace(/_/g,' '))}</strong><span>${escapeHtml(item.message || '')}</span><small>${item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</small></div>`).join('')}</details>` : ''}`;
  };

  window.decideVendorOnboarding = async function(vendorId, action) {
    const labels = { approve: 'Approve this vendor?', request_changes: 'What changes should the vendor make?', reject: 'Why is this application being rejected?' };
    let message = '';
    if (action === 'approve') {
      if (!confirm(labels[action])) return;
    } else {
      message = prompt(labels[action], '') ?? '';
      if (!message.trim()) return window.showToast?.('A message is required.', 'warning');
    }
    try {
      const payload = await request(`/vendors/${vendorId}/decision`, { method: 'POST', body: JSON.stringify({ action, message }) });
      if (payload.inviteUrl) await copyText(payload.inviteUrl).catch(() => {});
      window.APIService.clearCache();
      await refreshVendors();
      await showVendorDetail(vendorId);
      await window.refreshVendorInvitations();
      window.showToast?.(`Vendor ${action.replace('_',' ')} completed.`, 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  window.revealVendorTaxId = async function(vendorId) {
    if (!confirm('Reveal this sensitive Tax ID? This action will be recorded in the security audit log.')) return;
    try {
      const payload = await request(`/vendors/${vendorId}/tax-id`);
      alert(`Vendor Tax ID: ${payload.taxId}\n\nThis access has been audited.`);
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  window.retryVendorDecisionEmail = async function(vendorId) {
    try {
      await request(`/vendors/${vendorId}/retry-email`, { method: 'POST', body: '{}' });
      window.APIService.clearCache();
      await showVendorDetail(vendorId);
      window.showToast?.('Confirmation email sent.', 'success');
    } catch (error) { window.showToast?.(error.message, 'error'); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.refreshVendorInvitations();
    window.refreshVendorEmailStatus();
  });
})();
