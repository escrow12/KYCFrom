// ---- Document checklist per entity type (mirrors the original form's Section D) ----
const DOC_MAP = {
  Company: [
    "Certificate of Incorporation",
    "Memorandum of Association (MOA)",
    "Articles of Association (AOA)",
    "Certificate of Commencement of Business",
    "List of Directors with Director Identification Number (DIN)",
    "Board Resolution authorising signatory / Power of Attorney + signature proof",
    "Proof of Address (Utility Bill / Bank Statement / Rent Agreement)",
    "Photo, OVD & PAN of Authorised Signatories",
  ],
  LLP: [
    "Certificate of Incorporation",
    "Deed of Partnership along with Certificate of Registration",
    "List of Partners with DIN No.",
    "Signature of partner signing the agreement + signature proof",
    "Resolution authorizing designated partner as authorized signatory + signature proof",
    "Proof of Address (Utility Bill / Bank Statement / Rent Agreement)",
    "Photo, OVD & PAN of all Partners",
  ],
  Trust: [
    "Certificate of Registration",
    "Trust Deed",
    "List of Trustees / Office Bearers / Karta along with parceners",
    "Resolution passed by Board of Trustees / Managing Committee authorising person",
    "Proof of Address (Utility Bill / Bank Statement / Rent Agreement)",
    "Photo, OVD & PAN of Authorised Signatories / Karta",
    "Copy of Shops & Establishments License / Udyog Aadhaar",
  ],
  Society: [
    "Certificate of Registration",
    "Society By-laws / Registration document",
    "List of Office Bearers along with parceners",
    "Resolution passed by Managing Committee authorising person",
    "Proof of Address (Utility Bill / Bank Statement / Rent Agreement)",
    "Photo, OVD & PAN of Authorised Signatories",
    "Copy of Shops & Establishments License / Udyog Aadhaar",
  ],
  HUF: [
    "Bank verification of Karta along with signature proof of authorized signatory",
    "Proof of Address (Utility Bill / Bank Statement / Rent Agreement)",
    "Photo, OVD & PAN of Karta",
  ],
};

const form = document.getElementById("kycForm");
const docChecklistDiv = document.getElementById("docChecklist");
const isPepCheckbox = document.getElementById("isPep");
const pepDetailsWrap = document.getElementById("pepDetailsWrap") || document.querySelector(".pep-details");
const boTableBody = document.querySelector("#boTable tbody");
const addBoRowBtn = document.getElementById("addBoRow");
const downloadBtn = document.getElementById("downloadBtn");
const printBtn = document.getElementById("printBtn");
const statusMsg = document.getElementById("statusMsg");

let lastSubmittedId = null;

// ---- Generic single-select checkbox group helper ----
// Any set of checkboxes sharing the same data-group behaves like a radio group:
// checking one unchecks the others in that group.
function getGroupValue(groupName) {
  const checked = form.querySelector(`.group-check[data-group="${groupName}"]:checked`);
  if (checked) return checked.value;
  const namedChecked = form.querySelector(`input[name="${groupName}"]:checked`);
  return namedChecked ? namedChecked.value : "";
}

function setGroupValue(groupName, value) {
  if (value === undefined || value === null) return;
  const strVal = String(value).trim();
  if (!strVal) return;

  const namedInputs = form.querySelectorAll(`input[name="${groupName}"]`);
  let matched = false;
  namedInputs.forEach((input) => {
    if (input.type === "radio" || input.type === "checkbox") {
      if (input.value.toLowerCase() === strVal.toLowerCase()) {
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        matched = true;
      }
    }
  });
  if (matched) return;

  const groupChecks = form.querySelectorAll(`.group-check[data-group="${groupName}"]`);
  if (groupChecks.length) {
    groupChecks.forEach((cb) => {
      if (cb.value.toLowerCase() === strVal.toLowerCase()) {
        cb.checked = true;
        cb.dispatchEvent(new Event("change", { bubbles: true }));
        matched = true;
      }
    });
    if (matched) return;
  }

  const input = form.querySelector(`[name="${groupName}"]`);
  if (input) {
    if (input.type === "radio" || input.type === "checkbox") {
      input.checked = Boolean(value);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      input.value = value;
    }
  }
}

function setupCheckboxGroups() {
  const groups = {};
  form.querySelectorAll(".group-check").forEach((cb) => {
    const g = cb.dataset.group;
    if (!groups[g]) groups[g] = [];
    groups[g].push(cb);
  });
  Object.values(groups).forEach((checks) => {
    checks.forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) {
          checks.forEach((other) => {
            if (other !== cb) other.checked = false;
          });
        }
        if (cb.dataset.group === "entityType") renderChecklist();
      });
    });
  });
}
setupCheckboxGroups();

function renderChecklist() {
  const type = getGroupValue("entityType");
  if (!docChecklistDiv) return;
  docChecklistDiv.innerHTML = "";
  const docs = DOC_MAP[type] || [];
  docs.forEach((docLabel, i) => {
    const row = document.createElement("div");
    row.className = "doc-row";
    row.innerHTML = `
      <label class="doc-check">
        <input type="checkbox" class="doc-checkbox" data-label="${docLabel}" />
        <span>${i + 1}. ${docLabel}</span>
      </label>
      <span class="doc-verify-methods">
        <label class="checkbox-line small"><input type="checkbox" class="doc-verify-check" data-method="Original Verified" data-groupid="doc-verify-${i}" /> Original Verified</label>
        <label class="checkbox-line small"><input type="checkbox" class="doc-verify-check" data-method="Self-Attested" data-groupid="doc-verify-${i}" /> Self-Attested</label>
      </span>
    `;
    // Enforce single selection between the two verification-method checkboxes in this row
    const verifyChecks = row.querySelectorAll(".doc-verify-check");
    verifyChecks.forEach((cb) => {
      cb.addEventListener("change", () => {
        if (cb.checked) {
          verifyChecks.forEach((other) => {
            if (other !== cb) other.checked = false;
          });
        }
      });
    });
    docChecklistDiv.appendChild(row);
  });
  if (!docs.length) {
    docChecklistDiv.innerHTML = '<p class="hint">Select an Entity Type in Section A to see the required document checklist.</p>';
  }
}
renderChecklist();

