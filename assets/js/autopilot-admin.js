(function autopilotAdminWorkspace() {
    'use strict';

    const state = { requests: [], totals: {}, loaded: false };
    const $ = id => document.getElementById(id);
    const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
    const formatDate = value => value ? new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled';
    const dateInput = value => value ? new Date(value).toISOString().slice(0, 10) : '';
    const money = value => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

    function filteredRequests() {
        const query = String($('autopilotPlanSearch')?.value || '').trim().toLowerCase();
        return state.requests.filter(request => !query || [request.customer?.name, request.customer?.email, request.property?.label, request.property?.address]
            .join(' ').toLowerCase().includes(query));
    }

    function renderMetrics() {
        $('autopilotMetricProperties').textContent = state.totals.properties || 0;
        $('autopilotMetricEnrolled').textContent = state.totals.enrolled || 0;
        $('autopilotMetricServices').textContent = state.totals.services || 0;
        $('autopilotMetricApproval').textContent = state.totals.autoApproval || 0;
    }

    function renderRequests() {
        const requests = filteredRequests();
        $('autopilotPlanResultCount').textContent = `${requests.length} ${requests.length === 1 ? 'customer' : 'customers'}`;
        const emptyState = state.requests.length
            ? '<tr><td colspan="5"><div class="autopilot-admin-empty"><i class="fas fa-filter-circle-xmark"></i><strong>No matching customers</strong><p>Try a different customer, property, or address.</p></div></td></tr>'
            : '<tr><td colspan="5"><div class="autopilot-admin-empty"><i class="fas fa-clipboard-check"></i><strong>No active service requests</strong><p>Customers appear here only after they activate Autopilot and select at least one recurring service.</p></div></td></tr>';
        $('autopilotPlansTableBody').innerHTML = requests.length ? requests.map(request => {
            const services = (request.services || []).filter(service => service.enabled);
            const openOrders = services.filter(service => service.order).length;
            return `<tr><td><div class="autopilot-property-cell"><div><strong>${escapeHtml(request.customer?.name || 'Residential customer')}</strong><small>${escapeHtml(request.property?.label || 'Property')} · ${escapeHtml(request.property?.address || 'Address unavailable')}</small><em>${escapeHtml(request.customer?.email || '')}</em></div></div></td><td><strong>${services.length} selected</strong><small>${escapeHtml(services.map(service => service.label).join(', '))}${openOrders ? ` · ${openOrders} open order${openOrders === 1 ? '' : 's'}` : ''}</small></td><td><strong>${escapeHtml(formatDate(request.nextDueAt))}</strong></td><td>${request.autoApprovalEnabled ? `<span class="autopilot-consent-status is-approved"><i class="fas fa-shield-halved"></i>${escapeHtml(money(request.autoApprovalThreshold))} limit</span>` : '<span class="autopilot-consent-status"><i class="fas fa-lock"></i>Estimate required</span>'}</td><td><button type="button" class="autopilot-manage-button" data-review-autopilot="${escapeHtml(request.property.id)}"><i class="fas fa-clipboard-list"></i> Review requests</button></td></tr>`;
        }).join('') : emptyState;
    }

    async function loadAutopilotPlans(force = false) {
        if (state.loaded && !force) return renderRequests();
        const body = $('autopilotPlansTableBody');
        if (body) body.innerHTML = '<tr><td colspan="5"><div class="autopilot-admin-empty"><i class="fas fa-spinner fa-spin"></i><strong>Loading customer service requests…</strong></div></td></tr>';
        try {
            const response = await window.APIService.getAutopilotPlans();
            state.requests = response.data || [];
            state.totals = response.totals || {};
            state.loaded = true;
            renderMetrics();
            renderRequests();
        } catch (error) {
            if (body) body.innerHTML = `<tr><td colspan="5"><div class="autopilot-admin-empty is-error"><i class="fas fa-triangle-exclamation"></i><strong>Service requests could not be loaded</strong><p>${escapeHtml(error.message || 'Please try again.')}</p></div></td></tr>`;
        }
    }

    function openRequestReview(propertyId) {
        const request = state.requests.find(item => String(item.property?.id) === String(propertyId));
        if (!request) return;
        const services = (request.services || []).filter(service => service.enabled);
        document.querySelector('.autopilot-plan-modal')?.remove();
        const modal = document.createElement('div');
        modal.className = 'autopilot-plan-modal';
        modal.innerHTML = `<div class="autopilot-plan-dialog autopilot-request-dialog" role="dialog" aria-modal="true" aria-labelledby="autopilotRequestDialogTitle"><header><div><small>Autopilot work request</small><h2 id="autopilotRequestDialogTitle">${escapeHtml(request.customer?.name || 'Customer')}</h2><p>Review the property, scope, customer note, pricing, and confirmed service date.</p></div><button type="button" data-close-autopilot aria-label="Close"><i class="fas fa-times"></i></button></header><div class="autopilot-plan-body"><section class="autopilot-request-overview"><article><i class="fas fa-house"></i><div><small>Service property</small><strong>${escapeHtml(request.property?.label || 'Property')}</strong><p>${escapeHtml(request.property?.address || 'Address unavailable')}</p></div></article><article><i class="fas fa-user"></i><div><small>Customer</small><strong>${escapeHtml(request.customer?.name || 'Residential customer')}</strong><p>${escapeHtml(request.customer?.email || 'No email')}</p></div></article><article class="is-note"><i class="fas fa-message"></i><div><small>Customer message</small><p>${escapeHtml(request.requestNote || 'No additional instructions were provided.')}</p></div></article></section><div class="autopilot-plan-section-heading"><div><small>Work to confirm</small><h3>Requested services</h3></div><span>${services.length} selected</span></div><div class="autopilot-service-editor">${services.map(service => `<form class="autopilot-confirm-service" data-confirm-autopilot-order="${escapeHtml(service.key)}"><div class="autopilot-confirm-service-heading"><span class="autopilot-request-icon"><i class="fas fa-screwdriver-wrench"></i></span><div><strong>${escapeHtml(service.label)}</strong><small>Requested every ${Number(service.frequencyMonths)} months</small></div>${service.order ? `<span class="autopilot-order-created"><i class="fas fa-circle-check"></i>${escapeHtml(service.order.orderId)}</span>` : ''}</div><div class="autopilot-confirm-fields"><label><span>Customer price</span><span class="autopilot-price-field"><i>$</i><input name="price" type="number" min="0" max="10000000" step="0.01" value="${service.order?.amount != null ? escapeHtml(service.order.amount) : ''}" placeholder="0.00" required></span></label><label><span>Confirmed service date</span><input name="scheduledDate" type="date" value="${escapeHtml(dateInput(service.order?.scheduleDate || service.nextDueAt))}" required></label><button type="submit" class="autopilot-create-order"><i class="fas fa-calendar-check"></i>${service.order ? 'Update confirmation' : 'Confirm & create order'}</button></div>${service.order ? `<p class="autopilot-confirmed-summary"><i class="fas fa-circle-check"></i> Currently confirmed for ${escapeHtml(formatDate(service.order.scheduleDate))} at ${escapeHtml(money(service.order.amount))}. This date is visible to the customer.</p>` : ''}</form>`).join('')}</div><div class="autopilot-consent-boundary"><i class="fas fa-shield-halved"></i><div><strong>Estimate authorization</strong><p>${request.autoApprovalEnabled ? `The customer authorized eligible estimates up to ${escapeHtml(money(request.autoApprovalThreshold))} per service.` : 'The customer has not enabled auto-approval. Confirming creates the quoted order; normal estimate approval rules still apply.'}</p></div></div><div class="form-error" id="autopilotAdminError" role="alert" hidden></div></div><footer><span><i class="fas fa-eye"></i> Confirmed dates sync to the residential portal.</span><button type="button" class="btn-primary" data-close-autopilot>Done</button></footer></div>`;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelectorAll('[data-close-autopilot]').forEach(button => button.addEventListener('click', close));
        modal.addEventListener('click', event => { if (event.target === modal) close(); });
        modal.querySelectorAll('[data-confirm-autopilot-order]').forEach(form => form.addEventListener('submit', async event => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const error = modal.querySelector('#autopilotAdminError');
            const button = form.querySelector('[type="submit"]');
            button.disabled = true;
            error.hidden = true;
            try {
                const result = await window.APIService.createAutopilotServiceOrder(request.property.id, form.dataset.confirmAutopilotOrder, { price: Number(form.elements.price.value), scheduledDate: form.elements.scheduledDate.value });
                window.showToast?.(`${result.order?.orderId || 'Order'} confirmed for ${formatDate(result.order?.scheduleDate)}.`, 'success');
                close();
                state.loaded = false;
                await loadAutopilotPlans(true);
                openRequestReview(propertyId);
            } catch (requestError) {
                error.textContent = requestError.message || 'The order could not be created.';
                error.hidden = false;
                button.disabled = false;
            }
        }));
        modal.querySelector('button')?.focus();
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('autopilotPlanSearch')?.addEventListener('input', renderRequests);
        $('refreshAutopilotPlans')?.addEventListener('click', () => loadAutopilotPlans(true));
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-review-autopilot]');
            if (button) openRequestReview(button.dataset.reviewAutopilot);
        });
        if (location.hash === '#autopilot-plans') window.AuthReady?.then?.(() => { window.dashboard?.showSection?.('autopilot-plans'); loadAutopilotPlans(); });
    });
    window.addEventListener('hashchange', () => { if (location.hash === '#autopilot-plans') loadAutopilotPlans(); });
    window.loadAutopilotPlans = loadAutopilotPlans;
})();
