import { createClient } from '@supabase/supabase-js'

const [usernameInput, newPin] = process.argv.slice(2)
const username = usernameInput?.toUpperCase()
const url = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const domain = process.env.LOGIN_DOMAIN || 'imp-board.invalid'

if (!url || !secretKey || !/^IMP-([1-9]|1[0-5])$/.test(username || '') || !/^\d{6}$/.test(newPin || '')) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run reset-pin -- IMP-7 123456')
  process.exit(1)
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = `${username.toLowerCase()}@${domain}`
const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listError) throw listError

const user = users.users.find((item) => item.email === email)
if (!user) {
  console.error(`User ${username} not found.`)
  process.exit(1)
}

const { error } = await supabase.auth.admin.updateUserById(user.id, { password: newPin })
if (error) throw error

console.log(`PIN changed for ${username}.`)
