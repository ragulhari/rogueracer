// Tudo que é visual: pista, cenário, carros, marcas de pneu.
import * as THREE from 'three';
import { liveryColors } from './livery.js';
import { mulberry32 } from './rng.js';

// Faixa ao longo da pista entre dois deslocamentos laterais. colorOf(i) dá a cor de cada segmento.
function ribbon(track, offA, offB, y, colorOf) {
  // mantém o sentido dos triângulos igual em qualquer lado da pista (senão a face fica escura)
  if (offB < offA) [offA, offB] = [offB, offA];
  const N = track.N;
  const pos = new Float32Array(N * 6 * 3);
  const col = colorOf ? new Float32Array(N * 6 * 3) : null;
  const c = new THREE.Color();
  let k = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const ax = track.px[i] + track.nx[i] * offA, ay = track.py[i] + track.ny[i] * offA;
    const bx = track.px[i] + track.nx[i] * offB, by = track.py[i] + track.ny[i] * offB;
    const cx = track.px[j] + track.nx[j] * offA, cy = track.py[j] + track.ny[j] * offA;
    const dx = track.px[j] + track.nx[j] * offB, dy = track.py[j] + track.ny[j] * offB;
    const verts = [ax, ay, bx, by, cx, cy, bx, by, dx, dy, cx, cy];
    if (col) c.set(colorOf(i));
    for (let v = 0; v < 6; v++) {
      pos[k] = verts[v * 2]; pos[k + 1] = y; pos[k + 2] = verts[v * 2 + 1];
      if (col) { col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
      k += 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  // garante normais para cima independente do sentido dos triângulos
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function wallGeometry(track, off, height) {
  const N = track.N;
  const pos = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const ax = track.px[i] + track.nx[i] * off, az = track.py[i] + track.ny[i] * off;
    const bx = track.px[j] + track.nx[j] * off, bz = track.py[j] + track.ny[j] * off;
    pos.push(ax, 0, az, bx, 0, bz, ax, height, az, bx, 0, bz, bx, height, bz, ax, height, az);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function checkerTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 16;
  const ctx = cv.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
    ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
    ctx.fillRect(x * 4, y * 4, 4, 4);
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function padTexture(kind) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d');
  if (kind === 'boost') {
    c.fillStyle = 'rgba(10,40,60,0.85)';
    c.fillRect(0, 0, 64, 128);
    c.strokeStyle = '#4fd2ff';
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // setas apontando para baixo do canvas = sentido da corrida
    for (let k = 0; k < 3; k++) {
      const y = 22 + k * 36;
      c.beginPath(); c.moveTo(10, y); c.lineTo(32, y + 20); c.lineTo(54, y); c.stroke();
    }
  } else {
    const grd = c.createRadialGradient(32, 64, 4, 32, 64, 60);
    grd.addColorStop(0, 'rgba(8,8,12,0.95)');
    grd.addColorStop(0.6, 'rgba(20,18,30,0.85)');
    grd.addColorStop(1, 'rgba(20,18,30,0)');
    c.fillStyle = grd;
    c.beginPath();
    for (let a = 0; a <= 12; a++) {
      const ang = (a / 12) * Math.PI * 2, r = 0.78 + 0.22 * Math.sin(a * 2.7);
      const x = 32 + Math.cos(ang) * 30 * r, y = 64 + Math.sin(ang) * 60 * r;
      a ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.fill();
    c.fillStyle = 'rgba(120,90,200,0.25)';
    c.beginPath(); c.ellipse(26, 52, 8, 16, 0.4, 0, Math.PI * 2); c.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTrackScene(track) {
  const th = track.theme;
  const group = new THREE.Group();
  const neon = th.name === 'Cidade Neon';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: th.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const shoulder = new THREE.Mesh(
    ribbon(track, -track.wallOffset, track.wallOffset, 0.01),
    new THREE.MeshLambertMaterial({ color: th.shoulder, side: THREE.DoubleSide }),
  );
  shoulder.receiveShadow = true;
  group.add(shoulder);

  const road = new THREE.Mesh(
    ribbon(track, -track.halfWidth, track.halfWidth, 0.03),
    new THREE.MeshLambertMaterial({ color: th.road, side: THREE.DoubleSide }),
  );
  road.receiveShadow = true;
  group.add(road);

  const curbColor = (i) => (Math.floor(i / 2) % 2 ? 0xffffff : 0xd92b2b);
  const curbMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  for (const sg of [1, -1]) {
    const curb = new THREE.Mesh(ribbon(track, sg * track.halfWidth, sg * (track.halfWidth + 1.3), 0.04, curbColor), curbMat);
    curb.receiveShadow = true;
    group.add(curb);
  }

  // faixa central tracejada
  const dashGeo = ribbon(track, -0.18, 0.18, 0.05, (i) => (Math.floor(i / 3) % 2 ? th.road : 0xf2f2f2));
  group.add(new THREE.Mesh(dashGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  // linha de chegada
  const start = new THREE.Mesh(
    new THREE.PlaneGeometry(track.halfWidth * 2, 3),
    new THREE.MeshLambertMaterial({ map: checkerTexture() }),
  );
  start.rotation.x = -Math.PI / 2;
  start.rotation.z = Math.atan2(track.tx[0], track.ty[0]);
  start.position.set(track.px[0], 0.06, track.py[0]);
  group.add(start);

  // placas de turbo e manchas de óleo
  const boostTex = padTexture('boost'), oilTex = padTexture('oil');
  for (const pad of track.pads || []) {
    const boost = pad.kind === 'boost';
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pad.w, pad.len),
      new THREE.MeshBasicMaterial({ map: boost ? boostTex : oilTex, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.atan2(track.tx[pad.idx], track.ty[pad.idx]) + (boost ? 0 : pad.idx);
    mesh.position.set(track.px[pad.idx] + track.nx[pad.idx] * pad.lat, 0.065, track.py[pad.idx] + track.ny[pad.idx] * pad.lat);
    mesh.renderOrder = 2;
    if (boost) group.userData.boostMats = [...(group.userData.boostMats || []), mesh.material];
    group.add(mesh);
  }

  // muretas
  const wallMat = new THREE.MeshLambertMaterial({
    color: th.wall, side: THREE.DoubleSide,
    emissive: neon ? th.wall : 0x000000, emissiveIntensity: neon ? 0.8 : 0,
  });
  for (const sg of [1, -1]) {
    const w = new THREE.Mesh(wallGeometry(track, sg * track.wallOffset, 1.1), wallMat);
    w.castShadow = true;
    w.receiveShadow = true;
    group.add(w);
  }

  // árvores (ou postes de neon)
  const rng = mulberry32(track.level * 31 + 7);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < track.N; i++) {
    minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]);
    minY = Math.min(minY, track.py[i]); maxY = Math.max(maxY, track.py[i]);
  }
  const water = track.water;
  const inWater = (x, y, m = 0) => water && x > water.x0 - m && x < water.x1 + m && y > water.y0 - m && y < water.y1 + m;
  if (water) {
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(water.x1 - water.x0, water.y1 - water.y0),
      new THREE.MeshLambertMaterial({ color: 0x1f6fa8 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set((water.x0 + water.x1) / 2, 0.08, (water.y0 + water.y1) / 2);
    sea.receiveShadow = true;
    group.add(sea);
    // iates: casco branco e cabine
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x2b3440 });
    for (let k = 0; k < 14; k++) {
      const len = 10 + rng() * 14;
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(len * 0.32, 1.6, len), hullMat);
      hull.position.y = 0.8;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.24, 1.4, len * 0.4), deckMat);
      cabin.position.set(0, 2.2, -len * 0.08);
      hull.castShadow = cabin.castShadow = true;
      boat.add(hull, cabin);
      boat.position.set(water.x0 + 12 + rng() * (water.x1 - water.x0 - 24), 0, water.y0 + 12 + rng() * (water.y1 - water.y0 - 24));
      boat.rotation.y = Math.PI / 2 + (rng() - 0.5) * 0.3;
      group.add(boat);
    }
  }
  const spots = [];
  const margin = 120;
  const city = !!th.city;
  for (let tries = 0; tries < (city ? 6000 : 3000) && spots.length < (city ? 700 : 420); tries++) {
    const x = minX - margin + rng() * (maxX - minX + margin * 2);
    const y = minY - margin + rng() * (maxY - minY + margin * 2);
    if (inWater(x, y, 6)) continue;
    let near = Infinity;
    for (let i = 0; i < track.N; i += 3) near = Math.min(near, (track.px[i] - x) ** 2 + (track.py[i] - y) ** 2);
    if (near > (track.wallOffset + (city ? 9 : 6)) ** 2) spots.push([x, y, 0.7 + rng() * 0.8]);
  }
  if (city) {
    // prédios em tons pastel de Monte Carlo no lugar das árvores
    const pastel = [0xf2d8b5, 0xe9c4a6, 0xf5e6c8, 0xd9b8a0, 0xf0f0ea, 0xe7cfa0, 0xcfd8dc];
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const blocks = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), col = new THREE.Color();
    spots.forEach(([x, y, s], i) => {
      e4.set(0, rng() * Math.PI, 0);
      q4.setFromEuler(e4);
      m4.compose(new THREE.Vector3(x, 0, y), q4, new THREE.Vector3(6 + s * 6, 5 + rng() * rng() * 30, 6 + s * 6));
      blocks.setMatrixAt(i, m4);
      blocks.setColorAt(i, col.set(pastel[Math.floor(rng() * pastel.length)]));
    });
    blocks.castShadow = true;
    blocks.receiveShadow = true;
    group.add(blocks);
    return group;
  }
  const crownGeo = neon ? new THREE.BoxGeometry(1.2, 6, 1.2) : new THREE.ConeGeometry(2.6, 6, 7);
  const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({
    color: th.tree, emissive: neon ? th.tree : 0x000000, emissiveIntensity: neon ? 0.6 : 0,
  }), spots.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 6), new THREE.MeshLambertMaterial({ color: 0x5b3a1e }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach(([x, y, s], i) => {
    sc.set(s, s, s);
    p.set(x, (neon ? 3 : 5) * s, y);
    m.compose(p, q, sc);
    crown.setMatrixAt(i, m);
    p.set(x, 1 * s, y);
    m.compose(p, q, sc);
    trunk.setMatrixAt(i, m);
  });
  crown.castShadow = true;
  trunk.castShadow = true;
  group.add(crown);
  if (!neon) group.add(trunk);

  return group;
}

export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mm) => { if (mm.map) mm.map.dispose(); mm.dispose(); });
    }
  });
}

