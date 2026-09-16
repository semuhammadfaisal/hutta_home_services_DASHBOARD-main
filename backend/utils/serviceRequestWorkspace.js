const PORTAL_SOURCES = ['residential_portal', 'agent_portal', 'commercial_portal'];
function workspaceFilter(req) {
  return { source: req.query.workspace === 'service-requests' ? { $in: PORTAL_SOURCES } : { $nin: PORTAL_SOURCES } };
}
module.exports = { PORTAL_SOURCES, workspaceFilter };
