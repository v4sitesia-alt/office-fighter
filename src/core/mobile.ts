// Celular como aplicativo: instalar na tela de início (sem barra do navegador), tela cheia, tela sempre acesa.
type BIP = Event & { prompt(): Promise<void> };

export function setupMobile() {
  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const touch = matchMedia('(pointer: coarse)').matches;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const root = document.documentElement;
  if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);

  // Android/desktop Chrome: botão INSTALAR APP
  const install = document.getElementById('install') as HTMLButtonElement; let deferred: BIP | null = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; install.hidden = false; });
  install.addEventListener('click', () => { void deferred?.prompt(); deferred = null; install.hidden = true; });
  window.addEventListener('appinstalled', () => { install.hidden = true; });

  // tela cheia: botão + automática no primeiro toque em celular (o iPhone não permite; lá o caminho é instalar)
  const fs = document.getElementById('fs') as HTMLButtonElement;
  const canFs = !!root.requestFullscreen && document.fullscreenEnabled;
  const enter = () => root.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  if (canFs && !standalone) {
    fs.hidden = false;
    fs.addEventListener('click', () => { if (document.fullscreenElement) void document.exitFullscreen(); else void enter(); });
    document.addEventListener('fullscreenchange', () => { fs.textContent = document.fullscreenElement ? 'SAIR DA TELA CHEIA' : 'TELA CHEIA'; window.dispatchEvent(new Event('resize')); });
    if (touch) window.addEventListener('pointerup', () => void enter(), { once: true });
  }

  // iPhone/iPad no Safari: ensina a instalar (uma vez)
  let seen = false; try { seen = localStorage.getItem('v4f-ios-tip') === '1'; } catch { /* sem storage */ }
  if (ios && !standalone && !seen) {
    const tip = document.createElement('div'); tip.className = 'app-tip';
    tip.innerHTML = '<span>PRA JOGAR EM TELA CHEIA, SEM A BARRA DO NAVEGADOR: TOQUE EM <b>COMPARTILHAR</b> E DEPOIS EM <b>ADICIONAR À TELA DE INÍCIO</b>.</span><button type="button">OK</button>';
    tip.querySelector('button')!.addEventListener('click', () => { tip.remove(); try { localStorage.setItem('v4f-ios-tip', '1'); } catch { /* sem storage */ } });
    document.body.appendChild(tip);
  }

  // tela sempre acesa enquanto o jogo está aberto
  const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock;
  const keepAwake = () => { if (wl && document.visibilityState === 'visible') void wl.request('screen').catch(() => undefined); };
  window.addEventListener('pointerup', keepAwake, { once: true }); document.addEventListener('visibilitychange', keepAwake);

  // sem menu de contexto por toque longo nem zoom por gesto
  if (touch) { window.addEventListener('contextmenu', (e) => e.preventDefault()); document.addEventListener('gesturestart', (e) => e.preventDefault()); }
  window.addEventListener('orientationchange', () => setTimeout(() => window.dispatchEvent(new Event('resize')), 250));
}
