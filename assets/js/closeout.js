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

    function completionState(order) {
        if (order.workflowStatus === 'closeout_issue_reported') return 'Issue reported';
        if (order.satisfactionStatus === 'pending') return 'Awaiting customer feedback';
        if (['satisfied', 'issue_resolved'].includes(order.satisfactionStatus)) return status(order.satisfactionStatus);
        if (order.workflowStatus === 'completed') return 'Completed';
        return order.completion?.tokenSentAt ? 'Awaiting vendor completion' : 'Ready for completion';
    }

    function renderOrders() {
        const ready = orders.filter(order => order.workflowStatus === 'scheduled').length;
        const feedback = orders.filter(order => order.satisfactionStatus === 'pending').length;
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
        list.innerHTML = orders.map(order => `
            <article class="closeout-order-card">
                <div>
                    <span class="closeout-reference">${esc(order.requestReference || order.orderId)}</span>
                    <h3>${esc(order.customer?.name || 'Customer')}</h3>
                    <p>${esc(order.service || 'Service')}</p>
                </div>
                <div class="closeout-card-state">
                    <span class="workflow-chip ${order.workflowStatus === 'closeout_issue_reported' ? 'error' : order.workflowStatus === 'scheduled' ? 'warning' : 'success'}">${esc(completionState(order))}</span>
                    <small>${order.completion?.completionReference ? esc(order.completion.completionReference) : 'Completion not yet recorded'}</small>
                </div>
                <div class="closeout-card-meta">
                    <span><i class="fas fa-user-hard-hat"></i> ${esc(order.vendor?.name || 'Vendor')}</span>
                    <time datetime="${esc(order.updatedAt || '')}"><i class="fas fa-clock"></i> ${date(order.updatedAt)}</time>
                </div>
                <button class="btn-primary" type="button" data-closeout-open="${esc(order._id)}">${order.workflowStatus === 'scheduled' ? 'Complete Closeout' : 'View Closeout'}</button>
            </article>`).join('');
        list.querySelectorAll('[data-closeout-open]').forEach(button => {
            button.onclick = () => openCloseoutWorkspace(button.dataset.closeoutOpen);
        });
    }

    async function loadCloseout() {
        const list = $('closeoutOrderList');
        if (list) list.innerHTML = '<div class="workflow-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading completion records&hellip;</p></div>';
        try {
            orders = await window.APIService.getCloseoutOrders();
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
            target.innerHTML = '<p>No closeout emails have been queued.</p>';
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
            ['Confirmed end', date(order.scheduledEnd)]
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
            let timeline = `<div class="closeout-timeline"><div class="closeout-timeline-item success"><strong>Completion recorded</strong><p>${date(completion.completedAt)} · ${esc(status(completion.source))}</p></div>`;
            if (decision) {
                timeline += `<div class="closeout-timeline-item ${decision.decision === 'issue_reported' ? 'error' : 'success'}"><strong>${esc(status(decision.decision))}</strong><p>${date(decision.decisionAt)}</p></div>`;
                if (decision.decision === 'issue_reported') {
                    timeline += `<div class="closeout-issue"><strong>Customer issue</strong><p>${esc(decision.issueMessage)}</p>${decision.resolvedAt
                        ? `<p><strong>Resolved:</strong> ${esc(decision.resolutionNote)} · ${date(decision.resolvedAt)}</p>`
                        : '<button class="btn-primary" type="button" data-resolve-issue>Resolve Customer Issue</button>'}</div>`;
                }
            } else {
                timeline += '<div class="closeout-timeline-item"><strong>Awaiting customer feedback</strong><p>The 48-hour follow-up remains scheduled until the customer responds.</p></div>';
            }
            $('closeoutSatisfaction').innerHTML = `${timeline}</div>`;
            $('closeoutSatisfaction').querySelector('[data-resolve-issue]')?.addEventListener('click', resolveIssue);
        }
        renderEmails(data.emailMessages || []);
        $('closeoutWorkspace').hidden = false;
        $('closeoutOrderList').hidden = true;
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
            window.showToast?.('Customer issue resolved.');
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
            message: 'This immediately completes the Order and creates the customer invoice and pending Payment.',
            impact: 'The completion record, invoice, and Payment cannot be duplicated or silently overwritten.',
            confirmLabel: 'Complete and Invoice'
        });
        if (!confirmed) return;
        const formData = new FormData(event.currentTarget);
        formData.set('photoOverride', String(override));
        const button = $('closeoutCompleteButton');
        button.disabled = true;
        try {
            await window.APIService.completeCloseoutOrder(activeOrderId, formData);
            window.showToast?.('Job completed. Invoice and pending Payment created.');
            event.currentTarget.reset();
            await refreshWorkspace();
            await loadCloseout();
        } catch (error) {
            window.showToast?.(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    });

    window.loadCloseout = loadCloseout;
    window.openCloseoutWorkspace = openCloseoutWorkspace;
    window.closeCloseoutWorkspace = closeCloseoutWorkspace;
})();
