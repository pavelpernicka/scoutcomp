import { getLabelConfiguration, getLabelQrSize, LABEL_PADDING_MM, labelMetadata } from "./InventoryLabelPreview";
import i18n from "../../../i18n";

const qrDataUrl = async (value) => {
  const { BrowserQRCodeSvgWriter } = await import("@zxing/browser");
  return new Promise((resolve, reject) => {
  const writer = new BrowserQRCodeSvgWriter();
  const svg = writer.write(value, 512, 512);
  const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    URL.revokeObjectURL(svgUrl);
    resolve(canvas.toDataURL("image/png"));
  };
  image.onerror = () => { URL.revokeObjectURL(svgUrl); reject(new Error(i18n.t("inventory.qrPdfError"))); };
  image.src = svgUrl;
  });
};

const labelPdfFilename = (template) => `${(template.name || "stitky").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.pdf`;

async function createLabelsPdf(items, template) {
  const { jsPDF } = await import("jspdf");
  const width = Number(template.width_mm) || 62;
  const height = Number(template.height_mm) || 29;
  const orientation = width > height ? "landscape" : "portrait";
  // A custom jsPDF page format is expressed in millimetres. Each item gets its
  // own page so the PDF page itself is the physical label, not an A4 layout.
  const pdf = new jsPDF({ unit: "mm", format: [width, height], orientation, compress: true });
  const configuration = getLabelConfiguration(template);

  for (const [index, item] of items.entries()) {
    if (index) pdf.addPage([width, height], orientation);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const qrSize = getLabelQrSize(template, pageWidth, pageHeight);
    const qr = await qrDataUrl(item.qr_identifier);
    const qrY = (pageHeight - qrSize) / 2;
    const textX = LABEL_PADDING_MM + qrSize + 1.25;
    const textWidth = Math.max(1, pageWidth - textX - LABEL_PADDING_MM);
    pdf.addImage(qr, "PNG", LABEL_PADDING_MM, qrY, qrSize, qrSize, undefined, "FAST");
    const metadata = labelMetadata(item, configuration, (key, options, fallback) => i18n.t(key, { ...options, defaultValue: fallback })).map(({ value }) => value);
    const nameLines = pdf.splitTextToSize(item.name, textWidth).slice(0, 2);
    const textHeight = nameLines.length * 3.9 + 3.2 + metadata.length * 2.8;
    let y = Math.max(LABEL_PADDING_MM + 2.1, (pageHeight - textHeight) / 2 + 3.1);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(nameLines, textX, y);
    y += nameLines.length * 3.9;
    pdf.setFont("courier", "normal");
    pdf.setFontSize(7);
    pdf.text(item.qr_identifier, textX, y);
    y += 3.2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    metadata.forEach((value) => { pdf.text(pdf.splitTextToSize(value, textWidth).slice(0, 1), textX, y); y += 2.8; });
  }
  return pdf;
}

export async function downloadLabelsPdf(items, template) {
  const pdf = await createLabelsPdf(items, template);
  pdf.save(labelPdfFilename(template));
}

export async function printLabelsPdf(items, template) {
  // Open synchronously from the button handler so browsers do not treat the
  // PDF viewer as an unsolicited popup after QR rendering has finished.
  const popup = window.open("", "inventory-labels", "popup,width=960,height=720");
  const pdf = await createLabelsPdf(items, template);
  pdf.autoPrint();
  if (!popup) {
    pdf.save(labelPdfFilename(template));
    return false;
  }
  popup.location.href = pdf.output("bloburl");
  return true;
}
