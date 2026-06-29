/**
 * ============================================================
 *  A-MATH COMPETITION SYSTEM — Math Week 2026
 *  โรงเรียนพูลเจริญวิทยาคม
 *  กติกา: สมาคมครอสเวิร์ด เอแม็ท คำคม และซูโดกุแห่งประเทศไทย
 * ============================================================
 *  โครงสร้าง Google Sheet:
 *  - AM_Players:  A=รหัส, B=ชื่อทีม/บุคคล, C=ระดับ(มต้น/มปลาย),
 *                 D=โรงเรียน/สถาบัน, E=สมาชิกที่2 (ทีมเท่านั้น)
 *  - AM_Pairings: A=เกมที่, B=ระดับ, C=คู่ที่, D=รหัสA, E=รหัสB ('BYE'=ไม่มีคู่)
 *  - AM_Games:    A=เกมที่, B=ระดับ, C=คู่ที่, D=รหัสA, E=คะแนนดิบA,
 *                 F=รหัสB, G=คะแนนดิบB, H=timestamp
 *  - AM_Settings: A=key, B=value
 * ============================================================
 *  กติกาคะแนน (เอแม็ท):
 *  - W=2 แต้ม, T=1 แต้ม, L=0 แต้ม
 *  - ผลต่างต่อเกม = clamp(คะแนนA - คะแนนB, ±250) ยกเว้นเกมสุดท้าย ±200
 *  - ชนะ BYE = W อัตโนมัติ, ผลต่าง = +100
 *  - เรียงอันดับ: แต้มสะสม → ผลต่างสะสม(cap) → คะแนนดิบรวม(ก่อน cap)
 *  - เกณฑ์เกียรติบัตร: ร้อยละ 60 แรก (ปัดขึ้น)
 * ============================================================
 *  ประเภทผู้แข่งขัน:
 *  - มต้น: ทีม 2 คน
 *  - มปลาย: เดี่ยว 1 คน
 * ============================================================
 */

// ──────────────── Constants ────────────────
const AM_MAX_DIFF        = 250;
const AM_MAX_DIFF_FINAL  = 200;
const AM_BYE_DIFF        = 100;
const AM_WIN_PT          = 2;
const AM_TIE_PT          = 1;
const AM_LOSS_PT         = 0;
const AM_DEFAULT_GAMES   = 3;
const AM_CERT_PERCENT    = 0.60;

// ──────────────── Utility ────────────────

function amNormalizeLevel(level) {
  let s = String(level == null ? '' : level);
  if (typeof s.normalize === 'function') s = s.normalize('NFC');
  s = s.replace(/\s+/g, '').trim();
  return s;
}

function amGetSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

let _amCache = {};

function amReadSheet(name, numCols) {
  if (_amCache[name]) return _amCache[name];
  const sh = amGetSS().getSheetByName(name);
  if (!sh) return [];
  const last = sh.getLastRow();
  const data = last < 2 ? [] : sh.getRange(2, 1, last - 1, numCols).getValues();
  _amCache[name] = data;
  return data;
}

function amInvalidateCache(name) { delete _amCache[name]; }

// ──────────────── Routing ────────────────

function doGet(e) {
  const page = (e.parameter && e.parameter.page) ? e.parameter.page : 'admin';
  if (page === 'scoring') return HtmlService.createHtmlOutputFromFile('am_scoring').setTitle('A-Math กรอกผล');
  if (page === 'display') return HtmlService.createHtmlOutputFromFile('am_display').setTitle('A-Math ตารางอันดับ');
  if (page === 'state') {
    const level = amNormalizeLevel((e.parameter && e.parameter.level) || 'มต้น');
    return amJsonOut(amGetFullState(level));
  }
  return HtmlService.createHtmlOutputFromFile('am_admin').setTitle('A-Math Admin');
}

function amJsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ──────────────── Sheet Setup ────────────────

