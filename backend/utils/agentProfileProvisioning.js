const User = require('../models/User');
const RealEstateAgentProfile = require('../models/RealEstateAgentProfile');

// Only approved identities may receive an empty profile. This never grants
// portfolio/property access or reactivates a suspended profile.
async function ensureAgentProfile(userId, models = { User, RealEstateAgentProfile }) {
  const user = await models.User.findOne({ _id: userId, role: 'real_estate_agent', isActive: true }).lean();
  if (!user) return null;
  const existing = await models.RealEstateAgentProfile.findOne({ userId: user._id }).lean();
  if (existing) return existing;
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim().slice(0, 160) || 'Real Estate Agent';
  try {
    return await models.RealEstateAgentProfile.findOneAndUpdate(
      { userId: user._id },
      { $setOnInsert: { userId: user._id, displayName, referralCode: `AGENT-${String(user._id).toUpperCase()}`, status: 'active' } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    // A simultaneous request may have provisioned the same identity first.
    const profile = await models.RealEstateAgentProfile.findOne({ userId: user._id }).lean();
    if (!profile) throw error;
    return profile;
  }
}

module.exports = { ensureAgentProfile };
