const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 多边形包含判定算法 Point-in-polygon
function pointInPoly(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function generatePNG() {
  const width = 32;
  const height = 32;
  const buffer = Buffer.alloc(height * (width * 4 + 1));

  // 定义与 Logo.tsx 物理完全一致的顶点坐标 (基于 180x190 的 ViewBox 换算)
  // X: [10, 190] -> [0, 32]
  // Y: [10, 200] -> [0, 32]
  function mapX(x) { return ((x - 10) / 180) * 32; }
  function mapY(y) { return ((y - 10) / 190) * 32; }

  // 3个面的顶点数组
  const polyLeft = [
    [mapX(100), mapY(20)],
    [mapX(25),  mapY(65)],
    [mapX(25),  mapY(155)],
    [mapX(100), mapY(105)]
  ];

  const polyBottom = [
    [mapX(25),  mapY(155)],
    [mapX(100), mapY(195)],
    [mapX(175), mapY(155)],
    [mapX(100), mapY(105)]
  ];

  const polyRight = [
    [mapX(100), mapY(20)],
    [mapX(175), mapY(65)],
    [mapX(175), mapY(115)],
    [mapX(100), mapY(155)]
  ];

  const circleCx = mapX(100);
  const circleCy = mapY(105);
  const rOuter = (14 / 180) * 32;
  const rInner = (6 / 180) * 32;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    buffer[rowOffset] = 0; // Filter type 0
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      const dx = px - circleCx;
      const dy = py - circleCy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= rInner) {
        // 白色内核心
        buffer[pixelOffset] = 255;
        buffer[pixelOffset + 1] = 255;
        buffer[pixelOffset + 2] = 255;
        buffer[pixelOffset + 3] = 255;
      } else if (dist <= rOuter) {
        // 浅蓝内环 #bfdbfe
        buffer[pixelOffset] = 191;
        buffer[pixelOffset + 1] = 219;
        buffer[pixelOffset + 2] = 254;
        buffer[pixelOffset + 3] = 255;
      } else if (pointInPoly(px, py, polyLeft)) {
        // 左面：知性蓝 #3182ce -> 深蓝 #1e3a8a
        const t = (py / 32);
        buffer[pixelOffset] = Math.round(49 + (30 - 49) * t);
        buffer[pixelOffset + 1] = Math.round(130 + (58 - 130) * t);
        buffer[pixelOffset + 2] = Math.round(206 + (138 - 206) * t);
        buffer[pixelOffset + 3] = 255;
      } else if (pointInPoly(px, py, polyBottom)) {
        // 下面：蓝靛 #1e40af
        buffer[pixelOffset] = 30;
        buffer[pixelOffset + 1] = 64;
        buffer[pixelOffset + 2] = 175;
        buffer[pixelOffset + 3] = 230;
      } else if (pointInPoly(px, py, polyRight)) {
        // 右面：亮蓝 #60a5fa -> #3182ce
        const t = (py / 32);
        buffer[pixelOffset] = Math.round(96 + (49 - 96) * t);
        buffer[pixelOffset + 1] = Math.round(165 + (130 - 165) * t);
        buffer[pixelOffset + 2] = Math.round(250 + (206 - 250) * t);
        buffer[pixelOffset + 3] = 255;
      } else {
        // 背景透明
        buffer[pixelOffset] = 0;
        buffer[pixelOffset + 1] = 0;
        buffer[pixelOffset + 2] = 0;
        buffer[pixelOffset + 3] = 0;
      }
    }
  }

  const idatData = zlib.deflateSync(buffer);

  function createChunk(type, data) {
    const len = data.length;
    const chunk = Buffer.alloc(12 + len);
    chunk.writeUInt32BE(len, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);

    let crc = 0xffffffff;
    for (let i = 4; i < 8 + len; i++) {
      crc ^= chunk[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + len);
    return chunk;
  }

  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(32, 0);
  ihdrData.writeUInt32BE(32, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdr = createChunk('IHDR', ihdrData);
  const idat = createChunk('IDAT', idatData);
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

function generateICO(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const dir = Buffer.alloc(16);
  dir[0] = 32;
  dir[1] = 32;
  dir[2] = 0;
  dir[3] = 0;
  dir.writeUInt16LE(1, 4);
  dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(pngBuffer.length, 8);
  dir.writeUInt32LE(22, 12);

  return Buffer.concat([header, dir, pngBuffer]);
}

// 修正后的完美比例 SVG (viewBox="10 10 180 190")
const perfectSvg = `<svg width="32" height="32" viewBox="10 10 180 190" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradPrimary" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3182ce"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
    <linearGradient id="gradLight" x1="200" y1="0" x2="0" y2="200" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#3182ce"/>
    </linearGradient>
  </defs>
  <path d="M100 20 L25 65 L25 155 L100 105 Z" fill="url(#gradPrimary)"/>
  <path d="M25 155 L100 195 L175 155 L100 105 Z" fill="#1e40af" opacity="0.8"/>
  <path d="M100 20 L175 65 L175 115 L100 155 Z" fill="url(#gradLight)"/>
  <circle cx="100" cy="105" r="14" fill="#bfdbfe"/>
  <circle cx="100" cy="105" r="6" fill="#ffffff"/>
</svg>
`;

const pngBuf = generatePNG();
const icoBuf = generateICO(pngBuf);

const root = "d:\\Project Development\\ZhiGe-Dockyard\\zhige-dockyard-web";

fs.writeFileSync(path.join(root, "public", "favicon.ico"), icoBuf);
fs.writeFileSync(path.join(root, "public", "favicon.png"), pngBuf);
fs.writeFileSync(path.join(root, "public", "favicon.svg"), perfectSvg);

fs.writeFileSync(path.join(root, "src", "app", "favicon.ico"), icoBuf);
fs.writeFileSync(path.join(root, "src", "app", "icon.png"), pngBuf);
fs.writeFileSync(path.join(root, "src", "app", "icon.svg"), perfectSvg);

console.log("标准 1:1 比例完美立体 Icon 生成成功！");