function amSetupSheets() {
  const ss = amGetSS();

  function ensure(name, headers) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }

  ensure('AM_Players', [
    'รหัส', 'ชื่อทีม/บุคคล', 'ระดับ (มต้น/มปลาย)', 'โรงเรียน/สถาบัน', 'สมาชิกที่ 2 (ทีม ม.ต้น เท่านั้น)'
  ]);
  ensure('AM_Pairings', [
    'เกมที่', 'ระดับ', 'คู่ที่', 'รหัสA', 'รหัสB (BYE=ไม่มีคู่)'
  ]);
  ensure('AM_Games', [
    'เกมที่', 'ระดับ', 'คู่ที่', 'รหัสA', 'คะแนนดิบA', 'รหัสB', 'คะแนนดิบB', 'timestamp'
  ]);

  let settingsSh = ss.getSheetByName('AM_Settings');
  if (!settingsSh) {
    settingsSh = ss.insertSheet('AM_Settings');
    settingsSh.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
    settingsSh.setFrozenRows(1);
    settingsSh.appendRow(['totalGames', AM_DEFAULT_GAMES]);
  }

  return 'ตั้งค่าชีทสำเร็จ';
}

// ──────────────── Settings ────────────────

function amGetTotalGames() {
  const sh = amGetSS().getSheetByName('AM_Settings');
  if (!sh) return AM_DEFAULT_GAMES;
  const last = sh.getLastRow();
  if (last < 2) return AM_DEFAULT_GAMES;
  const data = sh.getRange(2, 1, last - 1, 2).getValues();
  const row = data.find(r => String(r[0]).trim() === 'totalGames');
  return row ? (Number(row[1]) || AM_DEFAULT_GAMES) : AM_DEFAULT_GAMES;
}

function amSetTotalGames(n) {
  const sh = amGetSS().getSheetByName('AM_Settings');
  if (!sh) { amSetupSheets(); return amSetTotalGames(n); }
  const last = sh.getLastRow();
  if (last >= 2) {
    const data = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === 'totalGames') {
        sh.getRange(i + 2, 2).setValue(n);
        return { totalGames: n };
      }
    }
  }
  sh.appendRow(['totalGames', n]);
  return { totalGames: n };
}

function amAddGame() {
  const next = amGetTotalGames() + 1;
  return amSetTotalGames(next);
}

// ──────────────── Players ────────────────

function amGetPlayers(level) {
  const normLevel = amNormalizeLevel(level);
  const data = amReadSheet('AM_Players', 5);
  return data
    .filter(r => String(r[0] || '').trim() && amNormalizeLevel(r[2]) === normLevel)
    .map(r => ({
      id:      String(r[0]).trim(),
      name:    String(r[1] || '').trim() || ('ทีมรหัส ' + String(r[0]).trim()),
      level:   String(r[2]).trim(),
      school:  String(r[3] || '').trim(),
      member2: String(r[4] || '').trim()
    }));
}

// ──────────────── Pairings ────────────────

function amGetPairings(level, gameNum) {
  const normLevel = amNormalizeLevel(level);
  const data = amReadSheet('AM_Pairings', 5);
  return data
    .filter(r => Number(r[0]) === Number(gameNum) && amNormalizeLevel(r[1]) === normLevel)
    .map(r => ({
      gameNum: Number(r[0]),
      pairNum: Number(r[2]),
      idA: String(r[3]).trim(),
      idB: String(r[4]).trim()
    }));
}

function amSavePairingsToSheet(level, gameNum, pairings) {
  const normLevel = amNormalizeLevel(level);
  const sh = amGetSS().getSheetByName('AM_Pairings');
  if (!sh) throw new Error('ไม่พบชีท AM_Pairings — กรุณากด "ตั้งค่าระบบ" ก่อน');

  const last = sh.getLastRow();
  if (last >= 2) {
    const data = sh.getRange(2, 1, last - 1, 2).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (Number(data[i][0]) === Number(gameNum) && amNormalizeLevel(data[i][1]) === normLevel) {
        sh.deleteRow(i + 2);
      }
    }
  }
  pairings.forEach(p => sh.appendRow([gameNum, level, p.pairNum, p.idA, p.idB]));
  amInvalidateCache('AM_Pairings');
}

