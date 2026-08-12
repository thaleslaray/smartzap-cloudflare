# Privacidade e retenção OAuth

O provisionador usa Authorization Code com PKCE e permissões Cloudflare
declaradas na tela de consentimento. Ele não recebe a senha da Cloudflare.

Durante uma instalação rápida:

- estado, verificador PKCE e token OAuth ficam cifrados no D1 do control plane;
- a chave de cifra é secret do Worker e não fica no Git;
- a sessão expira em até 30 minutos;
- token e sessão são removidos após instalação, desconexão ou limpeza periódica;
- a revogação remota é tentada antes da exclusão local;
- logs e respostas não contêm token em plaintext;
- Account ID e nomes técnicos necessários ao ledger podem ser retidos para
  segurança, retomada e auditoria operacional sem armazenar credenciais.

Na rota fork-first não há OAuth do provisionador: a autorização GitHub e
Cloudflare ocorre diretamente entre o usuário e esses provedores. Valores
gerados no navegador não são enviados nem gravados pela página.
