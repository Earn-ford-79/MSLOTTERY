import { useState } from 'react'
import './Auth.css'

export default function Auth({ onClose }) {
  const [mode, setMode] = useState('login')
  const [accountId, setAccountId] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setMessage('')

    const cleanUsername = username.trim()

    if (
      mode === 'register' &&
      (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername) ||
        cleanUsername.toLowerCase() === 'mshall07')
    ) {
      setMessage('Username ကို 3–24 လုံး ထည့်ပါ။ mshall07 ကို သီးသန့်ထားသည်။')
      return
    }

    if (password.length < 8 || password.length > 72) {
      setMessage('Password ကို 8–72 လုံး ထည့်ပါ။')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        mode === 'login' ? '/api/login' : '/api/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...(mode === 'login'
              ? { username: cleanUsername }
              : { username: cleanUsername }),
            password
          })
        }
      )

      const data = await response.json()

      if (!response.ok || !data.ok) {
        setMessage(data.message || data.error || 'လုပ်ဆောင်မှု မအောင်မြင်ပါ။')
        return
      }

      if (mode === 'register') {
        setMessage(
          data.accountId
            ? `အကောင့်ဖန်တီးပြီးပါပြီ။ သင့် Account ID: ${data.accountId}`
            : 'Demo account ဖန်တီးပြီးပါပြီ။ Login ဝင်နိုင်ပါပြီ။'
        )
        setMode('login')
        setPassword('')
        return
      }

      localStorage.setItem('msl-demo-current-user', data.user.username)
      setMessage('Login အောင်မြင်ပါတယ်။')
      onClose(data.user.username)
    } catch {
      setMessage('Server ချိတ်ဆက်မရပါ။ Backend အလုပ်လုပ်နေသလား စစ်ပါ။')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-overlay">
      <section className="auth-panel">
        <button className="auth-close" onClick={onClose}>✕</button>
        <p className="auth-label">MSLOTTERY ACCOUNT</p>
        <h2>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
        <p className="auth-sub">
          {mode === 'login'
            ? 'Username နှင့် Password ဖြင့် ဝင်ပါ။'
            : 'အကောင့်အသစ် ဖန်တီးပါ။'}
        </p>

        <form onSubmit={submit}>
          <label>Username</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            minLength={3}
            maxLength={24}
            required
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={8}
            maxLength={72}
            required
          />

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'ခဏစောင့်ပါ...' : mode === 'login' ? 'Login' : 'Register'}
          </button>
        </form>

        {message && <p className="auth-message">{message}</p>}

        <button
          className="auth-switch"
          disabled={loading}
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setMessage('')
            setPassword('')
          }}
        >
          {mode === 'login' ? 'အကောင့်မရှိသေးဘူးလား? Register' : 'အကောင့်ရှိပြီးသားလား? Login'}
        </button>

        <p className="auth-note">
          Demo အတွက်သာဖြစ်သည်။ တကယ့်ငွေကြေး သို့မဟုတ် အရေးကြီးသော Password မသုံးပါနှင့်။
        </p>
      </section>
    </div>
  )
}
