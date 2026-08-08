(function initializeSmplfixIconSystem() {
  'use strict';

  const ICON_SELECTOR = 'i.fa, i.fas, i.far, i.fab, i.fa-solid, i.fa-regular, i.fa-brands';
  const CONTROL_SELECTOR = 'button, [role="button"], a.btn, a[class^="btn-"], a[class*=" btn-"], .icon-btn, .action-btn';

  function hasVisibleControlText(control) {
    return Array.from(control.childNodes).some((node) => {
      if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent.trim());
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches(ICON_SELECTOR)) return false;
      return Boolean(node.textContent.trim());
    });
  }

  function normalizeIcon(icon) {
    const explicitlyNamed = icon.hasAttribute('aria-label') || icon.getAttribute('role') === 'img';
    if (!explicitlyNamed) icon.setAttribute('aria-hidden', 'true');

    const control = icon.closest(CONTROL_SELECTOR);
    if (!control || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby') || hasVisibleControlText(control)) return;

    const fallbackLabel = control.getAttribute('title');
    if (fallbackLabel && fallbackLabel.trim()) control.setAttribute('aria-label', fallbackLabel.trim());
  }

  function normalizeIcons(root) {
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(ICON_SELECTOR)) normalizeIcon(root);
    root.querySelectorAll?.(ICON_SELECTOR).forEach(normalizeIcon);
  }

  function start() {
    normalizeIcons(document);
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) normalizeIcons(node);
      }));
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
