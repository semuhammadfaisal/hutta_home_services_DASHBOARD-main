require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const Notification = require('./models/Notification');
const PropertyMembership = require('./models/PropertyMembership');
const ResidentialAccountProfile = require('./models/ResidentialAccountProfile');
const ResidentialPropertyProfile = require('./models/ResidentialPropertyProfile');
const ResidentialUtilityReading = require('./models/ResidentialUtilityReading');

const APPLY = process.argv.includes('--apply');
const DEMO = {
  services: [
    { key: 'hvac', label: 'HVAC tune-up', enabled: true, frequencyMonths: 6, nextDueAt: new Date('2027-03-15T16:00:00Z') },
    { key: 'roof', label: 'Roof and drainage check', enabled: true, frequencyMonths: 12, nextDueAt: new Date('2027-06-01T16:00:00Z') },
    { key: 'irrigation', label: 'Irrigation inspection', enabled: false, frequencyMonths: 6 },
    { key: 'water_heater', label: 'Water heater service', enabled: true, frequencyMonths: 12, nextDueAt: new Date('2027-01-20T16:00:00Z') },
    { key: 'pest', label: 'Pest prevention', enabled: false, frequencyMonths: 3 }
  ],
  passportEntries: [
    { category: 'filter', title: 'Downstairs HVAC filter', value: '20 × 25 × 1, MERV 11', notes: 'Return grille in hallway ceiling' },
    { category: 'paint', title: 'Great room wall paint', value: 'Sherwin-Williams Alabaster SW 7008, eggshell' },
    { category: 'appliance', title: 'Water heater', value: 'Rheem XE50T12CS55U1', notes: 'Installed January 2024' }
  ],
  utilityReadings: [
    { utilityType: 'electricity', periodStart: new Date('2026-07-01'), periodEnd: new Date('2026-07-31'), usage: 1842, unit: 'kWh', cost: 241.36 },
    { utilityType: 'water', periodStart: new Date('2026-07-01'), periodEnd: new Date('2026-07-31'), usage: 9120, unit: 'gallons', cost: 74.18 }
  ]
};

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const memberships = await PropertyMembership.find({ relationship: 'owner', status: 'active' }).limit(20).lean();
  process.stdout.write(`${APPLY ? 'Applying' : 'Dry run:'} residential demo data for ${memberships.length} owner membership(s).\n`);
  if (!APPLY) return;
  for (const membership of memberships) {
    await ResidentialPropertyProfile.findOneAndUpdate({ propertyId: membership.propertyId }, { $setOnInsert: { customerId: membership.customerId, 'autopilot.enabled': true, 'autopilot.services': DEMO.services, passportEntries: DEMO.passportEntries.map(entry => ({ ...entry, createdBy: membership.userId })) } }, { upsert: true, setDefaultsOnInsert: true });
    await ResidentialAccountProfile.findOneAndUpdate({ userId: membership.userId }, { $setOnInsert: { customerId: membership.customerId, referralCode: `SMPL-${String(membership.userId).slice(-8).toUpperCase()}`, notificationPreferences: { portal: true, email: true, upcomingVisits: true, jobUpdates: true, invoices: true, seasonalRecommendations: true } } }, { upsert: true, setDefaultsOnInsert: true });
    const hasReading = await ResidentialUtilityReading.exists({ propertyId: membership.propertyId });
    if (!hasReading) await ResidentialUtilityReading.insertMany(DEMO.utilityReadings.map(item => ({ ...item, propertyId: membership.propertyId, customerId: membership.customerId, enteredBy: membership.userId })));
    await Notification.updateOne({ userId: membership.userId, 'metadata.demoKey': 'seasonal-hvac' }, { $setOnInsert: { userId: membership.userId, title: 'Arizona seasonal care', message: 'A pre-season HVAC tune-up can help prepare your home for peak heat.', type: 'info', priority: 'medium', actionUrl: '#autopilot', metadata: { demoKey: 'seasonal-hvac', propertyId: membership.propertyId } } }, { upsert: true });
  }
}

if (require.main === module) run().then(() => mongoose.disconnect()).catch(error => { console.error(error.message); process.exitCode = 1; mongoose.disconnect(); });
module.exports = { DEMO };
