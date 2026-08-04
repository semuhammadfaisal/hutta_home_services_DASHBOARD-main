(() => {
    const $ = id => document.getElementById(id);
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    const token = fragment.get('token') || '';
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    const objectUrls = new Set();
    let closeout = null;
    const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const date = value => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Phoenix' }) : '—';
    const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
    const status = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

    async function api(path, options = {}) {
        const response = await fetch(path, {
            credentials: 'omit',
            cache: 'no-store',
            ...options,
            headers: { 'X-Customer-Satisfaction-Token': token, ...(options.headers || {}) }
        });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await response.json() : await response.blob();
        if (!response.ok) throw new Error(data?.message || 'Unable to complete this request.');
        return data;
    }

    function facts(entries) {
        $('closeoutOrderFacts').innerHTML = entries.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value || '—')}</dd></div>`).join('');
    }

    async function renderGallery(targetId, countId, files) {
        $(countId).textContent = `${files.length} photo${files.length === 1 ? '' : 's'}`;
        const target = $(targetId);
        if (!files.length) {
            target.innerHTML = '<p class="closeout-evidence-empty">No photo evidence was provided.</p>';
            return;
        }
        target.innerHTML = files.map(file => `<button type="button" data-evidence="${esc(file.documentId)}" aria-label="Open ${esc(file.name)}"><span class="closeout-image-loading"></span><small>${esc(file.name)}</small></button>`).join('');
        await Promise.all([...target.querySelectorAll('[data-evidence]')].map(async button => {
            try {
                const blob = await api(`/api/closeout/public/evidence/${encodeURIComponent(button.dataset.evidence)}`);
                const url = URL.createObjectURL(blob); objectUrls.add(url);
                button.innerHTML = `<img src="${url}" alt=""><small>${button.querySelector('small')?.textContent || 'Evidence photo'}</small>`;
                button.onclick = () => window.open(url, '_blank', 'noopener');
            } catch {
                button.disabled = true;
                button.innerHTML = '<span class="closeout-image-error">Image unavailable</span>';
            }
        }));
    }

    function renderDecision(decision) {
        if (!decision) return;
        $('satisfactionPending').hidden = true;
        $('satisfactionComplete').hidden = false;
        const issue = decision.decision === 'issue_reported';
        $('satisfactionComplete').classList.toggle('is-issue', issue);
        $('satisfactionResultIcon').textContent = issue ? '!' : '✓';
        $('satisfactionResultTitle').textContent = issue ? 'Your issue was reported' : 'Work completion confirmed';
        $('satisfactionResultMessage').textContent = issue
            ? 'Our team has been notified. After the issue is resolved, you will receive a new confirmation request.'
            : 'Thank you. This Order is now marked completed. Payment verification remains separate.';
        $('satisfactionDecisionAt').textContent = `Recorded ${date(decision.decisionAt)}`;
        $('closeoutStatusBadge').textContent = issue ? 'Issue reported' : 'Work confirmed';
        $('closeoutStatusBadge').classList.toggle('is-issue', issue);
    }

    function renderPaymentProof(proof, payment) {
        const finalPayment = ['received', 'completed'].includes(payment?.status);
        $('paymentStatus').textContent = status(payment?.status || 'pending');
        $('paymentProofState').hidden = !proof && !finalPayment;
        if (finalPayment) {
            $('paymentProofState').className = 'closeout-proof-state is-success';
            $('paymentProofState').innerHTML = '<strong>Payment verified</strong><p>The smplfix team has marked this Payment received.</p>';
            $('paymentProofForm').hidden = true;
        } else if (proof?.status === 'pending_review') {
            $('paymentProofState').className = 'closeout-proof-state is-pending';
            $('paymentProofState').innerHTML = `<strong>${proof.proofReference} is awaiting review</strong><p>Submitted ${date(proof.submittedAt)}. No additional upload is needed right now.</p>`;
            $('paymentProofForm').hidden = true;
        } else {
            $('paymentProofForm').hidden = false;
            if (proof?.status === 'rejected') {
                $('paymentProofState').hidden = false;
                $('paymentProofState').className = 'closeout-proof-state is-error';
                $('paymentProofState').innerHTML = `<strong>Previous proof was rejected</strong><p>${proof.rejectionReason || 'Upload clearer replacement evidence.'}</p>`;
            }
        }
    }

    function renderPaymentSettings(invoice) {
        const settings = invoice.paymentInstructions || {};
        const methods = settings.paymentMethods || [];
        $('paymentMethods').innerHTML = methods.length
            ? methods.map(method => `<article><strong>${esc(method.label)}</strong><p>${esc(method.instructions).replace(/\n/g, '<br>')}</p></article>`).join('')
            : '<article><strong>Payment instructions</strong><p>Contact sales@smplfix.com for payment instructions.</p></article>';
        $('paymentMethod').innerHTML = '<option value="">Choose method</option>' + methods.map(method => `<option value="${esc(method.key)}" data-reference-required="${Boolean(method.transactionReferenceRequired)}">${esc(method.label)}</option>`).join('');
        $('proofInstructions').textContent = settings.proofUploadInstructions || 'Upload a clear transaction image for staff review.';
        if (!methods.length) $('paymentProofForm').hidden = true;
    }

    async function submitDecision(action) {
        const error = $('satisfactionFormError');
        const typedName = $('typedName').value.trim();
        const completionConfirmed = $('completionConfirmed').checked;
        const issueMessage = $('issueMessage').value.trim();
        error.hidden = true;
        if (typedName.length < 2) return showError(error, 'Enter your full name.');
        if (action === 'satisfied' && !completionConfirmed) return showError(error, 'Review and check the completion confirmation.');
        if (action === 'report_issue' && issueMessage.length < 10) return showError(error, 'Describe the issue in at least 10 characters.');
        document.querySelectorAll('#confirm-work button').forEach(button => { button.disabled = true; });
        try {
            const data = await api('/api/closeout/public/satisfaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, typedName, completionConfirmed, issueMessage })
            });
            renderDecision({ decision: data.decision, decisionAt: data.decisionAt });
        } catch (requestError) {
            showError(error, requestError.message);
            document.querySelectorAll('#confirm-work button').forEach(button => { button.disabled = false; });
        }
    }

    function showError(target, message) {
        target.textContent = message; target.hidden = false;
    }

    function renderProofPreviews() {
        const files = [...$('proofImages').files];
        $('proofPreviews').innerHTML = '';
        files.forEach(file => {
            const url = URL.createObjectURL(file); objectUrls.add(url);
            const item = document.createElement('div');
            item.innerHTML = `<img src="${url}" alt=""><span>${file.name}</span>`;
            $('proofPreviews').append(item);
        });
    }

    async function submitProof(event) {
        event.preventDefault();
        const error = $('proofError'); error.hidden = true;
        const files = [...$('proofImages').files];
        if (!files.length || files.length > 3) return showError(error, 'Choose one to three transaction images.');
        if (files.some(file => file.size > 10 * 1024 * 1024)) return showError(error, 'Each transaction image must be 10 MB or smaller.');
        const selected = $('paymentMethod').selectedOptions[0];
        if (selected?.dataset.referenceRequired === 'true' && $('transactionReference').value.trim().length < 2) return showError(error, 'Enter the transaction reference for this payment method.');
        const formData = new FormData(event.currentTarget);
        const button = $('submitProofButton'); button.disabled = true; button.textContent = 'Uploading proof…';
        $('proofProgress').hidden = false; $('proofProgress').querySelector('span').style.width = '55%';
        try {
            const proof = await api('/api/closeout/public/payment-proof', { method: 'POST', body: formData });
            $('proofProgress').querySelector('span').style.width = '100%';
            renderPaymentProof(proof, closeout.payment);
            event.currentTarget.reset(); $('proofPreviews').innerHTML = '';
        } catch (requestError) {
            showError(error, requestError.message);
        } finally {
            button.disabled = false; button.textContent = 'Submit Payment Proof';
            setTimeout(() => { $('proofProgress').hidden = true; $('proofProgress').querySelector('span').style.width = '0'; }, 500);
        }
    }

    async function load() {
        try {
            if (!token) throw new Error('The secure customer closeout token is missing.');
            closeout = await api('/api/closeout/public/satisfaction');
            $('satisfactionReference').textContent = closeout.completionReference;
            $('satisfactionService').textContent = closeout.order.service || 'Completed service';
            $('satisfactionCompletedAt').textContent = `Completed ${date(closeout.completedAt)} Arizona time`;
            $('confirmationStatement').textContent = closeout.confirmationStatement;
            $('closeoutScope').textContent = closeout.order.scopeOfWork || 'No scope description available.';
            $('closeoutNotes').textContent = closeout.completionNotes || 'No completion notes were provided.';
            facts([
                ['Request', closeout.order.requestReference],
                ['Order', closeout.order.orderReference],
                ['Service address', closeout.order.address],
                ['Contractor', closeout.vendor.name],
                ['Scheduled start', `${date(closeout.schedule.scheduledStart)} Arizona time`],
                ['Scheduled end', `${date(closeout.schedule.scheduledEnd)} Arizona time`]
            ]);
            $('invoiceNumber').textContent = closeout.invoice.invoiceNumber;
            $('invoiceAmount').textContent = money(closeout.invoice.amount);
            $('declaredAmount').value = Number(closeout.invoice.amount).toFixed(2);
            $('paidAt').max = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
            $('paidAt').value = new Date().toISOString().slice(0, 10);
            renderPaymentSettings(closeout.invoice);
            renderPaymentProof(closeout.paymentProof, closeout.payment);
            await Promise.all([
                renderGallery('beforeGallery', 'beforeCount', closeout.evidence.before),
                renderGallery('afterGallery', 'afterCount', closeout.evidence.after)
            ]);
            $('satisfactionLoading').hidden = true;
            $('satisfactionDocument').hidden = false;
            if (closeout.decision) renderDecision(closeout.decision);
        } catch (error) {
            $('satisfactionLoading').hidden = true;
            $('satisfactionErrorMessage').textContent = error.message;
            $('satisfactionError').hidden = false;
        }
    }

    $('satisfiedButton').onclick = () => submitDecision('satisfied');
    $('showIssueButton').onclick = () => { $('satisfactionChoices').hidden = true; $('issuePanel').hidden = false; $('completionConfirmed').closest('label').hidden = true; $('issueMessage').focus(); };
    $('cancelIssueButton').onclick = () => { $('issuePanel').hidden = true; $('satisfactionChoices').hidden = false; $('completionConfirmed').closest('label').hidden = false; $('showIssueButton').focus(); };
    $('submitIssueButton').onclick = () => submitDecision('report_issue');
    $('proofImages').onchange = renderProofPreviews;
    $('paymentProofForm').onsubmit = submitProof;
    addEventListener('beforeunload', () => objectUrls.forEach(url => URL.revokeObjectURL(url)));
    load();
})();
