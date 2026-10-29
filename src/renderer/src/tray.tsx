import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TrayMenu } from './components/TrayMenu'
import './tray.css'

createRoot(document.getElementById('tray-root') as HTMLElement).render(
  <StrictMode>
    <TrayMenu />
  </StrictMode>
)
