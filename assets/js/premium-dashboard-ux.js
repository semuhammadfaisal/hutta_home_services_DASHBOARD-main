(function () {
    const routes = [
        { section: 'dashboard', label: 'Dashboard', hint: 'Overview, KPIs, exceptions', icon: 'tachometer-alt', loader: null },
        { section: 'orders', label: 'Orders', hint: 'Work orders, priority, schedule', icon: 'clipboard-list', loader: 'loadOrdersSection', focus: 'orderSearchInput' },
        { section: 'pipeline', label: 'Pipeline', hint: 'Kanban stages and assignments', icon: 'stream', loader: 'loadPipelineSection', focus: 'pipelineSearchInput' },
        { section: 'calendar', label: 'Calendar', hint: 'Scheduled work', icon: 'calendar-alt', loader: 'loadCalendarSection' },
        { section: 'recurring-calendar', label: 'Recurring Calendar', hint: 'Recurring services', icon: 'calendar-check', loader: 'loadRecurringCalendarSection' },
        { section: 'workflow-overview', label: 'Workflow Center', hint: 'Quotes, approvals, scheduling, and closeout', icon: 'route', loader: 'loadWorkflowCenter' },
        { section: 'customers', label: 'Customers', hint: 'Customer profiles and history', icon: 'users', loader: 'loadCustomersSection', focus: 'customerSearchInput' },
        { section: 'vendors', label: 'Vendors', hint: 'Vendor network and status', icon: 'handshake', loader: 'loadVendorsSection', focus: 'vendorSearchInput' },
        { section: 'vendor-reviews', label: 'Vendor Reviews', hint: 'Vendor applications and approvals', icon: 'user-check', loader: 'loadVendorReviews' },
        { section: 'payments', label: 'Payments', hint: 'Invoices, collections, status', icon: 'credit-card', loader: 'loadPaymentsSection', focus: 'paymentSearchInput' },
        { section: 'accounting', label: 'Accounting', hint: 'Cash flow and jobs', icon: 'calculator', loader: 'loadAccountingSection' },
        { section: 'reports', label: 'Reports', hint: 'Analytics and reporting center', icon: 'chart-bar', loader: 'loadReportsSection', focus: 'reportSearchInput' },
        { section: 'employees', label: 'Employees', hint: 'Team, roles, performance', icon: 'user-tie', loader: 'loadEmployeesSection', focus: 'employeeSearchInput' },
        { section: 'users', label: 'Users', hint: 'Roles and access', icon: 'users-cog', loader: 'loadUsersSection' },
        { section: 'settings', label: 'Settings', hint: 'Workspace preferences', icon: 'cog', loader: 'loadSettingsSection' }
    ];

    function safeCall(name) {
        if (name && typeof window[name] === 'function') {
            window[name]();
        }
    }

    function activateSection(section, searchTerm = '') {
        const route = routes.find((item) => item.section === section);
        if (window.dashboard && typeof window.dashboard.showSection === 'function') {
            window.dashboard.showSection(section);
        } else if (typeof window.showSection === 'function') {
            window.showSection(section);
        }

        if (route) safeCall(route.loader);

        document.querySelectorAll('.menu-item').forEach((item) => item.classList.remove('active'));
        const activeLink = document.querySelector(`.menu-item a[data-section="${section}"]`);
        if (activeLink) activeLink.parentElement.classList.add('active');

        closeSidebar();
        closeCommandPalette();

        if (route?.focus) {
            window.setTimeout(() => {
                const input = document.getElementById(route.focus);
                if (!input) return;
                if (searchTerm) {
                    input.value = searchTerm;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                input.focus({ preventScroll: true });
            }, 120);
        }
    }

    function closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const main = document.getElementById('mainContent');
        const toggle = document.getElementById('sidebarToggle');
        const backdrop = document.getElementById('sidebarBackdrop');
        if (window.matchMedia('(max-width: 768px)').matches) {
            sidebar?.classList.remove('show');
            sidebar?.classList.add('collapsed');
            main?.classList.add('expanded');
            toggle?.setAttribute('aria-expanded', 'false');
            if (backdrop) backdrop.hidden = true;
        }
    }

    function syncBackdrop() {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebarBackdrop');
        const isOpen = Boolean(sidebar?.classList.contains('show')) && window.matchMedia('(max-width: 768px)').matches;
        if (backdrop) backdrop.hidden = !isOpen;
    }

    function initSidebarBackdrop() {
        const toggle = document.getElementById('sidebarToggle');
        const backdrop = document.getElementById('sidebarBackdrop');
        toggle?.addEventListener('click', () => window.setTimeout(syncBackdrop, 0));
        backdrop?.addEventListener('click', closeSidebar);
        window.addEventListener('resize', syncBackdrop);
    }

    function routeMatches(query) {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return routes;
        return routes.filter((route) => `${route.label} ${route.hint} ${route.section}`.toLowerCase().includes(normalized));
    }

    function renderCommandResults(query = '') {
        const results = document.getElementById('commandPaletteResults');
        const count = document.getElementById('commandPaletteResultCount');
        const input = document.getElementById('commandPaletteInput');
        if (!results) return;
        const matches = routeMatches(query);
        if (count) count.textContent = `${matches.length} ${matches.length === 1 ? 'result' : 'results'}`;
        if (!matches.length) {
            results.innerHTML = '<div class="command-empty"><span class="command-empty-icon" aria-hidden="true"><i class="fas fa-search"></i></span><strong>No matching page found</strong><small>Try a page name such as Orders, Customers, Reports, or Settings.</small></div>';
            input?.removeAttribute('aria-activedescendant');
            return;
        }
        results.innerHTML = matches.map((route, index) => `
            <button type="button" id="command-option-${route.section}" class="command-item ${index === 0 ? 'active' : ''}" role="option" aria-selected="${index === 0 ? 'true' : 'false'}" data-section="${route.section}">
                <span class="command-item-icon" aria-hidden="true"><i class="fas fa-${route.icon}"></i></span>
                <span class="command-item-copy">
                    <strong>${route.label}</strong>
                    <small>${route.hint}</small>
                </span>
                <small class="command-item-route">${route.section.replaceAll('-', ' ')}</small>
            </button>
        `).join('');
        input?.setAttribute('aria-activedescendant', `command-option-${matches[0].section}`);
    }

    function setActiveCommandItem(items, index, input) {
        items.forEach((item, itemIndex) => {
            const active = itemIndex === index;
            item.classList.toggle('active', active);
            item.setAttribute('aria-selected', String(active));
        });
        const selected = items[index];
        if (selected) {
            input?.setAttribute('aria-activedescendant', selected.id);
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    function openCommandPalette(initialQuery = '') {
        const palette = document.getElementById('commandPalette');
        const input = document.getElementById('commandPaletteInput');
        if (!palette || !input) return;
        palette.hidden = false;
        document.body.classList.add('command-palette-open');
        input.value = initialQuery;
        renderCommandResults(initialQuery);
        window.setTimeout(() => input.focus(), 0);
    }

    function closeCommandPalette() {
        const palette = document.getElementById('commandPalette');
        if (palette) palette.hidden = true;
        document.body.classList.remove('command-palette-open');
    }

    function initCommandPalette() {
        const palette = document.getElementById('commandPalette');
        const input = document.getElementById('commandPaletteInput');
        const close = document.getElementById('commandPaletteClose');
        const mobileToggle = document.getElementById('mobileSearchToggle');
        const globalSearch = document.getElementById('globalDashboardSearch');
        const results = document.getElementById('commandPaletteResults');

        mobileToggle?.addEventListener('click', () => openCommandPalette());
        close?.addEventListener('click', closeCommandPalette);
        palette?.addEventListener('click', (event) => {
            if (event.target === palette) closeCommandPalette();
        });
        input?.addEventListener('input', () => renderCommandResults(input.value));
        input?.addEventListener('keydown', (event) => {
            const items = Array.from(document.querySelectorAll('.command-item'));
            const currentIndex = items.findIndex((item) => item.classList.contains('active'));
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!items.length) return;
                const nextIndex = event.key === 'ArrowDown'
                    ? (currentIndex + 1 + items.length) % items.length
                    : (currentIndex - 1 + items.length) % items.length;
                setActiveCommandItem(items, nextIndex, input);
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                const selected = items[currentIndex] || items[0];
                if (selected) activateSection(selected.dataset.section, input.value.trim());
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                closeCommandPalette();
            }
        });
        results?.addEventListener('click', (event) => {
            const item = event.target.closest('.command-item');
            if (item) activateSection(item.dataset.section, input?.value.trim() || '');
        });
        results?.addEventListener('mousemove', (event) => {
            const item = event.target.closest('.command-item');
            if (!item || item.classList.contains('active')) return;
            const items = Array.from(results.querySelectorAll('.command-item'));
            setActiveCommandItem(items, items.indexOf(item), input);
        });
        globalSearch?.addEventListener('focus', () => openCommandPalette(globalSearch.value));
        globalSearch?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                openCommandPalette(globalSearch.value);
            }
        });
        document.addEventListener('keydown', (event) => {
            const modK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
            if (modK) {
                event.preventDefault();
                openCommandPalette();
            }
            if (event.key === 'Escape') {
                closeCommandPalette();
                closeSidebar();
            }
        });
    }

    function labelTableCells(table) {
        const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim().replace(/\s+/g, ' '));
        table.querySelectorAll('tbody tr').forEach((row) => {
            Array.from(row.children).forEach((cell, index) => {
                if (!cell.hasAttribute('data-label') && headers[index]) {
                    cell.setAttribute('data-label', headers[index]);
                }
            });
            if (row.getAttribute('onclick') && !row.hasAttribute('tabindex')) {
                row.tabIndex = 0;
                row.setAttribute('role', 'button');
                row.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        row.click();
                    }
                });
            }
        });
    }

    function enhanceTables() {
        document.querySelectorAll('.orders-table, .customers-table, .vendors-table, .employees-table, .payments-table, .users-table').forEach(labelTableCells);
    }

    function initTableObserver() {
        enhanceTables();
        const observer = new MutationObserver((mutations) => {
            if (mutations.some((mutation) => mutation.addedNodes.length)) enhanceTables();
        });
        document.querySelectorAll('.orders-table tbody, .customers-table tbody, .vendors-table tbody, .employees-table tbody, .payments-table tbody, .users-table tbody')
            .forEach((tbody) => observer.observe(tbody, { childList: true }));
    }

    function enhanceIconButtons() {
        document.querySelectorAll('button[title]:not([aria-label])').forEach((button) => {
            button.setAttribute('aria-label', button.getAttribute('title'));
        });
    }

    function setTrend(key, trend) {
        const row = document.querySelector(`[data-kpi-trend="${key}"]`);
        if (!row) return;
        const pill = row.querySelector('.kpi-trend-pill');
        const period = row.querySelector('.kpi-period');
        if (!pill || !period) return;

        const raw = Number(trend?.percent ?? trend?.changePercent ?? trend?.deltaPercent);
        if (!Number.isFinite(raw)) {
            pill.className = 'kpi-trend-pill neutral';
            pill.innerHTML = '<i class="fas fa-minus" aria-hidden="true"></i>Live total';
            period.textContent = 'Current workspace';
            return;
        }
        const direction = raw > 0 ? 'positive' : raw < 0 ? 'negative' : 'neutral';
        const icon = raw > 0 ? 'arrow-up' : raw < 0 ? 'arrow-down' : 'minus';
        pill.className = `kpi-trend-pill ${direction === 'positive' ? '' : direction}`.trim();
        pill.innerHTML = `<i class="fas fa-${icon}" aria-hidden="true"></i>${Math.abs(raw).toFixed(1)}%`;
        period.textContent = trend?.label || 'vs previous period';
    }

    function updateKpiTrends(stats = {}) {
        const trends = stats.kpiTrends || stats.trends || {};
        ['totalOrders', 'totalRevenue', 'paymentsCollected', 'totalVendors', 'totalCustomers'].forEach((key) => {
            setTrend(key, trends[key]);
        });
    }

    function patchDashboardKpis() {
        if (!window.dashboard || window.dashboard.__premiumKpiPatched) return;
        const original = window.dashboard.renderKPIs?.bind(window.dashboard);
        if (!original) return;
        window.dashboard.renderKPIs = function patchedRenderKpis(stats) {
            original(stats);
            updateKpiTrends(stats || {});
        };
        window.dashboard.__premiumKpiPatched = true;
        updateKpiTrends(window.dashboard.data || {});
    }

    document.addEventListener('DOMContentLoaded', () => {
        initSidebarBackdrop();
        initCommandPalette();
        initTableObserver();
        enhanceIconButtons();
        patchDashboardKpis();
        window.setTimeout(() => {
            enhanceTables();
            enhanceIconButtons();
            patchDashboardKpis();
        }, 400);
    });
})();
