(function () {
    const mobileQuery = window.matchMedia('(max-width: 768px)');
    const groupNames = {
        dashboard: 'Command',
        calendar: 'Command',
        'recurring-calendar': 'Command',
        'workflow-overview': 'Command',
        orders: 'Operations',
        pipeline: 'Operations',
        customers: 'Operations',
        vendors: 'Operations',
        'vendor-reviews': 'Operations',
        payments: 'Finance',
        accounting: 'Finance',
        reports: 'Finance',
        employees: 'People & Admin',
        users: 'People & Admin',
        settings: 'People & Admin'
    };

    let focusBeforeDrawer = null;

    function drawerElements() {
        return {
            sidebar: document.getElementById('sidebar'),
            toggle: document.getElementById('sidebarToggle'),
            close: document.getElementById('sidebarClose'),
            backdrop: document.getElementById('sidebarBackdrop'),
            main: document.getElementById('mainContent'),
            topNav: document.querySelector('.top-nav')
        };
    }

    function isDrawerOpen() {
        const { sidebar } = drawerElements();
        return mobileQuery.matches && Boolean(sidebar?.classList.contains('show'));
    }

    function focusableIn(element) {
        if (!element) return [];
        return Array.from(element.querySelectorAll(
            'a[href]:not([hidden]), button:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])'
        )).filter((item) => item.getClientRects().length > 0 && item.getAttribute('aria-hidden') !== 'true');
    }

    function syncDrawerState(options = {}) {
        const { sidebar, toggle, backdrop, main, topNav } = drawerElements();
        if (!sidebar || !toggle) return;

        const open = isDrawerOpen();
        const desktopOpen = !mobileQuery.matches && !sidebar.classList.contains('collapsed');
        toggle.setAttribute('aria-expanded', (open || desktopOpen) ? 'true' : 'false');
        document.body.classList.toggle('shell-drawer-open', open);

        if (mobileQuery.matches) {
            sidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
            if (backdrop) backdrop.hidden = !open;
            if (main) main.inert = open;
            if (topNav) topNav.inert = open;
        } else {
            sidebar.removeAttribute('aria-hidden');
            if (backdrop) backdrop.hidden = true;
            if (main) main.inert = false;
            if (topNav) topNav.inert = false;
        }

        if (open && options.moveFocus) {
            focusBeforeDrawer = document.activeElement;
            window.setTimeout(() => {
                const target = document.getElementById('sidebarClose') || focusableIn(sidebar)[0];
                target?.focus({ preventScroll: true });
            }, 0);
        }
    }

    function closeDrawer(restoreFocus = true) {
        const { sidebar, toggle, backdrop, main, topNav } = drawerElements();
        if (!sidebar || !mobileQuery.matches) return;
        sidebar.classList.remove('show');
        sidebar.classList.add('collapsed');
        main?.classList.add('expanded');
        toggle?.setAttribute('aria-expanded', 'false');
        if (backdrop) backdrop.hidden = true;
        document.body.classList.remove('shell-drawer-open');
        sidebar.setAttribute('aria-hidden', 'true');
        if (main) main.inert = false;
        if (topNav) topNav.inert = false;
        if (restoreFocus) (focusBeforeDrawer || toggle)?.focus({ preventScroll: true });
        focusBeforeDrawer = null;
    }

    function focusActivePage() {
        window.setTimeout(() => {
            const heading = document.querySelector('.content-section.active .page-header h1, .content-section.active .reports-header h1, .content-section.active h1');
            const main = document.getElementById('mainContent');
            const target = heading || main;
            if (!target) return;
            if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }, 0);
    }

    function trapDrawerFocus(event) {
        if (!isDrawerOpen()) return;
        const { sidebar } = drawerElements();

        if (event.key === 'Escape') {
            event.preventDefault();
            closeDrawer(true);
            return;
        }

        if (event.key !== 'Tab') return;
        const items = focusableIn(sidebar);
        if (!items.length) {
            event.preventDefault();
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function initDrawer() {
        const { sidebar, toggle, close, backdrop } = drawerElements();
        if (!sidebar || !toggle) return;

        toggle.addEventListener('click', () => {
            window.setTimeout(() => syncDrawerState({ moveFocus: isDrawerOpen() }), 0);
        });
        close?.addEventListener('click', () => closeDrawer(true));
        backdrop?.addEventListener('click', () => closeDrawer(true));
        sidebar.addEventListener('click', (event) => {
            if (event.target.closest('.menu-item a') && mobileQuery.matches) {
                closeDrawer(false);
                focusActivePage();
            }
        });
        document.addEventListener('keydown', trapDrawerFocus);
        mobileQuery.addEventListener('change', () => syncDrawerState());
        new MutationObserver(() => syncDrawerState()).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
        syncDrawerState();
    }

    function currentTitle(activeLink) {
        const sectionId = activeLink?.dataset.section;
        const section = sectionId ? document.getElementById(sectionId) : document.querySelector('.content-section.active');
        const heading = section?.querySelector('.page-header h1, .reports-header h1, h1');
        return heading?.textContent.trim() || activeLink?.querySelector('span')?.textContent.trim() || 'Dashboard overview';
    }

    function syncNavigationState() {
        const activeItem = document.querySelector('.menu-item.active');
        const activeLink = activeItem?.querySelector('a[data-section]');
        const group = document.getElementById('pageBreadcrumbGroup');
        const current = document.getElementById('pageBreadcrumbCurrent');

        document.querySelectorAll('.menu-item a[data-section]').forEach((link) => {
            if (link === activeLink) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });

        if (!activeLink) return;
        const sectionId = activeLink.dataset.section;
        if (group) group.textContent = groupNames[sectionId] || 'smplfix';
        if (current) current.textContent = currentTitle(activeLink);
    }

    function initNavigationState() {
        const menu = document.querySelector('.sidebar-menu');
        const main = document.getElementById('mainContent');
        syncNavigationState();

        if (menu) {
            new MutationObserver(syncNavigationState).observe(menu, {
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'hidden']
            });
        }
        if (main) {
            new MutationObserver(syncNavigationState).observe(main, {
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    function initPageEyebrows() {
        document.querySelectorAll('.content-section').forEach((section) => {
            const header = section.querySelector(':scope > .page-header, :scope > .reports-header');
            const heading = header?.querySelector('h1');
            if (!header || !heading || header.querySelector('.overview-eyebrow, .page-eyebrow, .order-detail-eyebrow')) return;
            const eyebrow = document.createElement('p');
            eyebrow.className = 'page-eyebrow';
            eyebrow.textContent = groupNames[section.id] || 'smplfix';
            heading.parentElement?.insertBefore(eyebrow, heading);
        });
    }

    function closeProfile(restoreFocus = false) {
        const profile = document.getElementById('adminProfile');
        const dropdown = document.getElementById('profileDropdown');
        profile?.classList.remove('active');
        dropdown?.classList.remove('show');
        profile?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) profile?.focus({ preventScroll: true });
    }

    function initProfileMenu() {
        const profile = document.getElementById('adminProfile');
        const dropdown = document.getElementById('profileDropdown');
        if (!profile || !dropdown) return;
        const items = Array.from(dropdown.querySelectorAll('[role="menuitem"]'));

        profile.addEventListener('keydown', (event) => {
            if (event.target !== profile) return;
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (!dropdown.classList.contains('show')) profile.click();
                window.setTimeout(() => items[0]?.focus(), 0);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeProfile(true);
            }
        });

        dropdown.addEventListener('keydown', (event) => {
            const index = items.indexOf(document.activeElement);
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeProfile(true);
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                items[(index + direction + items.length) % items.length]?.focus();
            } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
            } else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) {
                event.preventDefault();
                items[index].click();
            }
        });
    }

    function updateAvatarFallback() {
        const avatar = document.getElementById('adminAvatar');
        if (!avatar || !avatar.src.startsWith('data:image/svg+xml')) return;
        avatar.src = avatar.src
            .replace(/%234CAF50/gi, '%230B0B0C')
            .replace(/font-family=['"]Inter['"]/gi, "font-family='Space Grotesk'");
    }

    function syncAccessibleControlNames(root = document) {
        root.querySelectorAll('button, a[href], [role="button"]').forEach((control) => {
            if (control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
            const visibleText = Array.from(control.childNodes)
                .filter((node) => node.nodeType === Node.TEXT_NODE)
                .map((node) => node.textContent.trim())
                .join(' ')
                .trim();
            if (visibleText) return;
            const label = control.getAttribute('title') || control.dataset.label;
            if (label) control.setAttribute('aria-label', label);
        });
    }

    function initAccessibleControlNames() {
        syncAccessibleControlNames();
        new MutationObserver((records) => records.forEach((record) => {
            record.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                if (node.matches('button, a[href], [role="button"]')) {
                    syncAccessibleControlNames(node.parentElement || document);
                } else {
                    syncAccessibleControlNames(node);
                }
            });
        })).observe(document.body, { childList: true, subtree: true });
    }

    function initAccessibleModals() {
        const selector = '.modal-overlay, [class*="-modal-overlay"]';
        const openers = new WeakMap();
        const wasOpen = new WeakMap();

        function isOpen(modal) {
            const style = window.getComputedStyle(modal);
            return style.display !== 'none' && style.visibility !== 'hidden';
        }

        function dialogFor(modal) {
            return modal.matches('[role="dialog"]') ? modal : (modal.querySelector('[role="dialog"], .modal-content') || modal);
        }

        function prepare(modal) {
            const dialog = dialogFor(modal);
            if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            const heading = dialog.querySelector('h1, h2, h3');
            if (heading && !dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
                if (!heading.id) heading.id = `${modal.id || 'smplfix-modal'}-title`;
                dialog.setAttribute('aria-labelledby', heading.id);
            }
            return dialog;
        }

        function sync(modal) {
            const open = isOpen(modal);
            const previous = wasOpen.get(modal) || false;
            wasOpen.set(modal, open);
            if (open && !previous) {
                openers.set(modal, document.activeElement);
                const dialog = prepare(modal);
                if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
                window.setTimeout(() => (focusableIn(dialog)[0] || dialog).focus({ preventScroll: true }), 0);
            } else if (!open && previous) {
                const opener = openers.get(modal);
                if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
            }
        }

        const modals = [];
        const observed = new WeakSet();
        function observeModal(modal) {
            if (observed.has(modal)) return;
            observed.add(modal);
            modals.push(modal);
            prepare(modal);
            wasOpen.set(modal, isOpen(modal));
            new MutationObserver(() => sync(modal)).observe(modal, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
            if (isOpen(modal)) {
                wasOpen.set(modal, false);
                sync(modal);
            }
        }
        document.querySelectorAll(selector).forEach(observeModal);
        new MutationObserver((records) => records.forEach((record) => {
            record.addedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                if (node.matches(selector)) observeModal(node);
                node.querySelectorAll(selector).forEach(observeModal);
            });
            record.removedNodes.forEach((node) => {
                if (!(node instanceof Element)) return;
                const removed = [node, ...node.querySelectorAll(selector)].filter((item) => observed.has(item));
                removed.forEach((modal) => {
                    const opener = openers.get(modal);
                    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
                    wasOpen.set(modal, false);
                });
            });
        })).observe(document.body, { childList: true, subtree: true });

        document.addEventListener('keydown', (event) => {
            if (event.defaultPrevented) return;
            const modal = modals.filter(isOpen).at(-1);
            if (!modal) return;
            const dialog = dialogFor(modal);
            if (event.key === 'Escape') {
                const close = dialog.querySelector('.modal-close, .btn-close, [data-dialog-cancel]');
                if (close) {
                    event.preventDefault();
                    close.click();
                }
                return;
            }
            if (event.key !== 'Tab') return;
            const items = focusableIn(dialog);
            if (!items.length) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initDrawer();
        initPageEyebrows();
        initNavigationState();
        initProfileMenu();
        updateAvatarFallback();
        initAccessibleControlNames();
        initAccessibleModals();
    });
})();
