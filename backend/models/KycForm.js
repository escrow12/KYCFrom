const mongoose = require("mongoose");

/*
  Schema fields map 1:1 to the sections in the original
  "KYC Form (Non-Individuals Only)" paper form:
  A. Identity Details
  B. Address Details (Entity)
  C. Other Details (PEP / Income / Activity)
  D. KYC Details (documents + beneficial ownership)
  Declaration + signatures
*/

const beneficialOwnerSchema = new mongoose.Schema(
  {
    name: String,
    designation: String, // Director / Partner / Trustee / Karta / Office Bearer
    din: String, // DIN No. (for company/LLP)
    panNo: String,
    percentageHolding: String, // % of shares / capital / profits
  },
  { _id: false }
);

const documentChecklistSchema = new mongoose.Schema(
  {
    name: String,
    selected: { type: Boolean, default: false },
    verificationMethod: String,
  },
  { _id: false }
);

const digioSchema = new mongoose.Schema(
  {
    customerIdentifier: String,
    referenceId: String,
    requestId: String,
    kid: String,
    rid: String,
    actionIds: [String],
    accessToken: { type: String, select: false },
    accessLink: String,
    status: String,
    lastAction: String,
    lastResponseAt: Date,
    lastSyncedAt: Date,
  },
  { _id: false }
);


const directorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    designation: String,
    din: String,
    digio: { type: digioSchema, default: undefined },
    status: { type: String, enum: ["pending", "requested", "completed", "rejected"], default: "pending" },
    completedAt: Date,
    rejectionReason: String,
    emailError: String,
  },
  { _id: true }
);

const agreementSignerSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    providerSignerId: String,
    status: { type: String, enum: ["pending", "signed", "rejected"], default: "pending" },
    signedAt: Date,
    emailError: String,
  },
  { _id: false }
);

const agreementSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ["pending", "sent", "signed"], default: "pending" },
    providerRequestId: String,
    documentId: String,
    signingUrl: String,
    signers: [agreementSignerSchema],
    lastAction: String,
    lastSyncedAt: Date,
    error: String,
    emailError: String,
  },
  { _id: false }
);

