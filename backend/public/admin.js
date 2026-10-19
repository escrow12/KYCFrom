const logoutButton = document.getElementById("logoutButton");
const recordsBody = document.getElementById("recordsBody");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const pagination = document.getElementById("pagination");
const listStatus = document.getElementById("listStatus");
const detailDialog = document.getElementById("detailDialog");
const detailContent = document.getElementById("detailContent");
const detailTitle = document.getElementById("detailTitle");
const closeDialog = document.getElementById("closeDialog");
const rejectDialog = document.getElementById("rejectDialog");
const rejectForm = document.getElementById("rejectForm");
const rejectionReason = document.getElementById("rejectionReason");
const closeRejectDialog = document.getElementById("closeRejectDialog");
const cancelReject = document.getElementById("cancelReject");
const toast = document.getElementById("toast");

let currentPage = 1;
let searchTimer;
let pendingRejectId = null;
let currentRecords = [];

const fields = {
  "SECTION A": [
    ["Corporate ID / SAP ID", "corporateIdOrSapId"], ["Product Type", "productType"], ["Product Type Other", "productTypeOther"],
    ["Entity Name", "entityName"], ["Incorporation / Registration Date", "incorporationDate", true], ["Registration Number", "registrationNo"],
    ["Entity Type", "entityType"], ["Entity Type Other / Please Specify", "entityTypeOther"], ["Entity PAN", "entityPan"], ["Nature of Business", "natureOfBusiness"], ["GST No.", "gstNo"],
  ],
  "SECTION B": [
    ["Registered Address", "registeredAddress"], ["City / Town / Village", "registeredCity"], ["Pincode", "registeredPincode"], ["State", "registeredState"], ["Country", "registeredCountry"],
    ["Phone", "phone"], ["Website", "website"], ["Email", "email"], ["Correspondence City", "correspondenceCity"], ["Correspondence Pincode", "correspondencePincode"],
    ["Correspondence State", "correspondenceState"], ["Correspondence Country", "correspondenceCountry"], ["Contact Person", "authSignatoryName"], ["DOB", "dob", true], ["Telephone", "authSignatoryTel"], ["FAX", "authSignatoryFax"], ["Contact Email", "authSignatoryEmail"],
    ["Authorized Signatory PAN", "authSignatoryPan"], ["OVD Type", "authSignatoryOvdType"], ["OVD Number", "authSignatoryOvdNo"],
  ],
  "SECTION C": [
    ["PEP Status", "isPep", false, true], ["PEP / RPEP Details", "pepDetails"], ["Gross Annual Income / Range", "incomeRange"], ["Net Worth", "netWorth"], ["Net Worth As On Date", "netWorthDate", true],
    ["Foreign Exchange / Money Changer", "isForexMoneyChanger", false, true], ["Gambling / Gaming / Lottery", "isGamblingGamingLottery", false, true], ["Money Lending / Pawning", "isMoneyLendingPawning", false, true],
  ],
  "DECLARATION": [["Declaration Accepted", "declarationAccepted", false, true], ["Signed Place", "signedPlace"], ["Signed Date", "signedDate", true]],
  "CORPORATE / CLIENT": [["Name", "clientName"], ["Designation", "clientDesignation"], ["Date", "clientDate", true], ["Place", "clientPlace"]],
  "RELATIONSHIP MANAGER": [["Name", "verifiedByRmName"], ["Designation", "rmDesignation"], ["Date", "rmDate", true], ["Place", "rmPlace"], ["Original Verified", "originalVerified", false, true], ["Self-Attested", "selfAttested", false, true], ["Client Signature Verified", "clientSignatureVerified", false, true], ["Entity Documents Seen And Verified", "documentsSeenAndVerified", false, true], ["Authorized Person Signed In My Presence", "signedInPresence", false, true]],
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function display(value, date = false, boolean = false) {
  if (boolean) return value ? '<span class="status-yes">Yes</span>' : '<span class="status-no">No</span>';
  if (value === undefined || value === null || value === "") return "N/A";
  if (date) return new Date(value).toLocaleDateString("en-IN");
  return escapeHtml(value);
}
function statusValue(record) { return record.applicationStatus || record.status || "pending"; }
function statusBadge(value) { const status = String(value || "pending"); const className = status.replace(/\s+/g, "-"); return `<span class="status-badge status-${escapeHtml(className)}">${escapeHtml(status)}</span>`; }
function customerIdentifier(record) { return record.digio?.customerIdentifier || record.email || record.authSignatoryEmail || "N/A"; }
function requestIdentifier(record) { return record.digio?.kid || record.digio?.requestId || "N/A"; }
function referenceIdentifier(record) { return record.digio?.referenceId || record.corporateIdOrSapId || record._id; }
function showToast(message, type = "success") {
  const isError = type === "error";
  const isInfo = type === "info";
  if (toast) {
    toast.textContent = message;
    toast.className = `toast visible ${type}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.className = "toast";
    }, 3500);
  }

  if (window.Swal) {
    const activeTarget = (detailDialog && detailDialog.open) ? detailDialog : (rejectDialog && rejectDialog.open) ? rejectDialog : (sendInviteDialog && sendInviteDialog.open) ? sendInviteDialog : document.body;
    Swal.fire({
      toast: true,
      target: activeTarget,
      position: "top-end",
      icon: isError ? "error" : isInfo ? "info" : "success",
      iconColor: isError ? "#dc3545" : isInfo ? "#0056b3" : "#28a745",
      title: message,
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
      background: isError ? "#fff5f5" : isInfo ? "#eef6ff" : "#f6fdf8",
      color: isError ? "#721c24" : isInfo ? "#004085" : "#155724",
    });
  }
}

// Patch Swal.fire so modal alerts/confirm dialogs are never occluded behind HTML5 <dialog> elements in the browser top-layer
if (window.Swal) {
  const _origSwalFire = Swal.fire.bind(Swal);
  Swal.fire = async function (options, ...args) {
    const isToast = options && typeof options === "object" && options.toast;
    if (isToast) {
      return _origSwalFire(options, ...args);
    }

    // Collect all open native <dialog> elements
    const openDialogs = Array.from(document.querySelectorAll("dialog[open]")).map((d) => ({
      dialog: d,
      id: d.id,
      scrollTop: d.scrollTop,
      contentScrollTop: d.querySelector(".detail-content") ? d.querySelector(".detail-content").scrollTop : 0,
    }));

    // Temporarily close open dialogs so SweetAlert modal in document.body displays unobstructed on top
    openDialogs.forEach((item) => {
      try { item.dialog.close(); } catch (e) {}
    });

    try {
      const result = await _origSwalFire(options, ...args);
      // Re-open dialogs that were previously open
      openDialogs.forEach((item) => {
        // If it's rejectDialog and user confirmed, keep rejectDialog closed
        if (item.id === "rejectDialog" && result && result.isConfirmed) return;
        try {
          item.dialog.showModal();
          item.dialog.scrollTop = item.scrollTop;
          const content = item.dialog.querySelector(".detail-content");
          if (content) content.scrollTop = item.contentScrollTop;
        } catch (e) {}
      });
      return result;
    } catch (err) {
      openDialogs.forEach((item) => {
        try { item.dialog.showModal(); } catch (e) {}
      });
      throw err;
    }
  };
}

async function showConfirmDialog({
  title = "Are you sure?",
  text = "",
  confirmButtonText = "Confirm",
  cancelButtonText = "Cancel",
  confirmButtonColor = "#28a745",
  cancelButtonColor = "#6c757d",
  icon = "question",
  iconColor = undefined,
}) {
  if (window.Swal) {
    const result = await Swal.fire({
      title,
      text,
      icon,
      iconColor: iconColor || confirmButtonColor,
      showCancelButton: true,
      confirmButtonColor,
      cancelButtonColor,
      confirmButtonText,
      cancelButtonText,
      reverseButtons: true,
      focusCancel: false,
    });
    return result.isConfirmed;
  }
  return window.confirm(text || title);
}

// Override default window.alert to always use SweetAlert2
window.alert = function (message) {
  if (window.Swal) {
    Swal.fire({
      icon: "info",
      title: "Notice",
      text: String(message),
      confirmButtonColor: "#0056b3",
      confirmButtonText: "OK",
    });
  }
};

function pdfUrl(id) { return `/api/kyc/${encodeURIComponent(id)}/pdf`; }
function downloadPdf(id) {
  try {
    const link = document.createElement("a");
    link.href = pdfUrl(id);
    link.download = `KYC-${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("KYC PDF download initiated.");
  } catch (e) {
    showToast("PDF Download Error: " + e.message, "error");
  }
}
// function downloadAgreement(id) {
//   try {
//     const link = document.createElement("a");
//     link.href = `/api/admin/kyc/${encodeURIComponent(id)}/agreement/download`;
//     link.download = `Signed_Agreement_${id}.pdf`;
//     document.body.appendChild(link);
//     link.click();
//     link.remove();
//     // showToast("Signed Agreement download initiated.");
//   } catch (e) {
//     showToast("Agreement Download Error: " + e.message, "error");
//   }
// }
function actionButtons(record) {
  const id = record._id;
  const appStatus = record.applicationStatus || (record.status === "rejected" ? "rejected" : record.status === "pending" ? "pending" : "approved");
  const kycStatus = record.kycStatus || (record.directors?.every((d) => d.status === "completed") ? "completed" : record.directors?.some((d) => ["requested", "completed"].includes(d.status)) ? "in_progress" : "not_started");
  const agrStatus = record.agreementStatus || (record.agreement?.status === "signed" || record.status === "completed" ? "signed" : record.agreement?.status === "sent" ? "sent" : "not_started");
  const isKycCompleted = (record.directors && record.directors.length > 0)
    ? record.directors.every((d) => d.status === "completed")
    : kycStatus === "completed";

  const isKycApproved = appStatus === "approved" || kycStatus === "completed" || record.status === "approved";

  const isAgrCompleted = agrStatus === "signed" || record.agreement?.status === "signed" || record.status === "completed" || record.status === "agreement_signed";

  let specificActions = "";
  if (appStatus === "pending") {
    specificActions = `<button data-action="approve" data-id="${escapeHtml(id)}">Approve</button><button class="danger" data-action="reject" data-id="${escapeHtml(id)}">Reject</button>`;
  } else if (isKycApproved && !isAgrCompleted) {
    if (agrStatus === "not_started") {
      if (isKycCompleted) {
        specificActions = `<button style="background:#28a745;color:#fff;" data-action="agreement" data-id="${escapeHtml(id)}">Send Agreement</button>`;
      } else {
        specificActions = `<button disabled style="background:#b0bec5;color:#fff;cursor:not-allowed;opacity:0.7;" title="Director KYC must be completed before sending Agreement">Send Agreement</button>`;
      }
    }
  }
  return `<div class="action-group"><button data-action="view" data-id="${escapeHtml(id)}">View Details</button>${specificActions}<button class="secondary" data-action="download" data-id="${escapeHtml(id)}">PDF</button></div>`;
}

function renderTable(records) {
  recordsBody.innerHTML = records.length ? records.map((record) => {
    const appStatus = record.applicationStatus || (record.status === "rejected" ? "rejected" : record.status === "pending" ? "pending" : "approved");
    const kycStatus = record.kycStatus || (record.directors?.every((d) => d.status === "completed") ? "completed" : record.directors?.some((d) => ["requested", "completed"].includes(d.status)) ? "in_progress" : "not_started");
    const agrStatus = record.agreementStatus || record.agreement?.status || "not_started";
    const hasEmailErr = Boolean(record.emailError || record.agreement?.emailError || record.directors?.some((d) => d.emailError));

    return `<tr>
      <td>
        <strong>${display(record.entityName)}</strong>
        ${hasEmailErr ? `<div style="font-size:11px;color:#d9534f;margin-top:2px;">⚠️ Email Warning</div>` : ""}
      </td>
      <td>${display(customerIdentifier(record))}</td>
      <td>${display(referenceIdentifier(record))}</td>
      <td>
        <div style="font-size:11px;display:flex;flex-direction:column;gap:2px;">
          <div>App: ${statusBadge(appStatus)}</div>
          <div>KYC: ${statusBadge(kycStatus)}</div>
          <div>Agr: ${statusBadge(agrStatus)}</div>
        </div>
      </td>
      <td>${display(record.createdAt, true)}</td>
      <td>${actionButtons(record)}</td>
    </tr>`;
  }).join("") : '<tr><td colspan="12" class="empty">No KYC submissions found.</td></tr>';
}

function renderPagination(info) {
  pagination.innerHTML = "";
  if (!info || info.pages <= 1) return;
  const add = (label, page, disabled = false, current = false) => { const button = document.createElement("button"); button.textContent = label; button.disabled = disabled; if (current) button.className = "current"; button.addEventListener("click", () => { currentPage = page; loadRecords(); }); pagination.appendChild(button); };
  add("Previous", info.page - 1, info.page <= 1);
  for (let page = 1; page <= info.pages; page += 1) add(String(page), page, false, page === info.page);
  add("Next", info.page + 1, info.page >= info.pages);
}
async function loadRecords() {
  listStatus.textContent = "Loading submissions..."; listStatus.className = "list-status";
  const params = new URLSearchParams({ page: currentPage, limit: 25, search: searchInput.value.trim(), sort: sortSelect.value });
  try {
    const response = await fetch(`/api/admin/kyc?${params}`); const result = await response.json();
    if (response.status === 401) { window.location.replace("/adminlogin.html"); return; }
    if (!response.ok || !result.success) throw new Error(result.message || "Unable to load records");
    currentRecords = result.data || [];
    renderTable(result.data); renderPagination(result.pagination);
    document.getElementById("totalCount").textContent = result.summary.total; document.getElementById("todayCount").textContent = result.summary.today; document.getElementById("weekCount").textContent = result.summary.week; document.getElementById("monthCount").textContent = result.summary.month;
    listStatus.textContent = `${result.pagination.total} submission${result.pagination.total === 1 ? "" : "s"}`;
  } catch (error) { listStatus.textContent = error.message; listStatus.className = "list-status error"; recordsBody.innerHTML = ""; }
}
function sectionHtml(title, record) {
  const list = fields[title];
  return `<section class="detail-section"><h3>${title}</h3><div class="detail-grid">${list.map(([label, key, date, boolean]) => `<div class="detail-item"><span class="detail-label">${label}</span><span class="detail-value">${display(record[key], date, boolean)}</span></div>`).join("")}</div></section>`;
}
function renderDetail(record) {
  const docs = Array.isArray(record.documentChecklist) ? record.documentChecklist : (record.documentsVerified || []).map((name) => ({ name, selected: true, verificationMethod: "N/A" }));
  const documentHtml = `<section class="detail-section"><h3>SECTION D - KYC DOCUMENT CHECKLIST</h3><table class="detail-table"><thead><tr><th>Document Name</th><th>Selected</th><th>Verification Method</th></tr></thead><tbody>${docs.length ? docs.map((doc) => `<tr><td>${display(doc.name || doc)}</td><td>${display(doc.selected, false, true)}</td><td>${display(doc.verificationMethod || "N/A")}</td></tr>`).join("") : '<tr><td colspan="3">N/A</td></tr>'}</tbody></table></section>`;
  const owners = Array.isArray(record.beneficialOwners) ? record.beneficialOwners : [];
  const ownersHtml = `<section class="detail-section"><h3>BENEFICIAL OWNERSHIP</h3><table class="detail-table"><thead><tr><th>Name</th><th>Designation</th><th>DIN</th><th>PAN</th><th>Percentage Holding</th></tr></thead><tbody>${owners.length ? owners.map((owner) => `<tr><td>${display(owner.name)}</td><td>${display(owner.designation)}</td><td>${display(owner.din)}</td><td>${display(owner.panNo)}</td><td>${display(owner.percentageHolding)}</td></tr>`).join("") : '<tr><td colspan="5">N/A</td></tr>'}</tbody></table></section>`;

  const appStatus = record.applicationStatus || (record.status === "rejected" ? "rejected" : record.status === "pending" ? "pending" : "approved");
  const kycStatus = record.kycStatus || (record.directors?.every((d) => d.status === "completed") ? "completed" : record.directors?.some((d) => ["requested", "completed"].includes(d.status)) ? "in_progress" : "not_started");
  const agrStatus = record.agreementStatus || record.agreement?.status || "not_started";
  const isDone = appStatus === "approved" && kycStatus === "completed" && agrStatus === "signed";
  const isAppApproved = appStatus === "approved";
  const isAllDirectorsCompleted = (record.directors && record.directors.length > 0)
    ? record.directors.every((d) => d.status === "completed")
    : kycStatus === "completed";

  const workflowStepper = `
    <div class="workflow-stepper" style="display:flex;gap:6px;align-items:center;margin-bottom:16px;background:#f5f8fa;padding:12px;border-radius:8px;border:1px solid #dce4ec;font-size:12px;overflow-x:auto;">
      <span style="padding:5px 10px;border-radius:4px;background:#28a745;color:#fff;font-weight:bold;">1. Submitted</span>
      <span style="color:#888;">→</span>
      <span style="padding:5px 10px;border-radius:4px;background:${appStatus === 'approved' ? '#28a745;color:#fff' : appStatus === 'rejected' ? '#dc3545;color:#fff' : '#ffc107;color:#000'};font-weight:bold;">2. Application: ${escapeHtml(appStatus)}</span>
      <span style="color:#888;">→</span>
      <span style="padding:5px 10px;border-radius:4px;background:${kycStatus === 'completed' ? '#28a745;color:#fff' : kycStatus === 'in_progress' ? '#ffc107;color:#000' : '#e0e0e0;color:#555'};font-weight:bold;">3. Director KYC: ${escapeHtml(kycStatus)}</span>
      <span style="color:#888;">→</span>
      <span style="padding:5px 10px;border-radius:4px;background:${agrStatus === 'signed' ? '#28a745;color:#fff' : agrStatus === 'sent' ? '#17a2b8;color:#fff' : '#e0e0e0;color:#555'};font-weight:bold;">4. Agreement: ${escapeHtml(agrStatus)}</span>
      <span style="color:#888;">→</span>
      <span style="padding:5px 10px;border-radius:4px;background:${isDone ? '#28a745;color:#fff' : '#e0e0e0;color:#555'};font-weight:bold;">5. Fully Completed</span>
    </div>
  `;

  const emailWarningHtml = record.emailError ? `
    <div style="background:#fdf2f2;border-left:4px solid #dc3545;padding:10px 14px;margin-bottom:14px;border-radius:4px;color:#721c24;font-size:13px;">
      <strong>⚠️ Email Delivery Warning:</strong> ${escapeHtml(record.emailError)}
    </div>
  ` : "";

  const isRecordAgrCompleted = agrStatus === "signed" || record.agreement?.status === "signed" || record.status === "completed" || record.status === "agreement_signed";

  const directorRows = (record.directors || []).map((director) => {
    const isCompleted = director.status === "completed";
    const dirAgrStatus = director.agreement?.status || (record.agreement?.signers?.find((s) => s.email && s.email.toLowerCase() === (director.email || "").toLowerCase())?.status === "signed" ? "signed" : record.agreement?.documentId && record.agreement?.signers?.some((s) => s.email && s.email.toLowerCase() === (director.email || "").toLowerCase()) ? "sent" : "not_started");
    const isAgrSent = dirAgrStatus === "sent";
    const isAgrSigned = dirAgrStatus === "signed" || (isRecordAgrCompleted && record.agreement?.selectedDirectorId && String(record.agreement.selectedDirectorId) === String(director._id));

    return `<tr>
    <td><strong>${display(director.name)}</strong></td>
    <td>${display(director.email)}</td>
    <td>${display(director.phone)}</td>
    <td>${statusBadge(director.status)}</td>
    <td>
      <div><strong>KID:</strong> <code>${display(director.digio?.kid || "Not Generated")}</code></div>
      ${director.digio?.rid ? `<div style="font-size:11px;color:#555;"><strong>RID:</strong> <code>${display(director.digio.rid)}</code></div>` : ""}
      ${director.agreement?.documentId ? `<div style="font-size:11px;color:#17a2b8;margin-top:2px;"><strong>Agr Doc:</strong> <code>${display(director.agreement.documentId)}</code></div>` : ""}
      ${director.rejectionReason ? `<div style="font-size:11px;color:#b02a37;margin-top:2px;">⚠️ ${escapeHtml(director.rejectionReason)}</div>` : ""}
      ${director.emailError ? `<div style="font-size:11px;color:#dc3545;margin-top:2px;">⚠️ Email Failed: ${escapeHtml(director.emailError)}</div>` : ""}
      ${director.agreement?.emailError ? `<div style="font-size:11px;color:#dc3545;margin-top:2px;">⚠️ Agr Email Failed: ${escapeHtml(director.agreement.emailError)}</div>` : ""}
    </td>
    <td>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
        ${!isCompleted ? `<button ${!isAppApproved ? 'disabled style="background:#b0bec5;color:#fff;cursor:not-allowed;opacity:0.7;" title="Application form details must be approved first"' : 'style="background:#28a745;color:#fff;"'} data-action="send-director-kyc" data-id="${escapeHtml(record._id)}" data-director-id="${escapeHtml(director._id)}">${director.digio?.kid ? "Resend KYC" : "Send KYC"}</button>` : `
          ${isAgrSigned ? `<span style="color:#28a745;font-weight:bold;font-size:12px;padding:4px 8px;background:#e8f5e9;border-radius:4px;">✓ Agreement Signed</span>` : `
            ${isRecordAgrCompleted ? `<span style="color:#28a745;font-size:12px;padding:4px 8px;background:#e8f5e9;border-radius:4px;font-weight:600;">✓ Completed</span>` : `
              <button style="${isAgrSent ? 'background:#17a2b8' : 'background:#28a745'};color:#fff;font-weight:bold;" data-action="send-director-agreement" data-id="${escapeHtml(record._id)}" data-director-id="${escapeHtml(director._id)}" title="${isAgrSent ? 'Resend Agreement to this Director' : 'Send Agreement to this Director'}">${isAgrSent ? "Resend Agreement" : "Send Agreement"}</button>
            `}
          `}
        `}
        <button type="button" class="danger" style="padding:4px 8px;font-size:12px;font-weight:bold;" data-action="delete-director" data-id="${escapeHtml(record._id)}" data-director-id="${escapeHtml(director._id)}" title="Remove Director">[−]</button>
      </div>
    </td>
  </tr>`;
  }).join("");

  const directorsNotice = !isAppApproved ? `
    <div style="background:#fff3cd;border:1px solid #ffeeba;color:#856404;padding:8px 12px;border-radius:4px;font-size:12px;margin-bottom:12px;">
      ⚠️ <strong>Action Required:</strong> Please approve the application form details above (Step 2) before initiating Director KYC or sending Agreements.
    </div>
  ` : "";

  const directorsHtml = `
    <section class="detail-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1f3b57;">
        <h3 style="margin:0;border:none;padding:0;">REQUIRED DIRECTORS FOR KYC</h3>
      </div>
      ${directorsNotice}
      <table class="detail-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone Number</th>
            <th>Status</th>
            <th>DigiO Identifiers</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${directorRows || '<tr><td colspan="6">No directors recorded.</td></tr>'}</tbody>
      </table>
    </section>
  `;

  let workflowStepAction = "";
  if (appStatus === "pending") {
    workflowStepAction = `
      <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button style="background:#28a745;color:#fff;padding:8px 16px;font-weight:bold;" data-action="approve" data-id="${escapeHtml(record._id)}">✓ Approve Application</button>
        <button class="danger" style="padding:8px 16px;font-weight:bold;" data-action="reject" data-id="${escapeHtml(record._id)}">✕ Reject Application</button>
      </div>`;
  } else if (appStatus === "approved") {
    if (isRecordAgrCompleted) {
      workflowStepAction = `
        <div style="margin-top:14px;padding:10px 14px;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:6px;color:#2e7d32;font-size:13px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">✅</span> <strong>Agreement Signing Completed.</strong> The Master Agent Agreement has been successfully signed.
        </div>`;
    } else if (!isAllDirectorsCompleted) {
      workflowStepAction = `
        <div style="margin-top:14px;padding:8px 12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:4px;color:#856404;font-size:13px;">
          ⏳ <strong>Step 3: Director KYC in progress.</strong> Please send and complete Director KYC in the table below before sending Agreement.
        </div>`;
    } else if (agrStatus === "not_started") {
      workflowStepAction = `
        <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button style="background:#28a745;color:#fff;padding:8px 16px;font-weight:bold;" data-action="agreement" data-id="${escapeHtml(record._id)}">Send Agreement</button>
        </div>`;
    }
  }

  const agreementSignersHtml = record.agreement && record.agreement.signers && record.agreement.signers.length
    ? ``
    : "";

  const agreementHtml = record.agreement ? `
    <div class="detail-item"><span class="detail-label">Agreement Document</span><span class="detail-value">${statusBadge(record.agreement.status)} <code>${display(record.agreement.documentId || record.agreement.providerRequestId)}</code></span></div>
    ${record.agreement.emailError ? `<div class="detail-item" style="grid-column:span 2;color:#dc3545;"><span class="detail-label">Agreement Email Error</span><span class="detail-value">⚠️ ${escapeHtml(record.agreement.emailError)}</span></div>` : ""}
    ${agreementSignersHtml}
  ` : "";

  const workflowHtml = `<section class="detail-section"><h3>WORKFLOW &amp; DECOUPLED STATUS</h3>${emailWarningHtml}${workflowStepper}<div class="detail-grid"><div class="detail-item"><span class="detail-label">Application Status</span><span class="detail-value">${statusBadge(appStatus)}</span></div><div class="detail-item"><span class="detail-label">Director KYC Status</span><span class="detail-value">${statusBadge(kycStatus)}</span></div><div class="detail-item"><span class="detail-label">Agreement Status</span><span class="detail-value">${statusBadge(agrStatus)}</span></div><div class="detail-item"><span class="detail-label">Customer Identifier</span><span class="detail-value">${display(customerIdentifier(record))}</span></div><div class="detail-item"><span class="detail-label">Reference ID</span><span class="detail-value">${display(referenceIdentifier(record))}</span></div><div class="detail-item"><span class="detail-label">Rejection Reason</span><span class="detail-value">${display(record.rejectionReason)}</span></div>${agreementHtml}</div>${workflowStepAction}</section>`;

  const uploadedDocs = record.uploadedDocuments || {};
  const uploadedDocsHtml = `
    <section class="detail-section" style="border: 2px solid #0056b3; background: #f8fbff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <h3 style="margin-top: 0; color: #0056b3; display: flex; align-items: center; gap: 8px;">
        <span>📁</span> UPLOADED VERIFICATION DOCUMENTS (AADHAAR & PAN CARD)
      </h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 15px; margin-top: 10px;">
        <div style="background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #d0e1f9;">
          <strong style="display: block; font-size: 13px; color: #333; margin-bottom: 6px;">📄 Aadhaar Card Document</strong>
          ${uploadedDocs.aadhaarCard ? `
            <a href="/uploads/${escapeHtml(uploadedDocs.aadhaarCard)}" target="_blank" style="display: inline-block; padding: 6px 14px; background: #0056b3; color: #fff; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: bold;">
              View Aadhaar Card ↗
            </a>
            <div style="font-size: 11px; color: #666; margin-top: 4px;">${escapeHtml(uploadedDocs.aadhaarCardOriginalName || "Aadhaar Card")}</div>
          ` : `<span style="color: #dc3545; font-size: 13px; font-weight: bold;">Not Uploaded Yet</span>`}
        </div>

        <div style="background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #d0e1f9;">
          <strong style="display: block; font-size: 13px; color: #333; margin-bottom: 6px;">📄 PAN Card Document</strong>
          ${uploadedDocs.panCard ? `
            <a href="/uploads/${escapeHtml(uploadedDocs.panCard)}" target="_blank" style="display: inline-block; padding: 6px 14px; background: #0056b3; color: #fff; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: bold;">
              View PAN Card ↗
            </a>
            <div style="font-size: 11px; color: #666; margin-top: 4px;">${escapeHtml(uploadedDocs.panCardOriginalName || "PAN Card")}</div>
          ` : `<span style="color: #dc3545; font-size: 13px; font-weight: bold;">Not Uploaded Yet</span>`}
        </div>
      </div>
    
    </section>
  `;

  // const digioMatchHtml = `
  //   <section class="detail-section" style="border: 2px solid #28a745; background: #f6fdf8; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
  //     <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #28a745;">
  //       <h3 style="margin: 0; color: #155724; border: none; padding: 0; display: flex; align-items: center; gap: 6px;">
  //         <span>🔍</span> DIGIO API DATA MATCHING &amp; VERIFICATION
  //       </h3>
  //       <button type="button" style="background:#155724; color:#fff; padding:6px 14px; font-size:12px; border-radius:4px; font-weight:bold; cursor:pointer; border:none;" data-action="match-digio" data-id="${escapeHtml(record._id)}">
  //         🔄 Fetch &amp; Match DigiO API Data
  //       </button>
  //     </div>
  //     <div id="digioMatchBox_${escapeHtml(record._id)}" style="font-size: 13px; color: #333;">
  //       <p style="margin:0; font-style:italic; color:#666;">Click "Fetch &amp; Match DigiO API Data" above to compare submitted form data with official DigiO API records.</p>
  //     </div>
  //   </section>
  // `;

  let rejectionBannerHtml = "";
  // if (appStatus === "rejected") {
  //   const editUrl = `/index.html?kycId=${encodeURIComponent(record._id)}&mode=edit`;
  //   rejectionBannerHtml = `
  //     <section class="detail-section" style="border: 2px solid #dc3545; background: #fff5f5; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px;">
  //       <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
  //         <div>
  //           <h3 style="margin: 0 0 6px 0; color: #dc3545; border: none; padding: 0; display: flex; align-items: center; gap: 8px;">
  //             <span>⚠️</span> APPLICATION REJECTED BY COMPLIANCE
  //           </h3>
  //           <p style="margin: 0; font-size: 14px; color: #333;">
  //             <strong>Rejection Reason:</strong> "${escapeHtml(record.rejectionReason || "Requirements not met.")}"
  //           </p>
  //         </div>
  //         <div style="display: flex; gap: 10px; align-items: center;">
  //           <a href="${editUrl}" target="_blank" style="display: inline-flex; align-items: center; gap: 6px; background: #e0a800; color: #000; font-weight: bold; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-size: 13px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
  //             ✏️ Open Pre-Filled Edit Form
  //           </a>
  //           <button type="button" class="secondary" style="padding: 8px 14px; font-size: 13px;" onclick="navigator.clipboard.writeText(window.location.origin + '${editUrl}').then(() => showToast('Edit form link copied to clipboard!'));">
  //             📋 Copy Link
  //           </button>
  //         </div>
  //       </div>
  //     </section>
  //   `;
  // }

  detailTitle.textContent = `${record.entityName || "KYC Details"}`;
  detailContent.innerHTML = rejectionBannerHtml + workflowHtml + uploadedDocsHtml + directorsHtml + Object.keys(fields).slice(0, 3).map((title) => sectionHtml(title, record)).join("") + documentHtml + ownersHtml + Object.keys(fields).slice(3).map((title) => sectionHtml(title, record)).join("");
  detailDialog.showModal();
}
async function viewRecord(id) {
  try {
    const response = await fetch(`/api/admin/kyc/${encodeURIComponent(id)}`);
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Unable to load record");
    renderDetail(result.data);
  } catch (error) {
    listStatus.textContent = error.message;
    listStatus.className = "list-status error";
  }
}
async function updateStatus(id, action, body = {}, directorId = "") {
  let button;
  if (directorId) {
    button = document.querySelector(`button[data-action="${action}"][data-id="${CSS.escape(id)}"][data-director-id="${CSS.escape(directorId)}"]`);
  }
  if (!button) {
    button = document.querySelector(`button[data-action="${action}"][data-id="${CSS.escape(id)}"]`);
  }
  if (button) {
    button.disabled = true;
    button.textContent =
      action === "send-director-agreement" ? "Sending..." :
      action === "send-director-kyc" ? "Sending..." : "Working...";
  }
  try {
    const method = action === "delete-director" ? "DELETE" : "POST";
    const endpoint =
      action === "send-director-agreement" ? `/api/admin/kyc/${encodeURIComponent(id)}/directors/${encodeURIComponent(directorId)}/send-agreement` :
      action === "send-director-kyc" ? `/api/admin/kyc/${encodeURIComponent(id)}/directors/${encodeURIComponent(directorId)}/send-kyc` :
      action === "delete-director" ? `/api/admin/kyc/${encodeURIComponent(id)}/directors/${encodeURIComponent(directorId)}` :
      action === "sync-director" ? `/api/admin/kyc/${encodeURIComponent(id)}/directors/${encodeURIComponent(directorId)}/sync` :
      action === "approve-director" ? `/api/admin/kyc/${encodeURIComponent(id)}/directors/${encodeURIComponent(directorId)}/approve` :
      action === "add-director" ? `/api/admin/kyc/${encodeURIComponent(id)}/directors` :
      action === "sync-agreement" ? `/api/admin/kyc/${encodeURIComponent(id)}/agreement/sync` :
      action === "approve-agreement" ? `/api/admin/kyc/${encodeURIComponent(id)}/agreement/approve` :
      action === "request" ? `/api/digio/${encodeURIComponent(id)}/request` :
      `/api/admin/kyc/${encodeURIComponent(id)}/${action}`;

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      ...(method !== "DELETE" ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Unable to update status");

    const msg =
      action === "send-director-agreement" ? "Agreement sent to Director for digital signing." :
      action === "send-director-kyc" ? "DigiO KYC link requested & emailed to Director." :
      action === "delete-director" ? "Director removed." :
      action === "sync-director" ? "Director KYC synced with DigiO." :
      action === "approve-director" ? "Director KYC approved." :
      action === "add-director" ? "New Director added successfully." :
      action === "sync-agreement" ? "Agreement signing status checked." :
      action === "approve-agreement" ? "Agreement marked as signed." :
      action === "agreement" ? "Master Agreement sent for digital signing." :
      action === "request" ? "DigiO KYC request created." :
      `KYC ${action === "approve" ? "approved" : "rejected"} successfully.`;

    showToast(msg);
    if ((action === "agreement" || action === "send-director-agreement") && result.data && result.data.signingUrl) {
      const signerName = (result.data.signers && result.data.signers[0] && result.data.signers[0].name) || "Director";
      showDigioLinkModal(`${signerName} (E-Sign Agreement)`, `Doc ID: ${result.data.documentId || "N/A"}`, result.data.signingUrl, result.data.signingUrl);
    }
    await loadRecords();
    if (detailDialog.open) {
      await viewRecord(id);
    }
  } catch (error) {
    showToast(error.message, "error");
    if (button) {
      button.disabled = false;
      button.textContent =
        action === "send-director-agreement" ? "Send Agreement" :
        action === "send-director-kyc" ? "Send KYC" :
        action === "approve" ? "Approve" :
        action === "reject" ? "Reject" :
        action === "agreement" ? "Send Agreement" : "Sync";
    }
  }
}
function openReject(id) { pendingRejectId = id; rejectionReason.value = ""; rejectDialog.showModal(); rejectionReason.focus(); }

function showDigioLinkModal(directorName, entityName, customKycUrl, digioUrl) {
  const dialog = document.getElementById("digioLinkDialog");
  if (!dialog) return;

  const dirElem = document.getElementById("modalDirectorInfo");
  const entElem = document.getElementById("modalEntityInfo");
  const customElem = document.getElementById("modalCustomKycUrl");
  const digioElem = document.getElementById("modalDigioUrl");
  const openBtn = document.getElementById("modalOpenLinkBtn");

  if (dirElem) dirElem.textContent = `Director Name: ${directorName || "N/A"}`;
  if (entElem) entElem.textContent = `Entity Name: ${entityName || "Corporate KYC"}`;
  if (customElem) customElem.value = customKycUrl || "";
  if (digioElem) digioElem.value = digioUrl || customKycUrl || "";
  if (openBtn) openBtn.href = customKycUrl || digioUrl || "#";

  dialog.showModal();
}

async function openDigioLinkModalForRecord(id) {
  try {
    const res = await fetch(`/api/admin/kyc/${encodeURIComponent(id)}`);
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || "Could not load record.");

    const record = result.data;
    const director = (record.directors && record.directors[0]) || {};
    const name = director.name || record.authSignatoryName || record.entityName;
    const email = director.email || record.email || record.authSignatoryEmail;
    const phone = director.phone || record.phone || record.authSignatoryTel;
    const entityName = record.entityName;

    const host = window.location.origin;
    const customUrl = `${host}/index.html?kycId=${encodeURIComponent(id)}&name=${encodeURIComponent(name || "")}&email=${encodeURIComponent(email || "")}&phone=${encodeURIComponent(phone || "")}`;
    const digioUrl = director.digio?.accessLink || record.digio?.accessLink || customUrl;

    showDigioLinkModal(name, entityName, customUrl, digioUrl);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function fetchAndMatchDigioData(id) {
  const box = document.getElementById(`digioMatchBox_${id}`);
  if (box) box.innerHTML = '<p style="color:#0056b3;font-weight:bold;margin:0;">🔄 Fetching latest response from DigiO API &amp; matching data...</p>';

  try {
    const res = await fetch(`/api/admin/kyc/${encodeURIComponent(id)}/match-digio`, { method: "POST" });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || "Failed to match DigiO data.");

    const data = result.data;
    const match = data.matchReport || {};
    const sub = data.submitted || {};
    const digioResp = data.digioResponse || {};

    const nameBadge = match.nameMatched
      ? '<span style="background:#28a745;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">🟢 MATCHED</span>'
      : '<span style="background:#dc3545;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">🔴 MISMATCH</span>';

    const emailBadge = match.emailMatched
      ? '<span style="background:#28a745;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">🟢 MATCHED</span>'
      : '<span style="background:#dc3545;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;">🔴 MISMATCH</span>';

    const statusBadgeHtml = statusBadge(data.digioStatus);

    if (box) {
      box.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:12px; margin-top:8px;">
          <div style="background:#fff; padding:10px; border-radius:6px; border:1px solid #cce5ff;">
            <strong>👤 Submitted Name:</strong> ${escapeHtml(sub.name || "N/A")} <br/>
            <strong>DigiO Name:</strong> ${escapeHtml(digioResp.customer_name || digioResp.name || "Pending/N/A")} <br/>
            Status: ${nameBadge}
          </div>
          <div style="background:#fff; padding:10px; border-radius:6px; border:1px solid #cce5ff;">
            <strong>✉️ Submitted Email:</strong> ${escapeHtml(sub.email || "N/A")} <br/>
            <strong>DigiO Email:</strong> ${escapeHtml(digioResp.customer_identifier || "Pending/N/A")} <br/>
            Status: ${emailBadge}
          </div>
          <div style="background:#fff; padding:10px; border-radius:6px; border:1px solid #cce5ff;">
            <strong>🔑 DigiO KID:</strong> <code>${escapeHtml(data.kid)}</code> <br/>
            <strong>DigiO Status:</strong> ${statusBadgeHtml}
          </div>
        </div>
        ${data.directorId ? `
          <div style="margin-top:12px;">
            <button type="button" style="background:#28a745; color:#fff; padding:6px 14px; border:none; border-radius:4px; font-weight:bold; cursor:pointer;" data-action="approve-director" data-id="${escapeHtml(id)}" data-director-id="${escapeHtml(data.directorId)}">
              ✓ Approve in DigiO &amp; Complete Verification
            </button>
          </div>
        ` : ""}
      `;
    }
    showToast("DigiO API data fetched & matched successfully!");
  } catch (err) {
    if (box) box.innerHTML = `<p style="color:#dc3545;font-weight:bold;margin:0;">⚠️ ${escapeHtml(err.message)}</p>`;
    showToast(err.message, "error");
  }
}

async function handleSendAgreementClick(id) {
  let record = currentRecords.find((r) => String(r._id) === String(id));
  if (!record || !record.directors) {
    try {
      const res = await fetch(`/api/admin/kyc/${encodeURIComponent(id)}`);
      const json = await res.json();
      if (json.success && json.data) record = json.data;
    } catch (e) {
      console.warn("Could not fetch record for agreement selection", e);
    }
  }

  if (!record) {
    showToast("Could not find KYC record.", "error");
    return;
  }

  const agrStatus = record.agreementStatus || record.agreement?.status;
  if (agrStatus === "signed" || record.status === "completed" || record.status === "agreement_signed") {
    showToast("Agreement is already signed and completed.", "info");
    return;
  }

  const directors = record.directors || [];
  if (directors.length === 0) {
    const confirmed = await showConfirmDialog({
      title: "Send Digital Agreement?",
      text: "Send Master Agent Agreement for digital signing?",
      icon: "question",
      confirmButtonText: "Confirm",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#28a745",
    });
    if (confirmed) updateStatus(id, "agreement");
    return;
  }

  if (directors.length === 1) {
    const d = directors[0];
    const isCompleted = d.status === "completed";
    if (!isCompleted) {
      if (window.Swal) {
        Swal.fire({
          icon: "warning",
          title: "Director KYC Pending",
          text: `Director ${d.name} must complete KYC verification before sending the agreement.`,
          confirmButtonColor: "#1f3b57",
        });
      } else {
        showToast(`Director ${d.name} must complete KYC first.`, "error");
      }
      return;
    }

    const confirmed = await showConfirmDialog({
      title: "Send Digital Agreement?",
      text: `Send Master Agent Agreement to Director ${d.name} (${d.email}) for digital signing?`,
      icon: "question",
      confirmButtonText: "Send Agreement",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#28a745",
    });
    if (confirmed) {
      showToast(`Sending Agreement to ${d.name}...`, "info");
      updateStatus(id, "agreement", { directorId: d._id }, d._id);
    }
    return;
  }

  // If there is MORE THAN 1 DIRECTOR (1 thi vadhu dairector hoy):
  const completedDirectors = directors.filter((d) => d.status === "completed");
  if (completedDirectors.length === 0) {
    if (window.Swal) {
      Swal.fire({
        icon: "warning",
        title: "Director KYC Incomplete",
        text: "None of the directors have completed KYC verification yet. At least one director must complete KYC before receiving the agreement.",
        confirmButtonColor: "#1f3b57",
      });
    } else {
      showToast("At least one director must complete KYC first.", "error");
    }
    return;
  }

  const directorOptionsHtml = directors.map((d, index) => {
    const isKycDone = d.status === "completed";
    const isFirstCompleted = isKycDone && String(completedDirectors[0]?._id) === String(d._id);
    const isChecked = isFirstCompleted ? "checked" : "";
    const isDisabled = !isKycDone ? "disabled" : "";

    return `
      <label class="director-select-card" style="display:flex !important; flex-direction:row !important; align-items:flex-start !important; width:100% !important; box-sizing:border-box !important; padding:12px !important; border:2px solid ${isFirstCompleted ? '#28a745' : '#e0e0e0'} !important; border-radius:8px !important; cursor:${isKycDone ? 'pointer' : 'not-allowed'} !important; background:${isFirstCompleted ? '#f0fff4' : isKycDone ? '#ffffff' : '#f8f9fa'} !important; margin-bottom:10px !important; transition:all 0.2s; ${!isKycDone ? 'opacity:0.6;' : ''}">
        <input type="radio" name="swalDirectorSelect" value="${escapeHtml(d._id)}" ${isChecked} ${isDisabled} style="width:18px !important; min-width:18px !important; max-width:18px !important; height:18px !important; min-height:18px !important; flex:0 0 18px !important; margin:3px 12px 0 0 !important; cursor:${isKycDone ? 'pointer' : 'not-allowed'} !important;" />
        <div style="flex:1 1 auto !important; min-width:0 !important; text-align:left !important;">
          <div style="font-weight:700 !important; color:#1f3b57 !important; font-size:14.5px !important; display:flex !important; justify-content:space-between !important; align-items:center !important; flex-wrap:wrap !important; gap:6px !important;">
            <span>${escapeHtml(d.name || "Director")}</span>
            <span style="font-size:11px !important; padding:3px 8px !important; border-radius:4px !important; font-weight:600 !important; background:${isKycDone ? '#e8f5e9' : '#fff3cd'} !important; color:${isKycDone ? '#2e7d32' : '#856404'} !important;">
              ${isKycDone ? "✓ KYC Completed" : "⏳ KYC " + (d.status || "Pending")}
            </span>
          </div>
          <div style="font-size:13px !important; color:#444 !important; margin-top:4px !important; word-break:break-all !important;">
            📧 <strong>Email:</strong> ${escapeHtml(d.email || "N/A")}
          </div>
          ${d.phone ? `<div style="font-size:12.5px !important; color:#666 !important; margin-top:2px !important;">📱 <strong>Phone:</strong> ${escapeHtml(d.phone)}</div>` : ""}
        </div>
      </label>
    `;
  }).join("");

  if (window.Swal) {
    const { value: selectedId, isConfirmed } = await Swal.fire({
      title: "Select Director for Agreement",
      width: 520,
      html: `
        <div style="font-size:13.5px; color:#444; text-align:left; margin-bottom:14px;">
          Select which director should receive and sign the <strong>Master Agent Agreement</strong>:
        </div>
        <div id="swalDirectorList" style="max-height:280px; overflow-y:auto; padding-right:4px;">
          ${directorOptionsHtml}
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#28a745",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Send Agreement",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const checked = document.querySelector('input[name="swalDirectorSelect"]:checked');
        if (!checked) {
          Swal.showValidationMessage("Please select a director to send the agreement to.");
          return false;
        }
        return checked.value;
      },
      didOpen: () => {
        const radios = document.querySelectorAll('input[name="swalDirectorSelect"]');
        radios.forEach((r) => {
          r.addEventListener("change", () => {
            radios.forEach((other) => {
              const card = other.closest(".director-select-card");
              if (card) {
                card.style.borderColor = other.checked ? "#28a745" : "#e0e0e0";
                card.style.background = other.checked ? "#f0fff4" : (other.disabled ? "#f8f9fa" : "#ffffff");
              }
            });
          });
        });
      }
    });

    if (isConfirmed && selectedId) {
      const selectedDirector = directors.find((d) => String(d._id) === String(selectedId));
      showToast(`Sending Agreement to ${selectedDirector?.name || "selected director"}...`, "info");
      updateStatus(id, "agreement", { directorId: selectedId }, selectedId);
    }
  } else {
    const selected = completedDirectors[0];
    updateStatus(id, "agreement", { directorId: selected._id }, selected._id);
  }
}

recordsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const id = button.dataset.id;
  if (button.dataset.action === "view") viewRecord(id);
  if (button.dataset.action === "open-digio-link-modal") openDigioLinkModalForRecord(id);
  if (button.dataset.action === "download") downloadPdf(id);
  if (button.dataset.action === "download-agreement") downloadAgreement(id);
  if (button.dataset.action === "agreement") {
    handleSendAgreementClick(id);
  }
  if (button.dataset.action === "sync-agreement") updateStatus(id, "sync-agreement");
  if (button.dataset.action === "request") {
    const confirmed = await showConfirmDialog({
      title: "Create DigiO KYC Request?",
      text: "Create a DigiO KYC request for this application?",
      icon: "question",
      confirmButtonText: "Confirm",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#0056b3",
    });
    if (confirmed) updateStatus(id, "request");
  }
  if (button.dataset.action === "approve") {
    const confirmed = await showConfirmDialog({
      title: "Approve KYC Request?",
      text: "Approve this KYC request? Director KYC will be initiated.",
      icon: "question",
      iconColor: "#28a745",
      confirmButtonText: "Confirm",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#28a745",
    });
    if (confirmed) updateStatus(id, "approve");
  }
  if (button.dataset.action === "reject") openReject(id);
});

