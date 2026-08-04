import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@duokai/ui/styles.css'
import './index.css'
import App from './App.tsx'
import { RendererErrorBoundary } from './components/RendererErrorBoundary'
import './lib/i18n-client'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RendererErrorBoundary>
      <App />
    </RendererErrorBoundary>
  </StrictMode>,
)
