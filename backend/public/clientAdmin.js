const recordsBody = document.getElementById("recordsBody");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const listStatus = document.getElementById("listStatus");
const detailDialog = document.getElementById("detailDialog");
const detailContent = document.getElementById("detailContent");
const detailTitle = document.getElementById("detailTitle");
let records = [];

const get = (record, path) => path.split(".").reduce((value, key) => value && value[key], record);
const display = (value) => value === undefined || value === null || value === "" ? "N/A" : String(value);
const escapeHtml = (value) => display(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const formatDate = (value) => value ? new Date(value).toLocaleString("en-IN") : "N/A";

function renderSummary() {
  document.getElementById("totalCount").textContent = records.length;
  document.getElementById("verifiedCount").textContent = records.filter((record) => get(record, "outcome.overallResult") === "VERIFIED").length;
  document.getElementById("partialCount").textContent = records.filter((record) => get(record, "outcome.overallResult") === "PARTIALLY VERIFIED").length;
  document.getElementById("riskCount").textContent = records.filter((record) => get(record, "outcome.overallResult") === "ADVERSE / HIGH RISK").length;
}

function renderTable() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = records.filter((record) => [
    get(record, "client.legalName"), get(record, "client.pan"), get(record, "client.gstin"), get(record, "assignment.referenceNo"),
  ].some((value) => display(value).toLowerCase().includes(query)));
  const sorted = [...filtered].sort((a, b) => {
    if (sortSelect.value === "name") return display(get(a, "client.legalName")).localeCompare(display(get(b, "client.legalName")));
    if (sortSelect.value === "result") return display(get(a, "outcome.overallResult")).localeCompare(display(get(b, "outcome.overallResult")));
    const comparison = new Date(a.createdAt) - new Date(b.createdAt);
    return sortSelect.value === "oldest" ? comparison : -comparison;
  });
  recordsBody.innerHTML = sorted.length ? sorted.map((record) => {
    const result = get(record, "outcome.overallResult");
    const resultClass = result === "VERIFIED" ? "verified" : result === "ADVERSE / HIGH RISK" ? "risk" : "";
    return `<tr><td>${escapeHtml(record._id)}</td><td>${escapeHtml(get(record, "client.legalName"))}</td><td>${escapeHtml(get(record, "client.constitution"))}</td><td>${escapeHtml(get(record, "client.pan"))}</td><td>${escapeHtml(get(record, "client.gstin"))}</td><td>${escapeHtml(get(record, "assignment.referenceNo"))}</td><td class="${resultClass}">${escapeHtml(result)}</td><td>${formatDate(record.createdAt)}</td><td class="actions"><button data-action="view" data-id="${record._id}">View</button><button class="secondary" data-action="download" data-id="${record._id}">PDF</button><button class="secondary" data-action="print" data-id="${record._id}">Print</button></td></tr>`;
  }).join("") : '<tr><td colspan="9">No client verification records found.</td></tr>';
}

function renderDetails(record) {
  const sections = { Assignment: "assignment", Client: "client", "Site Verification": "site", Evidence: "evidence", Contact: "contact", Statutory: "statutory", Operations: "operations", Observations: "observations", Outcome: "outcome", Certification: "certification" };
  detailTitle.textContent = get(record, "client.legalName") || "Client Verification Details";
  detailContent.innerHTML = Object.entries(sections).map(([title, path]) => {
    const data = get(record, path) || {};
    const entries = Object.entries(data).map(([key, value]) => `<div class="detail-item"><b>${escapeHtml(key)}</b>${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</div>`).join("");
    return `<section class="detail-section"><h3>${title}</h3><div class="detail-grid">${entries || '<div class="detail-item">N/A</div>'}</div></section>`;
  }).join("") + (record.keyPersons || []).map((person, index) => `<section class="detail-section"><h3>Key Person ${index + 1}</h3><div class="detail-grid"><div class="detail-item"><b>Name</b>${escapeHtml(person.name)}</div><div class="detail-item"><b>Designation</b>${escapeHtml(person.designation)}</div><div class="detail-item"><b>DIN / ID</b>${escapeHtml(person.dinId)}</div><div class="detail-item"><b>Remarks</b>${escapeHtml(person.remarks)}</div></div></section>`).join("");
  detailDialog.showModal();
}