function amBuildDisplayPairings(pairings, playerMap) {
  return pairings.map(p => ({
    pairNum:  p.pairNum,
    idA:      p.idA,
    nameA:    (playerMap[p.idA] || {}).name    || p.idA,
    schoolA:  (playerMap[p.idA] || {}).school  || '',
    member2A: (playerMap[p.idA] || {}).member2 || '',
    idB:      p.idB,
    nameB:    p.idB === 'BYE' ? 'BYE' : ((playerMap[p.idB] || {}).name    || p.idB),
    schoolB:  p.idB === 'BYE' ? ''    : ((playerMap[p.idB] || {}).school  || ''),
    member2B: p.idB === 'BYE' ? ''    : ((playerMap[p.idB] || {}).member2 || ''),
    isBye:    p.idB === 'BYE'
  }));
}

/** เกม 1: สุ่มจับคู่ */
function amGenerateGame1(level) {
  const players = amGetPlayers(level);
  if (players.length < 2) throw new Error('ผู้เข้าแข่งขันไม่เพียงพอ (ต้องการอย่างน้อย 2 ทีม/คน)');

  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const pairings = [];
  let pairNum = 1;

  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    pairings.push({ pairNum: pairNum++, idA: shuffled[i].id, idB: shuffled[i + 1].id });
  }
  if (shuffled.length % 2 === 1) {
    pairings.push({ pairNum: pairNum++, idA: shuffled[shuffled.length - 1].id, idB: 'BYE' });
  }

  amSavePairingsToSheet(level, 1, pairings);
  _amAutoSaveBye(level, 1, pairings);

  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });
  return amBuildDisplayPairings(pairings, playerMap);
}

/** เกม 2+: King of the Hill (จับคู่ตามอันดับปัจจุบัน: อันดับ1 vs 2, 3 vs 4, ...) */
function amGenerateKingOfHill(level, gameNum) {
  if (Number(gameNum) < 2) throw new Error('King of the Hill ใช้ตั้งแต่เกม 2 เป็นต้นไป');

  const standings = amComputeStandings(level);
  if (standings.length < 2) throw new Error('ยังไม่มีข้อมูลผลการแข่งขัน หรือผู้เข้าแข่งขันน้อยเกินไป');

  const pairings = [];
  let pairNum = 1;

  for (let i = 0; i + 1 < standings.length; i += 2) {
    pairings.push({ pairNum: pairNum++, idA: standings[i].id, idB: standings[i + 1].id });
  }
  if (standings.length % 2 === 1) {
    pairings.push({ pairNum: pairNum++, idA: standings[standings.length - 1].id, idB: 'BYE' });
  }

  amSavePairingsToSheet(level, gameNum, pairings);
  _amAutoSaveBye(level, gameNum, pairings);

  const players = amGetPlayers(level);
  const playerMap = {};
  players.forEach(p => { playerMap[p.id] = p; });
  return amBuildDisplayPairings(pairings, playerMap);
}

function _amAutoSaveBye(level, gameNum, pairings) {
  const byePair = pairings.find(p => p.idB === 'BYE');
  if (!byePair) return;
  _amDeleteResult(level, gameNum, byePair.pairNum);
  const sh = amGetSS().getSheetByName('AM_Games');
  if (!sh) return;
  sh.appendRow([Number(gameNum), level, byePair.pairNum, byePair.idA, AM_BYE_DIFF, 'BYE', 0, new Date()]);
  amInvalidateCache('AM_Games');
}

// ──────────────── Results ────────────────

