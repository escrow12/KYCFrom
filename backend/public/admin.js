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
function statusValue(record) { return record.applicationStatus || record.status || "pending"; }
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
  const appStatus = record.applicationStatus || (record.status === "rejected" ? "rejected" : record.status === "pending" ? "pending" : "approved");
  const agrStatus = record.agreementStatus || (record.agreement?.status === "signed" || record.status === "completed" ? "signed" : record.agreement?.status === "sent" ? "sent" : "not_started");

  let specificActions = "";
  if (appStatus === "pending") {
    specificActions = `<button data-action="approve" data-id="${escapeHtml(id)}">Approve</button><button class="danger" data-action="reject" data-id="${escapeHtml(id)}">Reject</button>`;
  } else if (appStatus === "approved") {
    if (agrStatus === "not_started") {
      specificActions = `<button style="background:#28a745;color:#fff;" data-action="agreement" data-id="${escapeHtml(id)}">Send Agreement</button>`;
    } else if (agrStatus === "sent") {
      specificActions = `<button data-action="sync-agreement" data-id="${escapeHtml(id)}">Check Signing</button>`;
    } else if (agrStatus === "signed") {
      specificActions = `<button class="secondary" data-action="download-agreement" data-id="${escapeHtml(id)}">Signed Agreement</button>`;
    }
  }
  return `<div class="action-group"><button data-action="view" data-id="${escapeHtml(id)}">View Details</button><button class="secondary" data-action="open-digio-link-modal" data-id="${escapeHtml(id)}">🔗 DigiO Link</button>${specificActions}<button class="secondary" data-action="download" data-id="${escapeHtml(id)}">PDF</button></div>`;
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
      <td>${display(requestIdentifier(record))}</td>
      <td>${display(referenceIdentifier(record))}</td>
      <td>
        <div style="font-size:11px;display:flex;flex-direction:column;gap:2px;">
          <div>App: ${statusBadge(appStatus)}</div>
          <div>KYC: ${statusBadge(kycStatus)}</div>
          <div>Agr: ${statusBadge(agrStatus)}</div>
        </div>
      </td>
      <td>${statusBadge(record.digio?.status || "not synced")}</td>
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

  const directorRows = (record.directors || []).map((director) => {
    const isCompleted = director.status === "completed";
    return `<tr>
    <td><strong>${display(director.name)}</strong></td>
    <td>${display(director.email)}</td>
    <td>${display(director.phone)}</td>
    <td>${statusBadge(director.status)}</td>
    <td>
      <div><strong>KID:</strong> <code>${display(director.digio?.kid || "Not Generated")}</code></div>
      ${director.digio?.rid ? `<div style="font-size:11px;color:#555;"><strong>RID:</strong> <code>${display(director.digio.rid)}</code></div>` : ""}
      ${director.rejectionReason ? `<div style="font-size:11px;color:#b02a37;margin-top:2px;">⚠️ ${escapeHtml(director.rejectionReason)}</div>` : ""}
      ${director.emailError ? `<div style="font-size:11px;color:#dc3545;margin-top:2px;">⚠️ Email Failed: ${escapeHtml(director.emailError)}</div>` : ""}
    </td>
    <td>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
        ${!isCompleted ? `<button style="background:#28a745;color:#fff;" data-action="send-director-kyc" data-id="${escapeHtml(record._id)}" data-director-id="${escapeHtml(director._id)}">Send KYC</button>` : `<button style="background:#28a745;color:#fff;" data-action="agreement" data-id="${escapeHtml(record._id)}">Send Agreement</button>`}
        <button data-action="sync-director" data-id="${escapeHtml(record._id)}" data-director-id="${escapeHtml(director._id)}">Sync DigiO</button>
        ${!isCompleted ? `<button class="secondary" data-action="approve-director" data-id="${escapeHtml(record._id)}" data-director-id="${escapeHtml(director._id)}">Approve KYC</button>` : ""}
        ${director.digio?.accessLink ? `<a href="${escapeHtml(director.digio.accessLink)}" target="_blank" style="padding:4px 8px;font-size:12px;background:#e9f0f8;border-radius:4px;text-decoration:none;color:#1f3b57;font-weight:bold;">KYC Link ↗</a>` : ""}
        <button type="button" class="danger" style="padding:4px 8px;font-size:12px;font-weight:bold;" data-action="delete-director" data-id="${escapeHtml(record._id)}" data-director-id="${escapeHtml(director._id)}" title="Remove Director">[−]</button>
      </div>
    </td>
  </tr>`;
  }).join("");

  const directorsHtml = `
    <section class="detail-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1f3b57;">
        <h3 style="margin:0;border:none;padding:0;">REQUIRED DIRECTORS FOR KYC (${statusBadge(kycStatus)})</h3>
      </div>
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

  const agreementAction = appStatus === "approved" && agrStatus !== "signed"
    ? `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;"><button style="background:#28a745;color:#fff;padding:8px 16px;font-weight:bold;font-size:14px;" data-action="agreement" data-id="${escapeHtml(record._id)}">${agrStatus === "sent" ? "Resend Master Agent Agreement" : "Send Master Agent Agreement for E-Signing"}</button>${agrStatus === "sent" ? `<button data-action="sync-agreement" data-id="${escapeHtml(record._id)}">Check Signing Status</button><button class="secondary" data-action="approve-agreement" data-id="${escapeHtml(record._id)}">Mark as Signed</button><button class="secondary" data-action="download-agreement" data-id="${escapeHtml(record._id)}">Download Agreement PDF</button>` : ""}</div>`
    : agrStatus === "signed"
    ? `<div style="margin-top:12px;"><button class="secondary" data-action="download-agreement" data-id="${escapeHtml(record._id)}">Download Signed Agreement PDF</button></div>`
    : "";

  const agreementSignersHtml = record.agreement && record.agreement.signers && record.agreement.signers.length
    ? `<div style="margin-top:10px;"><strong style="font-size:12px;">Signers:</strong><ul style="margin:4px 0;padding-left:18px;font-size:12px;">${record.agreement.signers.map(sig => `<li>${escapeHtml(sig.name)} (${escapeHtml(sig.email)}): ${statusBadge(sig.status)} ${sig.emailError ? `<span style="color:#dc3545;font-size:11px;">⚠️ Email Failed: ${escapeHtml(sig.emailError)}</span>` : ""}</li>`).join("")}</ul></div>`
    : "";

  const agreementHtml = record.agreement ? `
    <div class="detail-item"><span class="detail-label">Agreement Document</span><span class="detail-value">${statusBadge(record.agreement.status)} <code>${display(record.agreement.documentId || record.agreement.providerRequestId)}</code></span></div>
    ${record.agreement.signingUrl ? `<div class="detail-item"><span class="detail-label">Signing Gateway</span><span class="detail-value"><a href="${escapeHtml(record.agreement.signingUrl)}" target="_blank" style="color:#0066cc;font-weight:bold;">Open Sign Gateway ↗</a></span></div>` : ""}
    ${record.agreement.emailError ? `<div class="detail-item" style="grid-column:span 2;color:#dc3545;"><span class="detail-label">Agreement Email Error</span><span class="detail-value">⚠️ ${escapeHtml(record.agreement.emailError)}</span></div>` : ""}
    ${agreementSignersHtml}
  ` : "";

  const workflowHtml = `<section class="detail-section"><h3>WORKFLOW &amp; DECOUPLED STATUS</h3>${emailWarningHtml}${workflowStepper}<div class="detail-grid"><div class="detail-item"><span class="detail-label">Application Status</span><span class="detail-value">${statusBadge(appStatus)}</span></div><div class="detail-item"><span class="detail-label">Director KYC Status</span><span class="detail-value">${statusBadge(kycStatus)}</span></div><div class="detail-item"><span class="detail-label">Agreement Status</span><span class="detail-value">${statusBadge(agrStatus)}</span></div><div class="detail-item"><span class="detail-label">Customer Identifier</span><span class="detail-value">${display(customerIdentifier(record))}</span></div><div class="detail-item"><span class="detail-label">KYC / Request ID</span><span class="detail-value">${display(requestIdentifier(record))}</span></div><div class="detail-item"><span class="detail-label">Reference ID</span><span class="detail-value">${display(referenceIdentifier(record))}</span></div><div class="detail-item"><span class="detail-label">Rejection Reason</span><span class="detail-value">${display(record.rejectionReason)}</span></div>${agreementHtml}</div>${agreementAction}</section>`;

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
      <div style="margin-top: 15px; display: flex; gap: 10px; align-items: center;">
        ${appStatus === 'pending' ? `
          <button type="button" style="background:#28a745; color:#fff; padding:8px 18px; font-weight:bold; font-size:14px; border:none; border-radius:5px; cursor:pointer;" data-action="approve" data-id="${escapeHtml(record._id)}">
            ✓ Verify & Approve KYC
          </button>
          <button type="button" class="danger" style="padding:8px 18px; font-weight:bold; font-size:14px; border-radius:5px; cursor:pointer;" data-action="reject" data-id="${escapeHtml(record._id)}">
            ✗ Reject KYC
          </button>
        ` : `
          <span style="font-size:13px; font-weight:bold;">Verification Status: ${statusBadge(appStatus)}</span>
        `}
      </div>
    </section>
  `;

  const digioMatchHtml = `
    <section class="detail-section" style="border: 2px solid #28a745; background: #f6fdf8; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #28a745;">
        <h3 style="margin: 0; color: #155724; border: none; padding: 0; display: flex; align-items: center; gap: 6px;">
          <span>🔍</span> DIGIO API DATA MATCHING &amp; VERIFICATION
        </h3>
        <button type="button" style="background:#155724; color:#fff; padding:6px 14px; font-size:12px; border-radius:4px; font-weight:bold; cursor:pointer; border:none;" data-action="match-digio" data-id="${escapeHtml(record._id)}">
          🔄 Fetch &amp; Match DigiO API Data
        </button>
      </div>
      <div id="digioMatchBox_${escapeHtml(record._id)}" style="font-size: 13px; color: #333;">
        <p style="margin:0; font-style:italic; color:#666;">Click "Fetch &amp; Match DigiO API Data" above to compare submitted form data with official DigiO API records.</p>
      </div>
    </section>
  `;

  detailTitle.textContent = `${record.entityName || "KYC Details"}`;
  detailContent.innerHTML = workflowHtml + digioMatchHtml + uploadedDocsHtml + directorsHtml + Object.keys(fields).slice(0, 3).map((title) => sectionHtml(title, record)).join("") + documentHtml + ownersHtml + Object.keys(fields).slice(3).map((title) => sectionHtml(title, record)).join("");
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
    const method = action === "delete-director" ? "DELETE" : "POST";
    const endpoint =
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
    if (action === "agreement" && result.data && result.data.signingUrl) {
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
      button.textContent = action === "send-director-kyc" ? "Send KYC" : action === "approve" ? "Approve" : action === "reject" ? "Reject" : action === "agreement" ? "Send Agreement" : "Sync";
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

recordsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "view") viewRecord(id);
  if (button.dataset.action === "open-digio-link-modal") openDigioLinkModalForRecord(id);
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
  if (button.dataset.action === "match-digio") fetchAndMatchDigioData(id);
  if (button.dataset.action === "send-director-kyc" && window.confirm("Send DigiO KYC request to this director?")) updateStatus(id, "send-director-kyc", {}, button.dataset.directorId);
  if (button.dataset.action === "delete-director" && window.confirm("Remove this director?")) updateStatus(id, "delete-director", {}, button.dataset.directorId);
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
