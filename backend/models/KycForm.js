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

    // DigiO identifiers are server-side metadata; accessToken is excluded from normal queries.
    digio: { type: digioSchema, default: undefined },
    directors: [directorSchema],
    agreement: { type: agreementSchema, default: undefined },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "director_kyc_pending", "director_kyc_completed", "agreement_pending", "agreement_sent", "agreement_signed", "completed"],
      default: "pending",
    },
    approvalInProgress: { type: Boolean, default: false, select: false },
    rejectionReason: { type: String, trim: true },
    approvedBy: { type: String, trim: true },
    approvedAt: Date,
    rejectedBy: { type: String, trim: true },
    rejectedAt: Date,
  },
  { timestamps: true, collection: "kycApplications" }
);

module.exports = mongoose.model("KycForm", kycFormSchema);
