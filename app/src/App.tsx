import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { ContactosPage } from './pages/ContactosPage'
import { FichaContactoPage } from './pages/FichaContactoPage'
import { PipelinePage } from './pages/PipelinePage'

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
            <NavItem to="/">Contactos</NavItem>
            <NavItem to="/pipeline">Pipeline</NavItem>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<ContactosPage />} />
          <Route path="/contactos/:id" element={<FichaContactoPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
