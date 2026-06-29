// ============================================================
//  A-Math — กติกาและการคำนวณ (พอร์ตจาก Google Apps Script เดิม code.gs)
// ============================================================

export const AM_LEVELS = ['มต้น', 'มปลาย'] as const
export type Level = (typeof AM_LEVELS)[number]

// ค่าคงที่กติกา (ตรงกับ code.gs)
export const AM_MAX_DIFF = 250        // ผลต่างสูงสุดต่อเกม (cap)
export const AM_MAX_DIFF_FINAL = 200  // ผลต่างสูงสุดเกมสุดท้าย
export const AM_BYE_DIFF = 100        // ผลต่างเมื่อได้ BYE
export const AM_WIN_PT = 2
export const AM_TIE_PT = 1
export const AM_LOSS_PT = 0
export const AM_DEFAULT_GAMES = 3
export const AM_CERT_PERCENT = 0.6    // เกียรติบัตร 60% แรก

// ──────────────── Types ────────────────

export interface Player {
  id: number
  code: string
  name: string
  level: string
  school: string
  member2: string
}

export interface GameRow {
  game: number
  level: string
  pair_num: number
  player_a_id: number
  score_a: number | null
  player_b_id: number | null
  score_b: number | null
  is_bye: boolean
}

export interface Standing {
  player: Player
  rank: number
  points: number
  diffSum: number       // ผลต่างสะสม (หลัง cap)
  rawScoreSum: number   // คะแนนดิบรวม (ก่อน cap) — ใช้เป็น tiebreaker สุดท้าย
  wins: number
  ties: number
  losses: number
  gamesPlayed: number
}

export interface PairResult {
  pair_num: number
  player_a: Player
  player_b: Player | null  // null = BYE
  is_bye: boolean
}

// ──────────────── ผลแมตช์เดี่ยว ────────────────
// เทียบ code.gs:355-356 — clamp ผลต่างตาม cap
export function computeMatchResult(scoreA: number, scoreB: number, cap = AM_MAX_DIFF) {
  const rawDiff = scoreA - scoreB
  const diff = Math.max(-cap, Math.min(cap, rawDiff))
  const resultA = rawDiff > 0 ? 'W' : rawDiff < 0 ? 'L' : 'T'
  const resultB = rawDiff > 0 ? 'L' : rawDiff < 0 ? 'W' : 'T'
  return { rawDiff, diff, resultA, resultB }
}

// ──────────────── สุ่ม array ────────────────
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ──────────────── จับคู่ตามลำดับที่ส่งเข้ามา ────────────────
// 1 vs 2, 3 vs 4, ... ถ้าจำนวนคี่ คนสุดท้ายได้ BYE
// ใช้ทั้งเกม 1 (ส่ง array ที่ shuffle แล้ว) และเกม 2+ (ส่งตามอันดับ = King of the Hill)
export function pairInOrder(orderedPlayers: Player[]): { pair_num: number; idA: number; idB: number | null }[] {
  const pairings: { pair_num: number; idA: number; idB: number | null }[] = []
  let pairNum = 1
  for (let i = 0; i + 1 < orderedPlayers.length; i += 2) {
    pairings.push({ pair_num: pairNum++, idA: orderedPlayers[i].id, idB: orderedPlayers[i + 1].id })
  }
  if (orderedPlayers.length % 2 === 1) {
    pairings.push({ pair_num: pairNum++, idA: orderedPlayers[orderedPlayers.length - 1].id, idB: null })
  }
  return pairings
}

// เกม 1: สุ่มจับคู่ (amGenerateGame1)
export function generateGame1(players: Player[]) {
  return pairInOrder(shuffle(players))
}

// เกม 2+: King of the Hill — จับคู่ตามอันดับปัจจุบัน (amGenerateKingOfHill)
export function generateKingOfHill(standings: Standing[]) {
  return pairInOrder(standings.map((s) => s.player))
}

