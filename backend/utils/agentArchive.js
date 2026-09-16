const { PassThrough } = require('stream');
const safeName = value => String(value || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 140);
async function createAgentArchive(entries) {
  if (entries.length > 250 || entries.reduce((sum, item) => sum + item.buffer.length, 0) > 80 * 1024 * 1024) throw Object.assign(new Error('Transaction package exceeds download limits; download files individually'), { status: 413 });
  const { ZipArchive } = await import('archiver');
  return new Promise((resolve, reject) => {
    const zip = new ZipArchive({ zlib: { level: 6 } });
    const output = new PassThrough(), chunks = [];
    output.on('data', chunk => chunks.push(chunk));
    output.on('end', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject); zip.on('error', reject); zip.on('warning', reject);
    zip.pipe(output);
    entries.forEach((entry, index) => zip.append(entry.buffer, { name: `${String(index + 1).padStart(3, '0')}-${safeName(entry.name)}` }));
    zip.finalize().catch(reject);
  });
}
module.exports = { createAgentArchive, safeName };
