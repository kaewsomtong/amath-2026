import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const juniorPlayers = [
  { code: 'A01', name: 'นันทิตา เศษธรรม', school: 'ม.2/2', member2: 'ปนัดดา เหลือมใส', level: 'มต้น' },
  { code: 'A02', name: 'ญาณพงศ์ แก้วกุลบุตร', school: 'ม.3/5', member2: 'จิราวัฒน์ ผุยพันธ์', level: 'มต้น' },
  { code: 'A03', name: 'ฉัตรปวีณ์ สุทธปัญญา', school: 'ม.3/7', member2: 'ศิริอาภา กองผา', level: 'มต้น' },
  { code: 'A04', name: 'พิชชาพร บัวทนงค์', school: 'ม.3/7', member2: 'กฤติธีรา แจ่มแสง', level: 'มต้น' },
  { code: 'A05', name: 'พีร์รวัฒน์ อ่วมฟัก', school: 'ม.3/5', member2: 'อัครัช ลีลาสาร', level: 'มต้น' },
  { code: 'A06', name: 'บิลพัสด์ สุภาพ', school: 'ม.3/2', member2: 'พิชญ์ศราพงศ์ บุญเชนทร์', level: 'มต้น' },
  { code: 'A07', name: 'ณัฐดนัย ถนอมพงษ์นาวิน', school: 'ม.3/2', member2: 'พงศกร มาลัย', level: 'มต้น' },
  { code: 'A08', name: 'อมรินทร์ เสนสม', school: 'ม.3/2', member2: 'ธนากร งามเยี่ยม', level: 'มต้น' },
  { code: 'A09', name: 'กัญญาภัค สุดเปี่ยม', school: 'ม.1/15', member2: 'คุณภัทร หาไชย', level: 'มต้น' },
  { code: 'A10', name: 'ชรินทร์ทิพย์ ทองทิพย์', school: 'ม.3/12', member2: 'อดิศร ปะทะวัง', level: 'มต้น' },
  { code: 'A11', name: 'คุณากร รันสันเทียะ', school: 'ม.3/4', member2: 'ภคพร มาสุข', level: 'มต้น' },
  { code: 'A12', name: 'พีรดา แก้วพวง', school: 'ม.3/4', member2: 'ศศิรา ทองประเสริฐ', level: 'มต้น' },
  { code: 'A13', name: 'ณัฐวัฒน์ ผ่องพันธุ์', school: 'ม.1/15', member2: 'ณัฐชนน อพยานุกูล', level: 'มต้น' },
  { code: 'A14', name: 'ณนนท์ หัสดิน', school: 'ม.2/15', member2: 'ปรียานุช เฟื่องวงค์', level: 'มต้น' },
  { code: 'A15', name: 'ขวัญชนก อ่อนวิชัย', school: 'ม.3/3', member2: 'ณุชรดา รัตนประภา', level: 'มต้น' },
  { code: 'A16', name: 'ณัฐภัทร ชอบธรรม', school: 'ม.2/7', member2: 'กัญญาพัชร แซ่หลู่', level: 'มต้น' },
  { code: 'A17', name: 'กัญญาณัฐ รอดอินทร์', school: 'ม.2/7', member2: 'เจียระไน เพชรใส', level: 'มต้น' },
  { code: 'A18', name: 'ณัฏฐธิดา บุญช่วย', school: 'ม.2/7', member2: 'พรชนก เปล่งปลั่งกุลภัค', level: 'มต้น' },
  { code: 'A19', name: 'ธนิดา ยิ่งเมือง', school: 'ม.2/7', member2: 'ปุณนดา คำเหลือ', level: 'มต้น' },
  { code: 'A20', name: 'พิชญาภา ทองดี', school: 'ม.2/7', member2: 'วราพร โยลัย', level: 'มต้น' },
]

const seniorPlayers = [
  { code: 'B01', name: 'วริศรา สุกแก้ว', school: 'ม.4/2', member2: '', level: 'มปลาย' },
  { code: 'B02', name: 'ณัฐพล บุตมะ', school: 'ม.4/2', member2: '', level: 'มปลาย' },
  { code: 'B03', name: 'ธฤตญาณ ลัดดากลม', school: 'ม.4/2', member2: '', level: 'มปลาย' },
  { code: 'B04', name: 'เปรมณัตต์ อมรหัต', school: 'ม.6/3', member2: '', level: 'มปลาย' },
  { code: 'B05', name: 'ฐาปนพงศ์ ภาคพิเจริญ', school: 'ม.6/3', member2: '', level: 'มปลาย' },
  { code: 'B06', name: 'ธนันชัย ปลื้มสวาสดิ์', school: 'ม.4/7', member2: '', level: 'มปลาย' },
  { code: 'B07', name: 'ธนดล สุดสอาด', school: 'ม.6/5', member2: '', level: 'มปลาย' },
  { code: 'B08', name: 'ศุภณัฐ สุกิจวรผล', school: 'ม.6/1', member2: '', level: 'มปลาย' },
  { code: 'B09', name: 'ณัฏฐนนท์ เมืองพงษา', school: 'ม.4/3', member2: '', level: 'มปลาย' },
]

export async function GET() {
  const all = [...juniorPlayers, ...seniorPlayers]
  const { data, error } = await supabase
    .from('am_players')
    .upsert(all, { onConflict: 'code,level' })
    .select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, inserted: data?.length, junior: juniorPlayers.length, senior: seniorPlayers.length })
}
