(function setupClientVerificationPrint() {
  const printButton = document.getElementById("printBtn");
  const printArea = document.getElementById("printArea");
  if (!printButton || !printArea) return;

  // Replace the existing handler so the printout contains the current form values as text.
  const cleanButton = printButton.cloneNode(true);
  printButton.replaceWith(cleanButton);

  cleanButton.addEventListener("click", () => {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      window.print();
      return;
    }

    const printable = printArea.cloneNode(true);
    const actions = printable.querySelector(".actions");
    if (actions) actions.remove();

    printable.querySelectorAll("input, select, textarea").forEach((control) => {
      const output = document.createElement("div");
      output.className = "print-field-value";

      if (control.type === "checkbox" || control.type === "radio") {
        output.textContent = `${control.checked ? "[X]" : "[ ]"} ${control.parentElement.textContent.trim()}`;
      } else if (control.tagName === "SELECT") {
        output.textContent = control.options[control.selectedIndex]?.textContent || "";
      } else {
        output.textContent = control.value || "";
      }

      control.replaceWith(output);
    });

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => `<link rel="stylesheet" href="${link.href}">`)
      .join("");

    printWindow.document.write(`<!doctype html><html><head><title>Client Verification Form</title>${styles}
      <style>
        body { background: #fff !important; padding: 0 !important; }
        .paper { max-width: none !important; box-shadow: none !important; }
        .print-field-value { min-height: 18px; padding: 5px 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
        @media print { .actions, button { display: none !important; } }
      </style>
    </head><body>${printable.outerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    printWindow.print();
  });
}());
