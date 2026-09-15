import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { StoreProvider } from './lib/store'
import { FlashProvider } from './components/ui'
import './styles.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <FlashProvider>
        <App />
      </FlashProvider>
    </StoreProvider>
  </StrictMode>,
)
