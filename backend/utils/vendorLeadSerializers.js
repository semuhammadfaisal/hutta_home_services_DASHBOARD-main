function leadStatus(invitation, now = new Date()) {
  if (['sent', 'delivery_failed'].includes(invitation.status) && invitation.responseDueAt && new Date(invitation.responseDueAt) <= now) return 'expired';
  return invitation.status;
}
function serializeVendorLead(invitation, quote) {
  const source = invitation?.toObject ? invitation.toObject() : invitation || {};
  const snapshot = source.leadSnapshot || {};
  return {
    id: String(source._id),
    quoteId: source.quoteId ? String(source.quoteId?._id || source.quoteId) : null,
    quoteReference: quote?.quoteReference || source.quoteId?.quoteReference || '',
    status: leadStatus(source),
    responseRequired: source.responseRequired === true,
    propertyAddress: snapshot.propertyAddress || '',
    service: snapshot.service || '',
    scope: snapshot.scope || '',
    requestedWindow: snapshot.requestedWindow || '',
    relevantNotes: snapshot.relevantNotes || '',
    responseDueAt: source.responseDueAt || null,
    bidDueAt: source.bidDueAt || null,
    respondedAt: source.respondedAt || null,
    declineReasonCode: source.declineReasonCode || null,
    declineReason: source.declineReason || '',
    acceptedToBid: source.status === 'accepted_to_bid',
    awarded: quote?.status === 'selected'
  };
}
module.exports = { leadStatus, serializeVendorLead };
