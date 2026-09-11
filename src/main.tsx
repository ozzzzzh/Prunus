import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// KaTeX 的样式必须显式引入（不会被 rehype-katex 自动带上），
// 否则公式会以未排版的原始字形显示。
import 'katex/dist/katex.min.css'
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
