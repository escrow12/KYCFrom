const mongoose = require("mongoose");

const keyPersonSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    designation: { type: String, trim: true },
    dinId: { type: String, trim: true },
    remarks: { type: String, trim: true },
  },
  { _id: false }
);

const clientVerificationSchema = new mongoose.Schema(
  {
    assignment: {
      referenceNo: { type: String, trim: true },
      dateOfAssignment: Date,
      visitDateTime: Date,
      agencyExecutive: { type: String, trim: true },
      purpose: { type: [String], default: [] },
      requestedBy: { type: String, trim: true },
    },
    client: {
      legalName: { type: String, required: true, trim: true },
      tradeName: { type: String, trim: true },
      constitution: { type: String, trim: true },
      registrationNo: { type: String, trim: true },
      pan: { type: String, trim: true, uppercase: true },
      gstin: { type: String, trim: true, uppercase: true },
      incorporationDate: Date,
      registeredAddress: { type: String, trim: true },
      siteAddress: { type: String, trim: true },
      businessNature: { type: String, trim: true },
      websiteEmail: { type: String, trim: true },
      yearsInOperation: { type: String, trim: true },
    },
    site: {
      premisesType: { type: String, trim: true },
      signboardVisible: { type: String, trim: true },
      signboardRemarks: { type: String, trim: true },
      officeOperational: { type: String, trim: true },
      operationalRemarks: { type: String, trim: true },
      businessActivityObserved: { type: String, trim: true },
      officeArea: { type: String, trim: true },
      staffObserved: { type: String, trim: true },
      accessibility: { type: String, trim: true },
      ownershipEvidence: { type: String, trim: true },
      addressMatched: { type: String, trim: true },
      observation: { type: String, trim: true },
    },
    evidence: {
      latitude: { type: String, trim: true },
      longitude: { type: String, trim: true },
      mapLocation: { type: String, trim: true },
      capturedAt: Date,
      exteriorPhoto: { type: String, trim: true },
      interiorPhoto: { type: String, trim: true },
      signboardPhoto: { type: String, trim: true },
      landmarkPhoto: { type: String, trim: true },
      personPhoto: { type: String, trim: true },
      fileReferences: { type: String, trim: true },
    },
    contact: {
      name: { type: String, trim: true },
      designation: { type: String, trim: true },
      department: { type: String, trim: true },
      mobile: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      relationship: { type: String, trim: true },
      idVerified: { type: String, trim: true },
      statement: { type: String, trim: true },
    },
    keyPersons: { type: [keyPersonSchema], default: [] },
    statutory: {
      gstStatus: { type: String, trim: true },
      gstNameMatch: { type: String, trim: true },
      panIdentity: { type: String, trim: true },
      mcaRecords: { type: String, trim: true },
      addressMatch: { type: String, trim: true },
      activityConsistency: { type: String, trim: true },
      otherLicence: { type: String, trim: true },
      sources: { type: String, trim: true },
    },
    operations: {
      natureObserved: { type: String, trim: true },
      productsServices: { type: String, trim: true },
      customerVendorActivity: { type: String, trim: true },
      infrastructure: { type: String, trim: true },
      branding: { type: String, trim: true },
      businessScale: { type: String, trim: true },
      businessPresence: { type: String, trim: true },
    },
    observations: {
      positive: { type: String, trim: true },
      discrepancies: { type: String, trim: true },
      redFlags: { type: [String], default: [] },
      otherRedFlag: { type: String, trim: true },
      remarks: { type: String, trim: true },
    },
    outcome: {
      overallResult: { type: String, trim: true },
      recommendedAction: { type: String, trim: true },
      summary: { type: String, trim: true },
    },
    certification: {
      verifierName: { type: String, trim: true },
      designationAgency: { type: String, trim: true },
      signature: { type: String, trim: true },
      date: Date,
      reviewer: { type: String, trim: true },
      reviewDate: Date,
    },
  },
  {
    timestamps: true,
    collection: "clientVerificationForms",
  }
);

module.exports = mongoose.model("ClientVerification", clientVerificationSchema);
