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
const pepDetailsWrap = document.getElementById("pepDetailsWrap");
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

function addBoRow(data = {}) {
  if (!boTableBody) return;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="bo-name" value="${data.name || ""}" /></td>
    <td><input type="email" class="bo-email" value="${data.email || ""}" /></td>
    <td><input type="text" class="bo-designation" value="${data.designation || ""}" /></td>
    <td><input type="text" class="bo-din" value="${data.din || ""}" /></td>
    <td><input type="text" class="bo-pan" value="${data.panNo || ""}" /></td>
    <td><input type="text" class="bo-pct" value="${data.percentageHolding || ""}" /></td>
    <td><button type="button" class="remove-row">X</button></td>
  `;
  tr.querySelector(".remove-row").addEventListener("click", () => tr.remove());
  boTableBody.appendChild(tr);
}
if (addBoRowBtn) addBoRowBtn.addEventListener("click", () => addBoRow());
if (boTableBody) addBoRow();

function collectBeneficialOwners() {
  if (!boTableBody) return [];
  return Array.from(boTableBody.querySelectorAll("tr"))
    .map((tr) => ({
      name: tr.querySelector(".bo-name").value.trim(),
      email: tr.querySelector(".bo-email").value.trim().toLowerCase(),
      designation: tr.querySelector(".bo-designation").value.trim(),
      din: tr.querySelector(".bo-din").value.trim(),
      panNo: tr.querySelector(".bo-pan").value.trim(),
      percentageHolding: tr.querySelector(".bo-pct").value.trim(),
    }))
    .filter((row) => row.name); // skip fully empty rows
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

function setStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = type || "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("Submitting...", "");
  downloadBtn.disabled = true;

  if (!getGroupValue("entityType")) {
    setStatus("Error: Please select an Entity Type.", "error");
    return;
  }

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
    incomeRange: getGroupValue("incomeRange"),
    netWorth: fd.get("netWorth"),
    netWorthDate: fd.get("netWorthDate") || undefined,
    isForexMoneyChanger: fd.get("isForexMoneyChanger") === "Yes",
    isGamblingGamingLottery: fd.get("isGamblingGamingLottery") === "Yes",
    isMoneyLendingPawning: fd.get("isMoneyLendingPawning") === "Yes",
    documentsVerified: collectCheckedDocs(),
    documentChecklist: collectDocumentChecklist(),
    beneficialOwners: collectBeneficialOwners(),
    directors: collectBeneficialOwners(),
    declarationAccepted: !!fd.get("declarationAccepted"),
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

  try {
    const res = await fetch("/api/kyc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || "Submission failed");

    lastSubmittedId = result.id;
    setStatus("KYC Form Submitted Successfully", "success");
    downloadBtn.disabled = false;
    printBtn.disabled = false;
  } catch (err) {
    setStatus("Error: " + err.message, "error");
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
  } catch (err) {
    setStatus("PDF Error: " + err.message, "error");
  } finally {
    downloadBtn.disabled = false;
  }
});

printBtn.addEventListener("click", () => {
  if (!lastSubmittedId) return;
  const printWindow = window.open(`/api/kyc/${lastSubmittedId}/pdf`, "_blank");
  if (!printWindow) setStatus("PDF Error: Please allow pop-ups to print the PDF.", "error");
});

