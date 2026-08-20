import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { DashboardPage } from './pages/DashboardPage'
import { ContactosPage } from './pages/ContactosPage'
import { FichaContactoPage } from './pages/FichaContactoPage'
import { PipelinePage } from './pages/PipelinePage'
import { ActividadGlobalPage } from './pages/ActividadGlobalPage'
import { WikiArticlePage } from './pages/WikiArticlePage'
import { TouchpointsPage } from './pages/TouchpointsPage'
import { VocExplorerPage } from './pages/VocExplorerPage'
import { ConstructorPanelPage } from './pages/ConstructorPanelPage'

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `text-sm ${isActive ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'}`
      }
    >
      {children}
    </NavLink>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <header className="flex items-center gap-6 border-b border-slate-800 px-8 py-4">
          <div>
            <span className="font-semibold tracking-tight">Signal IQ</span>
            <span className="ml-2 text-sm text-slate-500">CRM nativo — Tutellus</span>
          </div>
          <nav className="flex gap-4">
            <NavItem to="/">Resumen</NavItem>
            <NavItem to="/contactos">Contactos</NavItem>
            <NavItem to="/pipeline">Pipeline</NavItem>
            <NavItem to="/actividad">Actividad</NavItem>
            <NavItem to="/voc">VOC Explorer</NavItem>
            <NavItem to="/touchpoints">Touchpoints</NavItem>
            <NavItem to="/constructor-panel">Constructor de Panel</NavItem>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/contactos" element={<ContactosPage />} />
          <Route path="/contactos/:id" element={<FichaContactoPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/actividad" element={<ActividadGlobalPage />} />
          <Route path="/wiki/:slug" element={<WikiArticlePage />} />
          <Route path="/touchpoints" element={<TouchpointsPage />} />
          <Route path="/voc" element={<VocExplorerPage />} />
          <Route path="/constructor-panel" element={<ConstructorPanelPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
