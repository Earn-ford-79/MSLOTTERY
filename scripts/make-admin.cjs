const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, '..', 'server', 'msl-demo.db')

async function main() {
  const SQL = await initSqlJs()
  const db = new SQL.Database(fs.readFileSync(dbPath))

  try {
    const target = db.exec(
      "SELECT id FROM users WHERE username = 'mshall07'"
    )
    if (!target.length || !target[0].values.length) {
      throw new Error('mshall07 account not found; no changes made')
    }

    db.run("UPDATE users SET role = 'user' WHERE username = 'testuser01'")
    db.run("UPDATE users SET role = 'admin' WHERE username = 'mshall07'")
    fs.writeFileSync(dbPath, Buffer.from(db.export()))

    const result = db.exec(
      "SELECT id, username, role FROM users WHERE username IN ('mshall07', 'testuser01') ORDER BY id"
    )
    console.log(result[0].values)
  } finally {
    db.close()
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
