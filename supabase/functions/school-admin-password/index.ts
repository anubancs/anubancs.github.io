import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getSecretKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw)
      const key = keys.default ?? Object.values(keys)[0]
      if (typeof key === 'string' && key) return key
    } catch {
      // Fall back to the legacy environment variable below.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401)

    const url = Deno.env.get('SUPABASE_URL')
    const secretKey = getSecretKey()
    if (!url || !secretKey) {
      console.error('Missing Supabase URL or server secret key')
      return json({ error: 'การตั้งค่าเซิร์ฟเวอร์ไม่สมบูรณ์' }, 500)
    }

    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) return json({ error: 'เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, 401)

    const { data: actor, error: actorError } = await admin
      .from('admin_users')
      .select('role')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    if (actorError) {
      console.error('Owner permission lookup failed:', actorError.message)
      return json({ error: 'ตรวจสอบสิทธิ์ผู้ดูแลไม่สำเร็จ' }, 500)
    }
    if (actor?.role !== 'owner') return json({ error: 'เฉพาะ Owner เท่านั้นที่ตั้งรหัสผ่านให้บัญชีอื่นได้' }, 403)

    const body = await req.json()
    const userId = String(body.user_id ?? '').trim()
    const password = String(body.password ?? '')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return json({ error: 'รหัสบัญชีผู้ใช้ไม่ถูกต้อง' }, 400)
    }
    if (password.length < 10 || password.length > 72) {
      return json({ error: 'รหัสผ่านต้องมีความยาว 10–72 ตัวอักษร' }, 400)
    }

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(userId)
    if (targetError || !target.user) return json({ error: 'ไม่พบบัญชีผู้ใช้ในระบบ' }, 404)

    const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password })
    if (updateError) {
      console.error('Admin password update failed:', updateError.message)
      return json({ error: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ: ' + updateError.message }, 400)
    }

    return json({ ok: true, user_id: userId, email: target.user.email ?? null })
  } catch (error) {
    console.error('school-admin-password error:', error)
    return json({ error: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' }, 500)
  }
})