// ──────────────── ตารางอันดับ ────────────────
// เทียบ amComputeStandings (code.gs:330-399)
// tiebreak: แต้มสะสม → ผลต่างสะสม(cap) → คะแนนดิบรวม(ก่อน cap)
export function computeStandings(players: Player[], games: GameRow[], totalGames: number): Standing[] {
  const acc: Record<number, Standing> = {}
  players.forEach((p) => {
    acc[p.id] = {
      player: p, rank: 0, points: 0, diffSum: 0, rawScoreSum: 0,
      wins: 0, ties: 0, losses: 0, gamesPlayed: 0,
    }
  })

  for (const r of games) {
    const cap = r.game === totalGames ? AM_MAX_DIFF_FINAL : AM_MAX_DIFF

    if (r.score_a === null && !r.is_bye) continue  // ยังไม่ได้กรอก — ข้ามไม่นับ

    if (r.is_bye || r.player_b_id == null) {
      const s = acc[r.player_a_id]
      if (s) {
        s.points += AM_WIN_PT
        s.diffSum += AM_BYE_DIFF
        s.wins += 1
        s.gamesPlayed += 1
      }
      continue
    }

    const scoreA = r.score_a ?? 0
    const scoreB = r.score_b ?? 0
    const rawDiff = scoreA - scoreB
    const diff = Math.max(-cap, Math.min(cap, rawDiff))

    const sa = acc[r.player_a_id]
    if (sa) {
      sa.points += rawDiff > 0 ? AM_WIN_PT : rawDiff < 0 ? AM_LOSS_PT : AM_TIE_PT
      sa.diffSum += diff
      sa.rawScoreSum += scoreA
      if (rawDiff > 0) sa.wins += 1
      else if (rawDiff < 0) sa.losses += 1
      else sa.ties += 1
      sa.gamesPlayed += 1
    }

    const sb = acc[r.player_b_id]
    if (sb) {
      sb.points += rawDiff < 0 ? AM_WIN_PT : rawDiff > 0 ? AM_LOSS_PT : AM_TIE_PT
      sb.diffSum -= diff
      sb.rawScoreSum += scoreB
      if (rawDiff < 0) sb.wins += 1
      else if (rawDiff > 0) sb.losses += 1
      else sb.ties += 1
      sb.gamesPlayed += 1
    }
  }

  const sorted = Object.values(acc).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.diffSum !== a.diffSum) return b.diffSum - a.diffSum
    if (b.rawScoreSum !== a.rawScoreSum) return b.rawScoreSum - a.rawScoreSum
    return a.player.code.localeCompare(b.player.code)
  })

  // จัดอันดับ (เสมอกันได้อันดับเท่ากัน) — เทียบ code.gs:387-396
  // เสมอจริงต้องมีคะแนน/ผลต่าง/คะแนนดิบเท่ากัน และเล่นแล้วอย่างน้อย 1 เกม
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const p = sorted[i - 1], c = sorted[i]
      const realTie = c.points === p.points && c.diffSum === p.diffSum && c.rawScoreSum === p.rawScoreSum
        && c.gamesPlayed > 0 && p.gamesPlayed > 0
      if (!realTie) rank = i + 1
    }
    sorted[i].rank = rank
  }
  return sorted
}

// ──────────────── แนะนำ Gibsonize ────────────────
// ผู้เล่นที่คะแนนนำห่างพอที่ไม่มีทางถูกแซงได้แม้แพ้ทุกเกมที่เหลือ
export function suggestGibsonize(standings: Standing[], remainingGames: number): Standing[] {
  if (standings.length < 2 || remainingGames <= 0) return []
  const result: Standing[] = []
  for (let i = 0; i < standings.length; i++) {
    const curr = standings[i]
    const nextMaxPoints = i + 1 < standings.length
      ? standings[i + 1].points + remainingGames * AM_WIN_PT
      : -Infinity
    if (curr.points > nextMaxPoints) result.push(curr)
    else break
  }
  return result
}

// ──────────────── สรุปเกียรติบัตร ────────────────
// เทียบ amGetAwardsSummary — 60% แรกของผู้ที่ลงแข่ง (ปัดขึ้น)
export interface AwardsSummary {
  totalPlayed: number
  cutoffCount: number
  standings: (Standing & { hasCertificate: boolean })[]
}

export function computeAwards(standings: Standing[]): AwardsSummary | null {
  const totalPlayed = standings.filter((s) => s.gamesPlayed > 0).length
  if (totalPlayed === 0) return null
  const cutoffCount = Math.ceil(totalPlayed * AM_CERT_PERCENT)
  return {
    totalPlayed,
    cutoffCount,
    standings: standings.map((s, i) => ({ ...s, hasCertificate: i < cutoffCount })),
  }
}