const kycFormSchema = new mongoose.Schema(
  {
    // A. Identity Details
    entityName: { type: String, required: true },
    entityType: {
      type: String,
      enum: ["Company", "LLP", "Trust", "Society", "HUF"],
      required: true,
    },
    entityPan: { type: String, required: true, uppercase: true, trim: true },
    incorporationDate: Date,
    registrationNo: String,
    entityTypeOther: String,
    natureOfBusiness: String,
    corporateIdOrSapId: String,
    productType: {
      type: String,
      enum: ["Gift", "Petro", "Meal", "GPR", "Other"],
    },
    productTypeOther: String,
    gstNo: String,

    // B. Address Details (Entity)
    registeredAddress: { type: String, required: true },
    registeredCity: String,
    registeredPincode: String,
    registeredState: String,
    registeredCountry: String,
    correspondenceCity: String,
    correspondencePincode: String,
    correspondenceState: String,
    correspondenceCountry: String,
    phone: String,
    website: String,
    email: String,
    dob: Date,

    // Authorized Signatory
    authSignatoryName: { type: String, required: true },
    authSignatoryTel: String,
    authSignatoryFax: String,
    authSignatoryEmail: String,
    authSignatoryPan: String,
    authSignatoryOvdNo: String,
    authSignatoryOvdType: String, // e.g. PAN Card / Driving License / Passport

    // C.1 PEP
    isPep: { type: Boolean, default: false },
    pepDetails: String,

    // C.2 Gross Annual Income
    incomeRange: {
      type: String,
      enum: [
        "Below 1 lac",
        "1-5 lac",
        "5-10 lac",
        "10-25 lac",
        ">25 lacs - 1 cr",
        "> 1 cr",
      ],
    },
    netWorth: String,
    netWorthDate: Date,

    // C.3 Activity Involvement
    isForexMoneyChanger: { type: Boolean, default: false },
    isGamblingGamingLottery: { type: Boolean, default: false },
    isMoneyLendingPawning: { type: Boolean, default: false },

    // D. KYC Details - documents seen/verified (checklist, varies by entity type)
    documentsVerified: [String],
    documentChecklist: [documentChecklistSchema],

    // D. Beneficial Ownership
    beneficialOwners: [beneficialOwnerSchema],

    // Declaration
    declarationAccepted: { type: Boolean, required: true },
    signedPlace: String,
    signedDate: { type: Date, default: Date.now },
    clientName: String,
    clientDesignation: String,
    clientDate: Date,
    clientPlace: String,

    // Internal verification (relationship manager section)
    verifiedByRmName: String,
    rmDesignation: String,
    rmDate: Date,
    rmPlace: String,
    originalVerified: { type: Boolean, default: false },
    selfAttested: { type: Boolean, default: false },
    clientSignatureVerified: { type: Boolean, default: false },
    signedInPresence: { type: Boolean, default: false },
    documentsSeenAndVerified: { type: Boolean, default: false },
    panCardMandatory: { type: Boolean, default: false },
    gstIfApplicable: { type: Boolean, default: false },

    // Uploaded Documents (Aadhaar & PAN Card)
    uploadedDocuments: {
      aadhaarCard: String,
      panCard: String,
      aadhaarCardOriginalName: String,
      panCardOriginalName: String,
    },

    // DigiO identifiers are server-side metadata; accessToken is excluded from normal queries.
    digio: { type: digioSchema, default: undefined },
    directors: [directorSchema],
    agreement: { type: agreementSchema, default: undefined },

    // Decoupled Status State Machine Fields
    applicationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    kycStatus: {
      type: String,
      enum: ["not_started", "in_progress", "completed"],
      default: "not_started",
    },
    agreementStatus: {
      type: String,
      enum: ["not_started", "sent", "signed"],
      default: "not_started",
    },

    // Legacy status field retained for backward compatibility & queries
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "director_kyc_pending", "director_kyc_completed", "agreement_pending", "agreement_sent", "agreement_signed", "completed"],
      default: "pending",
    },
    emailError: String,
    approvalInProgress: { type: Boolean, default: false, select: false },
    rejectionReason: { type: String, trim: true },
    approvedBy: { type: String, trim: true },
    approvedAt: Date,
    rejectedBy: { type: String, trim: true },
    rejectedAt: Date,
  },
  { timestamps: true, collection: "kycApplications" }
);

kycFormSchema.methods.syncStatuses = function () {
  if (!this.applicationStatus) {
    if (this.status === "rejected") this.applicationStatus = "rejected";
    else if (this.status === "pending" || !this.status) this.applicationStatus = "pending";
    else this.applicationStatus = "approved";
  }

  if (this.directors && this.directors.length > 0) {
    if (this.directors.every((d) => d.status === "completed")) this.kycStatus = "completed";
    else if (this.directors.some((d) => ["requested", "completed"].includes(d.status))) this.kycStatus = "in_progress";
    else this.kycStatus = "not_started";
  } else if (!this.kycStatus) {
    if (["director_kyc_completed", "agreement_pending", "agreement_sent", "completed"].includes(this.status)) this.kycStatus = "completed";
    else if (this.status === "director_kyc_pending") this.kycStatus = "in_progress";
    else this.kycStatus = "not_started";
  }

  if (this.agreement) {
    if (this.agreement.status === "signed" || this.status === "completed") this.agreementStatus = "signed";
    else if (this.agreement.status === "sent" || this.status === "agreement_sent") this.agreementStatus = "sent";
    else if (!this.agreementStatus) this.agreementStatus = "not_started";
  } else if (!this.agreementStatus) {
    this.agreementStatus = "not_started";
  }

  if (this.applicationStatus === "rejected") {
    this.status = "rejected";
  } else if (this.applicationStatus === "pending") {
    this.status = "pending";
  } else if (this.kycStatus === "completed" && this.agreementStatus === "signed") {
    this.status = "completed";
  } else if (this.agreementStatus === "sent") {
    this.status = "agreement_sent";
  } else if (this.agreementStatus === "signed") {
    this.status = "agreement_signed";
  } else if (this.kycStatus === "completed") {
    this.status = "director_kyc_completed";
  } else if (this.kycStatus === "in_progress") {
    this.status = "director_kyc_pending";
  } else {
    this.status = "approved";
  }
};

kycFormSchema.pre("save", function (next) {
  this.syncStatuses();
  next();
});

module.exports = mongoose.model("KycForm", kycFormSchema);