detailContent.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const id = button.dataset.id;
  if (button.dataset.action === "match-digio") fetchAndMatchDigioData(id);
  if (button.dataset.action === "send-director-kyc") {
    showToast("Sending DigiO KYC link to Director...", "info");
    updateStatus(id, "send-director-kyc", {}, button.dataset.directorId);
  }
  if (button.dataset.action === "send-director-agreement") {
    const confirmed = await showConfirmDialog({
      title: "Send Digital Agreement?",
      text: "Send Master Agent Agreement to this director for digital signing?",
      icon: "question",
      confirmButtonText: "Confirm",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#28a745",
    });
    if (confirmed) {
      showToast("Sending Agreement to Director...", "info");
      updateStatus(id, "send-director-agreement", {}, button.dataset.directorId);
    }
  }
  if (button.dataset.action === "delete-director") {
    const confirmed = await showConfirmDialog({
      title: "Remove Director?",
      text: "Are you sure you want to remove this director?",
      icon: "warning",
      iconColor: "#dc3545",
      confirmButtonText: "Confirm",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc3545",
    });
    if (confirmed) updateStatus(id, "delete-director", {}, button.dataset.directorId);
  }
  if (button.dataset.action === "sync-director") updateStatus(id, "sync-director", {}, button.dataset.directorId);
  if (button.dataset.action === "approve-director") {
    const confirmed = await showConfirmDialog({
      title: "Approve Director KYC?",
      text: "Mark this director's KYC as approved?",
      icon: "question",
      iconColor: "#28a745",
      confirmButtonText: "Confirm",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#28a745",
    });
    if (confirmed) updateStatus(id, "approve-director", {}, button.dataset.directorId);
  }
  if (button.dataset.action === "agreement") {
    handleSendAgreementClick(id);
  }
  if (button.dataset.action === "sync-agreement") updateStatus(id, "sync-agreement");
  if (button.dataset.action === "approve") {
    const confirmed = await showConfirmDialog({
      title: "Approve Application?",
      text: "Approve this application form details?",
      icon: "question",
      iconColor: "#28a745",
      confirmButtonText: "Confirm",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#28a745",
    });
    if (confirmed) updateStatus(id, "approve");
  }
  if (button.dataset.action === "reject") openReject(id);
  if (button.dataset.action === "download-agreement") downloadAgreement(id);
});

rejectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const reason = rejectionReason.value.trim();
  if (!reason) {
    showToast("Rejection reason is required.", "error");
    rejectionReason.focus();
    return;
  }
  const confirmed = await showConfirmDialog({
    title: "Confirm KYC Rejection?",
    text: "Are you sure you want to reject this KYC application and send the edit link?",
    icon: "warning",
    iconColor: "#dc3545",
    confirmButtonText: "Confirm Rejection",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc3545",
  });
  if (!confirmed) return;
  try { rejectDialog.close(); } catch (e) {}
  updateStatus(pendingRejectId, "reject", { reason });
});

const closeDigioLinkDialog = document.getElementById("closeDigioLinkDialog");
const closeDigioLinkModalBtn = document.getElementById("closeDigioLinkModalBtn");
const btnCopyCustomUrl = document.getElementById("btnCopyCustomUrl");
const btnCopyDigioUrl = document.getElementById("btnCopyDigioUrl");
const digioLinkDialog = document.getElementById("digioLinkDialog");

if (closeDigioLinkDialog) closeDigioLinkDialog.addEventListener("click", () => digioLinkDialog.close());
if (closeDigioLinkModalBtn) closeDigioLinkModalBtn.addEventListener("click", () => digioLinkDialog.close());
if (digioLinkDialog) digioLinkDialog.addEventListener("click", (e) => { if (e.target === digioLinkDialog) digioLinkDialog.close(); });

