import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ContactosPage } from './pages/ContactosPage'
import { FichaContactoPage } from './pages/FichaContactoPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <header className="border-b border-slate-800 px-8 py-4">
          <span className="font-semibold tracking-tight">Signal IQ</span>
          <span className="ml-2 text-sm text-slate-500">CRM nativo — Tutellus</span>
        </header>
        <Routes>
          <Route path="/" element={<ContactosPage />} />
          <Route path="/contactos/:id" element={<FichaContactoPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
