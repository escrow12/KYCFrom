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
function statusValue(record) { return record.status || "pending"; }
function statusBadge(value) { const status = String(value || "pending"); const className = status.replace(/\s+/g, "-"); return `<span class="status-badge status-${escapeHtml(className)}">${escapeHtml(status)}</span>`; }
function customerIdentifier(record) { return record.digio?.customerIdentifier || record.email || record.authSignatoryEmail || "N/A"; }
function requestIdentifier(record) { return record.digio?.kid || record.digio?.requestId || "N/A"; }
function referenceIdentifier(record) { return record.digio?.referenceId || record.corporateIdOrSapId || record._id; }
function showToast(message, type = "success") { toast.textContent = message; toast.className = `toast visible ${type}`; window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => { toast.className = "toast"; }, 3500); }
function pdfUrl(id) { return `/api/kyc/${encodeURIComponent(id)}/pdf`; }
function downloadPdf(id) {
  const link = document.createElement("a"); link.href = pdfUrl(id); link.download = `KYC-${id}.pdf`; document.body.appendChild(link); link.click(); link.remove();
}
function downloadAgreement(id) {
  const link = document.createElement("a"); link.href = `/api/admin/kyc/${encodeURIComponent(id)}/agreement/download`; link.download = `Signed_Agreement_${id}.pdf`; document.body.appendChild(link); link.click(); link.remove();
}
function actionButtons(record) {
  const id = record._id;
  const s = statusValue(record);
  let specificActions = "";
  if (s === "pending") {
    specificActions = `<button data-action="approve" data-id="${escapeHtml(id)}">Approve</button><button class="danger" data-action="reject" data-id="${escapeHtml(id)}">Reject</button>`;
  } else if (s === "agreement_pending" || s === "director_kyc_completed") {
    specificActions = `<button style="background:#28a745;color:#fff;" data-action="agreement" data-id="${escapeHtml(id)}">Send Agreement</button>`;
  } else if (s === "agreement_sent") {
    specificActions = `<button data-action="sync-agreement" data-id="${escapeHtml(id)}">Check Signing</button>`;
  } else if (s === "completed") {
    specificActions = `<button class="secondary" data-action="download-agreement" data-id="${escapeHtml(id)}">Signed Agreement</button>`;
  }
  return `<div class="action-group"><button data-action="view" data-id="${escapeHtml(id)}">View Details</button>${specificActions}<button class="secondary" data-action="download" data-id="${escapeHtml(id)}">PDF</button></div>`;
}
function renderTable(records) {
  recordsBody.innerHTML = records.length ? records.map((record) => `<tr>
    <td>${display(record.entityName)}</td><td>${display(customerIdentifier(record))}</td><td>${display(requestIdentifier(record))}</td><td>${display(referenceIdentifier(record))}</td>
    <td>${statusBadge(statusValue(record))}</td><td>${statusBadge(record.digio?.status || "not synced")}</td><td>${display(record.createdAt, true)}</td><td>${actionButtons(record)}</td>
  </tr>`).join("") : '<tr><td colspan="12" class="empty">No KYC submissions found.</td></tr>';
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

  const s = statusValue(record);
  const isApproved = ["approved", "director_kyc_pending", "director_kyc_completed", "agreement_pending", "agreement_sent", "completed"].includes(s);
  const isDirCompleted = ["director_kyc_completed", "agreement_pending", "agreement_sent", "completed"].includes(s);
  const isAgrSent = ["agreement_sent", "completed"].includes(s);
  const isDone = s === "completed";

  const workflowStepper = `
    <div class="workflow-stepper" style="display:flex;gap:6px;align-items:center;margin-bottom:16px;background:#f5f8fa;padding:12px;border-radius:8px;border:1px solid #dce4ec;font-size:12px;overflow-x:auto;">
      <span style="padding:5px 10px;border-radius:4px;background:#28a745;color:#fff;font-weight:bold;">1. Submitted</span>
      <span style="color:#888;">→</span>
      <span style="padding:5px 10px;border-radius:4px;background:${isApproved ? '#28a745;color:#fff' : s === 'rejected' ? '#dc3545;color:#fff' : '#e0e0e0;color:#555'};font-weight:bold;">2. Admin Approve</span>
      <span style="color:#888;">→</span>
      <span style="padding:5px 10px;border-radius:4px;background:${isDirCompleted ? '#28a745;color:#fff' : s === 'director_kyc_pending' ? '#ffc107;color:#000' : '#e0e0e0;color:#555'};font-weight:bold;">3. Director KYC</span>
      <span style="color:#888;">→</span>
      <span style="padding:5px 10px;border-radius:4px;background:${isDone ? '#28a745;color:#fff' : isAgrSent ? '#17a2b8;color:#fff' : s === 'agreement_pending' ? '#ffc107;color:#000' : '#e0e0e0;color:#555'};font-weight:bold;">4. Sign Agreement</span>
      <span style="color:#888;">→</span>
      <span style="padding:5px 10px;border-radius:4px;background:${isDone ? '#28a745;color:#fff' : '#e0e0e0;color:#555'};font-weight:bold;">5. KYC Completed</span>
    </div>
  `;

  const directorRows = (record.directors || []).map((director) => `<tr>
    <td><strong>${display(director.name)}</strong></td>
    <td>${display(director.email || director.phone)}</td>
    <td>${statusBadge(director.status)}</td>
    <td>
      <div><strong>KID:</strong> <code>${display(director.digio?.kid || "Not Generated")}</code></div>
      ${director.digio?.rid ? `<div style="font-size:11px;color:#555;"><strong>RID:</strong> <code>${display(director.digio.rid)}</code></div>` : ""}
      ${director.rejectionReason ? `<div style="font-size:11px;color:#b02a37;margin-top:2px;">⚠️ ${escapeHtml(director.rejectionReason)}</div>` : ""}
    </td>
    <td>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
        <button data-action="sync-director" data-id="${escapeHtml(record._id)}" data-director-id="${escapeHtml(director._id)}">Sync DigiO</button>
        ${director.status !== "completed" ? `<button class="secondary" data-action="approve-director" data-id="${escapeHtml(record._id)}" data-director-id="${escapeHtml(director._id)}">Approve KYC</button>` : ""}
        ${director.digio?.accessLink ? `<a href="${escapeHtml(director.digio.accessLink)}" target="_blank" style="padding:4px 8px;font-size:12px;background:#e9f0f8;border-radius:4px;text-decoration:none;color:#1f3b57;font-weight:bold;">KYC Link ↗</a>` : ""}
      </div>
    </td>
  </tr>`).join("");
  const directorsHtml = `<section class="detail-section"><h3>DIRECTOR KYC</h3><table class="detail-table"><thead><tr><th>Name</th><th>Email / Phone</th><th>Status</th><th>DigiO Identifiers</th><th>Actions</th></tr></thead><tbody>${directorRows || '<tr><td colspan="5">No directors recorded.</td></tr>'}</tbody></table></section>`;

  const agreementAction = ["agreement_pending", "director_kyc_completed"].includes(s)
    ? `<div style="margin-top:12px;"><button style="background:#28a745;color:#fff;padding:8px 16px;font-weight:bold;font-size:14px;" data-action="agreement" data-id="${escapeHtml(record._id)}">Send Master Agent Agreement for E-Signing</button></div>`
    : record.agreement && (record.agreement.status === "sent" || s === "agreement_sent")
    ? `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;"><button data-action="sync-agreement" data-id="${escapeHtml(record._id)}">Check Signing Status</button><button class="secondary" data-action="approve-agreement" data-id="${escapeHtml(record._id)}">Mark as Signed</button><button class="secondary" data-action="download-agreement" data-id="${escapeHtml(record._id)}">Download Agreement PDF</button></div>`
    : record.agreement && (record.agreement.status === "signed" || s === "completed")
    ? `<div style="margin-top:12px;"><button class="secondary" data-action="download-agreement" data-id="${escapeHtml(record._id)}">Download Signed Agreement PDF</button></div>`
    : "";

  const agreementSignersHtml = record.agreement && record.agreement.signers && record.agreement.signers.length
    ? `<div style="margin-top:10px;"><strong style="font-size:12px;">Signers:</strong><ul style="margin:4px 0;padding-left:18px;font-size:12px;">${record.agreement.signers.map(sig => `<li>${escapeHtml(sig.name)} (${escapeHtml(sig.email)}): ${statusBadge(sig.status)}</li>`).join("")}</ul></div>`
    : "";

  const agreementHtml = record.agreement ? `
    <div class="detail-item"><span class="detail-label">Agreement Document</span><span class="detail-value">${statusBadge(record.agreement.status)} <code>${display(record.agreement.documentId || record.agreement.providerRequestId)}</code></span></div>
    ${record.agreement.signingUrl ? `<div class="detail-item"><span class="detail-label">Signing Gateway</span><span class="detail-value"><a href="${escapeHtml(record.agreement.signingUrl)}" target="_blank" style="color:#0066cc;font-weight:bold;">Open Sign Gateway ↗</a></span></div>` : ""}
    ${agreementSignersHtml}
  ` : "";

  const workflowHtml = `<section class="detail-section"><h3>WORKFLOW &amp; STATUS</h3>${workflowStepper}<div class="detail-grid"><div class="detail-item"><span class="detail-label">Current Status</span><span class="detail-value">${statusBadge(s)}</span></div><div class="detail-item"><span class="detail-label">Customer Identifier</span><span class="detail-value">${display(customerIdentifier(record))}</span></div><div class="detail-item"><span class="detail-label">KYC / Request ID</span><span class="detail-value">${display(requestIdentifier(record))}</span></div><div class="detail-item"><span class="detail-label">Reference ID</span><span class="detail-value">${display(referenceIdentifier(record))}</span></div><div class="detail-item"><span class="detail-label">Rejection Reason</span><span class="detail-value">${display(record.rejectionReason)}</span></div>${agreementHtml}</div>${agreementAction}</section>`;

  detailTitle.textContent = `${record.entityName || "KYC Details"}`;
  detailContent.innerHTML = workflowHtml + directorsHtml + Object.keys(fields).slice(0, 3).map((title) => sectionHtml(title, record)).join("") + documentHtml + ownersHtml + Object.keys(fields).slice(3).map((title) => sectionHtml(title, record)).join("");
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
  const button = document.querySelector(`button[data-action="${action}"][data-id="${CSS.escape(id)}"]`);
  if (button) { button.disabled = true; button.textContent = "Working..."; }
  try {
    const endpoint =
      action === "sync-director" ? `/api/admin/kyc/${encodeURIComponent(id)}/directors/${encodeURIComponent(directorId)}/sync` :
      action === "approve-director" ? `/api/admin/kyc/${encodeURIComponent(id)}/directors/${encodeURIComponent(directorId)}/approve` :
      action === "sync-agreement" ? `/api/admin/kyc/${encodeURIComponent(id)}/agreement/sync` :
      action === "approve-agreement" ? `/api/admin/kyc/${encodeURIComponent(id)}/agreement/approve` :
      action === "request" ? `/api/kyc/${encodeURIComponent(id)}/request` :
      `/api/admin/kyc/${encodeURIComponent(id)}/${action}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Unable to update status");

    const msg =
      action === "sync-director" ? "Director KYC synced with DigiO." :
      action === "approve-director" ? "Director KYC approved." :
      action === "sync-agreement" ? "Agreement signing status checked." :
      action === "approve-agreement" ? "Agreement marked as signed." :
      action === "agreement" ? "Master Agreement sent for digital signing." :
      action === "request" ? "DigiO KYC request created." :
      `KYC ${action === "approve" ? "approved" : "rejected"} successfully.`;

    showToast(msg);
    await loadRecords();
    if (detailDialog.open) {
      await viewRecord(id);
    }
  } catch (error) {
    showToast(error.message, "error");
    if (button) {
      button.disabled = false;
      button.textContent = action === "approve" ? "Approve" : action === "reject" ? "Reject" : action === "agreement" ? "Send Agreement" : "Sync";
    }
  }
}
function openReject(id) { pendingRejectId = id; rejectionReason.value = ""; rejectDialog.showModal(); rejectionReason.focus(); }
recordsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "view") viewRecord(id);
  if (button.dataset.action === "download") downloadPdf(id);
  if (button.dataset.action === "download-agreement") downloadAgreement(id);
  if (button.dataset.action === "agreement" && window.confirm("Send Master Agent Agreement for digital signing?")) updateStatus(id, "agreement");
  if (button.dataset.action === "sync-agreement") updateStatus(id, "sync-agreement");
  if (button.dataset.action === "request" && window.confirm("Create a DigiO KYC request for this application?")) updateStatus(id, "request");
  if (button.dataset.action === "approve" && window.confirm("Approve this KYC request? Director KYC will be initiated.")) updateStatus(id, "approve");
  if (button.dataset.action === "reject") openReject(id);
});
detailContent.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "sync-director") updateStatus(id, "sync-director", {}, button.dataset.directorId);
  if (button.dataset.action === "approve-director" && window.confirm("Mark this director's KYC as approved?")) updateStatus(id, "approve-director", {}, button.dataset.directorId);
  if (button.dataset.action === "agreement" && window.confirm("Send Master Agent Agreement for digital signing?")) updateStatus(id, "agreement");
  if (button.dataset.action === "sync-agreement") updateStatus(id, "sync-agreement");
  if (button.dataset.action === "approve-agreement" && window.confirm("Mark the agreement as signed & complete onboarding?")) updateStatus(id, "approve-agreement");
  if (button.dataset.action === "download-agreement") downloadAgreement(id);
});
rejectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const reason = rejectionReason.value.trim();
  if (!reason) { showToast("Rejection reason is required.", "error"); return; }
  if (!window.confirm("Confirm rejection of this KYC request?")) return;
  rejectDialog.close();
  updateStatus(pendingRejectId, "reject", { reason });
});
searchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { currentPage = 1; loadRecords(); }, 250); });
sortSelect.addEventListener("change", () => { currentPage = 1; loadRecords(); });
closeDialog.addEventListener("click", () => detailDialog.close());
closeRejectDialog.addEventListener("click", () => rejectDialog.close());
cancelReject.addEventListener("click", () => rejectDialog.close());
detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) detailDialog.close(); });
logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin/auth/logout", { method: "POST", credentials: "same-origin" });
  window.location.replace("/adminlogin.html");
});
loadRecords();
