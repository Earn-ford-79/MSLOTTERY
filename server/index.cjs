const express = require('express')
const session = require('express-session')
const bcrypt = require('bcryptjs')
const { initDB, saveDB } = require('./db.cjs')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = Number(process.env.API_PORT || 3001)
const isProduction = process.env.NODE_ENV === 'production'
const sessionSecret = process.env.SESSION_SECRET || (() => {
  if (isProduction) return ''
  const secretPath = path.join(__dirname, '.session-secret')
  try {
    return fs.readFileSync(secretPath, 'utf8').trim()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const secret = crypto.randomBytes(32).toString('hex')
    fs.writeFileSync(secretPath, secret, { mode: 0o600, flag: 'wx' })
    return secret
  }
})()

if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('Production အတွက် SESSION_SECRET အနည်းဆုံး 32 characters လိုအပ်သည်။')
}

app.disable('x-powered-by')
app.use(express.json({ limit: '10kb' }))

app.use(session({
  name: 'msl.sid',
  secret: sessionSecret || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8
  }
}))

let db

function queryOne(sql, params = []) {
  const statement = db.prepare(sql)
  try {
    statement.bind(params)
    return statement.step() ? statement.getAsObject() : null
  } finally {
    statement.free()
  }
}

function queryAll(sql, params = []) {
  const statement = db.prepare(sql)
  try {
    statement.bind(params)
    const rows = []
    while (statement.step()) rows.push(statement.getAsObject())
    return rows
  } finally {
    statement.free()
  }
}

function execute(sql, params = []) {
  db.run(sql, params)
  saveDB()
  return db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0]
}

function publicUser(user) {
  return {
    id: user.id,
    accountId: user.account_id,
    username: user.username,
    role: user.role,
    points: user.points,
    createdAt: user.created_at
  }
}

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Login ဝင်ရန် လိုအပ်သည်။' })
  }
  next()
}

function getCurrentUser(req) {
  return queryOne(
    'SELECT id, account_id, username, role, points, created_at FROM users WHERE id = ?',
    [req.session.userId]
  )
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'MSL Demo API' })
})

app.post('/api/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '')

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username) || username.toLowerCase() === 'mshall07') {
      return res.status(400).json({
        error: 'Username သည် 3–24 လုံးဖြစ်ရမည်။ mshall07 ကို သီးသန့်ထားသည်။'
      })
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        error: 'Password သည် 8–72 characters ဖြစ်ရမည်။'
      })
    }

    if (queryOne('SELECT id FROM users WHERE username = ?', [username])) {
      return res.status(409).json({ error: 'Username အသုံးပြုပြီးသားဖြစ်သည်။' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    let accountId
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = String(crypto.randomInt(10000000, 100000000))
      if (!queryOne('SELECT id FROM users WHERE account_id = ?', [candidate])) {
        accountId = candidate
        break
      }
    }
    if (!accountId) {
      return res.status(503).json({ error: 'Account ID ဖန်တီးမရပါ။ ထပ်ကြိုးစားပါ။' })
    }

    const userId = execute(
      'INSERT INTO users (account_id, username, password_hash, points) VALUES (?, ?, ?, ?)',
      [accountId, username, passwordHash, 890]
    )

    execute(
      'INSERT INTO point_transactions (user_id, amount, reason) VALUES (?, ?, ?)',
      [userId, 890, 'Welcome bonus: 890 MMK']
    )

    res.status(201).json({ ok: true, accountId, message: 'Demo account ဖန်တီးပြီးပါပြီ။' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Server error ဖြစ်နေသည်။' })
  }
})

app.post('/api/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '')

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ error: 'Username ကို မှန်ကန်စွာ ထည့်ပါ။' })
    }

    const user = queryOne(
      'SELECT id, account_id, username, password_hash, role, points, created_at FROM users WHERE username = ?',
      [username]
    )

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Username သို့မဟုတ် Password မှားနေသည်။' })
    }

    req.session.regenerate((error) => {
      if (error) return res.status(500).json({ error: 'Session ဖန်တီး၍မရပါ။' })

      req.session.userId = user.id
      req.session.save((saveError) => {
        if (saveError) return res.status(500).json({ error: 'Session သိမ်း၍မရပါ။' })
        res.json({ ok: true, user: publicUser(user) })
      })
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Server error ဖြစ်နေသည်။' })
  }
})

