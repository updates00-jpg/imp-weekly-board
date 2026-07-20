import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const url = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const domain = process.env.LOGIN_DOMAIN || 'imp-board.invalid'

if (!url || !secretKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY first.')
  process.exit(1)
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const credentials = [['username', 'pin', 'role']]

for (let number = 1; number <= 15; number += 1) {
  const username = `IMP-${number}`
  const email = `${username.toLowerCase()}@${domain}`
  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const role = number <= 2 ? 'admin' : 'member'

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { username },
  })

  if (error) {
    console.error(`${username}: ${error.message}`)
    continue
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    username,
    role,
    active: true,
  })

  if (profileError) {
    console.error(`${username} profile: ${profileError.message}`)
    continue
  }

  credentials.push([username, pin, role])
  console.log(`Created ${username}`)
}

const csv = credentials.map((row) => row.join(',')).join('\n')
writeFileSync('credentials.csv', csv, 'utf8')
console.log('Saved credentials.csv. Store it securely and delete it after distributing PINs.')
