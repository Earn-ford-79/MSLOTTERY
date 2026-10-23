import { useEffect, useState } from 'react'
import './Dashboard.css'

export default function Dashboard({ username, onBack }) {
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState([])

  useEffect(() => {
    let active = true

    async function loadUser() {
      try {
        const response = await fetch('/api/me', {
          credentials: 'include'
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'အကောင့်အချက်အလက် ရယူမရပါ။')
        }

        if (active) setUser(data.user)

        const txResponse = await fetch('/api/transactions', {
          credentials: 'include'
        })
        if (txResponse.ok) {
          const txData = await txResponse.json()
          if (active) setTransactions(txData.transactions || [])
        }
      } catch (err) {
        if (active) setError(err.message || 'Server ချိတ်ဆက်မရပါ။')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadUser()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="dashboard">
      <button className="dash-back" onClick={onBack}>
        ← Home
      </button>

      <section className="dash-welcome">
        <p className="dash-label">MY ACCOUNT</p>
        <h1>မင်္ဂလာပါ၊ {user?.username || username} 👋</h1>
        <p>သင့်ရဲ့ Demo Dashboard မှ ကြိုဆိုပါတယ်။</p>
      </section>

      <section className="dash-balance">
        <p>DEMO BALANCE</p>
        <h2>
          {loading ? '...' : user ? Number(user.points).toLocaleString() : '—'}
          {' '}<span>MMK</span>
        </h2>
        <small>စမ်းသပ်အသုံးပြုရန် အမှတ်များသာဖြစ်သည်။</small>
        {error && <p className="dash-note">{error}</p>}
      </section>

      <section className="dash-details">
        <h2>Account Information</h2>
        <div className="dash-row">
          <span>Username</span>
          <strong>{user?.username || username}</strong>
        </div>
        <div className="dash-row">
          <span>Account Type</span>
          <strong>{user?.role === 'admin' ? 'Admin' : 'Demo User'}</strong>
        </div>
        <div className="dash-row">
          <span>Account Status</span>
          <strong className="dash-active">
            {loading ? 'Loading...' : user ? 'Active' : 'Unavailable'}
          </strong>
        </div>
      </section>

      <section className="dash-details">
        <h2>Transaction History</h2>
        {loading ? (
          <p>မှတ်တမ်းများ ဖတ်နေသည်...</p>
        ) : transactions.length === 0 ? (
          <p>မှတ်တမ်း မရှိသေးပါ။</p>
        ) : (
          transactions.map((tx, index) => (
            <div className="dash-row" key={`${tx.createdAt}-${index}`}>
              <div>
                <strong>{tx.reason}</strong>
                <br />
                <small>{tx.createdAt}</small>
              </div>
              <strong>
                {Number(tx.amount) > 0 ? '+' : ''}
                {Number(tx.amount).toLocaleString()} MMK
              </strong>
            </div>
          ))
        )}
      </section>

      <p className="dash-note">
        Demo mode သာဖြစ်ပြီး ငွေသွင်း၊ ငွေထုတ် စနစ် မပါဝင်ပါ။
      </p>
    </main>
  )
}
