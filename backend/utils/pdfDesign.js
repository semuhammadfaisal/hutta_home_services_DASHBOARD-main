const PDFDocument = require('pdfkit');
const path = require('path');

const COLORS = Object.freeze({
  blue: '#075eb8',
  blueDark: '#064b91',
  ink: '#15253b',
  text: '#33445a',
  muted: '#68788d',
  border: '#d9e3ee',
  surface: '#f5f8fb',
  paleBlue: '#edf6ff'
});

const PAGE = Object.freeze({ left: 50, right: 562, width: 512, footerY: 758 });
const clean = (value, fallback = '') => String(value ?? '').trim() || fallback;

function createDocument({ title, subject }) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 46, right: 50, bottom: 58, left: 50 },
    bufferPages: true,
    info: {
      Title: clean(title, 'Hutta Home Services Document'),
      Author: 'Hutta Home Services',
      Subject: clean(subject, title)
    }
  });
  doc.on('pageAdded', () => {
    doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(8)
      .text('HUTTA HOME SERVICES', PAGE.left, 42, { width: 250, characterSpacing: .9 });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
      .text('DOCUMENT CONTINUED', 312, 42, { width: 250, align: 'right' });
    doc.moveTo(PAGE.left, 59).lineTo(PAGE.right, 59).lineWidth(.7).strokeColor(COLORS.border).stroke();
    doc.y = 76;
  });
  return doc;
}

function drawBrandHeader(doc, { documentType, reference, meta = [], status }) {
  const logo = path.resolve(__dirname, '../../assets/images/logo.png');
  try {
    doc.image(logo, PAGE.left, 43, { width: 94, height: 46, fit: [94, 46] });
  } catch (_error) {
    doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(18).text('Huttas', PAGE.left, 54);
  }
  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8)
    .text('HUTTA HOME SERVICES', 300, 48, { width: 262, align: 'right', characterSpacing: 1.1 });
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(11)
    .text('sales@huttas.com', 300, 63, { width: 262, align: 'right' });
  doc.moveTo(PAGE.left, 101).lineTo(PAGE.right, 101).lineWidth(1).strokeColor(COLORS.border).stroke();

  doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(9)
    .text(clean(documentType).toUpperCase(), PAGE.left, 124, { characterSpacing: 1.25 });
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(25)
    .text(clean(reference, documentType), PAGE.left, 141, { width: 360 });
  if (status) {
    const statusText = clean(status).toUpperCase();
    const statusWidth = Math.min(150, Math.max(76, doc.widthOfString(statusText) + 24));
    doc.roundedRect(PAGE.right - statusWidth, 137, statusWidth, 28, 14).fill(COLORS.paleBlue);
    doc.fillColor(COLORS.blueDark).font('Helvetica-Bold').fontSize(8)
      .text(statusText, PAGE.right - statusWidth, 147, {
        width: statusWidth,
        align: 'center',
        characterSpacing: .5
      });
  }
  doc.y = 182;
  const cleanMeta = meta.filter(Boolean);
  if (cleanMeta.length) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9)
      .text(cleanMeta.join('  |  '), PAGE.left, doc.y, { width: PAGE.width });
    doc.moveDown(1.3);
  }
}

function ensureSpace(doc, height = 80) {
  if (doc.y + height > doc.page.height - 70) doc.addPage();
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 105);
  doc.moveDown(.45);
  doc.fillColor(COLORS.blueDark).font('Helvetica-Bold').fontSize(9)
    .text(clean(title).toUpperCase(), PAGE.left, doc.y, { characterSpacing: .9 });
  doc.moveDown(.35);
  doc.moveTo(PAGE.left, doc.y).lineTo(PAGE.right, doc.y).lineWidth(.7).strokeColor(COLORS.border).stroke();
  doc.moveDown(.75);
}

function drawText(doc, value, options = {}) {
  doc.fillColor(options.color || COLORS.text)
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size || 10)
    .text(clean(value, options.fallback || '-'), {
      width: options.width || PAGE.width,
      lineGap: options.lineGap ?? 2.5,
      ...options.textOptions
    });
}

function drawDetailsGrid(doc, items) {
  const filtered = items.filter(item => item && (item.value || item.showEmpty));
  const gap = 12;
  const columnWidth = (PAGE.width - gap) / 2;
  for (let index = 0; index < filtered.length; index += 2) {
    ensureSpace(doc, 58);
    const row = filtered.slice(index, index + 2);
    const top = doc.y;
    const heights = row.map(item => {
      const valueHeight = doc.font('Helvetica-Bold').fontSize(10)
        .heightOfString(clean(item.value, '-'), { width: columnWidth - 24, lineGap: 2 });
      return Math.max(52, 29 + valueHeight);
    });
    const height = Math.max(...heights);
    row.forEach((item, column) => {
      const x = PAGE.left + column * (columnWidth + gap);
      doc.roundedRect(x, top, columnWidth, height, 7).fill(COLORS.surface);
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7.5)
        .text(clean(item.label).toUpperCase(), x + 12, top + 11, {
          width: columnWidth - 24,
          characterSpacing: .65
        });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(10)
        .text(clean(item.value, '-'), x + 12, top + 27, { width: columnWidth - 24, lineGap: 2 });
    });
    doc.y = top + height + 10;
  }
}

function drawCallout(doc, { label, value, note }) {
  ensureSpace(doc, note ? 84 : 66);
  const top = doc.y;
  const height = note ? 78 : 62;
  doc.roundedRect(PAGE.left, top, PAGE.width, height, 8).fill(COLORS.paleBlue);
  doc.fillColor(COLORS.blueDark).font('Helvetica-Bold').fontSize(8)
    .text(clean(label).toUpperCase(), PAGE.left + 16, top + 13, { characterSpacing: .75 });
  doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(22)
    .text(clean(value), PAGE.left + 16, top + 29, { width: PAGE.width - 32, align: 'right' });
  if (note) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
      .text(clean(note), PAGE.left + 16, top + 58, { width: PAGE.width - 32 });
  }
  doc.y = top + height + 8;
}

function drawNotice(doc, value) {
  ensureSpace(doc, 48);
  const content = clean(value);
  const height = Math.max(42, doc.font('Helvetica').fontSize(8.5)
    .heightOfString(content, { width: PAGE.width - 28, lineGap: 2 }) + 22);
  const top = doc.y;
  doc.roundedRect(PAGE.left, top, PAGE.width, height, 7).fill(COLORS.surface);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5)
    .text(content, PAGE.left + 14, top + 11, { width: PAGE.width - 28, lineGap: 2 });
  doc.y = top + height + 8;
}

function addPageFooters(doc, { reference }) {
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    doc.save();
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(PAGE.left, 744).lineTo(PAGE.right, 744).lineWidth(.7).strokeColor(COLORS.border).stroke();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
      .text('Hutta Home Services  |  sales@huttas.com', PAGE.left, PAGE.footerY, {
        width: 300,
        lineBreak: false
      });
    doc.text(clean(reference), 330, PAGE.footerY, {
      width: 135,
      align: 'right',
      lineBreak: false
    });
    doc.text(`Page ${pageIndex + 1} of ${range.count}`, 475, PAGE.footerY, {
      width: PAGE.right - 475,
      align: 'right',
      lineBreak: false
    });
    doc.page.margins.bottom = previousBottomMargin;
    doc.restore();
  }
}

module.exports = {
  addPageFooters,
  createDocument,
  drawBrandHeader,
  drawCallout,
  drawDetailsGrid,
  drawNotice,
  drawSectionTitle,
  drawText
};
