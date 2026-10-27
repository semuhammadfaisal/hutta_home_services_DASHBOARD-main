function vendorContractorSnapshot(vendor) {
  if (!vendor) return {};
  return {
    companyName: vendor.name || vendor.companyName || '',
    licensedContractorName: vendor.legalBusinessName || vendor.name || vendor.companyName || '',
    contractorLicenseNumber: vendor.contractorLicenseNumber || '',
    licenseType: vendor.rocLicenseTypeClassification || vendor.rocClassification || '',
    rocNumber: vendor.rocLicenseNumber || vendor.rocNumber || '',
    rocLicenseExpirationDate: vendor.rocLicenseExpirationDate || undefined,
    coiOnFile: Boolean(vendor.certificateOfInsuranceOnFile),
    insuranceExpirationDate: vendor.insuranceExpirationDate || undefined
  };
}

function publicContractorSnapshot(snapshot) {
  if (!snapshot) return {};
  return {
    name: snapshot.licensedContractorName || snapshot.companyName || snapshot.name || '',
    licenseType: snapshot.licenseType || '',
    rocNumber: snapshot.rocNumber || ''
  };
}

module.exports = { publicContractorSnapshot, vendorContractorSnapshot };