function printRecord(record) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const sections = {
    Assignment: "assignment",
    Client: "client",
    "Site Verification": "site",
    Evidence: "evidence",
    Contact: "contact",
    Statutory: "statutory",
    Operations: "operations",
    Observations: "observations",
    Outcome: "outcome",
    Certification: "certification",
  };

  const sectionHtml = Object.entries(sections).map(([title, path]) => {
    const data = get(record, path) || {};
    const rows = Object.entries(data).map(([key, value]) => `
      <div class="detail-item">
        <span class="detail-label">${escapeHtml(key)}</span>
        <span class="detail-value">${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</span>
      </div>`).join("");
    return `<section class="detail-section"><h3>${title}</h3><div class="detail-grid">${rows || '<div class="detail-item"><span class="detail-value">N/A</span></div>'}</div></section>`;
  }).join("");

  const keyPersons = (record.keyPersons || []).map((person, index) => `
    <section class="detail-section"><h3>Key Person ${index + 1}</h3><div class="detail-grid">
      <div class="detail-item"><span class="detail-label">Name</span><span class="detail-value">${escapeHtml(person.name)}</span></div>
      <div class="detail-item"><span class="detail-label">Designation</span><span class="detail-value">${escapeHtml(person.designation)}</span></div>
      <div class="detail-item"><span class="detail-label">DIN / ID</span><span class="detail-value">${escapeHtml(person.dinId)}</span></div>
      <div class="detail-item"><span class="detail-label">Remarks</span><span class="detail-value">${escapeHtml(person.remarks)}</span></div>
    </div></section>`).join("");

  printWindow.document.write(`<!doctype html>
    <html><head><title>Client Verification - ${escapeHtml(get(record, "client.legalName"))}</title>
    <link rel="stylesheet" href="${window.location.origin}/clientAdmin.css">
    <style>
      .print-page { max-width: 1000px; margin: 28px auto; padding: 24px; background: #fff; }
      .print-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; }
      .print-header h1 { margin: 0; color: #1f3b57; }
      .print-button { margin-top: 20px; }
      @media print { @page { size: A4 portrait; margin: 10mm; } body { background: #fff; } .print-page { max-width: none; margin: 0; padding: 0; } .print-button { display: none; } }
    </style></head><body>
    <main class="print-page">
      <header class="print-header"><div><p class="eyebrow">Submitted Client Verification</p><h1>${escapeHtml(get(record, "client.legalName"))}</h1></div><button class="print-button" onclick="window.print()">Print</button></header>
      ${sectionHtml}${keyPersons}
    </main></body></html>`);
  printWindow.document.close();
  printWindow.focus();
}

async function loadRecords() {
  listStatus.textContent = "Loading client verification records...";
  try {
    const response = await fetch("/api/client-verification");
    if (response.status === 401) {
      window.location.replace("/adminlogin.html");
      return;
    }
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Unable to load records");
    records = result.data || [];
    renderSummary(); renderTable();
    listStatus.textContent = `${records.length} record${records.length === 1 ? "" : "s"} found`;
  } catch (error) {
    listStatus.textContent = error.message;
    recordsBody.innerHTML = "";
  }
}

recordsBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const record = records.find((item) => item._id === button.dataset.id);
  if (button.dataset.action === "view" && record) renderDetails(record);
  if (button.dataset.action === "download") window.location.href = `/api/client-verification/${button.dataset.id}/pdf`;
  if (button.dataset.action === "print" && record) printRecord(record);
});
searchInput.addEventListener("input", renderTable);
sortSelect.addEventListener("change", renderTable);
document.getElementById("closeDialog").addEventListener("click", () => detailDialog.close());
document.getElementById("logoutButton").addEventListener("click", async () => {
  await fetch("/api/admin/auth/logout", { method: "POST", credentials: "same-origin" });
  window.location.replace("/adminlogin.html");
});
loadRecords();
