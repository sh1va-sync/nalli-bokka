import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

const DISMISSED_KEY = 'nallibokka-install-prompt-dismissed'

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false)
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [installed, setInstalled] = useState(isStandalone)
  const isIos = isIosDevice()
  const isMobile = window.matchMedia('(max-width: 767px)').matches

  useEffect(() => {
    function onBeforeInstallPrompt(event) {
      event.preventDefault()
      setInstallEvent(event)
    }
    function onAppInstalled() {
      setInstalled(true)
      setInstallEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    navigator.serviceWorker?.ready.then(() => setServiceWorkerReady(true))
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  if (dismissed || installed || (!installEvent && !isIos && !(isMobile && serviceWorkerReady))) return null

  async function installApp() {
    if (!installEvent) {
      setInstructionsOpen(true)
      return
    }
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setInstallEvent(null)
  }

  function dismissPrompt() {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // Dismiss this visit even when persistent storage is unavailable.
    }
    setDismissed(true)
    setInstructionsOpen(false)
  }

  return (
    <aside className="fixed inset-x-3 bottom-[4.75rem] z-40 mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-white p-3 shadow-[0_12px_36px_-14px_rgba(48,36,31,.3)] md:bottom-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]">
        <Download size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-[var(--text-primary)]">Add NalliBokka to your home screen</p>
        {instructionsOpen
          ? <p className="mt-1 flex items-center gap-1 text-[10px] leading-4 text-[var(--text-secondary)]">{isIos ? <>Tap <Share size={12} /> Share, then choose “Add to Home Screen”.</> : 'Open your browser menu, then choose “Install app” or “Add to Home screen”.'}</p>
          : <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">Open your store faster, right from your home screen.</p>}
      </div>
      {!instructionsOpen && <button type="button" onClick={installApp} className="shrink-0 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--brand-primary-hover)]">
        {isIos ? 'How to add' : installEvent ? 'Install' : 'Add to home'}
      </button>}
      <button type="button" onClick={dismissPrompt} aria-label="Dismiss install prompt" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]">
        <X size={16} />
      </button>
    </aside>
  )
}
