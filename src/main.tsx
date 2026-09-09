import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import logo from './assets/PrunusLogoHighQuality.jpg'; 

const link = document.createElement('link');
link.type = 'image/jpeg';
link.rel = 'icon';
link.href = logo;
document.head.appendChild(link);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
