const PDFDocument = require('pdfkit');
const path = require('path');

const COLORS = Object.freeze({
  ink: '#0A0A0B',
  text: '#27272A',
  muted: '#77777C',
  label: '#A2A2A7',
  border: '#E7E7E8',
  surface: '#F5F5F3',
  white: '#FFFFFF'
});

const PAGE = Object.freeze({ left: 46, right: 566, width: 520, footerY: 758 });
const REVERSED_LOGO = path.resolve(__dirname, '../../assets/images/smplfix-logo-reversed.png');
const clean = (value, fallback = '') => String(value ?? '').trim() || fallback;

function createDocument({ title, subject }) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 38, right: PAGE.left, bottom: 60, left: PAGE.left },
    bufferPages: true,
    info: {
      Title: clean(title, 'smplfix Document'),
      Author: 'smplfix',
      Subject: clean(subject, title)
    }
  });

  doc.on('pageAdded', () => {
    doc.rect(0, 0, doc.page.width, 70).fill(COLORS.ink);
    try {
      doc.image(REVERSED_LOGO, PAGE.left, 19, { fit: [76, 34] });
    } catch (_error) {
      doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(16).text('smplfix', PAGE.left, 27);
    }
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(8)
      .text('DOCUMENT CONTINUED', 320, 27, { width: PAGE.right - 320, align: 'right', characterSpacing: 1.1 });
    doc.y = 92;
  });
  return doc;
}

function drawBrandHeader(doc, { documentType, reference, meta = [], status }) {
  doc.rect(0, 0, doc.page.width, 100).fill(COLORS.ink);
  try {
    doc.image(REVERSED_LOGO, PAGE.left, 27, { fit: [92, 42] });
  } catch (_error) {
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(19).text('smplfix', PAGE.left, 40);
  }

  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(19)
    .text(clean(documentType, 'Document'), 330, 31, { width: PAGE.right - 330, align: 'right' });
  doc.fillColor('#9C9CA1').font('Helvetica-Bold').fontSize(7.5)
    .text(clean(reference).toUpperCase(), 330, 61, {
      width: PAGE.right - 330,
      align: 'right',
      characterSpacing: 1.25
    });

  const context = [...meta, status].filter(Boolean).map(clean).filter(Boolean);
  doc.y = 124;
  if (context.length) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
      .text(context.join('  |  '), PAGE.left, doc.y, { width: PAGE.width, align: 'right' });
    doc.y += 18;
  }
}

function ensureSpace(doc, height = 80) {
  if (doc.y + height > doc.page.height - 72) doc.addPage();
}

function drawMetadataColumns(doc, columns) {
  const items = columns.filter(Boolean).slice(0, 3);
  if (!items.length) return;
  ensureSpace(doc, 94);
  const top = doc.y;
  const gap = 22;
  const width = (PAGE.width - gap * 2) / 3;
  const heights = items.map(item => {
    const lines = (item.lines || []).filter(Boolean).map(clean);
    const primary = clean(item.value || lines.shift(), '-');
    return 27
      + doc.font('Helvetica-Bold').fontSize(9.2).heightOfString(primary, { width, lineGap: 1.5 })
      + (lines.length ? doc.font('Helvetica').fontSize(8).heightOfString(lines.join('\n'), { width, lineGap: 2 }) + 5 : 0);
  });
  const height = Math.max(64, ...heights);

  items.forEach((item, index) => {
    const x = PAGE.left + index * (width + gap);
    const lines = (item.lines || []).filter(Boolean).map(clean);
    const primary = clean(item.value || lines.shift(), '-');
    doc.fillColor(COLORS.label).font('Helvetica-Bold').fontSize(7)
      .text(clean(item.label).toUpperCase(), x, top, { width, characterSpacing: 1.25 });
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(9.2)
      .text(primary, x, top + 18, { width, lineGap: 1.5 });
    if (lines.length) {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
        .text(lines.join('\n'), x, doc.y + 3, { width, lineGap: 2 });
    }
  });
  doc.y = top + height + 14;
}

function drawSectionTitle(doc, title) {
  ensureSpace(doc, 55);
  doc.moveDown(.35);
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8)
    .text(clean(title).toUpperCase(), PAGE.left, doc.y, { characterSpacing: 1.05 });
  doc.y += 7;
  doc.moveTo(PAGE.left, doc.y).lineTo(PAGE.right, doc.y).lineWidth(.8).strokeColor(COLORS.border).stroke();
  doc.y += 13;
}