function amGetResults(level) {
  const normLevel = amNormalizeLevel(level);
  const data = amReadSheet('AM_Games', 8);
  return data
    .filter(r => String(r[0]).trim() && amNormalizeLevel(r[1]) === normLevel)
    .map(r => ({
      gameNum: Number(r[0]),
      pairNum: Number(r[2]),
      idA:     String(r[3]).trim(),
      scoreA:  Number(r[4]),
      idB:     String(r[5]).trim(),
      scoreB:  Number(r[6]),
      isBye:   String(r[5]).trim() === 'BYE'
    }));
}

function amSaveResult(level, gameNum, pairNum, idA, scoreA, idB, scoreB) {
  const pairings = amGetPairings(level, gameNum);
  const pair = pairings.find(p => p.pairNum === Number(pairNum));
  if (!pair) throw new Error('ไม่พบคู่ที่ ' + pairNum + ' ในเกม ' + gameNum + ' — ตรวจสอบว่าจัดคู่แล้วหรือยัง');
  if (pair.idB === 'BYE') throw new Error('คู่นี้เป็น BYE — ระบบบันทึกให้อัตโนมัติแล้ว ไม่ต้องกรอก');

  _amDeleteResult(level, gameNum, pairNum);
  const sh = amGetSS().getSheetByName('AM_Games');
  if (!sh) throw new Error('ไม่พบชีท AM_Games');
  sh.appendRow([Number(gameNum), level, Number(pairNum), String(idA), Number(scoreA), String(idB), Number(scoreB), new Date()]);
  amInvalidateCache('AM_Games');
  return 'ok';
}

function _amDeleteResult(level, gameNum, pairNum) {
  const normLevel = amNormalizeLevel(level);
  const sh = amGetSS().getSheetByName('AM_Games');
  if (!sh) return;
  const last = sh.getLastRow();
  if (last < 2) return;
  const data = sh.getRange(2, 1, last - 1, 3).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (Number(data[i][0]) === Number(gameNum) &&
        amNormalizeLevel(data[i][1]) === normLevel &&
        Number(data[i][2]) === Number(pairNum)) {
      sh.deleteRow(i + 2);
      amInvalidateCache('AM_Games');
    }
  }
}

// ──────────────── Standings ────────────────

/**
 * คำนวณอันดับผู้แข่งขัน
 * Tiebreaker: 1) แต้มสะสม  2) ผลต่างสะสม(capped)  3) คะแนนดิบรวม(ก่อน cap)
 */
function amComputeStandings(level) {
  const totalGames = amGetTotalGames();
  const results    = amGetResults(level);
  const players    = amGetPlayers(level);

  const acc = {};
  players.forEach(p => {
    acc[p.id] = {
      id: p.id, name: p.name, school: p.school, member2: p.member2 || '',
      points: 0, diffSum: 0, rawScoreSum: 0,
      wins: 0, ties: 0, losses: 0, gamesPlayed: 0
    };
  });

  results.forEach(r => {
    const cap = (r.gameNum === totalGames) ? AM_MAX_DIFF_FINAL : AM_MAX_DIFF;

    if (r.isBye) {
      if (acc[r.idA]) {
        acc[r.idA].points      += AM_WIN_PT;
        acc[r.idA].diffSum     += AM_BYE_DIFF;
        acc[r.idA].wins        += 1;
        acc[r.idA].gamesPlayed += 1;
      }
    } else {
      const rawDiff = r.scoreA - r.scoreB;
      const diff    = Math.max(-cap, Math.min(cap, rawDiff));

      if (acc[r.idA]) {
        acc[r.idA].points      += rawDiff > 0 ? AM_WIN_PT : rawDiff < 0 ? AM_LOSS_PT : AM_TIE_PT;
        acc[r.idA].diffSum     += diff;
        acc[r.idA].rawScoreSum += r.scoreA;
        if (rawDiff > 0)      acc[r.idA].wins   += 1;
        else if (rawDiff < 0) acc[r.idA].losses += 1;
        else                  acc[r.idA].ties   += 1;
        acc[r.idA].gamesPlayed += 1;
      }

      if (acc[r.idB]) {
        acc[r.idB].points      += rawDiff < 0 ? AM_WIN_PT : rawDiff > 0 ? AM_LOSS_PT : AM_TIE_PT;
        acc[r.idB].diffSum     -= diff;
        acc[r.idB].rawScoreSum += r.scoreB;
        if (rawDiff < 0)      acc[r.idB].wins   += 1;
        else if (rawDiff > 0) acc[r.idB].losses += 1;
        else                  acc[r.idB].ties   += 1;
        acc[r.idB].gamesPlayed += 1;
      }
    }
  });

  const sorted = Object.values(acc).sort((a, b) => {
    if (b.points      !== a.points)      return b.points      - a.points;
    if (b.diffSum     !== a.diffSum)     return b.diffSum     - a.diffSum;
    if (b.rawScoreSum !== a.rawScoreSum) return b.rawScoreSum - a.rawScoreSum;
    return 0;
  });

  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const p = sorted[i - 1], c = sorted[i];
      if (c.points !== p.points || c.diffSum !== p.diffSum || c.rawScoreSum !== p.rawScoreSum) {
        rank = i + 1;
      }
    }
    sorted[i].rank = rank;
  }

  return sorted;
}

