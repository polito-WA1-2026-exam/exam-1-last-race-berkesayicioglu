import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API = 'http://localhost:3001/api'

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Request failed')
  }
  if (response.status === 204) return null
  return response.json()
}

function StationMap({ network, route = [], showLines = true, onStationClick, compact = false }) {
  if (!network) return null
  const stationById = new Map(network.stations.map((station) => [station.id, station]))
  const mapTitle = showLines ? 'Network map' : 'Route planner'
  const mapHint = showLines ? `${network.stations.length} stations` : `${route.length} selected`

  return (
    <div className={compact ? 'map-wrap compact-map' : 'map-wrap'}>
      <div className="map-header">
        <div>
          <span className="map-title">{mapTitle}</span>
          <span className="map-subtitle">{mapHint}</span>
        </div>
        {showLines && (
          <div className="map-legend">
            <span><i className="legend-dot" /> Station</span>
            <span><i className="legend-dot interchange" /> Interchange</span>
          </div>
        )}
      </div>
      <svg className="map" viewBox="0 0 100 100" role="img" aria-label="Underground network map">
        {showLines &&
          network.connections.map((connection) => {
            const from = stationById.get(connection.from_station)
            const to = stationById.get(connection.to_station)
            return (
              <line
                key={connection.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={connection.color}
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            )
          })}
        {route.slice(0, -1).map((stationId, index) => {
          const from = stationById.get(stationId)
          const to = stationById.get(route[index + 1])
          if (!from || !to) return null
          return <line key={`${stationId}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="route-line" />
        })}
        {network.stations.map((station) => {
          const selected = route.includes(station.id)
          const isCurrent = route[route.length - 1] === station.id
          const canSelect = onStationClick && !selected
          const radius = station.interchange ? 1.6 : 1.2
          return (
            <g
              key={station.id}
              className={`station ${selected ? 'selected' : ''} ${isCurrent ? 'current' : ''} ${canSelect ? 'clickable' : ''}`}
            >
              {canSelect && (
                <circle
                  className="station-hit"
                  cx={station.x}
                  cy={station.y}
                  r={3.2}
                  onClick={() => onStationClick(station)}
                />
              )}
              <circle className="station-dot" cx={station.x} cy={station.y} r={radius} />
              {station.interchange && (
                <circle className="station-ring" cx={station.x} cy={station.y} r={radius + 0.55} />
              )}
              <text x={station.x + 1.8} y={station.y - 1.2}>{station.name}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('berke@student.test')
  const [password, setPassword] = useState('berke')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      const data = await api('/sessions', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      onLogin(data.user)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form className="login-form card" onSubmit={submit}>
      <div>
        <span className="eyebrow">Player access</span>
        <h2>Log in to race</h2>
        <p className="muted">Use one of the seeded accounts to unlock the network and start a route.</p>
      </div>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary wide" type="submit">Log in</button>
    </form>
  )
}

function Timer({ seconds, total = 90 }) {
  const urgent = seconds <= 10
  const progress = (seconds / total) * 100
  return (
    <div
      className={`timer-ring ${urgent ? 'danger' : ''}`}
      style={{ '--progress': progress }}
      aria-label={`${seconds} seconds remaining`}
    >
      <span>{seconds}s</span>
    </div>
  )
}

function RankingPage({ ranking }) {
  return (
    <section className="ranking-page page-panel">
      <Ranking ranking={ranking} />
    </section>
  )
}

function Ranking({ ranking }) {
  const medals = ['gold', 'silver', 'bronze']
  return (
    <section className="ranking-card card ranking-full">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Leaderboard</span>
          <h2>General Ranking</h2>
        </div>
        <span className="panel-badge">{ranking.length} players</span>
      </div>
      <div className="ranking">
        {ranking.map((row, index) => (
          <div className={`rank-row ${medals[index] || ''}`} key={row.name}>
            <div className="rank-left">
              <span className="rank-position">{index + 1}</span>
              <strong>{row.name}</strong>
            </div>
            <span className="rank-score">{row.best_score} coins</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Game({ game, onFinished, onBackToSetup }) {
  const [route, setRoute] = useState([game.startStation])
  const [seconds, setSeconds] = useState(90)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const stationById = useMemo(() => new Map(game.network.stations.map((station) => [station.id, station])), [game])
  const start = stationById.get(game.startStation)
  const destination = stationById.get(game.destinationStation)

  const submitRoute = useCallback(async (currentRoute = route) => {
    if (result) return
    try {
      const data = await api(`/games/${game.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ route: currentRoute }),
      })
      setResult(data)
      onFinished()
    } catch (err) {
      setError(err.message)
    }
  }, [game.id, onFinished, result, route])

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          clearInterval(interval)
          submitRoute(route)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [route, result, submitRoute])

  function addStation(station) {
    if (result) return
    setRoute((current) => {
      if (current.includes(station.id)) return current
      return [...current, station.id]
    })
  }

  return (
    <section className="game-page page-panel">
      <div className="game-main card">
        <div className="phase-bar">
          <div>
            <span className="eyebrow">Planning phase</span>
            <h2>{start.name} → {destination.name}</h2>
            <p className="muted">Lines are hidden. Click stations in order to build your route.</p>
            <div className="journey-tags">
              <span className="journey-tag start">Start: {start.name}</span>
              <span className="journey-tag end">Goal: {destination.name}</span>
            </div>
          </div>
          <Timer seconds={seconds} />
        </div>
        <StationMap network={game.network} route={route} showLines={false} onStationClick={addStation} />
        <div className="route-builder">
          <span className="route-builder-label">Your route</span>
          <div className="route-steps">
            {route.map((id, index) => (
              <span className="route-step-wrap" key={`${id}-${index}`}>
                {index > 0 && <span className="route-arrow" aria-hidden="true">→</span>}
                <button
                  type="button"
                  className={`route-step ${index === route.length - 1 ? 'current' : ''}`}
                  onClick={() => setRoute(route.slice(0, index + 1))}
                >
                  <span className="route-step-num">{index + 1}</span>
                  {stationById.get(id)?.name}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="actions">
          <button type="button" onClick={onBackToSetup}>Back to setup</button>
          <button type="button" onClick={() => setRoute([game.startStation])}>Reset route</button>
          <button type="button" className="primary" onClick={() => submitRoute()}>Submit route</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <aside className="side-panel card">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Reference</span>
            <h2>Available Segments</h2>
          </div>
          <span className="panel-badge">{game.segments.length}</span>
        </div>
        <p className="muted">Each segment can be used once. Line changes only at interchange stations.</p>
        <div className="segments">
          {game.segments.map((segment) => (
            <div className="segment-item" key={segment.id}>
              <span className="segment-dot" aria-hidden="true" />
              <span>
                {stationById.get(segment.from_station)?.name}
                <span className="segment-arrow">→</span>
                {stationById.get(segment.to_station)?.name}
              </span>
            </div>
          ))}
        </div>
        {result && (
          <div className={`result ${result.valid ? 'success' : 'failure'}`}>
            <h2>{result.valid ? `Score: ${result.score} coins` : 'Invalid route'}</h2>
            {result.reason && <p className="result-reason">{result.reason}</p>}
            <div className="result-log">
              {result.log.map((entry, index) => (
                <div className={`log-entry ${entry.effect >= 0 ? 'positive' : 'negative'}`} key={index}>
                  <span>{entry.description}</span>
                  <strong>{entry.effect > 0 ? '+' : ''}{entry.effect}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </section>
  )
}

function InstructionsPage({ instructions, onLogin }) {
  return (
    <section className="instructions-page page-panel">
      <div className="hero-panel">
        <span className="eyebrow">Single-player underground sprint</span>
        <h2>{instructions?.title}</h2>
        <p>{instructions?.summary}</p>
        <div className="rule-grid">
          <span>90 second planning</span>
          <span>20 starting coins</span>
          <span>Random route events</span>
        </div>
      </div>
      <Login onLogin={onLogin} />
    </section>
  )
}

function SetupPage({ network, onStartGame }) {
  return (
    <section className="setup-page page-panel">
      <div className="setup-copy card">
        <span className="eyebrow">Setup page</span>
        <h2>Study the network before the lines disappear</h2>
        <p>Once the game starts, you will see station names and the segment list, but not the colored line map. Plan the path, then submit before the timer expires.</p>
        <ol className="setup-steps">
          <li>Memorize the colored routes on the map</li>
          <li>Start the game and rebuild your path station by station</li>
          <li>Submit before the 90 second timer runs out</li>
        </ol>
        <button type="button" className="primary wide" onClick={onStartGame}>Start new game</button>
      </div>
      <StationMap network={network} compact />
    </section>
  )
}

function AppNav({ user, page, onNavigate, onLogout }) {
  return (
    <nav className="app-nav" aria-label="Main navigation">
      {!user ? (
        <span className="nav-link active">Instructions</span>
      ) : (
        <>
          <button type="button" className={page === 'setup' ? 'nav-link active' : 'nav-link'} onClick={() => onNavigate('setup')}>
            Setup
          </button>
          <button type="button" className={page === 'ranking' ? 'nav-link active' : 'nav-link'} onClick={() => onNavigate('ranking')}>
            Ranking
          </button>
          <div className="user-box">
            <span className="user-avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="user-name">{user.name}</span>
            <button type="button" onClick={onLogout}>Logout</button>
          </div>
        </>
      )}
    </nav>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [instructions, setInstructions] = useState(null)
  const [ranking, setRanking] = useState([])
  const [network, setNetwork] = useState(null)
  const [game, setGame] = useState(null)
  const [page, setPage] = useState('instructions')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('last-race-theme') || 'light')

  const refreshInstructions = useCallback(async () => {
    const instructionsData = await api('/instructions')
    setInstructions(instructionsData)
  }, [])

  const refreshRanking = useCallback(async () => {
    const rankingData = await api('/ranking')
    setRanking(rankingData)
  }, [])

  const refreshPrivateData = useCallback(async () => {
    if (!user) return
    const networkData = await api('/network')
    setNetwork(networkData)
  }, [user])

  useEffect(() => {
    // Initial client/server synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([api('/session'), refreshInstructions()])
      .then(([session]) => {
        setUser(session.user)
        if (session.user) setPage('setup')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [refreshInstructions])

  useEffect(() => {
    if (!user || page !== 'ranking') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshRanking().catch((err) => setError(err.message))
  }, [user, page, refreshRanking])

  useEffect(() => {
    // Fetch authenticated-only data after the session is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPrivateData().catch((err) => setError(err.message))
  }, [refreshPrivateData])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('last-race-theme', theme)
  }, [theme])

  async function handleLogin(loggedInUser) {
    setUser(loggedInUser)
    setPage('setup')
    setError('')
  }

  async function startGame() {
    setError('')
    try {
      const data = await api('/games', { method: 'POST' })
      setGame(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function logout() {
    await api('/sessions/current', { method: 'DELETE' })
    setUser(null)
    setGame(null)
    setNetwork(null)
    setPage('instructions')
  }

  async function afterGameFinished() {
    await refreshRanking()
  }

  function navigate(nextPage) {
    setError('')
    if (!user) return
    setPage(nextPage)
    if (nextPage === 'setup') setGame(null)
  }

  function handleBackToSetup() {
    setGame(null)
    setPage('setup')
  }

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  if (loading) {
    return (
      <main className="shell loading-page">
        <div className="loader" aria-hidden="true" />
        <p>Loading Last Race...</p>
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">LR</span>
          <div>
            <span className="eyebrow">Web Applications I</span>
            <h1>Last Race</h1>
          </div>
        </div>
        <div className="top-actions">
          <AppNav user={user} page={game ? 'game' : page} onNavigate={navigate} onLogout={logout} />
          <button type="button" className="ghost" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {game ? (
        <Game game={game} onFinished={afterGameFinished} onBackToSetup={handleBackToSetup} />
      ) : user && page === 'ranking' ? (
        <RankingPage ranking={ranking} />
      ) : user && page === 'setup' ? (
        <SetupPage network={network} onStartGame={startGame} />
      ) : !user ? (
        <InstructionsPage instructions={instructions} onLogin={handleLogin} />
      ) : null}
    </main>
  )
}

export default App