if (btnCopyCustomUrl) {
  btnCopyCustomUrl.addEventListener("click", () => {
    const val = document.getElementById("modalCustomKycUrl").value;
    if (val) {
      navigator.clipboard.writeText(val);
      showToast("Custom KYC Link copied to clipboard!");
    }
  });
}

if (btnCopyDigioUrl) {
  btnCopyDigioUrl.addEventListener("click", () => {
    const val = document.getElementById("modalDigioUrl").value;
    if (val) {
      navigator.clipboard.writeText(val);
      showToast("DigiO Gateway Link copied to clipboard!");
    }
  });
}

searchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { currentPage = 1; loadRecords(); }, 250); });
sortSelect.addEventListener("change", () => { currentPage = 1; loadRecords(); });
closeDialog.addEventListener("click", () => detailDialog.close());
closeRejectDialog.addEventListener("click", () => rejectDialog.close());
cancelReject.addEventListener("click", () => rejectDialog.close());
detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) detailDialog.close(); });
rejectDialog.addEventListener("click", (event) => { if (event.target === rejectDialog) rejectDialog.close(); });
logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin/auth/logout", { method: "POST", credentials: "same-origin" });
  window.location.replace("/adminlogin.html");
});

const openSendInviteModalBtn = document.getElementById("openSendInviteModalBtn");
const sendInviteDialog = document.getElementById("sendInviteDialog");
const closeSendInviteDialog = document.getElementById("closeSendInviteDialog");
const cancelSendInvite = document.getElementById("cancelSendInvite");

