import { useEffect, useState } from 'react'
import './App.css'
import Auth from './Auth'
import Dashboard from './Dashboard'

function App() {
  const [showAuth, setShowAuth] = useState(false)
  const [username, setUsername] = useState('')
  const [showDashboard, setShowDashboard] = useState(false)
  const [activeGame, setActiveGame] = useState('')
  const [homePoints, setHomePoints] = useState(null)
  const [gameChoice, setGameChoice] = useState('1')
  const [gameBet, setGameBet] = useState('10')
  const [gameResult, setGameResult] = useState(null)
  const [gameError, setGameError] = useState('')
  const [gameLoading, setGameLoading] = useState(false)
  const [colorDuration, setColorDuration] = useState(30)
  const [selectedColor, setSelectedColor] = useState('red')
  const [colorState, setColorState] = useState(null)
  const [userRole, setUserRole] = useState('user')


  useEffect(() => {
    let active = true

    fetch('/api/me', { credentials: 'include' })
      .then(async response => {
        if (!response.ok) return null
        const data = await response.json()
        return data.user || null
      })
      .then(user => {
        if (!active) return
        if (user) {
          setUsername(user.username)
          localStorage.setItem('msl-demo-current-user', user.username)
        } else {
          localStorage.removeItem('msl-demo-current-user')
        }
      })
      .catch(error => {
        console.error('Session check error:', error)
      })

  
    return () => {
      active = false
    }
  }, [])

  async function playGame() {
    if (!username) {
      setShowAuth(true)
      setGameError('ကစားရန် Login ဝင်ပါ။')
      return
    }

    setGameLoading(true)
    setGameError('')
    setGameResult(null)

    try {
      const response = await fetch('/api/games/color/bet', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration: colorDuration,
          color: selectedColor,
          amount: Number(gameBet)
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'လောင်းကြေးတင်၍မရပါ။')
      setGameResult(data)
      if (data.points !== undefined) setHomePoints(Number(data.points))
      const me = await fetch('/api/me', { credentials: 'include' })
      if (me.ok) {
        const userData = await me.json()
        if (userData.user) setHomePoints(Number(userData.user.points))
      }
    } catch (error) {
      setGameError(error.message || 'Server နှင့် ချိတ်ဆက်မရပါ။')
    } finally {
      setGameLoading(false)
    }
  }

  useEffect(() => {
    if (activeGame !== 'Color Prediction') return
    let active = true
    const loadState = async () => {
      try {
        const response = await fetch(
          `/api/games/color/state?duration=${colorDuration}`,
          { credentials: 'include' }
        )
        const data = await response.json()
        if (active && response.ok) setColorState(data)
        else if (active && !response.ok) setGameError(data.error || 'Round အခြေအနေ မရပါ။')
      } catch {
        if (active) setGameError('Server နှင့် ချိတ်ဆက်မရပါ။')
      }
    }
    loadState()
    const timer = setInterval(loadState, 1000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [activeGame, colorDuration])

  useEffect(() => {
    let active = true

    fetch('/api/me', { credentials: 'include' })
      .then(async response => {
        if (!response.ok) return null
        const data = await response.json()
        return data.user || null
      })
      .then(user => {
        if (!active) return
        setHomePoints(user ? Number(user.points) : null)
      })
      .catch(error => {
        console.error('Home points error:', error)
      })

    return () => {
      active = false
    }
  }, [username])

  async function logout() {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Logout API error:', error)
    } finally {
      localStorage.removeItem('msl-demo-current-user')
      setHomePoints(null)
      setUsername('')
      setUserRole('user')
      setColorState(null)
      setShowDashboard(false)
    }
  }

  function handleLogin(user) {
    if (typeof user === 'string') {
      setUsername(user)
      setShowDashboard(true)
    }
    setShowAuth(false)
  }

  return (
    <div className="app">
      <header className="header">
        <div
          className="logo"
          onClick={() => setShowDashboard(false)}
          style={{ cursor: 'pointer' }}
        >
          MSL<span>ottery</span>
        </div>

        {username ? (
          <button
            className="login"
            onClick={() => setShowDashboard(!showDashboard)}
          >
            {showDashboard ? 'Home' : 'My Account'}
          </button>
        ) : (
          <button className="login" onClick={() => setShowAuth(true)}>
            Login / Register
          </button>
        )}
      </header>

      {showDashboard && username ? (
        <Dashboard
          username={username}
          onBack={() => setShowDashboard(false)}
        />
      ) : activeGame ? (
        <main className="games color-game">
          <button className="primary" onClick={() => {
            setActiveGame('')
            setGameResult(null)
            setGameError('')
          }}>← Back to Games</button>

          <section className="welcome color-panel">
            <p className="eyebrow">MSLOTTERY · LIVE ROUND</p>
            <h1>Color <span>Prediction</span></h1>
            <p className="description">အရောင်ရွေးပြီး MMK ဖြင့် ခန့်မှန်းကစားပါ။</p>

            <div className="duration-switch">
              <button className={colorDuration === 30 ? 'duration active' : 'duration'}
                onClick={() => { setColorDuration(30); setColorState(null); setGameResult(null); setGameError('') }}>
                30 Seconds
              </button>
              <button className={colorDuration === 60 ? 'duration active' : 'duration'}
                onClick={() => { setColorDuration(60); setColorState(null); setGameResult(null); setGameError('') }}>
                1 Minute
              </button>
            </div>

            <div className="round-clock">
              <small>ROUND ID</small>
              <strong>{colorState?.round?.roundKey || 'Loading…'}</strong>
              <small>TIME LEFT</small>
              <h2>{colorState?.round?.remainingMs != null
                ? `${Math.floor(colorState.round.remainingMs / 60000).toString().padStart(2, '0')}:${Math.floor((colorState.round.remainingMs % 60000) / 1000).toString().padStart(2, '0')}`
                : '--:--'}</h2>
              <p>{colorState?.round?.canBet ? 'လောင်းကြေး လက်ခံနေသည်' : 'လောင်းကြေး ယာယီပိတ်ထားသည်'}</p>
            </div>

            {userRole === 'owner' && colorState?.ownerPreview && (
              <div className="owner-preview">
                Owner Preview · နောက် Round: <strong>{colorState.ownerPreview.resultColor}</strong>
              </div>
            )}

            <div className="color-options">
              {[
                { id: 'green', label: 'GREEN', symbol: '🟢' },
                { id: 'violet', label: 'VIOLET', symbol: '🟣' },
                { id: 'red', label: 'RED', symbol: '🔴' }
              ].map(item => (
                <button key={item.id}
                  className={`color-choice ${item.id} ${selectedColor === item.id ? 'selected' : ''}`}
                  onClick={() => setSelectedColor(item.id)}
                  aria-pressed={selectedColor === item.id}>
                  <span>{item.symbol}</span>{item.label}
                </button>
              ))}
            </div>

            <label htmlFor="game-bet">လောင်းကြေး (MMK) · အနည်းဆုံး 10</label>
            <input id="game-bet" type="number" min="10" step="any"
              value={gameBet} onChange={event => setGameBet(event.target.value)} />

            <button className="primary bet-button" onClick={playGame}
              disabled={gameLoading || !username || !colorState?.round?.canBet ||
                !Number.isFinite(Number(gameBet)) || Number(gameBet) < 10 ||
                userRole === 'owner'}>
              {gameLoading ? 'လောင်းကြေးတင်နေသည်…' : 'Place Bet'}
            </button>
            {!username && <p>လောင်းကြေးတင်ရန် Login ဝင်ပါ။</p>}
            {userRole === 'owner' && <p>Owner account သည် လောင်းကြေးတင်၍မရပါ။</p>}
            {gameError && <p role="alert">{gameError}</p>}

            {gameResult && (
              <div className="game-result" aria-live="polite">
                <h2>လောင်းကြေး အောင်မြင်ပါပြီ</h2>
                <p>ရွေးချယ်ထားသောအရောင်: <strong>{selectedColor.toUpperCase()}</strong></p>
                <p>လောင်းကြေး: {Number(gameBet).toLocaleString()} MMK</p>
                <p>Round: {gameResult.roundKey || colorState?.round?.roundKey}</p>
                <p>လက်ကျန်: <strong>{homePoints == null ? '—' : homePoints.toLocaleString()} MMK</strong></p>
              </div>
            )}

            <div className="round-history">
              <h2>Recent Results</h2>
              {colorState?.history?.length ? colorState.history
                .filter(item => Number(item.duration) === colorDuration)
                .slice(0, 10).map(item => (
                  <div className="history-row" key={item.roundKey}>
                    <span>{item.roundKey}</span>
                    <strong className={`history-color ${String(item.resultColor || '').toLowerCase()}`}>
                      {item.resultColor || '—'}
                    </strong>
                  </div>
                )) : <p>ရလဒ်မှတ်တမ်း မရှိသေးပါ။</p>}
            </div>
          </section>
        </main>
      ) : (
        <main>
          <section className="welcome">
            <p className="eyebrow">WELCOME TO MSLottery</p>
            <h1>Play. Explore.<br /><span>Have Fun.</span></h1>
            <p className="description">
              သင့်ရဲ့ Demo Game စမ်းသပ်မှုကမ္ဘာမှ ကြိုဆိုပါတယ်။
            </p>
            <button
              className="primary"
              onClick={() =>
                document.getElementById('games').scrollIntoView({
                  behavior: 'smooth'
                })
              }
            >
              Explore Games ↓
            </button>
          </section>

          <section className="wallet">
            <div>
              <p>MY WALLET BALANCE</p>
              <h2>{homePoints === null ? "—" : homePoints.toLocaleString()} <span>MMK</span></h2>
            </div>
            <div className="coin">✦</div>
            <small>လက်ကျန်ငွေ · MMK</small>
          </section>

          <section id="games" className="games">
            <p className="eyebrow">DISCOVER</p>
            <h2>Our Games</h2>
            <div className="game-grid">
              <article className="game-card color-game-card">
                <div className="game-icon">🎨</div>
                <h3>Color Prediction</h3>
                <p>30-second and 1-minute rounds</p>
                <button onClick={() => setActiveGame('Color Prediction')}>Play Now</button>
              </article>
            </div>
          </section>
        </main>
      )}

      <footer>MSLottery · Demo mode only</footer>

      {showAuth && (
        <Auth onClose={handleLogin} />
      )}

      {username && (
        <button
          onClick={logout}
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid #34415e',
            background: '#182239',
            color: 'white',
            zIndex: 5
          }}
        >
          Logout
        </button>
      )}
    </div>
  )
}

export default App
