/* COOPMETRO XPT — gerador de QR Code local (modo byte, correção L/M, versões 1–15), sem dependências e sem rede.
 * Algoritmo padrão ISO/IEC 18004 (RS sobre GF(256), 8 máscaras com penalidade). Validado em testes decodificando a imagem.
 * O conteúdo do QR deste projeto é apenas o endereço da operação (nunca dados do pacote/pessoais) e NÃO autentica ninguém. */
(function (root) {
  'use strict';
  var NS = (root.CXPT = root.CXPT || {});

  var ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24],
  };
  var NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10],
  };
  var FORMAT_BITS = { L: 1, M: 0 };
  var MAX_VER = 15;

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { var n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(ver, ecl) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver]; }

  function utf8(str) {
    var out = [], s = unescape(encodeURIComponent(str));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(deg) {
    var res = [], i, j;
    for (i = 0; i < deg - 1; i++) res.push(0);
    res.push(1);
    var rootv = 1;
    for (i = 0; i < deg; i++) {
      for (j = 0; j < res.length; j++) { res[j] = gfMul(res[j], rootv); if (j + 1 < res.length) res[j] ^= res[j + 1]; }
      rootv = gfMul(rootv, 2);
    }
    return res;
  }
  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift(); res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, f); });
    });
    return res;
  }

  /** Codifica texto → {version, size, modules[y][x] (true = escuro)}. Lança erro se não couber. */
  function encode(text, ecl) {
    ecl = ecl === 'L' ? 'L' : 'M';
    var bytes = utf8(String(text));
    var ver, cap = 0, ccBits;
    for (ver = 1; ver <= MAX_VER; ver++) {
      ccBits = ver <= 9 ? 8 : 16;
      cap = dataCodewords(ver, ecl) * 8;
      if (4 + ccBits + bytes.length * 8 <= cap && bytes.length < (1 << ccBits)) break;
    }
    if (ver > MAX_VER) throw new Error('Texto longo demais para o QR deste projeto.');
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, ccBits); bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (var pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; data.push(v); }

    // blocos + ECC + intercalação
    var nb = NUM_BLOCKS[ecl][ver], eccLen = ECC_PER_BLOCK[ecl][ver], raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb), blocks = [], div = rsDivisor(eccLen), p = 0;
    for (i = 0; i < nb; i++) {
      var dat = data.slice(p, p + shortLen - eccLen + (i < nShort ? 0 : 1)); p += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var all = [];
    for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (b, j) { if (i !== shortLen - eccLen || j >= nShort) all.push(b[i]); });

    // matriz
    var size = ver * 4 + 17, mod = [], fn = [];
    for (i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setFn(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }
    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var pos = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      pos = [6]; for (var q = size - 7; pos.length < na; q -= step) pos.splice(1, 0, q);
    }
    pos.forEach(function (ax, ia) { pos.forEach(function (ay, ib) {
      if ((ia === 0 && ib === 0) || (ia === 0 && ib === pos.length - 1) || (ia === pos.length - 1 && ib === 0)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });
    function formatBits(mask) {
      var d = (FORMAT_BITS[ecl] << 3) | mask, rem = d;
      for (var t = 0; t < 10; t++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((d << 10) | rem) ^ 0x5412;
      function bit(n) { return ((b >>> n) & 1) !== 0; }
      for (var a = 0; a <= 5; a++) setFn(8, a, bit(a));
      setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
      for (a = 9; a < 15; a++) setFn(14 - a, 8, bit(a));
      for (a = 0; a < 8; a++) setFn(size - 1 - a, 8, bit(a));
      for (a = 8; a < 15; a++) setFn(8, size - 15 + a, bit(a));
      setFn(8, size - 8, true);
    }
    formatBits(0); // reserva as áreas de função
    if (ver >= 7) {
      var rem2 = ver; for (i = 0; i < 12; i++) rem2 = (rem2 << 1) ^ ((rem2 >>> 11) * 0x1f25);
      var vb = (ver << 12) | rem2;
      for (i = 0; i < 18; i++) { var col = ((vb >>> i) & 1) !== 0, a2 = size - 11 + (i % 3), b2 = Math.floor(i / 3); setFn(a2, b2, col); setFn(b2, a2, col); }
    }
    // dados em zigue-zague
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) {
        var x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && bi < all.length * 8) { mod[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    function applyMask(m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break; case 1: inv = y % 2 === 0; break; case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break; case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break; case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (!fn[y][x] && inv) mod[y][x] = !mod[y][x];
      }
    }
    function penalty() {
      var score = 0, y, x, run, line, k;
      function rowScore(get) {
        var s = 0, r = 1, prev = get(0);
        for (var t = 1; t < size; t++) { var cur = get(t); if (cur === prev) { r++; if (r === 5) s += 3; else if (r > 5) s++; } else { r = 1; prev = cur; } }
        // padrão tipo localizador 1011101 com 4 claros
        var str = ''; for (t = 0; t < size; t++) str += get(t) ? '1' : '0';
        var re = /(?=(00001011101|10111010000))/g, m; while ((m = re.exec(str))) { s += 40; re.lastIndex = m.index + 1; }
        return s;
      }
      for (y = 0; y < size; y++) score += rowScore(function (t) { return mod[y][t]; });
      for (x = 0; x < size; x++) score += rowScore(function (t) { return mod[t][x]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) { var c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3; }
      var dark = 0; for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
      var tot = size * size; k = Math.ceil(Math.abs(dark * 20 - tot * 10) / tot) - 1; score += Math.max(0, k) * 10;
      void run; void line;
      return score;
    }
    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); formatBits(m);
      var sc = penalty(); if (sc < bestScore) { bestScore = sc; best = m; }
      applyMask(m);
    }
    applyMask(best); formatBits(best);
    return { version: ver, size: size, modules: mod, mask: best, ecl: ecl };
  }

  /** Caminho SVG (1 unidade = 1 módulo) com zona silenciosa de `border` módulos. */
  function toPath(qr, border) {
    border = border == null ? 4 : border;
    var d = [];
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) d.push('M' + (x + border) + ',' + (y + border) + 'h1v1h-1z');
    }
    return d.join('');
  }

  NS.qr = { encode: encode, toPath: toPath, MAX_VER: MAX_VER };
  if (typeof module !== 'undefined' && module.exports) module.exports = NS.qr;
})(typeof window !== 'undefined' ? window : globalThis);
