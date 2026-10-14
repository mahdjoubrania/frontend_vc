/* VérifCar — générateur de QR code autonome (aucune dépendance, fonctionne hors ligne)
   Mode octet, correction d'erreur M, versions 1 à 10 (jusqu'à ~200 caractères).
   Usage : VCQR.svg('https://…', 120)  → chaîne <svg> carrée de 120 px.          */
(function (root) {
  'use strict';

  // ---- Corps de Galois GF(256), polynôme 0x11D ----
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    var res = [];
    for (var i = 0; i < degree - 1; i++) res.push(0);
    res.push(1);
    var r = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < res.length; j++) {
        res[j] = gfMul(res[j], r);
        if (j + 1 < res.length) res[j] ^= res[j + 1];
      }
      r = gfMul(r, 0x02);
    }
    return res;
  }
  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift();
      res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, f); });
    });
    return res;
  }

  // ---- Tables (niveau M) : versions 1..10 ----
  var TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];   // octets totaux
  var EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  var BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  var ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function utf8(str) {
    var out = [], s = unescape(encodeURIComponent(str));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function encode(text) {
    var bytes = utf8(text), ver, cap;
    for (ver = 1; ver <= 10; ver++) {
      cap = (TOTAL[ver] - EC_PER_BLOCK[ver] * BLOCKS[ver]) * 8;
      if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap) break;
    }
    if (ver > 10) throw new Error('VCQR: texte trop long');

    // flux de bits : mode octet + longueur + données
    var bits = [];
    function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
    put(4, 4);
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k];
      data.push(v);
    }

    // blocs + correction d'erreur + entrelacement
    var nb = BLOCKS[ver], ecl = EC_PER_BLOCK[ver], raw = TOTAL[ver];
    var shortLen = Math.floor(raw / nb), numShort = nb - raw % nb;
    var div = rsDivisor(ecl), blocks = [], pos = 0;
    for (i = 0; i < nb; i++) {
      var dlen = shortLen - ecl + (i < numShort ? 0 : 1);
      var dat = data.slice(pos, pos + dlen); pos += dlen;
      blocks.push({ d: dat, e: rsRemainder(dat, div) });
    }
    var cw = [];
    for (i = 0; i < shortLen - ecl + 1; i++) blocks.forEach(function (b) { if (i < b.d.length) cw.push(b.d[i]); });
    for (i = 0; i < ecl; i++) blocks.forEach(function (b) { cw.push(b.e[i]); });

    // ---- matrice ----
    var size = ver * 4 + 17, m = [], fn = [];
    for (i = 0; i < size; i++) { m.push([]); fn.push([]); for (k = 0; k < size; k++) { m[i].push(false); fn[i].push(false); } }
    function set(x, y, dark) { m[y][x] = dark; fn[y][x] = true; }

    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var x = c[0] + dx, y = c[1] + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    });
    var al = ALIGN[ver];
    al.forEach(function (ax, a) {
      al.forEach(function (ay, b) {
        if ((a === 0 && b === 0) || (a === 0 && b === al.length - 1) || (a === al.length - 1 && b === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    function drawFormat(mask) {
      var d = (0 << 3) | mask, r = d;                       // niveau M = 00
      for (var j = 0; j < 10; j++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var b = ((d << 10) | r) ^ 0x5412;
      function bit(j) { return ((b >>> j) & 1) !== 0; }
      for (j = 0; j <= 5; j++) set(8, j, bit(j));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (j = 9; j < 15; j++) set(14 - j, 8, bit(j));
      for (j = 0; j < 8; j++) set(size - 1 - j, 8, bit(j));
      for (j = 8; j < 15; j++) set(8, size - 15 + j, bit(j));
      set(8, size - 8, true);                               // module sombre
    }
    drawFormat(0);
    if (ver >= 7) {
      var r2 = ver;
      for (i = 0; i < 12; i++) r2 = (r2 << 1) ^ ((r2 >>> 11) * 0x1F25);
      var vb = (ver << 12) | r2;
      for (i = 0; i < 18; i++) {
        var bt = ((vb >>> i) & 1) !== 0, aa = size - 11 + i % 3, bb = Math.floor(i / 3);
        set(aa, bb, bt); set(bb, aa, bt);
      }
    }

    // placement en zigzag
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j2 = 0; j2 < 2; j2++) {
          var x = right - j2, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && bi < cw.length * 8) {
            m[y][x] = ((cw[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0;
            bi++;
          }
        }
      }
    }

    // masque : on garde celui qui a la plus petite pénalité
    var MASKS = [
      function (x, y) { return (x + y) % 2 === 0; },
      function (x, y) { return y % 2 === 0; },
      function (x) { return x % 3 === 0; },
      function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
    ];
    function applyMask(k) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x];
    }
    function penalty() {
      var p = 0, dark = 0, x, y;
      for (y = 0; y < size; y++) {                           // lignes / colonnes de même couleur
        for (var dir = 0; dir < 2; dir++) {
          var run = 1;
          for (x = 1; x < size; x++) {
            var a = dir ? m[x][y] : m[y][x], b = dir ? m[x - 1][y] : m[y][x - 1];
            if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
          }
        }
      }
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {   // blocs 2x2
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
      }
      var pat = [true, false, true, true, true, false, true, false, false, false, false];   // motifs 1:1:3:1:1
      for (y = 0; y < size; y++) for (x = 0; x + 11 <= size; x++) {
        var h1 = true, h2 = true, v1 = true, v2 = true;
        for (var q = 0; q < 11; q++) {
          if (m[y][x + q] !== pat[q]) h1 = false;
          if (m[y][x + q] !== pat[10 - q]) h2 = false;
          if (m[x + q][y] !== pat[q]) v1 = false;
          if (m[x + q][y] !== pat[10 - q]) v2 = false;
        }
        p += 40 * ((h1 ? 1 : 0) + (h2 ? 1 : 0) + (v1 ? 1 : 0) + (v2 ? 1 : 0));
      }
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (m[y][x]) dark++;
      p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    }
    var best = 0, bestP = Infinity;
    for (k = 0; k < 8; k++) {
      applyMask(k); drawFormat(k);
      var pk = penalty();
      if (pk < bestP) { bestP = pk; best = k; }
      applyMask(k);                                         // annule (XOR)
    }
    applyMask(best); drawFormat(best);
    return m;
  }

  function svg(text, px) {
    var m = encode(text), n = m.length, q = 4, d = '';                   // marge (quiet zone) de 4 modules
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    var s = n + q * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" width="' + (px || 120) + '" height="' + (px || 120) +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  root.VCQR = { encode: encode, svg: svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VCQR;
})(typeof window !== 'undefined' ? window : this);