function drawLineItems(doc, items) {
  const rows = (items || []).filter(Boolean);
  if (!rows.length) return;
  ensureSpace(doc, 56);
  const descriptionWidth = 350;
  const qtyX = 414;
  const amountX = 468;

  doc.fillColor(COLORS.label).font('Helvetica-Bold').fontSize(6.8)
    .text('DESCRIPTION', PAGE.left, doc.y, { width: descriptionWidth, characterSpacing: 1.2 });
  doc.text('QTY', qtyX, doc.y, { width: 35, align: 'center', characterSpacing: 1.2 });
  doc.text('AMOUNT', amountX, doc.y, { width: PAGE.right - amountX, align: 'right', characterSpacing: 1.2 });
  doc.y += 15;
  doc.moveTo(PAGE.left, doc.y).lineTo(PAGE.right, doc.y).lineWidth(1).strokeColor(COLORS.ink).stroke();
  doc.y += 12;

  rows.forEach(item => {
    const title = clean(item.title || item.description, 'Service');
    const detail = clean(item.detail || item.note);
    const rowHeight = Math.max(50,
      doc.font('Helvetica-Bold').fontSize(9.5).heightOfString(title, { width: descriptionWidth, lineGap: 2 })
      + (detail ? doc.font('Helvetica').fontSize(7.8).heightOfString(detail, { width: descriptionWidth, lineGap: 2 }) + 6 : 0)
      + 18);
    ensureSpace(doc, rowHeight + 15);
    const top = doc.y;
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(9.5)
      .text(title, PAGE.left, top, { width: descriptionWidth, lineGap: 2 });
    if (detail) {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.8)
        .text(detail, PAGE.left, doc.y + 3, { width: descriptionWidth, lineGap: 2 });
    }
    doc.fillColor(COLORS.text).font(item.qty === 'Included' ? 'Helvetica' : 'Helvetica-Bold').fontSize(8.8)
      .text(clean(item.qty, '1'), qtyX, top + 1, { width: 35, align: 'center' });
    doc.font(item.included ? 'Helvetica' : 'Helvetica-Bold')
      .text(clean(item.amount, '-'), amountX, top + 1, { width: PAGE.right - amountX, align: 'right' });
    doc.y = top + rowHeight;
    doc.moveTo(PAGE.left, doc.y).lineTo(PAGE.right, doc.y).lineWidth(.65).strokeColor(COLORS.border).stroke();
    doc.y += 11;
  });
}

function drawTotals(doc, { subtotal, tax, total, totalLabel = 'Total due' }) {
  ensureSpace(doc, 112);
  const x = 336;
  const width = PAGE.right - x;
  const line = (label, value) => {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5).text(label, x, doc.y, { width: 84 });
    doc.fillColor(COLORS.text).text(clean(value), x + 84, doc.y, { width: width - 84, align: 'right' });
    doc.y += 21;
  };
  line('Subtotal', subtotal);
  if (tax !== undefined && tax !== null) line('Tax', tax);
  const top = doc.y + 2;
  doc.roundedRect(x, top, width, 43, 7).fill(COLORS.ink);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9)
    .text(clean(totalLabel), x + 13, top + 17, { width: 92 });
  doc.fontSize(16).text(clean(total), x + 105, top + 13, { width: width - 118, align: 'right' });
  doc.y = top + 58;
}

function drawText(doc, value, options = {}) {
  doc.fillColor(options.color || COLORS.text)
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.size || 9)
    .text(clean(value, options.fallback || '-'), {
      width: options.width || PAGE.width,
      lineGap: options.lineGap ?? 2.5,
      ...options.textOptions
    });
}

function drawNotePanel(doc, { label = 'Note', value }) {
  const content = clean(value);
  if (!content) return;
  const innerWidth = PAGE.width - 30;
  const height = Math.max(62, doc.font('Helvetica').fontSize(8.3)
    .heightOfString(content, { width: innerWidth, lineGap: 2.5 }) + 39);
  ensureSpace(doc, height + 8);
  const top = doc.y;
  doc.roundedRect(PAGE.left, top, PAGE.width, height, 9).fill(COLORS.surface);
  doc.fillColor(COLORS.label).font('Helvetica-Bold').fontSize(6.8)
    .text(clean(label).toUpperCase(), PAGE.left + 15, top + 13, { width: innerWidth, characterSpacing: 1.2 });
  doc.fillColor(COLORS.text).font('Helvetica').fontSize(8.3)
    .text(content, PAGE.left + 15, top + 31, { width: innerWidth, lineGap: 2.5 });
  doc.y = top + height + 8;
}

// Backward-compatible helpers for work orders and any internal documents.
function drawDetailsGrid(doc, items) {
  const filtered = items.filter(item => item && (item.value || item.showEmpty));
  for (let index = 0; index < filtered.length; index += 3) {
    drawMetadataColumns(doc, filtered.slice(index, index + 3).map(item => ({
      label: item.label,
      value: clean(item.value, '-')
    })));
  }
}

function drawCallout(doc, { label, value, note }) {
  drawTotals(doc, { subtotal: value, total: value, totalLabel: label });
  if (note) drawNotePanel(doc, { label: 'Terms', value: note });
}

function drawNotice(doc, value) {
  drawNotePanel(doc, { value });
}

function addPageFooters(doc, { reference }) {
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    doc.save();
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(PAGE.left, 742).lineTo(PAGE.right, 742).lineWidth(.65).strokeColor(COLORS.border).stroke();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
      .text('smplfix  |  sales@smplfix.com', PAGE.left, PAGE.footerY, { width: 280, lineBreak: false });
    doc.text(clean(reference), 330, PAGE.footerY, { width: 130, align: 'right', lineBreak: false });
    doc.text(`Page ${pageIndex + 1} of ${range.count}`, 474, PAGE.footerY, {
      width: PAGE.right - 474,
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
  drawLineItems,
  drawMetadataColumns,
  drawNotePanel,
  drawNotice,
  drawSectionTitle,
  drawText,
  drawTotals
};
