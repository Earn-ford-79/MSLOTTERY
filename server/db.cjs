const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, 'msl-demo.db')

let db

async function initDB() {
  const SQL = await initSqlJs()

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      points INTEGER NOT NULL DEFAULT 1000,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS point_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)


  // Safe, additive schema migration: preserve existing users and transaction history.
  const ensureColumn = (table, column, definition) => {
    const columns = db.exec(`PRAGMA table_info(${table})`)[0]?.values || []
    if (!columns.some(row => row[1] === column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  ensureColumn('users', 'first_play_at', 'TEXT')
  ensureColumn('users', 'deposited_total', 'REAL NOT NULL DEFAULT 0')
  ensureColumn('users', 'banned_until', 'TEXT')
  ensureColumn('users', 'ban_reason', 'TEXT')
  ensureColumn('users', 'banned_by', 'INTEGER')

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_id
    ON users(account_id) WHERE account_id IS NOT NULL AND account_id <> ''`)

  db.run(`
    CREATE TABLE IF NOT EXISTS game_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_key TEXT NOT NULL UNIQUE,
      duration_seconds INTEGER NOT NULL CHECK(duration_seconds IN (30, 60)),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      result_color TEXT,
      result_number INTEGER,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK(status IN ('open', 'closed', 'settled', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS game_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      color TEXT NOT NULL CHECK(color IN ('red', 'green', 'violet')),
      amount REAL NOT NULL CHECK(amount >= 10),
      payout REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'won', 'lost', 'refunded')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      settled_at TEXT,
      FOREIGN KEY (round_id) REFERENCES game_rounds(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_game_bets_round ON game_bets(round_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_game_bets_user ON game_bets(user_id)')

  db.run(`
    CREATE TABLE IF NOT EXISTS deposit_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      method TEXT NOT NULL CHECK(method IN ('kpay', 'wavepay')),
      transaction_ref TEXT NOT NULL UNIQUE,
      receipt_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'approved', 'rejected')),
      review_reason TEXT,
      reviewed_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      fee REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL CHECK(method IN ('kpay', 'wavepay')),
      receiver TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'approved', 'rejected', 'completed')),
      review_reason TEXT,
      reviewed_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day_number INTEGER NOT NULL CHECK(day_number BETWEEN 1 AND 7),
      day_key TEXT NOT NULL,
      reward REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, day_key),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS ban_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      banned_until TEXT,
      actor_id INTEGER NOT NULL,
      lifted_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lifted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      action TEXT NOT NULL,
      target_user_id INTEGER,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_id) REFERENCES users(id),
      FOREIGN KEY (target_user_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  saveDB()
  return db
}

function saveDB() {
  if (db) {
    fs.writeFileSync(dbPath, Buffer.from(db.export()))
  }
}

module.exports = { initDB, saveDB }