// ──────────────── Awards ────────────────

function amGetAwardsSummary(level) {
  const standings   = amComputeStandings(level);
  const totalPlayed = standings.filter(s => s.gamesPlayed > 0).length;
  if (totalPlayed === 0) return null;

  const cutoffCount = Math.ceil(totalPlayed * AM_CERT_PERCENT);

  return {
    totalPlayed,
    cutoffCount,
    standings: standings.map((s, i) => ({ ...s, hasCertificate: i < cutoffCount }))
  };
}

// ──────────────── Pair Lookup ────────────────

function amLookupPair(level, gameNum, pairNum) {
  const pairings = amGetPairings(level, gameNum);
  const pair = pairings.find(p => p.pairNum === Number(pairNum));
  if (!pair) return { found: false, message: 'ไม่พบคู่ที่ ' + pairNum + ' ในเกม ' + gameNum };

  const players = amGetPlayers(level);
  const pm = {};
  players.forEach(p => { pm[p.id] = p; });

  const pA = pm[pair.idA] || { name: pair.idA, school: '', member2: '' };
  const isBye = pair.idB === 'BYE';
  const pB = isBye ? null : (pm[pair.idB] || { name: pair.idB, school: '', member2: '' });

  return {
    found: true,
    idA: pair.idA, nameA: pA.name, schoolA: pA.school, member2A: pA.member2 || '',
    idB: pair.idB,
    nameB:   isBye ? 'BYE' : pB.name,
    schoolB: isBye ? ''    : pB.school,
    member2B: isBye ? ''   : (pB.member2 || ''),
    isBye
  };
}

function amGetLatestGame(level) {
  const normLevel = amNormalizeLevel(level);
  const data = amReadSheet('AM_Pairings', 2);
  const nums = data
    .filter(r => amNormalizeLevel(r[1]) === normLevel && Number(r[0]) > 0)
    .map(r => Number(r[0]));
  return nums.length > 0 ? Math.max(...nums) : 0;
}

// ──────────────── Full State (display page) ────────────────

function amGetFullState(level) {
  const standings  = amComputeStandings(level);
  const totalGames = amGetTotalGames();
  const latestGame = amGetLatestGame(level);
  const players    = amGetPlayers(level);
  const playerMap  = {};
  players.forEach(p => { playerMap[p.id] = p; });

  let currentPairings = [];
  if (latestGame > 0) {
    const pairs = amGetPairings(level, latestGame);
    currentPairings = amBuildDisplayPairings(pairs, playerMap);
  }

  return {
    standings,
    totalGames,
    latestGame,
    currentPairings,
    capCurrent: (latestGame === totalGames) ? AM_MAX_DIFF_FINAL : AM_MAX_DIFF
  };
}