if (openSendInviteModalBtn && sendInviteDialog) {
  openSendInviteModalBtn.addEventListener("click", () => {
    sendInviteDialog.showModal();
    const dirNameInput = document.getElementById("inviteDirName");
    if (dirNameInput) dirNameInput.focus();
  });
}

if (closeSendInviteDialog && sendInviteDialog) {
  closeSendInviteDialog.addEventListener("click", () => sendInviteDialog.close());
}

if (cancelSendInvite && sendInviteDialog) {
  cancelSendInvite.addEventListener("click", () => sendInviteDialog.close());
}

if (sendInviteDialog) {
  sendInviteDialog.addEventListener("click", (e) => {
    if (e.target === sendInviteDialog) sendInviteDialog.close();
  });
}

const sendInviteForm = document.getElementById("sendInviteForm");
if (sendInviteForm) {
  sendInviteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSendInvite");
    btn.disabled = true;
    btn.textContent = "Sending...";

    const name = document.getElementById("inviteDirName").value.trim();
    const email = document.getElementById("inviteDirEmail").value.trim();
    const phone = document.getElementById("inviteDirPhone").value.trim();
    const entityName = document.getElementById("inviteEntityName").value.trim();

    try {
      const res = await fetch("/api/admin/kyc/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, entityName }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || "Failed to send KYC link.");

      showToast("DigiO KYC link created & sent to Director successfully!");
      sendInviteForm.reset();
      if (sendInviteDialog) sendInviteDialog.close();
      await loadRecords();

      // Show DigiO Link Modal!
      showDigioLinkModal(name, entityName, result.kycLink, result.digioAccessLink || result.kycLink);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "✉️ Send KYC Link";
    }
  });
}

loadRecords();