app.post('/api/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: 'Logout မအောင်မြင်ပါ။' })
    res.clearCookie('msl.sid')
    res.json({ ok: true })
  })
})

app.get('/api/me', requireLogin, (req, res) => {
  const user = getCurrentUser(req)
  if (!user) return res.status(401).json({ error: 'Account မတွေ့ပါ။' })
  res.json({ user: publicUser(user) })
})

app.get('/api/transactions', requireLogin, (req, res) => {
  const transactions = queryAll(`
    SELECT amount, reason, created_at AS createdAt
    FROM point_transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 50
  `, [req.session.userId])

  res.json({ transactions })
})


app.post('/api/games/lucky-number', requireLogin, (req, res) => {
  const number = Number(req.body.number)
  const bet = Number(req.body.bet)

  if (!Number.isInteger(number) || number < 1 || number > 10) {
    return res.status(400).json({ error: 'နံပါတ်ကို 1 မှ 10 အတွင်း ရွေးပါ။' })
  }
  if (!Number.isInteger(bet) || bet < 1 || bet > 100) {
    return res.status(400).json({ error: 'Bet ကို 1 မှ 100 PTS အတွင်း ထည့်ပါ။' })
  }

  const user = getCurrentUser(req)
  if (!user) return res.status(401).json({ error: 'Account မတွေ့ပါ။' })
  if (user.points < bet) {
    return res.status(400).json({ error: 'Demo Points မလုံလောက်ပါ။' })
  }

  const result = crypto.randomInt(1, 11)
  const won = number === result
  const delta = won ? bet * 2 : -bet

  db.run('UPDATE users SET points = points + ? WHERE id = ?', [delta, user.id])
  db.run(
    'INSERT INTO point_transactions (user_id, amount, reason) VALUES (?, ?, ?)',
    [user.id, delta, `Lucky Number: ရွေး ${number}, ထွက် ${result}`]
  )
  saveDB()

  res.json({
    ok: true,
    game: 'Lucky Number',
    chosen: number,
    result,
    won,
    amount: delta,
    points: getCurrentUser(req).points
  })
})

app.post('/api/games/lucky-dice', requireLogin, (req, res) => {
  const bet = Number(req.body.bet)
  const choice = String(req.body.choice || '')

  if (!Number.isInteger(bet) || bet < 1 || bet > 100) {
    return res.status(400).json({ error: 'Bet ကို 1 မှ 100 PTS အတွင်း ထည့်ပါ။' })
  }
  if (!['high', 'low'].includes(choice)) {
    return res.status(400).json({ error: 'High သို့မဟုတ် Low ကို ရွေးပါ။' })
  }

  const user = getCurrentUser(req)
  if (!user) return res.status(401).json({ error: 'Account မတွေ့ပါ။' })
  if (user.points < bet) {
    return res.status(400).json({ error: 'Demo Points မလုံလောက်ပါ။' })
  }

  const result = crypto.randomInt(1, 7)
  const won = choice === (result >= 4 ? 'high' : 'low')
  const delta = won ? bet : -bet

  db.run('UPDATE users SET points = points + ? WHERE id = ?', [delta, user.id])
  db.run(
    'INSERT INTO point_transactions (user_id, amount, reason) VALUES (?, ?, ?)',
    [user.id, delta, `Lucky Dice: ${choice === 'high' ? 'High' : 'Low'}, ထွက် ${result}`]
  )
  saveDB()

  res.json({
    ok: true,
    game: 'Lucky Dice',
    choice,
    result,
    won,
    amount: delta,
    points: getCurrentUser(req).points
  })
})


