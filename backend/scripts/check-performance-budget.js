const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '../..');
const htmlPath = path.join(root, 'pages/admin-dashboard.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const refs = [...html.matchAll(/(?:src|href)=["']\.\.\/([^"'?]+)(?:\?[^"']*)?["']/g)].map(match => match[1]);
const localAssets = [...new Set(refs)].map(ref => path.join(root, ref)).filter(file => fs.existsSync(file));
const resources = [htmlPath, ...localAssets];
const compressedBytes = resources.reduce((sum, file) => sum + zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length, 0);
const maxCompressedBytes = Number(process.env.INITIAL_ASSET_BUDGET_BYTES || 500000);
const oversized = resources.filter(file => fs.statSync(file).size > 550000);
console.log(JSON.stringify({ compressedBytes, maxCompressedBytes, resourceCount: resources.length, oversized: oversized.map(file => path.relative(root, file)) }, null, 2));
if (compressedBytes > maxCompressedBytes || oversized.length) process.exitCode = 1;
