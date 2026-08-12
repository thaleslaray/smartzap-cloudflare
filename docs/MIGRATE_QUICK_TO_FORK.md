# Migrar da instalação rápida para um fork

A instalação rápida não se transforma automaticamente em fork. A migração é
deliberada para não sobrescrever recursos ou dados.

1. Crie o fork e conecte-o ao Workers Builds sem publicar em produção.
2. Identifique versão, commit/schema da instalação rápida e exporte configuração
   não secreta.
3. Capture bookmark D1 e backup R2.
4. Configure um staging físico no fork e valide `/setup`.
5. Planeje a janela: preserve nomes/IDs somente quando o ledger confirmar a
   mesma instalação; caso contrário use recursos novos e migração de dados.
6. Cadastre os secrets diretamente na Cloudflare do fork.
7. Migre, valide Meta/webhook/Queues e faça a troca controlada de tráfego.
8. Só remova o Worker rápido depois do período de rollback.

O provisionador não transfere OAuth, chaves ou tokens para o GitHub. A execução
é responsabilidade do proprietário ou de serviço contratado separadamente.
