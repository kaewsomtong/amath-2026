import { NextRequest, NextResponse } from 'next/server'
import { computeAwards } from '@/lib/am-logic'
import { loadStandings } from '@/app/api/standings/route'

// GET /api/awards?level=มต้น  → สรุปเกียรติบัตร 60% แรก
export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get('level')
  if (!level) return NextResponse.json({ error: 'ต้องระบุระดับ (level)' }, { status: 400 })
  const { standings } = await loadStandings(level)
  const awards = computeAwards(standings)
  return NextResponse.json(awards)
}
