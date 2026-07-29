import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import PwaManager from './components/PwaManager'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary><PwaManager /><App /></ErrorBoundary>,
)
