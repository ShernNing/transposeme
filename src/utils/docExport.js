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
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = height - 40;
  page.drawText(title, { x: 40, y, size: 24, font, color: rgb(0,0,0) });
  y -= 32;
  page.drawText(`Key: ${key}`, { x: 40, y, size: 16, font, color: rgb(0.2,0.2,0.2) });
  y -= 28;
  chordText.split("\n").forEach(line => {
    page.drawText(line, { x: 40, y, size: 12, font, color: rgb(0,0,0) });
    y -= 18;
  });
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}