// Carro de Fórmula 1 visto de cima: bico fino, asa dianteira larga, laterais (sidepods),
// cockpit com capacete, cobertura do motor com barbatana, asa traseira e rodas expostas.
// Frente apontando para +z, ~5,2 m de comprimento.
// Geometrias compartilhadas por todos os carros (o grid tem 20)
const carGeo = {};
const geo = (key, make) => carGeo[key] || (carGeo[key] = make());
const carbonMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.55, metalness: 0.2 });
const rubberMat = new THREE.MeshLambertMaterial({ color: 0x0d0d0f });
const rimMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });

// livery: índice em LIVERIES; primary/secondary: cores
export function makeCarMesh(primary, secondary = 0xffffff, livery = 0) {
  const g = new THREE.Group();
  const L = liveryColors(livery, primary, secondary);
  const mats = new Map();
  const paint = (color) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.35 }));
    return mats.get(color);
  };
  const part = (name) => paint(L.part(name));
  const carbon = carbonMat;
  const trim = new THREE.MeshLambertMaterial({ color: L.trim });
  const rubber = rubberMat;
  const rim = rimMat;
  const add = (geometry, mat, x, y, z, parent = g) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  // bico afinando até a ponta
  const nose = add(geo('nose', () => new THREE.CylinderGeometry(0.16, 0.36, 1.7, 8)), part('nose'), 0, 0.36, 1.75);
  nose.rotation.x = Math.PI / 2;
  nose.scale.set(1, 1, 0.75);
  // asa dianteira com placas laterais e faixa na cor de destaque
  add(box(2.1, 0.07, 0.42), carbon, 0, 0.14, 2.45);
  add(box(1.9, 0.075, 0.12), trim, 0, 0.15, 2.32);
  for (const x of [-1.04, 1.04]) add(box(0.05, 0.3, 0.5), part('endF'), x, 0.24, 2.45);
  // monocoque e cockpit
  add(box(0.78, 0.48, 1.9), part('mono'), 0, 0.42, 0.35);
  add(box(0.5, 0.2, 0.7), carbon, 0, 0.62, 0.15); // abertura do cockpit
  add(geo('helmet', () => new THREE.SphereGeometry(0.2, 12, 8)), trim, 0, 0.78, 0.05); // capacete
  const halo = add(geo('halo', () => new THREE.TorusGeometry(0.3, 0.035, 6, 16, Math.PI)), carbon, 0, 0.82, 0.18);
  halo.rotation.x = -Math.PI / 2;
  // laterais (sidepods)
  for (const x of [-0.72, 0.72]) {
    add(box(0.62, 0.4, 1.5), part('pod'), x, 0.34, -0.35);
    add(box(0.5, 0.2, 0.08), carbon, x, 0.42, 0.42); // entrada de ar
  }
  // cobertura do motor, entrada de ar acima do piloto e barbatana
  add(box(0.62, 0.55, 1.6), part('engine'), 0, 0.55, -1.0);
  add(box(0.34, 0.3, 0.35), carbon, 0, 0.92, -0.25);
  add(box(0.04, 0.32, 1.1), part('fin'), 0, 0.98, -1.25);
  // faixas da pintura por cima do bico, do monocoque e do motor
  const stripeMat = paint(L.stripe);
  for (const sx of L.stripes) {
    const w = L.stripes.length > 1 ? 0.1 : 0.2;
    const ns = add(box(w * 0.8, 0.02, 1.7), stripeMat, sx * 0.55, 0.565, 1.72);
    ns.rotation.x = 0.088;
    add(box(w, 0.02, 1.0), stripeMat, sx, 0.665, 0.9);
    add(box(w, 0.02, 1.6), stripeMat, sx * 0.85, 0.835, -1.0);
  }
  // assoalho
  add(box(1.5, 0.05, 2.9), carbon, 0, 0.12, -0.45);
  // asa traseira: plano principal, flap e placas laterais
  add(box(1.4, 0.06, 0.38), carbon, 0, 1.05, -2.15);
  add(box(1.4, 0.05, 0.2), trim, 0, 1.16, -2.28);
  for (const x of [-0.72, 0.72]) add(box(0.05, 0.62, 0.62), part('endR'), x, 0.82, -2.18);
  add(box(0.1, 0.5, 0.12), carbon, 0, 0.75, -2.05); // suporte
  // rodas expostas (as de trás mais largas) e braços de suspensão
  for (const [x, z, w, r] of [[-0.98, 1.45, 0.36, 0.34], [0.98, 1.45, 0.36, 0.34], [-0.98, -1.4, 0.46, 0.37], [0.98, -1.4, 0.46, 0.37]]) {
    const wheel = add(geo(`w${r},${w}`, () => new THREE.CylinderGeometry(r, r, w, 16)), rubber, x, r, z);
    wheel.rotation.z = Math.PI / 2;
    const cap = add(geo(`c${r},${w}`, () => new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 12)), rim, x, r, z);
    cap.rotation.z = Math.PI / 2;
    const arm = add(box(Math.abs(x) - 0.3, 0.04, 0.08), carbon, x / 2, r * 0.9, z);
    arm.castShadow = false;
  }
  // flap extra que aparece com o bônus de aerofólio
  const spoiler = add(box(1.5, 0.06, 0.3), trim, 0, 1.32, -2.25);
  spoiler.visible = false;
  g.userData.spoiler = spoiler;

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 1.8, 8),
    new THREE.MeshBasicMaterial({ color: 0x4fd2ff, transparent: true, opacity: 0.85 }),
  );
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0.5, -2.7);
  flame.visible = false;
  g.add(flame);
  g.userData.flame = flame;
  return g;
}

