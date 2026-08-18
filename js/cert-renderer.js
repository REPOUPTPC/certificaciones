/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - RENDERIZADOR SVG (js/cert-renderer.js)
 * ==============================================================================
 */

(function() {
  const QRCodeGen = (function() {
    const PAD0 = 0xEC, PAD1 = 0x11;
    function QR(typeNumber, errorCorrectionLevel) {
      this.typeNumber = typeNumber;
      this.errorCorrectionLevel = errorCorrectionLevel;
      this.modules = null;
      this.moduleCount = 0;
      this.dataCache = null;
      this.dataList = [];
    }
    QR.prototype = {
      addData: function(data) { this.dataList.push(new QR8bitByte(data)); this.dataCache = null; },
      isDark: function(row, col) { return this.modules[row][col]; },
      getModuleCount: function() { return this.moduleCount; },
      make: function() { this.makeImpl(false, this.getBestMaskPattern()); },
      makeImpl: function(test, maskPattern) {
        this.moduleCount = this.typeNumber * 4 + 17;
        this.modules = new Array(this.moduleCount);
        for (let r = 0; r < this.moduleCount; r++) {
          this.modules[r] = new Array(this.moduleCount);
          for (let c = 0; c < this.moduleCount; c++) this.modules[r][c] = null;
        }
        this.setupPositionProbePattern(0, 0);
        this.setupPositionProbePattern(this.moduleCount - 7, 0);
        this.setupPositionProbePattern(0, this.moduleCount - 7);
        this.setupPositionAdjustPattern();
        this.setupTimingPattern();
        this.setupTypeInfo(test, maskPattern);
        if (this.typeNumber >= 7) this.setupTypeNumber(test);
        if (this.dataCache == null) this.dataCache = createData(this.typeNumber, this.errorCorrectionLevel, this.dataList);
        this.mapData(this.dataCache, maskPattern);
      },
      setupPositionProbePattern: function(row, col) {
        for (let r = -1; r <= 7; r++) {
          if (row + r <= -1 || this.moduleCount <= row + r) continue;
          for (let c = -1; c <= 7; c++) {
            if (col + c <= -1 || this.moduleCount <= col + c) continue;
            if ((0 <= r && r <= 6 && (c == 0 || c == 6)) || (0 <= c && c <= 6 && (r == 0 || r == 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4))
              this.modules[row + r][col + c] = true;
            else
              this.modules[row + r][col + c] = false;
          }
        }
      },
      getBestMaskPattern: function() {
        let minLostPoint = 0, pattern = 0;
        for (let i = 0; i < 8; i++) { this.makeImpl(true, i); const lostPoint = QRUtil.getLostPoint(this); if (i == 0 || minLostPoint > lostPoint) { minLostPoint = lostPoint; pattern = i; } }
        return pattern;
      },
      setupTimingPattern: function() {
        for (let r = 8; r < this.moduleCount - 8; r++) { if (this.modules[r][6] != null) continue; this.modules[r][6] = (r % 2 == 0); }
        for (let c = 8; c < this.moduleCount - 8; c++) { if (this.modules[6][c] != null) continue; this.modules[6][c] = (c % 2 == 0); }
      },
      setupPositionAdjustPattern: function() {
        const pos = QRUtil.getPatternPosition(this.typeNumber);
        for (let i = 0; i < pos.length; i++) {
          for (let j = 0; j < pos.length; j++) {
            const row = pos[i], col = pos[j];
            if (this.modules[row][col] != null) continue;
            for (let r = -2; r <= 2; r++) {
              for (let c = -2; c <= 2; c++) {
                if (r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)) this.modules[row + r][col + c] = true;
                else this.modules[row + r][col + c] = false;
              }
            }
          }
        }
      },
      setupTypeNumber: function(test) {
        const bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        for (let i = 0; i < 18; i++) { const mod = (!test && ((bits >> i) & 1) == 1); this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod; }
        for (let i = 0; i < 18; i++) { const mod = (!test && ((bits >> i) & 1) == 1); this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod; }
      },
      setupTypeInfo: function(test, maskPattern) {
        const data = (this.errorCorrectionLevel << 3) | maskPattern, bits = QRUtil.getBCHTypeInfo(data);
        for (let i = 0; i < 15; i++) { const mod = (!test && ((bits >> i) & 1) == 1); if (i < 6) this.modules[i][8] = mod; else if (i < 8) this.modules[i + 1][8] = mod; else this.modules[this.moduleCount - 15 + i][8] = mod; }
        for (let i = 0; i < 15; i++) { const mod = (!test && ((bits >> i) & 1) == 1); if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod; else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod; else this.modules[8][15 - i - 1] = mod; }
        this.modules[this.moduleCount - 8][8] = (!test);
      },
      mapData: function(data, maskPattern) {
        let inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
        for (let col = this.moduleCount - 1; col > 0; col -= 2) {
          if (col == 6) col--;
          while (true) {
            for (let c = 0; c < 2; c++) {
              if (this.modules[row][col - c] == null) {
                let dark = false;
                if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) == 1);
                const mask = QRUtil.getMask(maskPattern, row, col - c);
                if (mask) dark = !dark;
                this.modules[row][col - c] = dark;
                bitIndex--;
                if (bitIndex == -1) { byteIndex++; bitIndex = 7; }
              }
            }
            row += inc;
            if (row < 0 || this.moduleCount <= row) { row -= inc; inc = -inc; break; }
          }
        }
      }
    };

    const QRUtil = {
      PATTERN_POSITION_TABLE: [[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],
      G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
      G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
      G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
      getBCHTypeInfo: function(data) { let d = data << 10; while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15))); return ((data << 10) | d) ^ QRUtil.G15_MASK; },
      getBCHTypeNumber: function(data) { let d = data << 12; while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18))); return (data << 12) | d; },
      getBCHDigit: function(data) { let digit = 0; while (data != 0) { digit++; data >>>= 1; } return digit; },
      getPatternPosition: function(typeNumber) { return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1]; },
      getMask: function(maskPattern, i, j) { switch (maskPattern) { case 0: return (i + j) % 2 == 0; case 1: return i % 2 == 0; case 2: return j % 3 == 0; case 3: return (i + j) % 3 == 0; case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0; case 5: return (i * j) % 2 + (i * j) % 3 == 0; case 6: return ((i * j) % 2 + (i * j) % 3) % 2 == 0; case 7: return ((i * j) % 3 + (i + j) % 2) % 2 == 0; default: throw new Error("bad maskPattern:" + maskPattern); } },
      getErrorCorrectPolynomial: function(errorCorrectLength) { let a = new QRPolynomial([1], 0); for (let i = 0; i < errorCorrectLength; i++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0)); return a; },
      getLengthInBits: function(mode, type) { if (1 <= type && type < 10) { switch(mode) { case 1: return 10; case 2: return 9; case 4: return 8; case 8: return 8; default: throw new Error("mode:" + mode); } } else if (type < 27) { switch(mode) { case 1: return 12; case 2: return 11; case 4: return 16; case 8: return 10; default: throw new Error("mode:" + mode); } } else if (type < 41) { switch(mode) { case 1: return 14; case 2: return 13; case 4: return 16; case 8: return 12; default: throw new Error("mode:" + mode); } } else throw new Error("type:" + type); },
      getLostPoint: function(qr) { const moduleCount = qr.getModuleCount(); let lostPoint = 0;
        for (let row = 0; row < moduleCount; row++) { for (let col = 0; col < moduleCount; col++) { let sameCount = 0, dark = qr.isDark(row, col); for (let r = -1; r <= 1; r++) { if (row + r < 0 || moduleCount <= row + r) continue; for (let c = -1; c <= 1; c++) { if (col + c < 0 || moduleCount <= col + c) continue; if (r == 0 && c == 0) continue; if (dark == qr.isDark(row + r, col + c)) sameCount++; } } if (sameCount > 5) lostPoint += (3 + sameCount - 5); } }
        for (let row = 0; row < moduleCount - 1; row++) { for (let col = 0; col < moduleCount - 1; col++) { let count = 0; if (qr.isDark(row, col)) count++; if (qr.isDark(row + 1, col)) count++; if (qr.isDark(row, col + 1)) count++; if (qr.isDark(row + 1, col + 1)) count++; if (count == 0 || count == 4) lostPoint += 3; } }
        for (let row = 0; row < moduleCount; row++) { for (let col = 0; col < moduleCount - 6; col++) { if (qr.isDark(row, col) && !qr.isDark(row, col + 1) && qr.isDark(row, col + 2) && qr.isDark(row, col + 3) && qr.isDark(row, col + 4) && !qr.isDark(row, col + 5) && qr.isDark(row, col + 6)) lostPoint += 40; } }
        for (let col = 0; col < moduleCount; col++) { for (let row = 0; row < moduleCount - 6; row++) { if (qr.isDark(row, col) && !qr.isDark(row + 1, col) && qr.isDark(row + 2, col) && qr.isDark(row + 3, col) && qr.isDark(row + 4, col) && !qr.isDark(row + 5, col) && qr.isDark(row + 6, col)) lostPoint += 40; } }
        let darkCount = 0; for (let col = 0; col < moduleCount; col++) { for (let row = 0; row < moduleCount; row++) { if (qr.isDark(row, col)) darkCount++; } } const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5; lostPoint += ratio * 10;
        return lostPoint;
      }
    };

    const QRMath = {
      glog: function(n) { if (n < 1) throw new Error("glog(" + n + ")"); return QRMath.LOG_TABLE[n]; },
      gexp: function(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return QRMath.EXP_TABLE[n]; },
      EXP_TABLE: new Array(256), LOG_TABLE: new Array(256)
    };
    for (let i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
    for (let i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    for (let i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

    function QRPolynomial(num, shift) { if (num.length == undefined) throw new Error(num.length + "/" + shift); let offset = 0; while (offset < num.length && num[offset] == 0) offset++; this.num = new Array(num.length - offset + shift); for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset]; }
    QRPolynomial.prototype = {
      get: function(index) { return this.num[index]; },
      getLength: function() { return this.num.length; },
      multiply: function(e) { const num = new Array(this.getLength() + e.getLength() - 1); for (let i = 0; i < this.getLength(); i++) for (let j = 0; j < e.getLength(); j++) num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j))); return new QRPolynomial(num, 0); },
      mod: function(e) { if (this.getLength() - e.getLength() < 0) return this; const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0)), num = new Array(this.getLength()); for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i); for (let i = 0; i < e.getLength(); i++) num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio); return new QRPolynomial(num, 0).mod(e); }
    };

    function QR8bitByte(data) { this.mode = 4; this.data = data; }
    QR8bitByte.prototype = { getLength: function() { return this.data.length; }, write: function(buffer) { for (let i = 0; i < this.data.length; i++) buffer.put(this.data.charCodeAt(i), 8); } };

    function QRBitBuffer() { this.buffer = []; this.length = 0; }
    QRBitBuffer.prototype = { get: function(index) { const bufIndex = Math.floor(index / 8); return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) == 1; }, put: function(num, length) { for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) == 1); }, getLengthInBits: function() { return this.length; }, putBit: function(bit) { const bufIndex = Math.floor(this.length / 8); if (this.buffer.length <= bufIndex) this.buffer.push(0); if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8)); this.length++; } };

    const RS_BLOCK_TABLE = [[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]];

    function QRRSBlock(totalCount, dataCount) { this.totalCount = totalCount; this.dataCount = dataCount; }
    QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectionLevel) { const rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel); const length = rsBlock.length / 3, list = []; for (let i = 0; i < length; i++) { const count = rsBlock[i * 3 + 0], totalCount = rsBlock[i * 3 + 1], dataCount = rsBlock[i * 3 + 2]; for (let j = 0; j < count; j++) list.push(new QRRSBlock(totalCount, dataCount)); } return list; };
    function getRsBlockTable(typeNumber, errorCorrectionLevel) { switch(errorCorrectionLevel) { case 1: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0]; case 0: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1]; case 3: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2]; case 2: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3]; default: return undefined; } }

    function createData(typeNumber, errorCorrectionLevel, dataList) {
      const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel), buffer = new QRBitBuffer();
      for (let i = 0; i < dataList.length; i++) { const data = dataList[i]; buffer.put(data.mode, 4); buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber)); data.write(buffer); }
      let totalDataCount = 0; for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
      if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error("code length overflow");
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
      while (buffer.getLengthInBits() % 8 != 0) buffer.putBit(false);
      while (true) { if (buffer.getLengthInBits() >= totalDataCount * 8) break; buffer.put(PAD0, 8); if (buffer.getLengthInBits() >= totalDataCount * 8) break; buffer.put(PAD1, 8); }
      return createBytes(buffer, rsBlocks);
    }

    function createBytes(buffer, rsBlocks) {
      let offset = 0, maxDcCount = 0, maxEcCount = 0; const dcdata = new Array(rsBlocks.length), ecdata = new Array(rsBlocks.length);
      for (let r = 0; r < rsBlocks.length; r++) { const dcCount = rsBlocks[r].dataCount, ecCount = rsBlocks[r].totalCount - dcCount; maxDcCount = Math.max(maxDcCount, dcCount); maxEcCount = Math.max(maxEcCount, ecCount); dcdata[r] = new Array(dcCount); for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset]; offset += dcCount; const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount), rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1), modPoly = rawPoly.mod(rsPoly); ecdata[r] = new Array(rsPoly.getLength() - 1); for (let i = 0; i < ecdata[r].length; i++) { const modIndex = i + modPoly.getLength() - ecdata[r].length; ecdata[r][i] = (modIndex >= 0)? modPoly.get(modIndex) : 0; } }
      let totalCodeCount = 0; for (let i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
      const data = new Array(totalCodeCount); let index = 0;
      for (let i = 0; i < maxDcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
      for (let i = 0; i < maxEcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
      return data;
    }

    return QR;
  })();

  function generateQRCodeSVG(text, size = 80) {
    let qr = new QRCodeGen(5, 2);
    try { qr.addData(text); qr.make(); } catch(e) {
      try { qr = new QRCodeGen(10, 2); qr.addData(text); qr.make(); } catch(e2) {
        try { qr = new QRCodeGen(20, 2); qr.addData(text); qr.make(); } catch(e3) { return ''; }
      }
    }
    const mc = qr.getModuleCount();
    const cellSize = size / mc;
    let svg = '';
    for (let row = 0; row < mc; row++) {
      for (let col = 0; col < mc; col++) {
        if (qr.isDark(row, col)) {
          const x = Math.round(col * cellSize * 100) / 100;
          const y = Math.round(row * cellSize * 100) / 100;
          const w = Math.round((col + 1) * cellSize * 100) / 100 - x;
          const h = Math.round((row + 1) * cellSize * 100) / 100 - y;
          svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000"/>`;
        }
      }
    }
    return svg;
  }

  function resolveBinding(binding, cert, isEditor = false) {
    if (!binding) return null;
    const verifyUrl = window.config ? `${window.config.getVerificationUrl()}?ID=${cert?.codigo || ''}` : `https://www.jornaltec.uptpc.edu.ve/p/validador-de-certificados.html?ID=${cert?.codigo || ''}`;

    switch (binding) {
      case 'nombre_completo': return cert?.nombre_completo || (isEditor ? 'NOMBRE Y APELLIDO PARTICIPANTE' : '');
      case 'cedula': return cert?.cedula || (isEditor ? 'V-12345678' : '');
      case 'cedula_label': return cert?.cedula ? `Cédula de Identidad: ${cert.cedula}` : (isEditor ? 'Cédula de Identidad: V-12345678' : '');
      case 'unidad_nombre': return cert?.unidad_nombre || (isEditor ? 'Unidad de Ciencia y Tecnología' : '');
      case 'motivo': return cert?.motivo || (isEditor ? 'Por su valiosa participación en el taller de formación.' : '');
      case 'ponencias': return cert?.ponencias || cert?.contenido || (isEditor ? 'Módulo 1: Desarrollo Web | Módulo 2: Certificaciones' : '');
      case 'tipo_horas': {
        const parts = [];
        if (cert?.tipo_curso) parts.push(`Tipo: ${cert.tipo_curso}`);
        if (cert?.horas) parts.push(`Horas Académicas: ${cert.horas}`);
        if (parts.length > 0) return parts.join('  |  ');
        return isEditor ? 'Tipo: Taller  |  Horas Académicas: 16' : '';
      }
      case 'tomo_folio': {
        const parts = [];
        if (cert?.tomo && String(cert.tomo).trim() !== '') parts.push(`Tomo: ${cert.tomo}`);
        if (cert?.folio && String(cert.folio).trim() !== '') parts.push(`Folio: ${cert.folio}`);
        if (parts.length > 0) return parts.join('  |  ');
        return isEditor ? 'Tomo: 01  |  Folio: 102' : '';
      }
      case 'matricula': {
        if (cert?.matricula && String(cert.matricula).trim() !== '') return `Matrícula: ${cert.matricula}`;
        return isEditor ? 'Matrícula: MAT-2026-001' : '';
      }
      case 'lugar': return cert?.lugar || (isEditor ? 'Puerto Cabello, Venezuela' : '');
      case 'codigo_label': return cert?.codigo ? `Código de Verificación: ${cert.codigo}` : (isEditor ? 'Código de Verificación: HGQ5573DTY' : '');
      case 'url_verificacion': return cert?.codigo ? verifyUrl : (isEditor ? verifyUrl : '');
      case 'qr_url': return cert?.codigo ? verifyUrl : (isEditor ? verifyUrl : '');
      case 'logo_url': return cert?.logo_url || '';
      case 'logo_universidad': return cert?.logo_universidad || (window.config ? window.config.getDefaultLogoSvg() : 'https://tuyatgbswyaaetytathd.supabase.co/storage/v1/object/public/logos/UPTPC_LOGO.png');
      case 'curso_nombre': return cert?.nombre_curso || (isEditor ? 'NOMBRE CURSO / TALLER FORMATIVO' : '');
      case 'fecha_curso': return cert?.fecha_curso ? (window.utils ? window.utils.formatDateExtended(cert.fecha_curso) : cert.fecha_curso) : (isEditor ? '20 DE MAYO DE 2026' : '');
      case 'se_certifica': return 'Se certifica que:';

      // Firmante 1
      case 'firma1_nombre': return cert?.firma1_nombre || (isEditor ? 'Msc. Carlos Rodríguez' : '');
      case 'firma1_cargo': return cert?.firma1_cargo || (isEditor ? 'Rector de la UPTPC' : '');
      case 'firma1_url': return cert?.firma1_url || cert?.firma1_firma || '';
      case 'sello1_url': return cert?.sello1_url || cert?.firma1_sello || '';

      // Firmante 2
      case 'firma2_nombre': return cert?.firma2_nombre || (isEditor ? 'Dra. Elena Mendoza' : '');
      case 'firma2_cargo': return cert?.firma2_cargo || (isEditor ? 'Directora de Ciencia y Tecnología' : '');
      case 'firma2_url': return cert?.firma2_url || cert?.firma2_firma || '';
      case 'sello2_url': return cert?.sello2_url || cert?.firma2_sello || '';

      // Firmante 3
      case 'firma3_nombre': return cert?.firma3_nombre || (isEditor ? 'Lcdo. Roberto Gómez' : '');
      case 'firma3_cargo': return cert?.firma3_cargo || (isEditor ? 'Secretario General UPTPC' : '');
      case 'firma3_url': return cert?.firma3_url || cert?.firma3_firma || '';
      case 'sello3_url': return cert?.sello3_url || cert?.firma3_sello || '';

      default: return cert?.[binding] || (isEditor ? `[${binding}]` : '');
    }
  }

  function renderCertificateSVG(disenoConfig, certData, isEditor = false) {
    if (!disenoConfig || !disenoConfig.elementos) {
      return renderFallbackSVG(certData);
    }

    const svgWidth = disenoConfig.ancho || 1123;
    const svgHeight = disenoConfig.alto || 794;
    const fondo = disenoConfig.fondo || {};
    const marco = disenoConfig.marco || {};
    const elementos = disenoConfig.elementos || [];

    let defsContent = '';
    let bodyContent = '';

    if (fondo.gradiente) {
      const g = fondo.gradiente;
      defsContent += `<linearGradient id="bgGrad" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">
        <stop offset="0%" style="stop-color:${g.startColor};stop-opacity:${g.startOpacity}" />
        <stop offset="100%" style="stop-color:${g.endColor};stop-opacity:${g.endOpacity}" />
      </linearGradient>`;
    }

    bodyContent += `<rect width="${svgWidth}" height="${svgHeight}" fill="${fondo.color || '#FFFFFF'}"/>`;

    if (marco.exterior) {
      const e = marco.exterior;
      bodyContent += `<rect x="${e.x}" y="${e.y}" width="${e.ancho}" height="${e.alto}" rx="${e.rx || 0}" ry="${e.ry || e.rx || 0}" fill="none" stroke="${e.stroke}" stroke-width="${e.strokeWidth}"/>`;
    }

    if (marco.interior) {
      const i = marco.interior;
      const dashAttr = i.strokeDasharray ? ` stroke-dasharray="${i.strokeDasharray}"` : '';
      bodyContent += `<rect x="${i.x}" y="${i.y}" width="${i.ancho}" height="${i.alto}" rx="${i.rx || 0}" ry="${i.ry || i.rx || 0}" fill="none" stroke="${i.stroke}" stroke-width="${i.strokeWidth}"${dashAttr}/>`;
    }

    if (marco.esquinas) {
      marco.esquinas.forEach(esq => {
        bodyContent += `<path d="${esq.path}" fill="none" stroke="${esq.stroke}" stroke-width="${esq.strokeWidth}" opacity="${esq.opacity || 1}"/>`;
      });
    }

    if (fondo.gradiente && marco.interior) {
      const i = marco.interior;
      bodyContent += `<rect x="${i.x + 2}" y="${i.y + 2}" width="${i.ancho - 4}" height="${i.alto - 4}" rx="${Math.max(0, (i.rx || 0) - 1)}" ry="${Math.max(0, (i.ry || i.rx || 0) - 1)}" fill="url(#bgGrad)"/>`;
    }

    elementos.forEach((el, index) => {
      const estilo = el.estilo || {};

      switch (el.tipo) {
        case 'texto':
        case 'texto_multilinea': {
          let textoVal = el.binding ? resolveBinding(el.binding, certData, isEditor) : null;
          if (!textoVal && el.texto_fijo) textoVal = el.texto_fijo;
          if (!textoVal && isEditor) textoVal = `[Variable: ${el.binding || el.id}]`;
          if (!textoVal) break;

          const ta = estilo.textAnchor || (estilo.textAlign === 'center' ? 'middle' : estilo.textAlign === 'right' ? 'end' : 'start');
          const ff = estilo.fontFamily || 'Arial, sans-serif';
          const fs = estilo.fontSize || 16;
          const fw = estilo.fontWeight || 'normal';
          const fst = estilo.fontStyle || 'normal';
          const fill = estilo.fill || estilo.color || '#000000';
          const ls = estilo.letterSpacing || 0;
          const op = estilo.opacity !== undefined ? estilo.opacity : 1;
          const anchoMax = el.ancho || 400;

          let xPos = el.x;
          if (ta === 'middle') xPos = el.x + anchoMax / 2;
          else if (ta === 'end') xPos = el.x + anchoMax;

          const lineas = el.tipo === 'texto_multilinea' ? wrapText(textoVal, anchoMax, fs) : [textoVal];
          const lineHeight = fs * 1.3;

          const escapeFn = window.utils ? window.utils.escapeHtml : (t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));

          bodyContent += `<g data-elem-id="${el.id}" data-elem-index="${index}">`;
          bodyContent += `<text text-anchor="${ta}" font-family="${ff}" font-size="${fs}px" font-weight="${fw}" font-style="${fst}" fill="${fill}" opacity="${op}" letter-spacing="${ls}">`;
          lineas.forEach((linea, lineIdx) => {
            bodyContent += `<tspan x="${xPos}" y="${el.y + fs + lineIdx * lineHeight}">${escapeFn(linea)}</tspan>`;
          });
          bodyContent += `</text>`;
          bodyContent += `</g>`;
          break;
        }

        case 'imagen': {
          let href = el.binding ? resolveBinding(el.binding, certData, isEditor) : null;
          if (!href && el.texto_fijo) href = el.texto_fijo;

          bodyContent += `<g data-elem-id="${el.id}" data-elem-index="${index}">`;
          if (href) {
            const preserve = estilo.preserveAspectRatio || 'xMidYMid meet';
            const op = estilo.opacity !== undefined ? estilo.opacity : 1;
            bodyContent += `<image href="${href}" x="${el.x}" y="${el.y}" width="${el.ancho}" height="${el.alto}" preserveAspectRatio="${preserve}" opacity="${op}" onerror="this.style.display='none'"/>`;
          }

          // Si es en modo editor y la imagen no tiene fuente cargada, renderizamos caja indicadora visual para edición
          if (isEditor && !href) {
            const labelText = el.binding ? `[${el.binding}]` : (el.id || 'Imagen');
            const boxColor = el.binding ? '#1565C0' : '#424242';
            bodyContent += `
              <rect x="${el.x}" y="${el.y}" width="${el.ancho}" height="${el.alto}" fill="rgba(21, 101, 192, 0.08)" stroke="${boxColor}" stroke-width="1.5" stroke-dasharray="4,4" rx="4"/>
              <text x="${el.x + el.ancho / 2}" y="${el.y + el.alto / 2 + 4}" text-anchor="middle" font-size="12px" font-family="Arial" font-weight="bold" fill="${boxColor}">${labelText}</text>
            `;
          }
          bodyContent += `</g>`;
          break;
        }

        case 'linea': {
          const stroke = estilo.stroke || '#000000';
          const sw = estilo.strokeWidth || 1;
          const op = estilo.opacity !== undefined ? estilo.opacity : 1;
          const dash = estilo.strokeDasharray ? ` stroke-dasharray="${estilo.strokeDasharray}"` : '';
          bodyContent += `<g data-elem-id="${el.id}" data-elem-index="${index}">
            <line x1="${el.x}" y1="${el.y}" x2="${el.x + el.ancho}" y2="${el.y + el.alto}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"${dash}/>
          </g>`;
          break;
        }

        case 'qr': {
          let qrUrl = el.binding ? resolveBinding(el.binding, certData) : null;
          if (!qrUrl && el.texto_fijo) qrUrl = el.texto_fijo;

          bodyContent += `<g data-elem-id="${el.id}" data-elem-index="${index}">`;
          const qrSize = el.ancho || 80;
          if (qrUrl) {
            const qrSVG = generateQRCodeSVG(qrUrl, qrSize);
            bodyContent += `<g transform="translate(${el.x}, ${el.y})"><rect width="${qrSize}" height="${el.alto || qrSize}" fill="white"/>${qrSVG}</g>`;
          }
          if (isEditor || !qrUrl) {
            bodyContent += `
              <rect x="${el.x}" y="${el.y}" width="${qrSize}" height="${el.alto || qrSize}" fill="rgba(0,0,0,0.05)" stroke="#000" stroke-width="1" stroke-dasharray="2,2"/>
              <text x="${el.x + qrSize / 2}" y="${el.y + (el.alto || qrSize) / 2 + 4}" text-anchor="middle" font-size="11px" font-family="Arial" fill="#333">[Código QR]</text>
            `;
          }
          bodyContent += `</g>`;
          break;
        }

        case 'rectangulo': {
          const fill = estilo.fill || 'none';
          const stroke = estilo.stroke || '#000000';
          const sw = estilo.strokeWidth || 2;
          const op = estilo.opacity !== undefined ? estilo.opacity : 1;
          const rx = estilo.rx ? ` rx="${estilo.rx}"` : '';
          const ry = estilo.ry ? ` ry="${estilo.ry}"` : '';
          bodyContent += `<g data-elem-id="${el.id}" data-elem-index="${index}">
            <rect x="${el.x}" y="${el.y}" width="${el.ancho}" height="${el.alto}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"${rx}${ry}/>
          </g>`;
          break;
        }
      }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" id="certificadoSVG" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" style="display:block;max-width:100%;height:auto;">
      <defs>${defsContent}</defs>
      ${bodyContent}
    </svg>`;
  }

  function wrapText(text, maxWidth, fontSize) {
    if (!text) return [];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    const maxCharsPerLine = Math.floor(maxWidth / (fontSize * 0.55));

    words.forEach(word => {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  function renderFallbackSVG(cert) {
    const qrUrl = window.config ? `${window.config.getVerificationUrl()}?ID=${cert?.codigo || ''}` : `https://www.jornaltec.uptpc.edu.ve/p/validador-de-certificados.html?ID=${cert?.codigo || ''}`;
    const qrSVG = generateQRCodeSVG(qrUrl, 80);
    const mainColor = '#0f3460';
    const secColor = '#0D47A1';
    const escapeFn = window.utils ? window.utils.escapeHtml : (t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));

    return `<svg xmlns="http://www.w3.org/2000/svg" id="certificadoSVG" viewBox="0 0 1123 794" width="1123" height="794" style="display:block;max-width:100%;height:auto;">
      <defs>
        <style>
          .text { font-family: Arial, sans-serif; fill: #000000; text-anchor: middle; }
          .title { font-size: 28px; font-weight: bold; fill: ${mainColor}; }
          .subtitle { font-size: 18px; fill: #333; }
          .paragraph { font-size: 16px; }
          .name { font-size: 26px; font-weight: bold; fill: ${mainColor}; }
          .small { font-size: 12px; fill: #555; }
          .web { font-size: 11px; fill: #777; }
        </style>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${mainColor};stop-opacity:0.05" />
          <stop offset="100%" style="stop-color:${secColor};stop-opacity:0.08" />
        </linearGradient>
      </defs>
      <rect width="1123" height="794" fill="#FFFFFF"/>
      <rect x="20" y="20" width="1083" height="754" rx="8" fill="none" stroke="${mainColor}" stroke-width="3"/>
      <rect x="28" y="28" width="1067" height="738" rx="6" fill="none" stroke="${mainColor}" stroke-width="1" stroke-dasharray="5,5"/>
      <rect x="30" y="30" width="1063" height="734" rx="5" fill="url(#bgGrad)"/>
      <path d="M 30 120 L 30 30 L 120 30" fill="none" stroke="${mainColor}" stroke-width="5" opacity="0.6"/>
      <path d="M 1093 674 L 1093 764 L 1003 764" fill="none" stroke="${mainColor}" stroke-width="5" opacity="0.6"/>

      <image href="https://tuyatgbswyaaetytathd.supabase.co/storage/v1/object/public/logos/UPTPC_LOGO.png" x="60" y="50" width="100" height="100" preserveAspectRatio="xMidYMid meet" onerror="this.style.display='none'"/>
      ${cert?.logo_url ? `<image href="${cert.logo_url}" x="963" y="50" width="100" height="100" preserveAspectRatio="xMidYMid meet" onerror="this.style.display='none'"/>` : ''}

      <text x="561" y="60" class="text title" font-size="22">REPÚBLICA BOLIVARIANA DE VENEZUELA</text>
      <text x="561" y="85" class="text subtitle" font-size="16">UNIVERSIDAD POLITÉCNICA TERRITORIAL DE PUERTO CABELLO</text>
      <text x="561" y="110" class="text subtitle" font-size="14" fill="${secColor}">${escapeFn(cert?.unidad_nombre || 'Unidad de Ciencia y Tecnología')}</text>
      <line x1="200" y1="130" x2="923" y2="130" stroke="${mainColor}" stroke-width="2" opacity="0.5"/>
      <text x="561" y="170" class="text title" font-size="32" letter-spacing="8">CERTIFICADO</text>
      <text x="561" y="220" class="text paragraph" font-size="16">Se certifica que:</text>
      <text x="561" y="260" class="text name">${escapeFn(cert?.nombre_completo || '')}</text>
      <text x="561" y="290" class="text paragraph" font-size="15">Cédula de Identidad: ${escapeFn(cert?.cedula || '')}</text>
      <text x="561" y="340" class="text paragraph" font-size="14">${escapeFn(cert?.motivo || '')}</text>
      <text x="561" y="420" class="text small" font-size="12">${escapeFn(cert?.ponencias || cert?.contenido || '')}</text>
      <text x="561" y="540" class="text small" font-size="13">Tipo: ${escapeFn(cert?.tipo_curso || 'Taller')} | Horas Académicas: ${cert?.horas || 0}</text>
      ${cert?.tomo ? `<text x="561" y="570" class="text small" font-size="13">Tomo: ${escapeFn(cert.tomo)} ${cert?.folio ? ' | Folio: ' + escapeFn(cert.folio) : ''}</text>` : ''}
      <text x="561" y="600" class="text paragraph" font-size="14">${escapeFn(cert?.lugar || 'Puerto Cabello, Venezuela')}</text>
      <text x="561" y="640" class="text small" font-size="12">Código de Verificación: ${escapeFn(cert?.codigo || '')}</text>
      <g transform="translate(930, 620)">${qrSVG}</g>
      <text x="561" y="680" class="text web">Verifique la autenticidad en: ${escapeFn(qrUrl)}</text>
      <line x1="420" y1="720" x2="700" y2="720" stroke="#333" stroke-width="1"/>
      <text x="561" y="740" class="text small" font-size="12">Rector de la UPTPC</text>
    </svg>`;
  }

  window.certRenderer = {
    generateQRCodeSVG,
    resolveBinding,
    renderCertificateSVG,
    renderFallbackSVG
  };
})();
