// Utility for exporting chord sheets to .docx and PDF
import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// Generate a .docx file from plain text
export async function generateDocx({ title, key, chordText }) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: title, bold: true, size: 32 }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Key: ${key}`, italics: true, size: 24 }),
            ],
          }),
          ...chordText.split("\n").map(line => new Paragraph(line)),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return blob;
}

// Generate a PDF file from plain text
export async function generatePdf({ title, key, chordText }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const margin = 40;
  const lineHeight = 18;
  const minY = margin;

  const addPage = () => {
    const p = pdfDoc.addPage();
    return { page: p, y: p.getSize().height - margin };
  };

  let { page, y } = addPage();

  page.drawText(title, { x: margin, y, size: 24, font, color: rgb(0, 0, 0) });
  y -= 32;
  page.drawText(`Key: ${key}`, { x: margin, y, size: 16, font, color: rgb(0.2, 0.2, 0.2) });
  y -= 28;

  for (const line of chordText.split("\n")) {
    if (y < minY + lineHeight) {
      ({ page, y } = addPage());
    }
    page.drawText(line, { x: margin, y, size: 12, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}
