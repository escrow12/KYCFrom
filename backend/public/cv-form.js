const form = document.getElementById("verificationForm");
const statusEl = document.getElementById("status");
const downloadBtn = document.getElementById("downloadBtn");
let savedId = null;

function setNested(target, path, value) {
  const parts = path.split(".");
  let current = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) current[part] = value;
    else current = current[part] || (current[part] = {});
  });
}

function collect() {
  const data = {};
  Array.from(form.elements).forEach((element) => {
    if (!element.name || element.disabled) return;
    if (element.type === "checkbox" && !element.checked) return;
    if (element.type === "radio" && !element.checked) return;
    const existing = element.name.includes(".") ? element.name.split(".").reduce((obj, key) => obj && obj[key], data) : data[element.name];
    if (element.type === "checkbox" && existing !== undefined) {
      const list = Array.isArray(existing) ? existing : [existing];
      list.push(element.value);
      setNested(data, element.name, list);
    } else setNested(data, element.name, element.value);
  });
  data.keyPersons = Array.from(document.querySelectorAll("#persons tbody tr")).map((row) => ({
    name: row.querySelector("[data-key=name]").value.trim(),
    designation: row.querySelector("[data-key=designation]").value.trim(),
    dinId: row.querySelector("[data-key=dinId]").value.trim(),
    remarks: row.querySelector("[data-key=remarks]").value.trim(),
  })).filter((person) => person.name || person.designation || person.dinId || person.remarks);
  return data;
}

function addPerson() {
  const row = document.createElement("tr");
  row.innerHTML = '<td><input data-key="name"></td><td><input data-key="designation"></td><td><input data-key="dinId"></td><td><input data-key="remarks"></td><td><button type="button" class="secondary remove">×</button></td>';
  row.querySelector(".remove").addEventListener("click", () => row.remove());
  document.querySelector("#persons tbody").appendChild(row);
}
document.getElementById("addPerson").addEventListener("click", addPerson);
addPerson();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "Saving...";
  try {
    const response = await fetch("/api/client-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(collect()) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to save form");
    savedId = result.id;
    downloadBtn.disabled = false;
    statusEl.textContent = "Saved successfully.";
  } catch (error) {
    statusEl.textContent = error.message;
  }
});

document.getElementById("printBtn").addEventListener("click", () => window.print());
downloadBtn.addEventListener("click", () => { if (savedId) window.location.href = `/api/client-verification/${savedId}/pdf`; });
