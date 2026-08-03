import { Baby, FileText, Home } from 'lucide-react'

type Page = 'home' | 'scan' | 'history'

interface NavBarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

export default function NavBar({ currentPage, onNavigate }: NavBarProps) {
  const navItems: { page: Page; label: string; icon: React.ReactNode }[] = [
    { page: 'home', label: 'Dashboard', icon: <Home size={15} /> },
    { page: 'scan', label: 'New Scan', icon: <Baby size={15} /> },
    { page: 'history', label: 'Patient History', icon: <FileText size={15} /> },
  ]

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(8, 12, 24, 0.97)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(56,189,248,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 56,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)'
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 12px rgba(14,165,233,0.5)'
        }}>
          <Baby size={18} color="white" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.3px' }}>
            Fetal Diagnostic Platform
          </div>
          <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 500, letterSpacing: '0.5px' }}>
            FMF · ISUOG · Hadlock Protocol
          </div>
        </div>
      </div>

      {/* Nav Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {navItems.map(({ page, label, icon }) => {
          const isActive = currentPage === page
          return (
            <button
              key={page}
              type="button"
              onClick={() => onNavigate(page)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s ease',
                border: isActive ? '1px solid rgba(56,189,248,0.5)' : '1px solid transparent',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(99,102,241,0.15))'
                  : 'transparent',
                color: isActive ? '#38bdf8' : '#94a3b8',
                boxShadow: isActive ? '0 0 12px rgba(14,165,233,0.15)' : 'none'
              }}
            >
              {icon}
              <span style={{ display: 'none' }} className="nav-label">{label}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
