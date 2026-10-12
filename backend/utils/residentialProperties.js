const crypto = require('crypto');
const limits = { label: 120, addressLine1: 240, addressLine2: 240, city: 120, state: 80, postalCode: 24, country: 80, propertyType: 80 };
const clean = (value, max) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '').trim().replace(/\s+/g, ' ').slice(0, max);
const optionalNumber = (value, min, max, field, errors) => {
  if (value === '' || value == null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) { errors.push(`${field} must be between ${min} and ${max}`); return undefined; }
  return number;
};
const checked = value => value === true || value === 'true' || value === 'on' || value === 'yes';

function validateProperty(body = {}) {
  const data = {}; const errors = [];
  for (const [field, limit] of Object.entries(limits)) {
    if (body[field] != null && typeof body[field] !== 'string') errors.push(`${field} must be text`);
    data[field] = typeof body[field] === 'string' ? body[field].trim().replace(/\s+/g, ' ') : '';
    if (data[field].length > limit) errors.push(`${field} is too long`);
  }
  data.country = data.country || 'US'; data.label = data.label || 'My property';
  for (const field of ['addressLine1', 'city', 'state', 'postalCode']) if (!data[field]) errors.push(`${field} is required`);
  if (body.confirmAuthority !== true) errors.push('Confirm that you own this property or are authorized to manage it');
  data.details = {
    subtype: clean(body.propertySubtype, 100), title: clean(body.propertyTitle, 160), description: clean(body.propertyDescription, 3000),
    yearBuilt: optionalNumber(body.yearBuilt, 1700, 2200, 'Year built', errors), bedrooms: optionalNumber(body.bedrooms, 0, 100, 'Bedrooms', errors),
    fullBathrooms: optionalNumber(body.fullBathrooms, 0, 100, 'Full bathrooms', errors), halfBathrooms: optionalNumber(body.halfBathrooms, 0, 100, 'Half bathrooms', errors),
    livingAreaSqFt: optionalNumber(body.livingAreaSqFt, 0, 10000000, 'Living area', errors), lotSize: optionalNumber(body.lotSize, 0, 100000000, 'Lot size', errors),
    lotSizeUnit: ['sq_ft', 'acres'].includes(body.lotSizeUnit) ? body.lotSizeUnit : 'sq_ft', stories: optionalNumber(body.stories, 0, 200, 'Stories', errors),
    garageSpaces: optionalNumber(body.garageSpaces, 0, 100, 'Garage spaces', errors), parkingSpaces: optionalNumber(body.parkingSpaces, 0, 1000, 'Parking spaces', errors),
    condition: clean(body.propertyCondition, 100)
  };
  data.addressDetails = {
    county: clean(body.county, 120), parcelNumber: clean(body.parcelNumber, 120),
    latitude: optionalNumber(body.latitude, -90, 90, 'Latitude', errors), longitude: optionalNumber(body.longitude, -180, 180, 'Longitude', errors)
  };
  data.interior = {
    flooring: clean(body.interiorFlooring, 500), kitchen: clean(body.interiorKitchen, 1000), appliances: clean(body.interiorAppliances, 1000),
    heating: clean(body.interiorHeating, 500), cooling: clean(body.interiorCooling, 500), fireplace: clean(body.interiorFireplace, 500),
    laundry: clean(body.interiorLaundry, 500), basement: clean(body.interiorBasement, 500), attic: clean(body.interiorAttic, 500),
    furnishing: ['', 'furnished', 'unfurnished', 'partially_furnished'].includes(body.interiorFurnishing) ? body.interiorFurnishing : ''
  };
  data.exterior = {
    exteriorType: clean(body.exteriorType, 500), roofType: clean(body.roofType, 500), garage: clean(body.exteriorGarage, 500),
    driveway: clean(body.driveway, 500), yard: clean(body.yard, 500), patioDeck: clean(body.patioDeck, 500), balcony: clean(body.balcony, 500),
    pool: clean(body.pool, 500), fence: clean(body.fence, 500), landscaping: clean(body.landscaping, 1000)
  };
  data.utilities = {
    electricity: clean(body.utilityElectricity, 200), gas: clean(body.utilityGas, 200), water: clean(body.utilityWater, 200),
    sewerSeptic: clean(body.utilitySewerSeptic, 200), internet: clean(body.utilityInternet, 200), solar: clean(body.utilitySolar, 500), waterHeater: clean(body.utilityWaterHeater, 500)
  };
  data.hoa = {
    hasHoa: checked(body.hasHoa), name: clean(body.hoaName, 200), fee: optionalNumber(body.hoaFee, 0, 1000000, 'HOA fee', errors),
    frequency: ['', 'monthly', 'quarterly', 'semiannual', 'annual'].includes(body.hoaFrequency) ? body.hoaFrequency : '', websiteContact: clean(body.hoaWebsiteContact, 1000)
  };
  data.media = { virtualTourUrl: clean(body.virtualTourUrl, 1000) };
  if (data.media.virtualTourUrl && !/^https?:\/\/[^\s]+$/i.test(data.media.virtualTourUrl)) errors.push('Virtual tour URL must begin with http:// or https://');
  data.ownerInformation = {
    name: clean(body.ownerName, 200), email: clean(body.ownerEmail, 320).toLowerCase(), phone: clean(body.ownerPhone, 60),
    mailingAddress: clean(body.ownerMailingAddress, 1000), ownerType: ['', 'individual', 'joint_owner', 'llc', 'trust', 'other'].includes(body.ownerType) ? body.ownerType : ''
  };
  if (data.ownerInformation.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.ownerInformation.email)) errors.push('Owner email is invalid');
  data.ownershipVerification = { declarationConfirmed: checked(body.ownerDeclaration) };
  const address = ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'].map(field => data[field].toLowerCase());
  return { data, errors, addressKey: crypto.createHash('sha256').update(JSON.stringify(address)).digest('hex') };
}
function exactText(value) { return new RegExp(`^\\s*${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\s*$`, 'i'); }
module.exports = { validateProperty, exactText };