// Marcas de pneu em anel (as mais antigas são reaproveitadas)
export class SkidMarks {
  constructor(scene, max = 4000) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.4, 1.0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
      max,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.next = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3(1, 1, 1);
  }

  add(x, z, heading) {
    this.e.set(0, heading, 0);
    this.q.setFromEuler(this.e);
    this.p.set(x, 0.07, z);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.next, this.m);
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.mesh.count = 0;
    this.next = 0;
  }
}

// Fumaça de pneu e poeira: partículas em pontos com tamanho e transparência por vértice.
export class Smoke {
  constructor(scene, max = 600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 2);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 400 } },
      vertexShader: `
        attribute float alpha; attribute float size; attribute vec3 color;
        varying float vA; varying vec3 vC; uniform float scale;
        void main() {
          vA = alpha; vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; varying vec3 vC;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.1, d));
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.next = 0;
  }

  setViewport(h) { this.points.material.uniforms.scale.value = h * 0.6; }

  emit(x, z, vx, vz, color = 0xdddddd, life = 0.9, size = 2) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = 0.5; this.pos[i * 3 + 2] = z;
    this.vel[i * 2] = vx; this.vel[i * 2 + 1] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size;
    const c = new THREE.Color(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.pos[i * 3] += this.vel[i * 2] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 2 + 1] * dt;
      this.vel[i * 2] *= 1 - dt * 2;
      this.vel[i * 2 + 1] *= 1 - dt * 2;
      this.size[i] += dt * 3;
      this.alpha[i] = 0.45 * k;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}
