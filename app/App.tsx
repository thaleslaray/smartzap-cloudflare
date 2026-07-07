import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'
import Shell from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import CampaignNew from './pages/CampaignNew'
import CampaignDetail from './pages/CampaignDetail'
import Contacts from './pages/Contacts'
import Templates from './pages/Templates'
import SettingsPage from './pages/Settings'
import { useRealtime } from './hooks/useRealtime'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

function AuthedApp() {
  useRealtime() // WS de invalidação — Task 17
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/new" element={<CampaignNew />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="templates" element={<Templates />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<AuthedApp />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
