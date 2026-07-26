(() => {
    let orders = [];
    let activeOrderId = '';
    let activeWorkspace = null;
    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const date = value => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
    const status = value => String(value || '').replaceAll('_', ' ');
    const documentUrl = photo => photo?.url || '#';
    const previewUrls = new Set();

    function clearPreviewUrls() {
        previewUrls.forEach(url => URL.revokeObjectURL(url));
        previewUrls.clear();
    }

    function setupUploadPreview(inputId, label) {
        const input = $(inputId);
        if (!input) return;
        let mount = input.parentElement.querySelector('.closeout-upload-preview');
        let summary = input.parentElement.querySelector('.closeout-upload-summary');
        if (!summary) {
            summary = document.createElement('div');
            summary.className = 'closeout-upload-summary';
            input.after(summary);
        }
        if (!mount) {
            mount = document.createElement('div');
            mount.className = 'closeout-upload-preview';
            summary.after(mount);
        }
        const render = () => {
            [...mount.querySelectorAll('img')].forEach(image => {
                if (image.src.startsWith('blob:')) {
                    URL.revokeObjectURL(image.src);
                    previewUrls.delete(image.src);
                }
            });
            const files = [...input.files];
            summary.innerHTML = `<span>${files.length} of 10 ${esc(label.toLowerCase())} selected</span><span>${files.reduce((total, file) => total + file.size, 0) ? `${(files.reduce((total, file) => total + file.size, 0) / 1048576).toFixed(1)} MB` : 'No files'}</span>`;
            mount.innerHTML = files.map((file, index) => {
                const url = URL.createObjectURL(file);
                previewUrls.add(url);
                return `<article><img src="${esc(url)}" alt="${esc(label)} preview ${index + 1}"><span>${esc(file.name)}</span><button type="button" data-remove-upload="${index}" aria-label="Remove ${esc(file.name)}"><i class="fas fa-times"></i></button></article>`;
            }).join('');
            mount.querySelectorAll('[data-remove-upload]').forEach(button => {
                button.onclick = () => {
                    const transfer = new DataTransfer();
                    files.filter((_, index) => index !== Number(button.dataset.removeUpload)).forEach(file => transfer.items.add(file));
                    input.files = transfer.files;
                    render();
                };
            });
        };
        input.addEventListener('change', render);
        render();
        return render;
    }

    function completionState(order) {
        if (order.workflowStatus === 'closeout_issue_reported') return 'Issue reported';
        if (order.workflowStatus === 'awaiting_customer_closeout' || order.satisfactionStatus === 'pending') return 'Awaiting customer closeout';
        if (['satisfied', 'issue_resolved'].includes(order.satisfactionStatus)) return status(order.satisfactionStatus);
        if (order.workflowStatus === 'completed') return 'Completed';
        return order.completion?.tokenSentAt ? 'Awaiting vendor completion' : 'Ready for completion';
    }

    function statePresentation(order) {
        if (order.workflowStatus === 'closeout_issue_reported') return { tone: 'error', icon: 'fa-exclamation-triangle', action: 'Resolve Issue' };
        if (order.workflowStatus === 'awaiting_customer_closeout' || order.satisfactionStatus === 'pending') return { tone: 'warning', icon: 'fa-comment-dots', action: 'Manage Closeout' };
        if (['satisfied', 'issue_resolved'].includes(order.satisfactionStatus)) return { tone: 'success', icon: 'fa-check-circle', action: 'View Closeout' };
        if (order.workflowStatus === 'completed') return { tone: 'success', icon: 'fa-check-circle', action: 'View Closeout' };
        if (order.completion?.tokenSentAt) return { tone: 'warning', icon: 'fa-clock', action: 'Manage Completion' };
        return { tone: 'active', icon: 'fa-clipboard-check', action: 'Complete Closeout' };
    }

    function renderOrders() {
        const ready = orders.filter(order => order.workflowStatus === 'scheduled').length;
        const feedback = orders.filter(order => order.workflowStatus === 'awaiting_customer_closeout' || order.satisfactionStatus === 'pending').length;
        const issues = orders.filter(order => order.satisfactionStatus === 'issue_reported').length;
        const completed = orders.filter(order => order.workflowStatus === 'completed').length;
        $('closeoutReadyCount').textContent = ready;
        $('closeoutFeedbackCount').textContent = feedback;
        $('closeoutIssueCount').textContent = issues;
        $('closeoutCompletedCount').textContent = completed;
        const list = $('closeoutOrderList');
        if (!orders.length) {
            list.innerHTML = '<div class="workflow-empty"><i class="fas fa-clipboard-check"></i><p>No scheduled or completed Orders are available for closeout.</p></div>';
            return;
        }
        list.innerHTML = orders.map(order => {
            const presentation = statePresentation(order);
            return `
            <article class="closeout-order-card ${presentation.tone}">
                <div class="closeout-card-identity">
                    <span class="closeout-card-icon"><i class="fas ${presentation.icon}"></i></span>
                    <div>
                        <span class="closeout-reference">${esc(order.requestReference || order.orderId)}</span>
                        <h3>${esc(order.customer?.name || 'Customer')}</h3>
                        <p>${esc(order.service || 'Service')}</p>
                    </div>
                </div>
                <div class="closeout-card-state">
                    <small>Current closeout state</small>
                    <span class="workflow-chip ${presentation.tone === 'active' ? '' : presentation.tone}">${esc(completionState(order))}</span>
                    <small>${order.completion?.completionReference ? esc(order.completion.completionReference) : 'Completion not yet recorded'}</small>
                </div>
                <div class="closeout-card-meta">
                    <span><small>Vendor</small><strong>${esc(order.vendor?.name || 'Vendor')}</strong></span>
                    <time datetime="${esc(order.updatedAt || '')}"><small>Last updated</small><strong>${date(order.updatedAt)}</strong></time>
                </div>
                <button class="btn-primary closeout-card-action" type="button" data-closeout-open="${esc(order._id)}">${presentation.action} <i class="fas fa-arrow-right"></i></button>
            </article>`;
        }).join('');
        list.querySelectorAll('[data-closeout-open]').forEach(button => {
            button.onclick = () => openCloseoutWorkspace(button.dataset.closeoutOpen);
        });
    }

    async function loadCloseout() {
        const list = $('closeoutOrderList');
        if (list) list.innerHTML = '<div class="workflow-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading completion records&hellip;</p></div>';
        try {
            orders = await window.APIService.getCloseoutOrders();
            if ($('closeoutSettingsButton')) {
                $('closeoutSettingsButton').hidden = window.AuthSession?.user?.role !== 'admin';
            }
            renderOrders();
        } catch (error) {
            if (list) list.innerHTML = `<div class="workflow-empty"><i class="fas fa-exclamation-circle"></i><p>${esc(error.message)}</p><button class="btn-secondary" onclick="loadCloseout()">Retry</button></div>`;
        }
    }

    function linkActions(data) {
        const completion = data.completion;
        if (completion?.status === 'completed') return '';
        if (!completion?.tokenSentAt) return '<button class="btn-primary" type="button" data-closeout-action="create">Send Completion Link</button>';
        return `
            <button class="btn-primary" type="button" data-closeout-action="resend">Resend Link</button>
            <button class="btn-secondary" type="button" data-closeout-action="rotate">Rotate Link</button>
            <button class="btn-secondary" type="button" data-closeout-action="revoke">Revoke</button>`;
    }

    function facts(entries) {
        return `<dl class="closeout-facts">${entries.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
    }

    function photoGroup(label, photos) {
        return `<div class="closeout-photo-group"><h4>${esc(label)} (${photos.length})</h4><div class="closeout-photo-grid">${photos.length
            ? photos.map(photo => `<a class="closeout-photo" href="${esc(documentUrl(photo))}" target="_blank" rel="noopener"><img src="${esc(documentUrl(photo))}" alt="${esc(label)} evidence"><span>${esc(photo.name || 'Photo')}</span></a>`).join('')
            : '<p>No photos.</p>'}</div></div>`;
    }

    function renderEmails(messages) {
        const target = $('closeoutEmails');
        if (!messages.length) {
            target.innerHTML = '<div class="closeout-empty-mini"><i class="far fa-envelope"></i><strong>No email activity yet</strong><p>Closeout messages will appear here after completion.</p></div>';
            return;
        }
        target.innerHTML = messages.map(message => `
            <div class="closeout-email-row">
                <div><strong>${esc(status(message.type))}</strong><small>${esc(status(message.status))} · ${date(message.sentAt || message.nextAttemptAt || message.createdAt)}</small></div>
                ${message.status === 'permanently_failed' ? `<button class="btn-secondary" type="button" data-email-retry="${esc(message._id)}">Retry</button>` : ''}
            </div>`).join('');
        target.querySelectorAll('[data-email-retry]').forEach(button => button.onclick = async () => {
            button.disabled = true;
            try {
                await window.APIService.retryCloseoutEmail(button.dataset.emailRetry);
                window.showToast?.('Email queued for retry.');
                await refreshWorkspace();
            } catch (error) {
                window.showToast?.(error.message, 'error');
                button.disabled = false;
            }
        });
    }

    function renderWorkspace(data) {
        activeWorkspace = data;
        const { order, completion, invoice, decision } = data;
        $('closeoutWorkspaceTitle').textContent = `${order.requestReference || order.orderId} · ${order.customer?.name || 'Customer'}`;
        $('closeoutWorkspaceSummary').textContent = `${order.service || 'Service'} · ${completionState(order)}`;
        $('closeoutWorkspace').dataset.closeoutState = order.workflowStatus || '';
        $('closeoutLinkStatus').textContent = completion?.tokenRevokedAt
            ? `Secure link revoked ${date(completion.tokenRevokedAt)}`
            : completion?.tokenSentAt
            ? `Secure link sent ${date(completion.tokenSentAt)}${completion.tokenExpiresAt ? ` · expires ${date(completion.tokenExpiresAt)}` : ''}`
            : completion?.status === 'completed' ? `Completion recorded ${date(completion.completedAt)}` : 'No completion link has been sent.';
        $('closeoutLinkActions').innerHTML = linkActions(data);
        $('closeoutLinkActions').querySelectorAll('[data-closeout-action]').forEach(button => button.onclick = () => runLinkAction(button.dataset.closeoutAction, button));
        $('closeoutJobSummary').innerHTML = facts([
            ['Customer', esc(order.customer?.name || '—')],
            ['Vendor', esc(order.vendor?.name || completion?.vendorSnapshot?.name || '—')],
            ['Service address', esc(order.customer?.address || completion?.customerSnapshot?.address || '—')],
            ['Approved scope', esc(completion?.jobSnapshot?.scopeOfWork || order.description || '—')],
            ['Confirmed start', date(order.scheduledStart)],
            ['Confirmed end', date(order.scheduledEnd)],
            ['Actual completion', completion?.completedAt ? `${date(completion.completedAt)}${order.scheduledStart && new Date(completion.completedAt) < new Date(order.scheduledStart) ? ' · completed early' : ''}` : 'Not completed']
        ]);
        const form = $('closeoutStaffForm');
        form.hidden = completion?.status === 'completed';
        const photos = [...(completion?.beforePhotos || []), ...(completion?.afterPhotos || [])];
        $('closeoutPhotosPanel').hidden = !photos.length;
        if (photos.length) $('closeoutPhotos').innerHTML = `${photoGroup('Before', completion.beforePhotos || [])}${photoGroup('After', completion.afterPhotos || [])}`;
        $('closeoutInvoicePanel').hidden = !invoice;
        if (invoice) {
            $('closeoutInvoice').innerHTML = facts([
                ['Invoice', esc(invoice.invoiceNumber)],
                ['Amount', money(invoice.amount)],
                ['Due', date(invoice.dueDate)],
                ['Payment', esc(status(invoice.paymentId?.status || 'pending'))]
            ]) + `<a class="btn-secondary" href="/api/closeout/invoices/${encodeURIComponent(invoice._id)}/pdf" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> Download Invoice</a>`;
        }
        $('closeoutSatisfactionPanel').hidden = !completion || completion.status !== 'completed';
        if (completion?.status === 'completed') {
            let timeline = `<div class="closeout-timeline"><div class="closeout-timeline-item success"><strong>Completion evidence recorded</strong><p>${date(completion.completedAt)} · ${esc(status(completion.source))}</p></div>`;
            const decisions = data.decisions || (decision ? [decision] : []);
            if (decisions.length) {
                [...decisions].reverse().forEach(item => {
                    timeline += `<div class="closeout-timeline-item ${item.decision === 'issue_reported' ? 'error' : 'success'}"><strong>Revision ${esc(item.closeoutRevision || 1)} · ${esc(status(item.decision))}</strong><p>${esc(item.typedName || 'Customer')} · ${date(item.decisionAt)}</p></div>`;
                    if (item.decision === 'issue_reported') {
                        timeline += `<div class="closeout-issue"><strong>Customer issue</strong><p>${esc(item.issueMessage)}</p>${item.resolvedAt
                            ? `<p><strong>Resolved:</strong> ${esc(item.resolutionNote)} · ${date(item.resolvedAt)}</p>`
                            : '<button class="btn-primary" type="button" data-resolve-issue>Resolve and Request Reconfirmation</button>'}</div>`;
                    }
                });
            } else {
                timeline += '<div class="closeout-timeline-item"><strong>Awaiting customer closeout</strong><p>The customer is reviewing completion evidence and the invoice.</p></div>';
            }
            timeline += '<div class="closeout-customer-link-actions"><button class="btn-secondary" type="button" data-customer-closeout-link="resend"><i class="fas fa-paper-plane"></i> Resend Customer Link</button><button class="btn-secondary" type="button" data-customer-closeout-link="rotate"><i class="fas fa-sync-alt"></i> Rotate Secure Link</button></div>';
            $('closeoutSatisfaction').innerHTML = `${timeline}</div>`;
            $('closeoutSatisfaction').querySelector('[data-resolve-issue]')?.addEventListener('click', resolveIssue);
            $('closeoutSatisfaction').querySelectorAll('[data-customer-closeout-link]').forEach(button => button.onclick = () => runCustomerCloseoutLink(button.dataset.customerCloseoutLink, button));
        }
        renderPaymentProofs(data.paymentProofs || []);
        renderEmails(data.emailMessages || []);
        $('closeoutWorkspace').hidden = false;
        $('closeoutOrderList').hidden = true;
    }

    function renderPaymentProofs(proofs) {
        const panel = $('closeoutPaymentProofPanel');
        panel.hidden = !proofs.length;
        if (!proofs.length) return;
        $('closeoutPaymentProofs').innerHTML = proofs.map(proof => `
            <article class="closeout-proof-review ${esc(proof.status)}">
                <header><div><strong>${esc(proof.proofReference)}</strong><small>Revision ${esc(proof.revisionNumber)} · ${date(proof.submittedAt)}</small></div><span class="workflow-chip ${proof.status === 'verified' ? 'success' : proof.status === 'rejected' ? 'error' : 'warning'}">${esc(status(proof.status))}</span></header>
                ${facts([
                    ['Payer', esc(proof.payerName)],
                    ['Method', esc(status(proof.paymentMethod))],
                    ['Declared amount', money(proof.declaredAmount)],
                    ['Paid date', date(proof.paidAt)],
                    ['Transaction reference', esc(proof.transactionReference || '—')]
                ])}
                <div class="closeout-proof-images">${(proof.proofImages || []).map(image => {
                    const evidenceUrl = `/api/closeout/payment-proofs/${encodeURIComponent(proof._id)}/evidence/${encodeURIComponent(image.documentId)}`;
                    return `<a href="${esc(evidenceUrl)}" target="_blank" rel="noopener"><img src="${esc(evidenceUrl)}" alt="Payment proof"><span>${esc(image.name)}</span></a>`;
                }).join('')}</div>
                ${proof.customerNotes ? `<p class="closeout-proof-note"><strong>Customer notes:</strong> ${esc(proof.customerNotes)}</p>` : ''}
                ${proof.rejectionReason ? `<p class="closeout-proof-note error"><strong>Rejected:</strong> ${esc(proof.rejectionReason)}</p>` : ''}
                ${proof.status === 'pending_review' ? `<footer><button class="btn-primary" type="button" data-proof-verify="${esc(proof._id)}"><i class="fas fa-check"></i> Verify Payment</button><button class="btn-secondary" type="button" data-proof-reject="${esc(proof._id)}">Reject Proof</button></footer>` : ''}
            </article>`).join('');
        $('closeoutPaymentProofs').querySelectorAll('[data-proof-verify]').forEach(button => button.onclick = () => verifyProof(button.dataset.proofVerify, button));
        $('closeoutPaymentProofs').querySelectorAll('[data-proof-reject]').forEach(button => button.onclick = () => rejectProof(button.dataset.proofReject, button));
    }

    async function runCustomerCloseoutLink(action, button) {
        button.disabled = true;
        try {
            await window.APIService[action === 'rotate' ? 'rotateCustomerCloseoutLink' : 'resendCustomerCloseoutLink'](activeOrderId);
            window.showToast?.('Customer closeout link queued for delivery.');
            await refreshWorkspace();
        } catch (error) {
            window.showToast?.(error.message, 'error');
            button.disabled = false;
        }
    }

    async function verifyProof(proofId, button) {
        const confirmed = await window.WorkflowDialog?.confirm({
            title: 'Verify this payment proof?',
            message: 'The Payment will be marked received and the Pipeline record will move to Paid.',
            impact: 'Only verify after confirming the transaction outside the CRM.',
            confirmLabel: 'Verify Payment'
        });
        if (!confirmed) return;
        button.disabled = true;
        try {
            await window.APIService.verifyPaymentProof(proofId);
            window.showToast?.('Payment proof verified. Payment marked received.');
            await refreshWorkspace();
        } catch (error) {
            window.showToast?.(error.message, 'error');
            button.disabled = false;
        }
    }

    async function rejectProof(proofId, button) {
        const reason = await window.WorkflowDialog?.prompt({
            title: 'Reject payment proof',
            message: 'Explain what the customer must correct before submitting replacement evidence.',
            placeholder: 'Rejection reason (minimum 10 characters)',
            confirmLabel: 'Reject and Notify Customer'
        });
        if (!reason) return;
        button.disabled = true;
        try {
            await window.APIService.rejectPaymentProof(proofId, reason);
            window.showToast?.('Payment proof rejected. Customer notification queued.');
            await refreshWorkspace();
        } catch (error) {
            window.showToast?.(error.message, 'error');
            button.disabled = false;
        }
    }

    async function openCloseoutWorkspace(orderId) {
        activeOrderId = String(orderId || '').trim();
        if (!activeOrderId) return;
        try {
            const data = await window.APIService.getCloseoutOrder(activeOrderId);
            renderWorkspace(data);
        } catch (error) {
            window.showToast?.(error.message || 'Unable to open closeout workspace', 'error');
        }
    }

    function closeCloseoutWorkspace() {
        activeOrderId = '';
        activeWorkspace = null;
        $('closeoutWorkspace').hidden = true;
        $('closeoutOrderList').hidden = false;
        $('closeoutStaffForm').reset();
        clearPreviewUrls();
        renderBeforeUploads?.();
        renderAfterUploads?.();
        $('closeoutOverrideReasonLabel').hidden = true;
    }

    async function refreshWorkspace() {
        if (!activeOrderId) return;
        window.APIService.clearCache();
        renderWorkspace(await window.APIService.getCloseoutOrder(activeOrderId));
    }

    async function runLinkAction(action, button) {
        const map = {
            create: 'createCompletionLink',
            resend: 'resendCompletionLink',
            rotate: 'rotateCompletionLink',
            revoke: 'revokeCompletionLink'
        };
        if (['rotate', 'revoke'].includes(action)) {
            const confirmed = await window.WorkflowDialog?.confirm({
                title: action === 'revoke' ? 'Revoke completion link?' : 'Rotate completion link?',
                message: action === 'revoke' ? 'The vendor will no longer be able to use the current link.' : 'The current link will stop working and a new secure link will be emailed.',
                confirmLabel: action === 'revoke' ? 'Revoke Link' : 'Rotate Link',
                tone: action === 'revoke' ? 'danger' : undefined
            });
            if (!confirmed) return;
        }
        button.disabled = true;
        try {
            await window.APIService[map[action]](activeOrderId);
            window.showToast?.(action === 'revoke' ? 'Completion link revoked.' : 'Completion link queued for delivery.');
            await refreshWorkspace();
        } catch (error) {
            window.showToast?.(error.message, 'error');
            button.disabled = false;
        }
    }

    async function resolveIssue() {
        const note = await window.WorkflowDialog?.prompt({
            title: 'Resolve customer issue',
            message: 'Record how the reported issue was resolved. This note becomes part of the closeout audit history.',
            placeholder: 'Resolution details (minimum 10 characters)',
            confirmLabel: 'Resolve Issue'
        });
        if (!note) return;
        try {
            await window.APIService.resolveCloseoutIssue(activeWorkspace.decision._id, note);
            window.showToast?.('Issue resolved. Customer reconfirmation queued.');
            await refreshWorkspace();
            await loadCloseout();
        } catch (error) {
            window.showToast?.(error.message, 'error');
        }
    }

    $('closeoutPhotoOverride')?.addEventListener('change', event => {
        $('closeoutOverrideReasonLabel').hidden = !event.currentTarget.checked;
        $('closeoutOverrideReason').required = event.currentTarget.checked;
    });
    const renderBeforeUploads = setupUploadPreview('closeoutBeforePhotos', 'Before photos');
    const renderAfterUploads = setupUploadPreview('closeoutAfterPhotos', 'After photos');
    $('closeoutStaffForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const before = [...$('closeoutBeforePhotos').files];
        const after = [...$('closeoutAfterPhotos').files];
        const override = $('closeoutPhotoOverride').checked;
        const reason = $('closeoutOverrideReason').value.trim();
        if ((!before.length || !after.length) && (!override || reason.length < 10)) {
            window.showToast?.('Add before and after photos, or enable the override and enter a reason of at least 10 characters.', 'error');
            return;
        }
        if (before.length > 10 || after.length > 10) {
            window.showToast?.('A maximum of 10 photos is allowed per category.', 'error');
            return;
        }
        const confirmed = await window.WorkflowDialog?.confirm({
            title: 'Mark this job complete?',
            message: 'This records vendor completion, creates the invoice and pending Payment, and asks the customer to review the work.',
            impact: 'The Order remains in progress until the customer confirms completion.',
            confirmLabel: 'Record Completion and Invoice'
        });
        if (!confirmed) return;
        const formData = new FormData(event.currentTarget);
        formData.set('photoOverride', String(override));
        const button = $('closeoutCompleteButton');
        let progress = event.currentTarget.querySelector('.closeout-progress');
        if (!progress) {
            progress = document.createElement('div');
            progress.className = 'closeout-progress full';
            progress.setAttribute('role', 'progressbar');
            progress.setAttribute('aria-label', 'Completion upload progress');
            progress.innerHTML = '<span></span>';
            button.closest('.full').before(progress);
        }
        progress.hidden = false;
        progress.setAttribute('aria-valuenow', '25');
        progress.querySelector('span').style.width = '25%';
        button.disabled = true;
        button.textContent = 'Uploading and completing…';
        try {
            progress.setAttribute('aria-valuenow', '65');
            progress.querySelector('span').style.width = '65%';
            await window.APIService.completeCloseoutOrder(activeOrderId, formData);
            progress.setAttribute('aria-valuenow', '100');
            progress.querySelector('span').style.width = '100%';
            window.showToast?.('Completion recorded. Customer closeout and invoice queued.');
            event.currentTarget.reset();
            clearPreviewUrls();
            renderBeforeUploads?.();
            renderAfterUploads?.();
            await refreshWorkspace();
            await loadCloseout();
        } catch (error) {
            window.showToast?.(error.message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Mark Job Complete';
            setTimeout(() => { progress.hidden = true; progress.querySelector('span').style.width = '0'; }, 600);
        }
    });

    async function openCloseoutSettings() {
        try {
            const settings = await window.APIService.getCloseoutSettings();
            document.getElementById('closeoutSettingsDialog')?.remove();
            const dialog = document.createElement('dialog');
            dialog.id = 'closeoutSettingsDialog';
            dialog.className = 'closeout-settings-dialog';
            const methodKeys = ['bank-transfer', 'check', 'online'];
            const defaults = { 'bank-transfer': 'Bank Transfer', check: 'Check', online: 'Online / Other' };
            const byKey = new Map((settings.paymentMethods || []).map(method => [method.key, method]));
            dialog.innerHTML = `<form method="dialog" id="closeoutSettingsForm">
                <header><div><small>Stage 6 settings</small><h2>Customer payment instructions</h2><p>Only enter information approved for customer display.</p></div><button type="button" data-settings-close aria-label="Close">×</button></header>
                <div class="closeout-settings-body">
                    ${methodKeys.map(key => {
                        const method = byKey.get(key) || {};
                        return `<section data-method="${key}">
                            <label class="closeout-check"><input type="checkbox" data-method-enabled ${method.enabled !== false && byKey.has(key) ? 'checked' : ''}><span><strong>${defaults[key]}</strong>Show this option to customers.</span></label>
                            <label>Customer-facing label<input data-method-label maxlength="100" value="${esc(method.label || defaults[key])}"></label>
                            <label>Instructions<textarea data-method-instructions maxlength="4000" rows="3">${esc(method.instructions || '')}</textarea></label>
                            <label class="closeout-check"><input type="checkbox" data-method-reference ${method.transactionReferenceRequired ? 'checked' : ''}><span>Require a transaction/reference number.</span></label>
                        </section>`;
                    }).join('')}
                    <label>Remittance contact<input id="closeoutRemittanceContact" maxlength="500" value="${esc(settings.remittanceContact || '')}"></label>
                    <label>Proof upload instructions<textarea id="closeoutProofInstructions" maxlength="2000" rows="3">${esc(settings.proofUploadInstructions || '')}</textarea></label>
                    <label>Customer closeout email message<textarea id="closeoutEmailMessage" maxlength="3000" rows="3">${esc(settings.customerCloseoutEmailMessage || '')}</textarea></label>
                </div>
                <footer><button type="button" class="btn-secondary" data-settings-close>Cancel</button><button type="submit" class="btn-primary">Save Payment Settings</button></footer>
            </form>`;
            document.body.append(dialog);
            dialog.querySelectorAll('[data-settings-close]').forEach(button => button.onclick = () => dialog.close());
            dialog.querySelector('form').onsubmit = async event => {
                event.preventDefault();
                const save = dialog.querySelector('button[type="submit"]'); save.disabled = true;
                const paymentMethods = [...dialog.querySelectorAll('[data-method]')].map(section => ({
                    key: section.dataset.method,
                    label: section.querySelector('[data-method-label]').value.trim(),
                    instructions: section.querySelector('[data-method-instructions]').value.trim(),
                    enabled: section.querySelector('[data-method-enabled]').checked,
                    transactionReferenceRequired: section.querySelector('[data-method-reference]').checked
                })).filter(method => !method.enabled || (method.label && method.instructions));
                try {
                    await window.APIService.updateCloseoutSettings({
                        paymentMethods,
                        remittanceContact: dialog.querySelector('#closeoutRemittanceContact').value.trim(),
                        proofUploadInstructions: dialog.querySelector('#closeoutProofInstructions').value.trim(),
                        customerCloseoutEmailMessage: dialog.querySelector('#closeoutEmailMessage').value.trim()
                    });
                    window.showToast?.('Stage 6 payment settings saved.');
                    dialog.close();
                } catch (error) {
                    window.showToast?.(error.message, 'error'); save.disabled = false;
                }
            };
            dialog.addEventListener('close', () => dialog.remove(), { once: true });
            dialog.showModal();
        } catch (error) {
            window.showToast?.(error.message, 'error');
        }
    }

    window.loadCloseout = loadCloseout;
    window.openCloseoutWorkspace = openCloseoutWorkspace;
    window.closeCloseoutWorkspace = closeCloseoutWorkspace;
    window.openCloseoutSettings = openCloseoutSettings;
})();