if (isPepCheckbox && pepDetailsWrap) {
  isPepCheckbox.addEventListener("change", () => {
    pepDetailsWrap.classList.toggle("hidden", !isPepCheckbox.checked);
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function formatDateForInput(dateVal) {
  if (!dateVal) return "";
  if (typeof dateVal === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
    return dateVal.substring(0, 10);
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function addBoRow(data = {}) {
  if (!boTableBody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>
      <input type="text" class="bo-name" value="${escapeHtml(data.name || "")}" placeholder="Full Name" />
      ${data.rejectionReason ? `<div style="font-size:11px;color:#dc3545;margin-top:2px;font-weight:bold;">⚠️ ${escapeHtml(data.rejectionReason)}</div>` : ""}
    </td>
    <td><input type="email" class="bo-email" value="${escapeHtml(data.email || "")}" placeholder="email@domain.com" /></td>
    <td><input type="tel" class="bo-phone" value="${escapeHtml(data.phone || "")}" placeholder="Mobile No." /></td>
    <td><button type="button" class="remove-row" style="background:#a9323a;color:#fff;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-weight:bold;">X</button></td>
  `;
  const nameInput = tr.querySelector(".bo-name");
  const emailInput = tr.querySelector(".bo-email");
  const phoneInput = tr.querySelector(".bo-phone");

  if (nameInput && data.name) nameInput.value = data.name;
  if (emailInput && data.email) emailInput.value = data.email;
  if (phoneInput && data.phone) phoneInput.value = data.phone;

  if (nameInput) {
    nameInput.addEventListener("input", () => {
      clearFieldError(nameInput);
      updateSummaryIfActive();
    });
  }
  if (emailInput) {
    emailInput.addEventListener("input", () => {
      clearFieldError(emailInput);
      updateSummaryIfActive();
    });
  }
  if (phoneInput) {
    phoneInput.addEventListener("input", () => {
      phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 10);
      clearFieldError(phoneInput);
      updateSummaryIfActive();
    });
  }

  tr.querySelector(".remove-row").addEventListener("click", () => {
    tr.remove();
    updateSummaryIfActive();
  });
  boTableBody.appendChild(tr);
}
if (addBoRowBtn) addBoRowBtn.addEventListener("click", () => addBoRow());
if (boTableBody && boTableBody.children.length === 0) addBoRow();

function collectBeneficialOwners() {
  if (!boTableBody) return [];
  return Array.from(boTableBody.querySelectorAll("tr"))
    .map((tr) => ({
      name: tr.querySelector(".bo-name") ? tr.querySelector(".bo-name").value.trim() : "",
      email: tr.querySelector(".bo-email") ? tr.querySelector(".bo-email").value.trim().toLowerCase() : "",
      phone: tr.querySelector(".bo-phone") ? tr.querySelector(".bo-phone").value.trim() : "",
    }))
    .filter((row) => row.name || row.email); // skip fully empty rows
}

function collectCheckedDocs() {
  if (docChecklistDiv) {
    return Array.from(docChecklistDiv.querySelectorAll(".doc-row"))
      .filter((row) => row.querySelector(".doc-checkbox").checked)
      .map((row) => {
        const label = row.querySelector(".doc-checkbox").dataset.label;
        const checkedMethod = row.querySelector(".doc-verify-check:checked");
        const method = checkedMethod ? checkedMethod.dataset.method : "";
        return method ? `${label} (${method})` : label;
      });
  }

  return getStaticDocumentInputs()
    .filter((input) => input.checked)
    .map((input) => {
      const label = input.closest("label");
      return label ? label.textContent.replace(/\s+/g, " ").trim() : input.name;
    });
}

function getStaticDocumentInputs() {
  return Array.from(form.querySelectorAll('input[type="checkbox"]')).filter((input) =>
    /^(doc|company|llp|trust)/i.test(input.name) ||
    ["panCardMandatory", "gstIfApplicable"].includes(input.name)
  );
}

function collectDocumentChecklist() {
  return getStaticDocumentInputs().map((input) => {
    const label = input.closest("label");
    return {
      name: label ? label.textContent.replace(/\s+/g, " ").trim() : input.name,
      selected: input.checked,
      verificationMethod: "N/A",
    };
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char]));
}

function setStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = type || "";
}

let activeKycId = null;

function populateFormWithRecord(record) {
  if (!record) return;

  // 1. Rejection / Warning Banner
  if (record.applicationStatus === "rejected" || record.rejectionReason) {
    let existingBanner = document.getElementById("rejectionAlertBanner");
    if (!existingBanner) {
      existingBanner = document.createElement("div");
      existingBanner.id = "rejectionAlertBanner";
      existingBanner.style.cssText = "background:#fff2f2; border: 2px solid #dc3545; border-radius: 8px; padding: 18px 22px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(220,53,69,0.15);";
      form.prepend(existingBanner);
    }
    existingBanner.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <span style="font-size:24px;">⚠️</span>
        <h3 style="margin:0; color:#dc3545; font-size:18px;">KYC Application Requires Corrections</h3>
      </div>
      <div style="background:#fff; border-left: 4px solid #dc3545; padding: 12px 16px; margin: 10px 0; border-radius: 4px;">
        <strong style="color:#721c24;">Reason for Rejection:</strong>
        <p style="margin: 4px 0 0 0; font-size: 15px; color: #222; font-style: italic;">"${escapeHtml(record.rejectionReason || "Please review and correct your submitted details.")}"</p>
      </div>
      <p style="margin: 0; font-size: 13px; color: #555;">
        Please review your pre-filled details below, make the necessary corrections to your Entity details, Director details, or Documents, then click <strong>"Update &amp; Resubmit KYC Form"</strong>.
      </p>
    `;
    existingBanner.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Safe setter for input fields
  const setVal = (name, val) => {
    if (val === undefined || val === null) return;
    try {
      const input = form.querySelector(`[name="${name}"]`);
      if (input) {
        if (input.type === "date") {
          input.value = formatDateForInput(val);
        } else if (input.type === "checkbox") {
          input.checked = Boolean(val);
        } else if (input.type === "radio") {
          const r = form.querySelector(`input[name="${name}"][value="${val}"]`);
          if (r) r.checked = true;
        } else {
          input.value = val;
        }
      }
    } catch (e) {
      console.warn(`Error setting value for field ${name}:`, e);
    }
  };

  // Section A: Identity Details
  setVal("corporateIdOrSapId", record.corporateIdOrSapId);
  setVal("entityName", record.entityName);
  setVal("registrationNo", record.registrationNo);
  setVal("incDate", record.incorporationDate);
  setVal("entityTypeOther", record.entityTypeOther);
  setVal("entityPan", record.entityPan);
  setVal("natureOfBusiness", record.natureOfBusiness);
  setVal("gstNo", record.gstNo);
  setVal("productTypeOther", record.productTypeOther);

  if (record.productType) {
    const prodCbs = form.querySelectorAll('input[name="productType"]');
    prodCbs.forEach((cb) => {
      if (cb.value.toLowerCase() === String(record.productType).toLowerCase()) {
        cb.checked = true;
      }
    });
  }

  if (record.entityType) {
    setGroupValue("entityType", record.entityType);
    renderChecklist();
  }

  // Section B: Address Details (Entity)
  setVal("registeredAddress", record.registeredAddress);
  setVal("registeredCity", record.registeredCity);
  setVal("registeredPincode", record.registeredPincode);
  setVal("registeredState", record.registeredState);
  setVal("registeredCountry", record.registeredCountry);
  setVal("phone", record.phone);
  setVal("website", record.website);
  setVal("email", record.email);
  setVal("correspondenceCity", record.correspondenceCity);
  setVal("correspondencePincode", record.correspondencePincode);
  setVal("correspondenceState", record.correspondenceState);
  setVal("correspondenceCountry", record.correspondenceCountry);

  // Contact Person / Authorized Signatory
  setVal("authSignatoryName", record.authSignatoryName);
  setVal("dob", record.dob);
  setVal("authSignatoryTel", record.authSignatoryTel);
  setVal("authSignatoryFax", record.authSignatoryFax);
  setVal("authSignatoryEmail", record.authSignatoryEmail);
  setVal("authSignatoryPan", record.authSignatoryPan);
  setVal("authSignatoryOvdNo", record.authSignatoryOvdNo);

  if (record.authSignatoryOvdType) {
    setGroupValue("authSignatoryOvdType", record.authSignatoryOvdType);
  }

  // Section C: PEP & Income
  if (record.isPep) {
    if (isPepCheckbox) isPepCheckbox.checked = true;
    if (pepDetailsWrap) pepDetailsWrap.classList.remove("hidden");
  } else {
    if (isPepCheckbox) isPepCheckbox.checked = false;
    if (pepDetailsWrap) pepDetailsWrap.classList.add("hidden");
  }
  setVal("pepDetails", record.pepDetails);

  if (record.incomeRange) {
    setGroupValue("incomeRange", record.incomeRange);
  }
  setVal("netWorth", record.netWorth);
  setVal("netWorthDate", record.netWorthDate);

  // Activities
  const forexVal = record.isForexMoneyChanger ? "Yes" : "No";
  const forexRadio = form.querySelector(`input[name="isForexMoneyChanger"][value="${forexVal}"]`);
  if (forexRadio) forexRadio.checked = true;

  const gamblingVal = record.isGamblingGamingLottery ? "Yes" : "No";
  const gamblingRadio = form.querySelector(`input[name="isGamblingGamingLottery"][value="${gamblingVal}"]`);
  if (gamblingRadio) gamblingRadio.checked = true;

  const moneyVal = record.isMoneyLendingPawning ? "Yes" : "No";
  const moneyRadio = form.querySelector(`input[name="isMoneyLendingPawning"][value="${moneyVal}"]`);
  if (moneyRadio) moneyRadio.checked = true;

  // Uploaded Verification Documents
  const aadhaarInput = document.getElementById("aadhaarCardInput");
  const panInput = document.getElementById("panCardInput");
  const uploaded = record.uploadedDocuments || {};

  if (uploaded.aadhaarCard && aadhaarInput) {
    aadhaarInput.removeAttribute("required");
    let notice = document.getElementById("aadhaarExistingNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "aadhaarExistingNotice";
      notice.style.cssText = "font-size: 13px; color: #155724; margin-top: 8px; font-weight: bold; background: #eaf8ee; padding: 8px 12px; border-radius: 6px; border: 1px solid #c3e6cb; display: flex; align-items: center; justify-content: space-between;";
      aadhaarInput.parentNode.appendChild(notice);
    }
    notice.innerHTML = `
      <span>✓ Currently Uploaded: <a href="/uploads/${escapeHtml(uploaded.aadhaarCard)}" target="_blank" style="color: #0056b3; text-decoration: underline; font-weight: bold;">${escapeHtml(uploaded.aadhaarCardOriginalName || "Aadhaar Card")}</a></span>
      <span style="font-size: 11px; color: #666; font-weight: normal;">(Choose file only if replacing)</span>
    `;
  }

  if (uploaded.panCard && panInput) {
    panInput.removeAttribute("required");
    let notice = document.getElementById("panExistingNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "panExistingNotice";
      notice.style.cssText = "font-size: 13px; color: #155724; margin-top: 8px; font-weight: bold; background: #eaf8ee; padding: 8px 12px; border-radius: 6px; border: 1px solid #c3e6cb; display: flex; align-items: center; justify-content: space-between;";
      panInput.parentNode.appendChild(notice);
    }
    notice.innerHTML = `
      <span>✓ Currently Uploaded: <a href="/uploads/${escapeHtml(uploaded.panCard)}" target="_blank" style="color: #0056b3; text-decoration: underline; font-weight: bold;">${escapeHtml(uploaded.panCardOriginalName || "PAN Card")}</a></span>
      <span style="font-size: 11px; color: #666; font-weight: normal;">(Choose file only if replacing)</span>
    `;
  }

  // Section D: KYC Document Checklist Checkboxes
  setVal("panCardMandatory", record.panCardMandatory);
  setVal("gstIfApplicable", record.gstIfApplicable);

  if (Array.isArray(record.documentChecklist) && record.documentChecklist.length) {
    const staticInputs = getStaticDocumentInputs();
    record.documentChecklist.forEach((item) => {
      const target = staticInputs.find((input) => {
        const label = input.closest("label");
        const labelText = label ? label.textContent.replace(/\s+/g, " ").trim() : input.name;
        return labelText === item.name || input.name === item.name;
      });
      if (target) {
        target.checked = Boolean(item.selected);
      }
    });
  }

  if (Array.isArray(record.documentsVerified) && record.documentsVerified.length && docChecklistDiv) {
    record.documentsVerified.forEach((docItem) => {
      const rows = docChecklistDiv.querySelectorAll(".doc-row");
      rows.forEach((row) => {
        const cb = row.querySelector(".doc-checkbox");
        const label = cb ? cb.dataset.label : "";
        if (label && docItem.includes(label)) {
          cb.checked = true;
          if (docItem.includes("Original Verified")) {
            const m = row.querySelector('input[data-method="Original Verified"]');
            if (m) m.checked = true;
          } else if (docItem.includes("Self-Attested")) {
            const m = row.querySelector('input[data-method="Self-Attested"]');
            if (m) m.checked = true;
          }
        }
      });
    });
  }

  // Directors Table (#boTable tbody)
  const directorsList = (record.directors && record.directors.length ? record.directors : record.beneficialOwners) || [];
  if (boTableBody) {
    boTableBody.innerHTML = "";
    if (directorsList.length > 0) {
      directorsList.forEach((dir) => {
        addBoRow({
          name: dir.name,
          email: dir.email,
          phone: dir.phone,
          rejectionReason: dir.rejectionReason,
        });
      });
    } else {
      addBoRow();
    }
  }

  // Declaration / Client
  setVal("declarationAccepted", record.declarationAccepted);
  setVal("signedPlace", record.signedPlace);
  setVal("signedDate", record.signedDate);
  setVal("clientName", record.clientName);
  setVal("clientDesignation", record.clientDesignation);
  setVal("clientDate", record.clientDate);
  setVal("clientPlace", record.clientPlace);

  // Relationship Manager Details
  setVal("verifiedByRmName", record.verifiedByRmName);
  setVal("rmDesignation", record.rmDesignation);
  setVal("rmDate", record.rmDate);
  setVal("rmPlace", record.rmPlace);
  setVal("originalVerified", record.originalVerified);
  setVal("selfAttested", record.selfAttested);
  setVal("clientSignatureVerified", record.clientSignatureVerified);
  setVal("documentsSeenAndVerified", record.documentsSeenAndVerified);
  setVal("signedInPresence", record.signedInPresence);

  // Update Submit Button Text & Style
  const submitBtn = document.getElementById("submitBtn");
  if (submitBtn) {
    submitBtn.textContent = "Update & Resubmit KYC Form";
    submitBtn.style.backgroundColor = "#28a745";
    submitBtn.style.color = "#ffffff";
    submitBtn.style.fontWeight = "bold";
    submitBtn.style.padding = "12px 24px";
    submitBtn.style.fontSize = "15px";
    submitBtn.style.cursor = "pointer";
  }
}

async function autoFillFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const kycId = urlParams.get("kycId");
  const name = urlParams.get("name");
  const email = urlParams.get("email");
  const phone = urlParams.get("phone");
  const entityName = urlParams.get("entityName");

  if (kycId) {
    activeKycId = kycId;
    try {
      setStatus("Loading existing KYC details...", "");
      const res = await fetch(`/api/kyc/${encodeURIComponent(kycId)}`);
      const result = await res.json();
      if (!res.ok || !result.success || !result.data) {
        throw new Error(result.message || "Could not retrieve KYC application.");
      }
      populateFormWithRecord(result.data);
      setStatus("Loaded existing KYC details. Please update any necessary fields and resubmit.", "info");
    } catch (err) {
      console.error("Error auto-filling from kycId:", err);
      setStatus("Note: Could not automatically load previous KYC details (" + err.message + ")", "error");
    }
  }

  if (name) {
    const authNameInput = form.querySelector('input[name="authSignatoryName"]');
    const clientNameInput = form.querySelector('input[name="clientName"]');
    if (authNameInput && !authNameInput.value) authNameInput.value = name;
    if (clientNameInput && !clientNameInput.value) clientNameInput.value = name;
  }
  if (email) {
    const emailInput = form.querySelector('input[name="email"]');
    const authEmailInput = form.querySelector('input[name="authSignatoryEmail"]');
    if (emailInput && !emailInput.value) emailInput.value = email;
    if (authEmailInput && !authEmailInput.value) authEmailInput.value = email;
  }
  if (phone) {
    const phoneInput = form.querySelector('input[name="phone"]');
    const authTelInput = form.querySelector('input[name="authSignatoryTel"]');
    if (phoneInput && !phoneInput.value) phoneInput.value = phone;
    if (authTelInput && !authTelInput.value) authTelInput.value = phone;
  }
  if (entityName) {
    const entityInput = form.querySelector('input[name="entityName"]');
    if (entityInput && !entityInput.value) entityInput.value = entityName;
  }
}
autoFillFromUrl();

// ============================================================================
// CUSTOM VALIDATION ENGINE & FORMATTERS
// ============================================================================

const REGEX_PAN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const REGEX_GST = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const REGEX_EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const REGEX_PINCODE = /^[1-9][0-9]{5}$/;
const REGEX_MOBILE = /^[6-9][0-9]{9}$/;
const REGEX_PHONE = /^[0-9]{10,12}$/;
const REGEX_NAME = /^[a-zA-Z\s.'-]{2,}$/;

function isValidDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

function isDateInFuture(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d > today;
}

function calculateAge(dateStr) {
  if (!dateStr) return 0;
  const dob = new Date(dateStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function getFieldContainer(el) {
  if (!el) return null;
  if (el instanceof NodeList || Array.isArray(el)) {
    el = el[0];
  }
  if (!el || !el.closest) return null;

  // If inside table td (director row)
  const td = el.closest("td");
  if (td) return td;

  if (el.id === "aadhaarCardInput" || el.id === "panCardInput") {
    return el.parentElement;
  }

  // If inside specific signature and verification containers
  const sigLine = el.closest(".signature-line");
  if (sigLine) return sigLine;

  const verOptions = el.closest(".verification-options");
  if (verOptions) return verOptions;

  const rmVer = el.closest(".rm-verification");
  if (rmVer) return rmVer;

  const mandOptions = el.closest(".mandatory-options");
  if (mandOptions) return mandOptions;

  // If inside standard field containers
  const origField = el.closest(".original-field, .address-field, .other-box, .document-upload-box, .kyc-document-heading, .corporate-id-row, .table-wrap");
  if (origField) return origField;

  const letterBoxes = el.closest(".letter-boxes");
  if (letterBoxes && letterBoxes.parentElement) return letterBoxes.parentElement;

  if (el.closest("label")) return el.closest("label");

  return el.parentElement;
}

function setFieldError(fieldOrName, message, customEl) {
  let el = customEl || (typeof fieldOrName === "string" ? form.querySelector(`[name="${fieldOrName}"]`) : fieldOrName);
  if (!el && typeof fieldOrName === "string") {
    el = form.querySelectorAll(`[name="${fieldOrName}"]`);
    if (el.length === 0) el = null;
  }
  if (!el) return;

  const primaryEl = (el instanceof NodeList || Array.isArray(el)) ? el[0] : el;
  const isDeclaration = Boolean(primaryEl.closest(".original-declaration-section"));

  if (primaryEl.type === "checkbox" || primaryEl.type === "radio") {
    primaryEl.style.outline = "2px solid #dc3545";
    primaryEl.style.outlineOffset = "2px";
    if (primaryEl.classList) primaryEl.classList.add("input-error");
  } else {
    primaryEl.style.outline = "2px solid #dc3545";
    primaryEl.style.backgroundColor = "#fff8f8";
    if (primaryEl.classList) primaryEl.classList.add("input-error");
  }

  // Inside the declaration paper cards, avoid injecting DOM elements that distort layout
  if (!isDeclaration) {
    const container = getFieldContainer(primaryEl) || primaryEl.parentElement;
    if (container) {
      if (container.classList) container.classList.add("field-container-error");
      const fieldKey = primaryEl.name || primaryEl.id || primaryEl.className || "field";
      let errDiv = container.querySelector(`.field-error[data-for="${fieldKey}"]`);
      if (!errDiv) {
        errDiv = document.createElement("div");
        errDiv.className = "field-error";
        errDiv.dataset.for = fieldKey;
        container.appendChild(errDiv);
      }
      errDiv.innerHTML = `<span>⚠️</span> <span>${escapeHtml(message)}</span>`;
    }
  }
}

function clearFieldError(fieldOrName) {
  let el = typeof fieldOrName === "string" ? form.querySelector(`[name="${fieldOrName}"]`) : fieldOrName;
  if (!el && typeof fieldOrName === "string") {
    el = form.querySelectorAll(`[name="${fieldOrName}"]`);
    if (el.length === 0) el = null;
  }
  if (!el) return;

  const primaryEl = (el instanceof NodeList || Array.isArray(el)) ? el[0] : el;
  if (primaryEl) {
    primaryEl.style.outline = "";
    primaryEl.style.outlineOffset = "";
    primaryEl.style.backgroundColor = "";
    if (primaryEl.classList) {
      primaryEl.classList.remove("input-error");
      primaryEl.classList.remove("checkbox-error-highlight");
    }
  }

  const container = getFieldContainer(primaryEl) || primaryEl.parentElement;
  if (container) {
    const fieldKey = primaryEl.name || primaryEl.id || primaryEl.className || "field";
    const errDiv = container.querySelector(`.field-error[data-for="${fieldKey}"]`);
    if (errDiv) errDiv.remove();

    const remainingErrors = container.querySelectorAll(".field-error");
    if (remainingErrors.length === 0 && container.classList) {
      container.classList.remove("field-container-error");
    }
  }
}

function clearAllErrors() {
  form.querySelectorAll(".input-error").forEach((el) => {
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.style.backgroundColor = "";
    el.classList.remove("input-error");
  });
  form.querySelectorAll(".checkbox-error-highlight").forEach((el) => {
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.classList.remove("checkbox-error-highlight");
  });
  form.querySelectorAll(".field-container-error").forEach((el) => el.classList.remove("field-container-error"));
  form.querySelectorAll(".field-error").forEach((el) => el.remove());
  const banner = document.getElementById("validationSummaryBanner");
  if (banner) banner.remove();
}

function scrollToFirstError(el) {
  if (!el) return;
  const target = (el instanceof NodeList || Array.isArray(el)) ? el[0] : el;
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    if (typeof target.focus === "function") {
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
    const container = getFieldContainer(target);
    if (container) {
      container.classList.add("validation-shake");
      setTimeout(() => container.classList.remove("validation-shake"), 600);
    }
  }, 300);
}

function updateSummaryIfActive() {
  const remainingErrors = form.querySelectorAll(".field-error");
  if (remainingErrors.length === 0 && statusMsg && statusMsg.className === "error") {
    setStatus("", "");
  }
}

function renderValidationSummary(errors) {
  const banner = document.getElementById("validationSummaryBanner");
  if (banner) banner.remove();
}

function setupInputFormatters() {
  // Uppercase fields
  ["entityPan", "authSignatoryPan", "gstNo"].forEach((name) => {
    const input = form.querySelector(`input[name="${name}"]`);
    if (input) {
      input.addEventListener("input", () => {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.toUpperCase().replace(/\s+/g, "");
        if (name.includes("Pan")) {
          input.value = input.value.slice(0, 10);
        } else if (name === "gstNo") {
          input.value = input.value.slice(0, 15);
        }
        try { input.setSelectionRange(start, end); } catch (e) {}
        clearFieldError(input);
        updateSummaryIfActive();
      });
    }
  });

  // Numeric only fields
  [
    { name: "registeredPincode", max: 6 },
    { name: "correspondencePincode", max: 6 },
    { name: "authSignatoryTel", max: 15 },
    { name: "phone", max: 15 },
  ].forEach(({ name, max }) => {
    const input = form.querySelector(`input[name="${name}"]`);
    if (input) {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^\d+]/g, "").slice(0, max);
        clearFieldError(input);
        updateSummaryIfActive();
      });
    }
  });

  // Clear field errors on input & change
  form.addEventListener("input", (e) => {
    if (e.target && e.target.name) {
      clearFieldError(e.target);
      updateSummaryIfActive();
    }
  });

  form.addEventListener("change", (e) => {
    if (e.target && e.target.name) {
      clearFieldError(e.target);
      if (e.target.name === "originalVerified") {
        clearFieldError("originalVerified");
      }
      if (e.target.name === "selfAttested") {
        clearFieldError("selfAttested");
      }
      if (e.target.name === "panCardMandatory") {
        clearFieldError("panCardMandatory");
      }
      if (e.target.name === "clientSignatureVerified") {
        clearFieldError("clientSignatureVerified");
      }
      if (e.target.name === "documentsSeenAndVerified") {
        clearFieldError("documentsSeenAndVerified");
      }
      if (e.target.name === "signedInPresence") {
        clearFieldError("signedInPresence");
      }
      if (e.target.name === "entityType") {
        clearFieldError("entityType");
      }
      updateSummaryIfActive();
    }
    if (e.target && (e.target.id === "aadhaarCardInput" || e.target.id === "panCardInput")) {
      clearFieldError(e.target);
      updateSummaryIfActive();
    }
  });
}
setupInputFormatters();

function validateKycForm() {
  clearAllErrors();
  const errors = [];

  function addError(fieldOrName, message, el) {
    const targetEl = el || (typeof fieldOrName === "string" ? form.querySelector(`[name="${fieldOrName}"]`) : fieldOrName);
    errors.push({ field: fieldOrName, message, element: targetEl });
    setFieldError(fieldOrName, message, targetEl);
  }

  const fd = new FormData(form);

  // Corporate ID / SAP ID (Optional, max 50 chars)
  const corpId = (fd.get("corporateIdOrSapId") || "").trim();
  if (corpId && corpId.length > 50) {
    addError("corporateIdOrSapId", "Corporate ID / SAP ID cannot exceed 50 characters.");
  }

  // Product Type: if 'Other' selected, productTypeOther is required
  const selectedProduct = form.querySelector('input[name="productType"]:checked');
  if (selectedProduct && selectedProduct.value === "Other") {
    const otherVal = (fd.get("productTypeOther") || "").trim();
    if (!otherVal || otherVal.length < 2) {
      addError("productTypeOther", "Please specify the other Product Type.");
    }
  }

  // ========================================================================
  // SECTION A: IDENTITY DETAILS (ALL MANDATORY AS REQUESTED)
  // ========================================================================

  // A.1 Entity Name (Required)
  const entityName = (fd.get("entityName") || "").trim();
  if (!entityName) {
    addError("entityName", "1. Name of the Corporate is required.");
  } else if (entityName.length < 2) {
    addError("entityName", "Name of the Corporate must be at least 2 characters long.");
  }

  // A.2 Date of Incorporation (Required)
  const incDate = fd.get("incDate");
  if (!incDate) {
    addError("incDate", "2. Date of Incorporation / Registration is required.");
  } else if (!isValidDate(incDate)) {
    addError("incDate", "Please provide a valid Date of Incorporation.");
  } else if (isDateInFuture(incDate)) {
    addError("incDate", "Date of Incorporation cannot be a future date.");
  }

  // A.3 Registration Number (Required)
  const regNo = (fd.get("registrationNo") || "").trim();
  if (!regNo) {
    addError("registrationNo", "3. Registration Number issued by Registration Authority is required.");
  } else if (regNo.length < 2) {
    addError("registrationNo", "Registration Number must be at least 2 characters.");
  }

  // A.4 Entity Type (Required)
  const entityType = getGroupValue("entityType");
  const entityTypeRadios = form.querySelectorAll('input[name="entityType"]');
  if (!entityType) {
    addError("entityType", "4. Entity Type is required. Please select an option (Company, HUF, LLP, Society, Trust).", entityTypeRadios[0]);
  }
  const entityTypeOther = (fd.get("entityTypeOther") || "").trim();
  if (entityType === "Other" && (!entityTypeOther || entityTypeOther.length < 2)) {
    addError("entityTypeOther", "Please specify the entity type in 'Please Specify'.");
  }

  // A.5 Entity PAN (Required, valid PAN format)
  const entityPan = (fd.get("entityPan") || "").trim().toUpperCase();
  if (!entityPan) {
    addError("entityPan", "5. Entity Permanent Account Number (PAN) is required.");
  } else if (!REGEX_PAN.test(entityPan)) {
    addError("entityPan", "Entity PAN must be a valid 10-character PAN (e.g. ABCDE1234F).");
  }

  // A.6 Nature of Business (Required)
  const natureOfBusiness = (fd.get("natureOfBusiness") || "").trim();
  if (!natureOfBusiness) {
    addError("natureOfBusiness", "6. Nature of Business is required.");
  } else if (natureOfBusiness.length < 2) {
    addError("natureOfBusiness", "Nature of Business must be at least 2 characters long.");
  }

  // GST Number validation if entered
  const gstNo = (fd.get("gstNo") || "").trim().toUpperCase();
  if (gstNo && !REGEX_GST.test(gstNo)) {
    addError("gstNo", "GSTIN must be 15 alphanumeric characters (e.g. 24AAAAA0000A1Z5).");
  }

  // ========================================================================
  // SECTION B: ADDRESS DETAILS (ENTITY)
  // (2. Address for Correspondence is OPTIONAL as requested)
  // ========================================================================

  // B.1 Registered Address (Required)
  const registeredAddress = (fd.get("registeredAddress") || "").trim();
  if (!registeredAddress) {
    addError("registeredAddress", "Registered Address is required.");
  } else if (registeredAddress.length < 3) {
    addError("registeredAddress", "Registered Address must be at least 3 characters long.");
  }

  const registeredCity = (fd.get("registeredCity") || "").trim();
  if (!registeredCity) {
    addError("registeredCity", "City/Town/Village is required.");
  } else if (registeredCity.length < 2) {
    addError("registeredCity", "City must be at least 2 characters.");
  }

  const registeredPincode = (fd.get("registeredPincode") || "").trim();
  if (!registeredPincode) {
    addError("registeredPincode", "Pincode is required.");
  } else if (!REGEX_PINCODE.test(registeredPincode)) {
    addError("registeredPincode", "Pincode must be exactly 6 digits (e.g. 380001).");
  }

  const registeredState = (fd.get("registeredState") || "").trim();
  if (!registeredState) {
    addError("registeredState", "State is required.");
  } else if (registeredState.length < 2) {
    addError("registeredState", "Please enter a valid State name.");
  }

  const registeredCountry = (fd.get("registeredCountry") || "").trim();
  if (!registeredCountry) {
    addError("registeredCountry", "Country is required.");
  } else if (registeredCountry.length < 2) {
    addError("registeredCountry", "Please enter a valid Country name.");
  }

  // Phone (Entity) (Required)
  const phone = (fd.get("phone") || "").trim();
  if (!phone) {
    addError("phone", "Entity Ph. No. is required.");
  } else {
    const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, "").replace(/^91/, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 12) {
      addError("phone", "Entity Phone Number must be a valid 10-digit number.");
    }
  }

  // Email (Entity) (Required)
  const email = (fd.get("email") || "").trim();
  if (!email) {
    addError("email", "Entity Email ID is required.");
  } else if (!REGEX_EMAIL.test(email)) {
    addError("email", "Please provide a valid Entity Email address (e.g. info@company.com).");
  }

  // Website (Optional, validate if entered)
  const website = (fd.get("website") || "").trim();
  if (website && !/^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/i.test(website)) {
    addError("website", "Please enter a valid Website URL (e.g., https://example.com).");
  }

  // B.2 Address for Correspondence (EXPLICITLY OPTIONAL)
  const corrPincode = (fd.get("correspondencePincode") || "").trim();
  if (corrPincode && !REGEX_PINCODE.test(corrPincode)) {
    addError("correspondencePincode", "Correspondence Pincode must be exactly 6 digits.");
  }

  // B.3 Contact Person / Authorized Signatory Details (Required)
  const authSignatoryName = (fd.get("authSignatoryName") || "").trim();
  if (!authSignatoryName) {
    addError("authSignatoryName", "Contact Person / Authorized Signatory Name is required.");
  } else if (authSignatoryName.length < 2) {
    addError("authSignatoryName", "Authorized Signatory Name must be at least 2 characters.");
  }

  const dob = fd.get("dob");
  if (!dob) {
    addError("dob", "Date of Birth (DOB) is required.");
  } else if (!isValidDate(dob)) {
    addError("dob", "Please enter a valid Date of Birth.");
  } else if (isDateInFuture(dob)) {
    addError("dob", "Date of Birth cannot be a future date.");
  } else {
    const age = calculateAge(dob);
    if (age < 18) {
      addError("dob", "Authorized Signatory must be at least 18 years of age.");
    }
  }

  const authSignatoryTel = (fd.get("authSignatoryTel") || "").trim();
  if (!authSignatoryTel) {
    addError("authSignatoryTel", "Authorized Signatory Tel (Off) / Mobile is required.");
  } else {
    const cleanAuthTel = authSignatoryTel.replace(/[\s\-\(\)\+]/g, "").replace(/^91/, "");
    if (cleanAuthTel.length < 10 || cleanAuthTel.length > 12) {
      addError("authSignatoryTel", "Authorized Signatory Tel must be a valid 10-digit mobile number.");
    }
  }

  const authSignatoryEmail = (fd.get("authSignatoryEmail") || "").trim();
  if (!authSignatoryEmail) {
    addError("authSignatoryEmail", "Authorized Signatory Email ID is required.");
  } else if (!REGEX_EMAIL.test(authSignatoryEmail)) {
    addError("authSignatoryEmail", "Please provide a valid email address for Authorized Signatory.");
  }

  const authSignatoryFax = (fd.get("authSignatoryFax") || "").trim();
  if (authSignatoryFax && !/^[0-9\+\-\s\(\)]{5,25}$/.test(authSignatoryFax)) {
    addError("authSignatoryFax", "Please enter a valid FAX number.");
  }

  // B.4 Authorized Signatory PAN & OVD (Required)
  const authSignatoryPan = (fd.get("authSignatoryPan") || "").trim().toUpperCase();
  if (!authSignatoryPan) {
    addError("authSignatoryPan", "Authorized Signatory PAN No. is required.");
  } else if (!REGEX_PAN.test(authSignatoryPan)) {
    addError("authSignatoryPan", "Authorized Signatory PAN must be a valid 10-character PAN (e.g. ABCDE1234F).");
  }

  const authSignatoryOvdNo = (fd.get("authSignatoryOvdNo") || "").trim();
  if (!authSignatoryOvdNo) {
    addError("authSignatoryOvdNo", "Authorized Signatory OVD No. is required.");
  } else if (authSignatoryOvdNo.length < 2) {
    addError("authSignatoryOvdNo", "OVD Number must be at least 2 characters.");
  }

  // --- Section C: Other Details ---
  if (isPepCheckbox && isPepCheckbox.checked) {
    const pepDetails = (fd.get("pepDetails") || "").trim();
    if (!pepDetails || pepDetails.length < 2) {
      addError("pepDetails", "Please enter Details of PEP/RPEP (mandatory when PEP is checked).");
    }
  }

  const netWorthDate = fd.get("netWorthDate");
  if (netWorthDate) {
    if (!isValidDate(netWorthDate)) {
      addError("netWorthDate", "Please provide a valid Networth date.");
    } else if (isDateInFuture(netWorthDate)) {
      addError("netWorthDate", "Networth 'as on date' cannot be in the future.");
    }
  }

  // ========================================================================
  // SECTION D: KYC DETAILS & MANDATORY DOCUMENTS
  // ========================================================================
  const aadhaarInput = document.getElementById("aadhaarCardInput");
  const panInput = document.getElementById("panCardInput");

  const ALLOWED_EXTS = [".pdf", ".png", ".jpg", ".jpeg"];
  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
  const isEditMode = new URLSearchParams(window.location.search).get("mode") === "edit" || !!activeKycId;
  const hasExistingAadhaar = Boolean(document.getElementById("aadhaarExistingNotice"));
  const hasExistingPan = Boolean(document.getElementById("panExistingNotice"));

  // Validate Aadhaar file upload
  if (aadhaarInput && aadhaarInput.files && aadhaarInput.files.length > 0) {
    const file = aadhaarInput.files[0];
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      addError("aadhaarCard", `Invalid Aadhaar file format (${ext}). Only PDF, PNG, JPG are allowed.`, aadhaarInput);
    } else if (file.size > MAX_FILE_SIZE) {
      addError("aadhaarCard", `Aadhaar file size exceeds 15MB limit.`, aadhaarInput);
    }
  } else if (!isEditMode && !hasExistingAadhaar) {
    addError("aadhaarCard", "Aadhaar Card document upload is required (*.pdf, *.png, *.jpg).", aadhaarInput);
  }

  // Validate PAN file upload
  if (panInput && panInput.files && panInput.files.length > 0) {
    const file = panInput.files[0];
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      addError("panCard", `Invalid PAN file format (${ext}). Only PDF, PNG, JPG are allowed.`, panInput);
    } else if (file.size > MAX_FILE_SIZE) {
      addError("panCard", `PAN file size exceeds 15MB limit.`, panInput);
    }
  } else if (!isEditMode && !hasExistingPan) {
    addError("panCard", "PAN Card document upload is required (*.pdf, *.png, *.jpg).", panInput);
  }

  // "Copy of PAN Card (Mandatory for all categories of a entity)" - MUST BE CHECKED
  const panCardMandatory = form.querySelector('input[name="panCardMandatory"]');
  if (!panCardMandatory || !panCardMandatory.checked) {
    addError("panCardMandatory", "Please tick 'Copy of PAN Card (Mandatory for all categories of a entity)'.", panCardMandatory);
  }

  // "GST (If Applicable)" - validate GST format if checked or GST number is filled
  const gstIfApplicable = form.querySelector('input[name="gstIfApplicable"]');
  if (gstIfApplicable && gstIfApplicable.checked && !gstNo) {
    // Info / notice: if GST is checked, GST number should be filled in Section A
  }

  // Document checklist table: ensure at least one document is checked
  const checkedDocs = collectCheckedDocs();
  if (!checkedDocs || checkedDocs.length === 0) {
    const tableEl = form.querySelector(".original-kyc-table") || form.querySelector(".mandatory-options");
    addError("documentChecklist", "Please tick the applicable documents attached from the KYC checklist table.", tableEl);
  }

  // ========================================================================
  // REQUIRED DIRECTORS FOR KYC (AT LEAST ONE VALID DIRECTOR REQUIRED)
  // ========================================================================
  const boRows = boTableBody ? Array.from(boTableBody.querySelectorAll("tr")) : [];
  if (boRows.length === 0) {
    addError("directors", "At least one Director is required for KYC.", addBoRowBtn || boTableBody);
  } else {
    let completeDirectorsCount = 0;
    const seenEmails = new Set();
    const seenPhones = new Set();

    boRows.forEach((row, idx) => {
      const nameInput = row.querySelector(".bo-name");
      const emailInput = row.querySelector(".bo-email");
      const phoneInput = row.querySelector(".bo-phone");

      const dName = nameInput ? nameInput.value.trim() : "";
      const dEmail = emailInput ? emailInput.value.trim().toLowerCase() : "";
      const dPhone = phoneInput ? phoneInput.value.trim() : "";

      const rowLabel = `Director #${idx + 1}`;

      if (!dName) {
        addError(`bo-name-${idx}`, `${rowLabel}: Name is required.`, nameInput);
      } else if (dName.length < 2) {
        addError(`bo-name-${idx}`, `${rowLabel}: Name must be at least 2 characters.`, nameInput);
      }

      if (!dEmail) {
        addError(`bo-email-${idx}`, `${rowLabel}: Email is required.`, emailInput);
      } else if (!REGEX_EMAIL.test(dEmail)) {
        addError(`bo-email-${idx}`, `${rowLabel}: Please enter a valid email address.`, emailInput);
      } else if (seenEmails.has(dEmail)) {
        addError(`bo-email-${idx}`, `${rowLabel}: Email '${dEmail}' is already used for another Director.`, emailInput);
      } else {
        seenEmails.add(dEmail);
      }

      if (!dPhone) {
        addError(`bo-phone-${idx}`, `${rowLabel}: Phone number is required.`, phoneInput);
      } else {
        const cleanDPhone = dPhone.replace(/[\s\-\(\)\+]/g, "").replace(/^91/, "");
        if (cleanDPhone.length < 10 || cleanDPhone.length > 12) {
          addError(`bo-phone-${idx}`, `${rowLabel}: Phone must be a valid 10-digit mobile number.`, phoneInput);
        } else if (seenPhones.has(cleanDPhone)) {
          addError(`bo-phone-${idx}`, `${rowLabel}: Phone number '${dPhone}' is already used for another Director.`, phoneInput);
        } else {
          seenPhones.add(cleanDPhone);
        }
      }

      if (dName && dEmail && dPhone) {
        completeDirectorsCount++;
      }
    });

    if (completeDirectorsCount === 0 && boRows.length > 0) {
      addError("directors", "At least one complete Director (Name, Email, Phone) is required for KYC.", boTableBody);
    }
  }

  // ========================================================================
  // CORPORATE / CLIENT SIGNATURE DETAILS (ALL MANDATORY AS REQUESTED)
  // Name, Designation, Date, Place
  // ========================================================================
  const clientName = (fd.get("clientName") || "").trim();
  if (!clientName) {
    addError("clientName", "Corporate / Client Name is required.");
  } else if (clientName.length < 2) {
    addError("clientName", "Corporate / Client Name must be at least 2 characters.");
  }

  const clientDesignation = (fd.get("clientDesignation") || "").trim();
  if (!clientDesignation) {
    addError("clientDesignation", "Corporate / Client Designation is required.");
  } else if (clientDesignation.length < 2) {
    addError("clientDesignation", "Corporate / Client Designation must be at least 2 characters.");
  }

  const clientDate = fd.get("clientDate");
  if (!clientDate) {
    addError("clientDate", "Corporate / Client Date is required.");
  } else if (!isValidDate(clientDate)) {
    addError("clientDate", "Please provide a valid Corporate / Client Date.");
  }

  const clientPlace = (fd.get("clientPlace") || "").trim();
  if (!clientPlace) {
    addError("clientPlace", "Corporate / Client Place is required.");
  } else if (clientPlace.length < 2) {
    addError("clientPlace", "Corporate / Client Place must be at least 2 characters.");
  }

  // ========================================================================
  // RELATIONSHIP MANAGER SIGNATURE DETAILS (ALL MANDATORY AS REQUESTED)
  // Name, Designation, Date, Place
  // ========================================================================
  const rmName = (fd.get("verifiedByRmName") || "").trim();
  if (!rmName) {
    addError("verifiedByRmName", "Relationship Manager Name is required.");
  } else if (rmName.length < 2) {
    addError("verifiedByRmName", "Relationship Manager Name must be at least 2 characters.");
  }

  const rmDesignation = (fd.get("rmDesignation") || "").trim();
  if (!rmDesignation) {
    addError("rmDesignation", "Relationship Manager Designation is required.");
  } else if (rmDesignation.length < 2) {
    addError("rmDesignation", "Relationship Manager Designation must be at least 2 characters.");
  }

  const rmDate = fd.get("rmDate");
  if (!rmDate) {
    addError("rmDate", "Relationship Manager Date is required.");
  } else if (!isValidDate(rmDate)) {
    addError("rmDate", "Please provide a valid RM Verification Date.");
  }

  const rmPlace = (fd.get("rmPlace") || "").trim();
  if (!rmPlace) {
    addError("rmPlace", "Relationship Manager Place is required.");
  } else if (rmPlace.length < 2) {
    addError("rmPlace", "Relationship Manager Place must be at least 2 characters.");
  }

  // ========================================================================
  // VERIFICATION CHECKBOXES (ALL MANDATORY AS REQUESTED)
  // ========================================================================

  // (Original Verified) – True copies of Document received
  const originalVerified = form.querySelector('input[name="originalVerified"]');
  if (!originalVerified || !originalVerified.checked) {
    addError("originalVerified", "Please tick: '(Original Verified) – True copies of Document received.'", originalVerified);
  }

  // (Self-Attested) – Self Certified document copies received
  const selfAttested = form.querySelector('input[name="selfAttested"]');
  if (!selfAttested || !selfAttested.checked) {
    addError("selfAttested", "Please tick: '(Self-Attested) – Self Certified document copies received.'", selfAttested);
  }

  // Client / customer / authorised signature signed in my personal
  const clientSignatureVerified = form.querySelector('input[name="clientSignatureVerified"]');
  if (!clientSignatureVerified || !clientSignatureVerified.checked) {
    addError("clientSignatureVerified", "Please tick: 'Client / customer / authorised signature signed in my personal.'", clientSignatureVerified);
  }

  // Entity documents seen and verified
  const documentsSeenAndVerified = form.querySelector('input[name="documentsSeenAndVerified"]');
  if (!documentsSeenAndVerified || !documentsSeenAndVerified.checked) {
    addError("documentsSeenAndVerified", "Please tick: 'Entity documents seen and verified.'", documentsSeenAndVerified);
  }

  // Entity authorized person sign in my presence
  const signedInPresence = form.querySelector('input[name="signedInPresence"]');
  if (!signedInPresence || !signedInPresence.checked) {
    addError("signedInPresence", "Please tick: 'Entity authorized person sign in my presence.'", signedInPresence);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Run custom validation across fields
  const validation = validateKycForm();
  if (!validation.isValid) {
    // Unfocus submit button to avoid browser scrolling down to it
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }

    const errorCount = validation.errors.length;
    setStatus(`⚠️ Please resolve the ${errorCount} highlighted validation error${errorCount > 1 ? "s" : ""} on the form.`, "error");

    if (window.Swal) {
      Swal.fire({
        icon: "warning",
        iconColor: "#dc3545",
        title: "Validation Incomplete",
        returnFocus: false,
        heightAuto: false,
        scrollbarPadding: false,
        html: `
          <div style="font-size: 13.5px; color: #333; text-align: left;">
            <p style="margin-bottom: 8px; font-weight: bold; color: #dc3545;">
              Please complete all mandatory details before submitting (${errorCount} field${errorCount > 1 ? "s" : ""} require attention):
            </p>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.6; max-height: 220px; overflow-y: auto; color: #444;">
              ${validation.errors.slice(0, 8).map(err => `<li>${escapeHtml(err.message)}</li>`).join("")}
              ${validation.errors.length > 8 ? `<li style="color:#777; font-style:italic;">...and ${validation.errors.length - 8} more field(s)</li>` : ""}
            </ul>
          </div>
        `,
        confirmButtonColor: "#1f3b57",
        confirmButtonText: "Review & Complete",
      }).then(() => {
        const firstInvalid = validation.errors[0]?.element;
        if (firstInvalid) {
          scrollToFirstError(firstInvalid);
        }
      });
    } else {
      scrollToFirstError(validation.errors[0]?.element);
    }
    return;
  }

  // Clear summary banner on valid submit
  renderValidationSummary([]);
  setStatus("Submitting KYC & Uploading Verification Documents...", "");
  downloadBtn.disabled = true;

  const fd = new FormData(form);
  const selectedProduct = form.querySelector('input[name="productType"]:checked');
  const payload = {
    entityName: fd.get("entityName"),
    entityType: getGroupValue("entityType"),
    entityPan: (fd.get("entityPan") || "").toUpperCase(),
    incorporationDate: fd.get("incDate") || undefined,
    registrationNo: fd.get("registrationNo"),
    dob: fd.get("dob") || undefined,
    corporateIdOrSapId: (fd.get("corporateIdOrSapId") || "").trim() || undefined,
    productType: selectedProduct ? selectedProduct.value : undefined,
    productTypeOther: fd.get("productTypeOther") || undefined,
    gstNo: fd.get("gstNo"),
    registeredAddress: fd.get("registeredAddress"),
    phone: fd.get("phone"),
    website: fd.get("website"),
    authSignatoryName: fd.get("authSignatoryName"),
    authSignatoryPan: fd.get("authSignatoryPan"),
    authSignatoryOvdType: getGroupValue("authSignatoryOvdType"),
    authSignatoryOvdNo: fd.get("authSignatoryOvdNo"),
    isPep: !!isPepCheckbox?.checked,
    pepDetails: fd.get("pepDetails"),
    incomeRange: getGroupValue("incomeRange") || undefined,
    netWorth: fd.get("netWorth"),
    netWorthDate: fd.get("netWorthDate") || undefined,
    isForexMoneyChanger: fd.get("isForexMoneyChanger") === "Yes",
    isGamblingGamingLottery: fd.get("isGamblingGamingLottery") === "Yes",
    isMoneyLendingPawning: fd.get("isMoneyLendingPawning") === "Yes",
    documentsVerified: collectCheckedDocs(),
    documentChecklist: collectDocumentChecklist(),
    beneficialOwners: collectBeneficialOwners(),
    directors: collectBeneficialOwners(),
    declarationAccepted: true,
    signedPlace: fd.get("signedPlace"),
    signedDate: fd.get("signedDate") || undefined,
    clientDate: fd.get("clientDate") || undefined,
    verifiedByRmName: fd.get("verifiedByRmName"),
    rmDate: fd.get("rmDate") || undefined,
    documentsSeenAndVerified: !!fd.get("documentsSeenAndVerified"),
    signedInPresence: !!fd.get("signedInPresence"),
    entityTypeOther: fd.get("entityTypeOther"),
    natureOfBusiness: fd.get("natureOfBusiness"),
    email: fd.get("email"),
    registeredCity: fd.get("registeredCity"),
    registeredPincode: fd.get("registeredPincode"),
    registeredState: fd.get("registeredState"),
    registeredCountry: fd.get("registeredCountry"),
    correspondenceCity: fd.get("correspondenceCity"),
    correspondencePincode: fd.get("correspondencePincode"),
    correspondenceState: fd.get("correspondenceState"),
    correspondenceCountry: fd.get("correspondenceCountry"),
    authSignatoryTel: fd.get("authSignatoryTel"),
    authSignatoryFax: fd.get("authSignatoryFax"),
    authSignatoryEmail: fd.get("authSignatoryEmail"),
    clientName: fd.get("clientName"),
    clientDesignation: fd.get("clientDesignation"),
    clientPlace: fd.get("clientPlace"),
    rmDesignation: fd.get("rmDesignation"),
    rmPlace: fd.get("rmPlace"),
    originalVerified: !!fd.get("originalVerified"),
    selfAttested: !!fd.get("selfAttested"),
    clientSignatureVerified: !!fd.get("clientSignatureVerified"),
    panCardMandatory: !!fd.get("panCardMandatory"),
    gstIfApplicable: !!fd.get("gstIfApplicable"),
  };

  if (activeKycId) {
    payload._id = activeKycId;
  }

  const uploadFormData = new FormData();
  uploadFormData.append("payload", JSON.stringify(payload));

  const aadhaarInput = document.getElementById("aadhaarCardInput");
  const panInput = document.getElementById("panCardInput");

  if (aadhaarInput && aadhaarInput.files[0]) {
    uploadFormData.append("aadhaarCard", aadhaarInput.files[0]);
  }
  if (panInput && panInput.files[0]) {
    uploadFormData.append("panCard", panInput.files[0]);
  }

  try {
    const res = await fetch("/api/kyc", {
      method: "POST",
      body: uploadFormData,
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || "Submission failed");

    lastSubmittedId = result.id;
    const isUpdate = Boolean(activeKycId);
    setStatus(
      isUpdate
        ? "✓ KYC Form details updated and resubmitted successfully for Admin review!"
        : "KYC Form & Documents Submitted Successfully for DigiO Verification!",
      "success"
    );
    downloadBtn.disabled = false;
    printBtn.disabled = false;

    // If there was a rejection banner, update it to a success state
    const banner = document.getElementById("rejectionAlertBanner");
    if (banner) {
      banner.style.background = "#eaf8ee";
      banner.style.borderColor = "#28a745";
      banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:24px;">✅</span>
          <div>
            <h3 style="margin:0; color:#155724; font-size:16px;">Form Resubmitted Successfully!</h3>
            <p style="margin:4px 0 0 0; font-size:13px; color:#28a745;">Your updated application details have been submitted to compliance admin for approval.</p>
          </div>
        </div>
      `;
    }

    if (window.Swal) {
      Swal.fire({
        icon: "success",
        iconColor: "#28a745",
        title: isUpdate ? "Form Resubmitted Successfully!" : "KYC Submitted Successfully!",
        html: `
          <div style="font-size:14px;color:#333;line-height:1.5;">
            <p style="margin:0 0 10px 0;font-weight:600;color:#28a745;">
              ${isUpdate
                ? "Your KYC application details have been updated and resubmitted for Admin review."
                : "Your KYC application and documents have been submitted successfully!"}
            </p>
            ${result.id ? `<p style="margin:0;font-size:13px;color:#555;">Application Reference ID: <strong style="color:#155724;">${escapeHtml(result.id)}</strong></p>` : ""}
          </div>
        `,
        confirmButtonColor: "#28a745",
        confirmButtonText: "Done",
      });
    }
  } catch (err) {
    setStatus("Error: " + err.message, "error");
    if (window.Swal) {
      Swal.fire({
        icon: "error",
        iconColor: "#dc3545",
        title: "Submission Failed",
        text: err.message || "Failed to submit KYC form.",
        confirmButtonColor: "#dc3545",
        confirmButtonText: "OK",
      });
    }
  }
});

downloadBtn.addEventListener("click", async () => {
  if (!lastSubmittedId) return;

  downloadBtn.disabled = true;
  setStatus("Preparing KYC PDF...", "");
  try {
    const response = await fetch(`/api/kyc/${lastSubmittedId}/pdf`);
    if (!response.ok) throw new Error("PDF generation failed");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "KYC-Form.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setStatus("KYC PDF downloaded successfully.", "success");
    if (window.Swal) {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        iconColor: "#28a745",
        title: "KYC PDF downloaded successfully",
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
    }
  } catch (err) {
    setStatus("PDF Error: " + err.message, "error");
    if (window.Swal) {
      Swal.fire({
        icon: "error",
        iconColor: "#dc3545",
        title: "Download Error",
        text: err.message || "Failed to generate or download KYC PDF.",
        confirmButtonColor: "#dc3545",
        confirmButtonText: "OK",
      });
    }
  } finally {
    downloadBtn.disabled = false;
  }
});

printBtn.addEventListener("click", () => {
  if (!lastSubmittedId) return;
  const printWindow = window.open(`/api/kyc/${lastSubmittedId}/pdf`, "_blank");
  if (!printWindow) setStatus("PDF Error: Please allow pop-ups to print the PDF.", "error");
});