function colorRound(duration, startMs) {
  const roundKey = `${duration}:${startMs}`
  let round = queryOne('SELECT * FROM game_rounds WHERE round_key = ?', [roundKey])
  if (!round) {
    const colors = ['red', 'green', 'violet']
    const resultColor = colors[crypto.randomInt(0, colors.length)]
    const startsAt = new Date(startMs).toISOString()
    const endsAt = new Date(startMs + duration * 1000).toISOString()
    db.run(
      `INSERT OR IGNORE INTO game_rounds
       (round_key, duration_seconds, starts_at, ends_at, result_color, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [roundKey, duration, startsAt, endsAt, resultColor]
    )
    saveDB()
    round = queryOne('SELECT * FROM game_rounds WHERE round_key = ?', [roundKey])
  }
  return round
}

function settleEndedColorRounds() {
  const now = Date.now()
  const rounds = queryAll(
    `SELECT * FROM game_rounds
     WHERE status IN ('open', 'closed') AND ends_at <= ?
     ORDER BY id ASC`,
    [new Date(now).toISOString()]
  )

  for (const round of rounds) {
    const bets = queryAll(
      `SELECT * FROM game_bets WHERE round_id = ? AND status = 'pending'`,
      [round.id]
    )

    for (const bet of bets) {
      const won = bet.color === round.result_color
      const payout = won ? Math.round(Number(bet.amount) * 198) / 100 : 0

      if (payout > 0) {
        db.run('UPDATE users SET points = points + ? WHERE id = ?', [payout, bet.user_id])
        db.run(
          'INSERT INTO point_transactions (user_id, amount, reason) VALUES (?, ?, ?)',
          [bet.user_id, payout, `Color Prediction အနိုင်ရ · Round ${round.round_key}`]
        )
      }

      db.run(
        `UPDATE game_bets SET status = ?, payout = ?, settled_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
        [won ? 'won' : 'lost', payout, bet.id]
      )
    }

    db.run(
      `UPDATE game_rounds SET status = 'settled' WHERE id = ? AND status IN ('open', 'closed')`,
      [round.id]
    )
  }

  if (rounds.length) saveDB()
}

function colorRoundState(req, res) {
  const duration = Number(req.query.duration || req.body?.duration || 30)
  if (![30, 60].includes(duration)) {
    return res.status(400).json({ error: 'Round ကို 30 သို့မဟုတ် 60 စက္ကန့် ရွေးပါ။' })
  }

  const now = Date.now()
  const periodMs = duration * 1000
  const startMs = Math.floor(now / periodMs) * periodMs
  const round = colorRound(duration, startMs)
  const remainingMs = Math.max(0, new Date(round.ends_at).getTime() - now)

  if (remainingMs <= 5000 && round.status === 'open') {
    db.run("UPDATE game_rounds SET status = 'closed' WHERE id = ? AND status = 'open'", [round.id])
    saveDB()
    round.status = 'closed'
  }

  settleEndedColorRounds()

  const history = queryAll(
    `SELECT round_key AS roundKey, duration_seconds AS duration,
            starts_at AS startsAt, ends_at AS endsAt,
            result_color AS resultColor, result_number AS resultNumber
     FROM game_rounds WHERE status = 'settled'
     ORDER BY id DESC LIMIT 20`
  )

  const response = {
    ok: true,
    duration,
    serverTime: new Date(now).toISOString(),
    round: {
      roundKey: round.round_key,
      duration: round.duration_seconds,
      startsAt: round.starts_at,
      endsAt: round.ends_at,
      remainingMs,
      canBet: remainingMs > 5000 && round.status === 'open',
      status: round.status,
      resultColor: remainingMs <= 0 || round.status === 'settled' ? round.result_color : null
    },
    history
  }

  const user = req.session.userId ? getCurrentUser(req) : null
  if (user && user.role === 'owner') {
    const nextRound = colorRound(duration, startMs + periodMs)
    response.ownerPreview = {
      roundKey: nextRound.round_key,
      resultColor: nextRound.result_color
    }
  }

  return res.json(response)
}

app.get('/api/games/color/state', colorRoundState)

