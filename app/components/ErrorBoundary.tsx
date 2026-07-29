import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Card, Logo, btnPrimary, btnSecondary } from './ui'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // A resposta de recuperação é deliberadamente local: detalhes podem conter
    // dados do operador e não devem ser enviados a serviços de terceiros.
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
        <Card className="w-full max-w-md p-7 text-center">
          <div className="mb-4 flex justify-center"><Logo size={42} /></div>
          <h1 className="text-xl font-bold">A tela encontrou um erro</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Nenhum disparo foi iniciado por esta falha. Recarregue para buscar novamente o estado salvo no servidor.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <a href="/" className={btnSecondary}>Ir ao dashboard</a>
            <button className={btnPrimary} onClick={() => location.reload()}>Recarregar</button>
          </div>
        </Card>
      </main>
    )
  }
}

