import { useEffect } from 'react'
import { useRoute } from './lib/hooks'
import { useStore } from './lib/store'
import Home from './screens/Home'
import PromptBuilder from './screens/PromptBuilder'
import ImportPlan from './screens/ImportPlan'
import DayPreview from './screens/DayPreview'
import Runner from './screens/Runner'
import History from './screens/History'
import DataScreen from './screens/Data'
import Schedule from './screens/Schedule'

const TABS = [
  { to: '/', icon: '⚡', label: 'Today' },
  { to: '/prompt', icon: '✎', label: 'Prompt' },
  { to: '/import', icon: '⇩', label: 'Import' },
  { to: '/history', icon: '≡', label: 'Log' },
  { to: '/data', icon: '⛭', label: 'Data' },
]

export default function App() {
  const [route, navigate] = useRoute()
  const { activeSession } = useStore()
  const [path, query] = route.split('?')
  const params = new URLSearchParams(query ?? '')

  useEffect(() => { window.scrollTo({ top: 0 }) }, [path])

  // The runner owns the whole screen; bail out if its session disappeared.
  useEffect(() => {
    if (path === '/run' && !activeSession) navigate('/', { replace: true })
  }, [path, activeSession, navigate])

  if (path === '/run' && activeSession) {
    return <Runner session={activeSession} navigate={navigate} />
  }

  let screen
  switch (path) {
    case '/prompt': screen = <PromptBuilder navigate={navigate} />; break
    case '/import': screen = <ImportPlan navigate={navigate} />; break
    case '/history': screen = <History navigate={navigate} />; break
    case '/data': screen = <DataScreen navigate={navigate} />; break
    case '/schedule': screen = <Schedule navigate={navigate} />; break
    case '/day': screen = <DayPreview dayId={params.get('d') ?? ''} navigate={navigate} />; break
    default: screen = <Home navigate={navigate} />
  }

  return (
    <div className="app">
      {screen}
      <nav className="tabbar">
        <div className="tabbar__inner">
          {TABS.map((tab) => (
            <button
              key={tab.to}
              type="button"
              className={`tab${path === tab.to ? ' tab--on' : ''}`}
              onClick={() => navigate(tab.to)}
            >
              <span className="tab__icon" aria-hidden>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

export type Navigate = ReturnType<typeof useRoute>[1]
