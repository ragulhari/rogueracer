// Gera um SVG da pista (Mônaco por padrão) marcando trechos com raio pequeno. Uso: node tools/plot-track.mjs saida.svg [nivel]
import { writeFileSync } from 'node:fs';
import { fixedTrack, generateTrack, FIXED_TRACKS } from '../src/track.js';
const [out, lvl] = process.argv.slice(2);
const t = FIXED_TRACKS[lvl || 'monaco'] ? fixedTrack(lvl || 'monaco', false) : generateTrack(+lvl);
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (let i = 0; i < t.N; i++) { minX = Math.min(minX, t.px[i]); maxX = Math.max(maxX, t.px[i]); minY = Math.min(minY, t.py[i]); maxY = Math.max(maxY, t.py[i]); }
const pad = 40;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}" width="1000" style="background:#222">`;
const pts = Array.from({ length: t.N }, (_, i) => `${t.px[i]},${t.py[i]}`).join(' ');
svg += `<polygon points="${pts}" fill="none" stroke="#555" stroke-width="${t.wallOffset * 2}"/>`;
svg += `<polygon points="${pts}" fill="none" stroke="#ccc" stroke-width="${t.halfWidth * 2}"/>`;
const limit = 1 / (t.wallOffset + 2);
for (let i = 0; i < t.N; i++) if (Math.abs(t.curvature[i]) > limit) svg += `<circle cx="${t.px[i]}" cy="${t.py[i]}" r="3" fill="red"/>`;
for (let i = 0; i < t.N; i += 50) svg += `<text x="${t.px[i] + 12}" y="${t.py[i]}" fill="#ff0" font-size="14">${i}</text>`;
if (t.water) svg += `<rect x="${t.water.x0}" y="${t.water.y0}" width="${t.water.x1 - t.water.x0}" height="${t.water.y1 - t.water.y0}" fill="#1f6fa880"/>`;
svg += `<circle cx="${t.px[0]}" cy="${t.py[0]}" r="6" fill="#0f0"/></svg>`;
writeFileSync(out, svg);
let mc = 0; for (const c of t.curvature) mc = Math.max(mc, Math.abs(c));
console.log(t.name, 'comprimento', t.length.toFixed(0), 'm; raio mínimo', (1 / mc).toFixed(1), 'm; limite', (t.wallOffset + 2).toFixed(1));
