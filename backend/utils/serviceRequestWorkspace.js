const PORTAL_SOURCES = ['residential_portal', 'agent_fulfillment', 'commercial_portal'];
const ISOLATED_INTAKE_SOURCES = ['agent_portal'];
function workspaceFilter(req) {
  const workspace = String(req.query?.workspace || '').toLowerCase();
  return {
    source: workspace === 'service-requests'
      ? { $in: PORTAL_SOURCES }
      : { $nin: [...PORTAL_SOURCES, ...ISOLATED_INTAKE_SOURCES] }
  };
}
module.exports = { PORTAL_SOURCES, ISOLATED_INTAKE_SOURCES, workspaceFilter };
