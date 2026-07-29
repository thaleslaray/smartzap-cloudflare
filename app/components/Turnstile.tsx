import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render(container: HTMLElement, options: {
    sitekey: string
    callback(token: string): void
    'expired-callback'(): void
    'error-callback'(): void
    theme: 'dark'
    action: 'login'
  }): string
  remove(widgetId: string): void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_ID = 'cloudflare-turnstile-script'

export function Turnstile({ siteKey, onToken }: {
  siteKey: string
  onToken(token: string | null): void
}) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let widgetId: string | null = null
    const render = () => {
      if (!container.current || !window.turnstile || widgetId) return
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
        theme: 'dark',
        action: 'login',
      })
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    if (window.turnstile) render()
    else script.addEventListener('load', render)

    return () => {
      script?.removeEventListener('load', render)
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
      onToken(null)
    }
  }, [siteKey, onToken])

  return <div ref={container} className="flex min-h-[65px] justify-center" />
}
