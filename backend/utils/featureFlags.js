function enabled(name, { productionDefault = false, nonProductionDefault = true } = {}) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return process.env.NODE_ENV === 'production' ? productionDefault : nonProductionDefault;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function agentPortalEnabled() {
  return enabled('AGENT_PORTAL_ENABLED', { productionDefault: false, nonProductionDefault: true });
}

module.exports = { agentPortalEnabled, enabled };
