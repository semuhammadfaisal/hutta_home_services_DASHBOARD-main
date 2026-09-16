// Local SVG icons keep registration usable when the external icon font is unavailable.
(() => {
    const paths = {
        user: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
        envelope: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
        lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
        eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
        'eye-slash': '<path d="m3 3 18 18M10 5a11 11 0 0 1 12 7s-1 2-3 4M6 6a18 18 0 0 0-4 6s4 7 10 7c2 0 4-1 5-2"/>',
        check: '<path d="m5 12 4 4L19 6"/>',
        'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
        'arrow-left': '<path d="M20 12H4m6-6-6 6 6 6"/>',
        'layer-group': '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
        'user-tag': '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 10-6m1 1h6l3 4-5 5-4-3v-6Z"/>',
        'shield-halved': '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm0 0v20"/>',
        'circle-exclamation': '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
        'circle-info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
        'triangle-exclamation': '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.01"/>',
        'circle-notch': '<path d="M21 12a9 9 0 1 1-9-9"/>',
        building: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-5h4v5"/>',
        phone: '<path d="m5 3 4 1 1 5-3 2a14 14 0 0 0 6 6l2-3 5 1 1 4c-7 6-23-10-16-16Z"/>',
        pin: '<path d="M19 9c0 6-7 13-7 13S5 15 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
        tools: '<path d="m4 20 10-10m0 0a5 5 0 0 0 6-6l-3 3-3-3 3-3a5 5 0 0 0-6 6L1 17l3 3Z"/>',
        badge: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h5"/>'
    };
    const fields = { vendorCompanyName: 'building', vendorLegalName: 'building', vendorPhone: 'phone', vendorEntityType: 'building', vendorTrades: 'tools', vendorAddress: 'pin', vendorZip: 'pin', vendorRadius: 'pin', vendorRocNumber: 'badge', vendorRocClassification: 'badge' };
    window.renderSignupIcons = () => {
        for (const [id, name] of Object.entries(fields)) {
            const control = document.getElementById(id)?.parentElement;
            if (control && !control.querySelector('i')) {
                const icon = document.createElement('i'); icon.dataset.signupIcon = name; control.prepend(icon);
            }
        }
        document.querySelectorAll('.signup-page i').forEach(icon => {
            const name = Object.keys(paths).find(key => icon.classList.contains(`fa-${key}`)) || icon.dataset.signupIcon;
            if (!paths[name]) return;
            icon.dataset.signupIcon = name;
            icon.classList.add('signup-svg-icon');
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${paths[name]}</svg>`;
        });
    };
    document.addEventListener('DOMContentLoaded', window.renderSignupIcons);
})();