app.post('/api/games/color/bet', requireLogin, (req, res) => {
  const duration = Number(req.body.duration || 30)
  const color = String(req.body.color || '').toLowerCase()
  const amount = Number(req.body.amount)

  if (![30, 60].includes(duration)) {
    return res.status(400).json({ error: 'Round ကို 30 သို့မဟုတ် 60 စက္ကန့် ရွေးပါ။' })
  }
  if (!['red', 'green', 'violet'].includes(color)) {
    return res.status(400).json({ error: 'အရောင်ကို Red, Green, Violet ထဲမှ ရွေးပါ။' })
  }
  if (!Number.isFinite(amount) || amount < 10 || amount > 1e12) {
    return res.status(400).json({ error: 'အနည်းဆုံး 10 MMK လောင်းရပါမယ်။' })
  }

  const user = getCurrentUser(req)
  if (!user) return res.status(401).json({ error: 'Account မတွေ့ပါ။' })
  if (user.role === 'owner') {
    return res.status(403).json({ error: 'Owner account မှ ဂိမ်းလောင်းကြေး မထည့်နိုင်ပါ။' })
  }

  const ban = queryOne('SELECT banned_until, ban_reason FROM users WHERE id = ?', [user.id])
  if (ban && (!ban.banned_until || new Date(ban.banned_until).getTime() > Date.now())) {
    return res.status(403).json({ error: ban.ban_reason || 'ဤ account ကို ယာယီပိတ်ထားသည်။' })
  }

  const lockdown = queryOne("SELECT value FROM system_settings WHERE key = 'lockdown_until'")
  if (lockdown && lockdown.value && new Date(lockdown.value).getTime() <= Date.now()) {
    return res.status(503).json({ error: 'ဂိမ်းကို ယာယီပိတ်ထားပါတယ်။' })
  }

  const now = Date.now()
  const periodMs = duration * 1000
  const startMs = Math.floor(now / periodMs) * periodMs
  const round = colorRound(duration, startMs)
  const remainingMs = new Date(round.ends_at).getTime() - now

  if (remainingMs <= 5000 || round.status !== 'open') {
    if (round.status === 'open') {
      db.run("UPDATE game_rounds SET status = 'closed' WHERE id = ?", [round.id])
      saveDB()
    }
    return res.status(400).json({ error: 'Round ပြီးဆုံးရန် ၅ စက္ကန့်သာ ကျန်တော့သဖြင့် လောင်းကြေးပိတ်ထားပါတယ်။' })
  }

  const current = getCurrentUser(req)
  if (Number(current.points) < amount) {
    return res.status(400).json({ error: 'လက်ကျန် MMK မလုံလောက်ပါ။' })
  }

  try {
    db.run('BEGIN TRANSACTION')
    db.run('UPDATE users SET points = points - ?, first_play_at = COALESCE(first_play_at, CURRENT_TIMESTAMP) WHERE id = ?', [amount, user.id])
    db.run(
      `INSERT INTO game_bets (round_id, user_id, color, amount, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [round.id, user.id, color, amount]
    )
    db.run(
      'INSERT INTO point_transactions (user_id, amount, reason) VALUES (?, ?, ?)',
      [user.id, -amount, `Color Prediction လောင်းကြေး · ${color} · ${round.round_key}`]
    )
    db.run('COMMIT')
    saveDB()
  } catch (error) {
    try { db.run('ROLLBACK') } catch (_) {}
    console.error('Color bet failed:', error)
    return res.status(500).json({ error: 'လောင်းကြေးသိမ်းဆည်းမှု မအောင်မြင်ပါ။' })
  }

  res.json({
    ok: true,
    roundKey: round.round_key,
    duration,
    color,
    amount,
    points: getCurrentUser(req).points,
    message: 'လောင်းကြေးလက်ခံပြီးပါပြီ။'
  })
})

app.get('/api/admin/users', requireLogin, (req, res) => {
  const user = getCurrentUser(req)
  if (!user || user.role !== 'owner') {
    return res.status(403).json({ error: 'Admin permission လိုအပ်သည်။' })
  }

  const users = queryAll(`
    SELECT id, account_id AS accountId, username, role, points, created_at AS createdAt
    FROM users
    ORDER BY id DESC
    LIMIT 100
  `)

  res.json({ users })
})

initDB()
  .then((database) => {
    db = database
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`MSL Demo API ready at http://127.0.0.1:${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Database initialization failed:', error)
    process.exit(1)
  })
