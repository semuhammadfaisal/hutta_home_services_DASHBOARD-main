const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureAgentProfile } = require('../utils/agentProfileProvisioning');
const id = '507f1f77bcf86cd799439011';
const query = value => ({ lean: async () => value });

function fixture(existing = null, approved = true) {
  const calls = [];
  const models = {
    User: { findOne(filter) {
      assert.deepEqual(filter, { _id: id, role: 'real_estate_agent', isActive: true });
      return query(approved ? { _id: id, firstName: 'Ryan', lastName: 'Agent' } : null);
    } },
    RealEstateAgentProfile: {
      findOne: () => query(existing),
      findOneAndUpdate(filter, update, options) {
        calls.push({ filter, update, options });
        return query(update.$setOnInsert);
      }
    }
  };
  return { models, calls };
}

test('approved agents receive a linked empty profile without access grants', async () => {
  const { models, calls } = fixture();
  const profile = await ensureAgentProfile(id, models);
  assert.equal(profile.userId, id);
  assert.equal(profile.displayName, 'Ryan Agent');
  assert.equal(profile.referralCode, `AGENT-${id.toUpperCase()}`);
  assert.equal(calls[0].options.runValidators, true);
  assert.deepEqual(Object.keys(calls[0].update), ['$setOnInsert']);
  assert.doesNotMatch(JSON.stringify(profile), /permissions|propertyId|customerId|payment/);
});

test('inactive, pending and non-agent identities cannot provision profiles', async () => {
  const { models, calls } = fixture(null, false);
  assert.equal(await ensureAgentProfile(id, models), null);
  assert.equal(calls.length, 0);
});

test('existing and suspended profiles are preserved without reactivation', async () => {
  for (const status of ['active', 'suspended']) {
    const existing = { userId: id, status, displayName: 'Custom Name', referralCode: 'CUSTOM' };
    const { models, calls } = fixture(existing);
    assert.equal(await ensureAgentProfile(id, models), existing);
    assert.equal(calls.length, 0);
  }
});

test('duplicate provisioning race returns the existing profile', async () => {
  const { models } = fixture();
  let reads = 0;
  const existing = { userId: id, status: 'suspended' };
  models.RealEstateAgentProfile.findOne = () => query(++reads === 1 ? null : existing);
  models.RealEstateAgentProfile.findOneAndUpdate = () => ({ lean: async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); } });
  assert.equal(await ensureAgentProfile(id, models), existing);
});
