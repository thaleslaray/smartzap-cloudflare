# 📚 Guia de Comandos Customizados - Engenharia Reversa

## 🎯 O Que São Slash Commands?

Slash commands são **prompts reutilizáveis** que você cria como arquivos Markdown. Quando você executa `/comando`, o Claude lê o arquivo e segue as instruções automaticamente.

---

## 🏗️ Anatomia de um Comando

### Estrutura Básica

```markdown
---
description: Descrição curta do comando
---

## User Input
$ARGUMENTS

## Goal
O que o comando faz

## Execution Steps
### 1. Passo 1
**YOU MUST NOW [ação]:**
[Comandos específicos]

## Success Criteria
✅ Checklist de conclusão
```

### Componentes Essenciais

| Componente | Obrigatório | Propósito |
|------------|-------------|-----------|
| `description` | ✅ | Aparece na lista de comandos |
| `User Input` | ⚠️ | Captura argumentos opcionais |
| `Goal` | ✅ | Define objetivo do comando |
| `Execution Steps` | ✅ | Passos a executar |
| `Success Criteria` | ⚠️ | Checklist de validação |

---

## 🔍 Engenharia Reversa do `/specswarm:analyze-quality`

### 1. Localização
```bash
~/.claude/plugins/marketplaces/specswarm-marketplace/commands/analyze-quality.md
```

### 2. Técnicas Usadas

#### A. Comandos Imperativos
```markdown
**YOU MUST NOW initialize the analysis using the Bash tool:**
```
- **Técnica:** Usar "YOU MUST NOW" força execução imediata
- **Resultado:** Claude executa sem hesitar

#### B. Análise Multi-Ferramenta
```markdown
1. **Find all source files** using Bash:
   ```bash
   find ${REPO_ROOT} -type f -name "*.ts"
   ```

2. **Scan for anti-patterns** using Grep:
   ```bash
   grep -rn "useEffect.*fetch" app/
   ```
```
- **Técnica:** Combinar Bash + Grep + Read
- **Resultado:** Análise completa e precisa

#### C. Scoring System
```markdown
- Test Coverage: Has tests? (+25 points)
- Documentation: Has JSDoc? (+15 points)
- Architecture: Clean? (+20 points)
- Security: Secure? (+20 points)
- Performance: Optimized? (+20 points)
Total: 0-100 points
```
- **Técnica:** Sistema de pontuação objetivo
- **Resultado:** Métricas quantificáveis

#### D. Priorização por Impacto
```markdown
1. **Critical Priority** (security, production failures)
2. **High Priority** (quality, maintainability)
3. **Medium Priority** (improvement opportunities)
4. **Low Priority** (nice-to-have)
```
- **Técnica:** Categorização por severidade
- **Resultado:** Roadmap claro de ações

---

## 💡 Como Criar Seus Próprios Comandos

### Passo 1: Escolha um Diretório

**Opção A: Projeto Local**
```bash
mkdir -p .claude/commands
```

**Opção B: Global (todos os projetos)**
```bash
mkdir -p ~/.claude/commands
```

### Passo 2: Crie o Arquivo

```bash
# Formato: nome-do-comando.md
touch .claude/commands/analyze-api-routes.md
```

### Passo 3: Estruture o Comando

```markdown
---
description: Analisa rotas API do projeto
---

## Goal
Verificar se todas as rotas API têm:
- Validação de input
- Tratamento de erros
- Rate limiting
- Documentação

## Execution Steps

### 1. Find API Routes
**YOU MUST NOW find all API routes:**
```bash
find app/api -name "route.ts" -o -name "*.route.ts"
```

### 2. Check Validation
**YOU MUST NOW check for input validation:**
```bash
grep -rn "zod\|yup\|validate" app/api/
```

### 3. Generate Report
**YOU MUST NOW create summary report:**
- Routes without validation: {COUNT}
- Routes without error handling: {COUNT}
- Routes without docs: {COUNT}
```

### Passo 4: Teste o Comando

```bash
# No chat do Claude Code
/analyze-api-routes
```

---

## 🛠️ Exemplos Práticos

### Exemplo 1: Análise de Dependências

```markdown
---
description: Analisa dependências do package.json
---

## Goal
Verificar dependências desatualizadas e vulnerabilidades

## Execution Steps

### 1. Check Outdated Packages
**YOU MUST NOW check for outdated packages:**
```bash
npm outdated --json
```

### 2. Check for Vulnerabilities
**YOU MUST NOW run security audit:**
```bash
npm audit --json
```

### 3. Display Results
**YOU MUST NOW show summary:**
- Total dependencies: {COUNT}
- Outdated: {COUNT}
- Vulnerabilities: {CRITICAL}/{HIGH}/{MEDIUM}/{LOW}
```

### Exemplo 2: Análise de Imports

```markdown
---
description: Encontra imports não utilizados
---

## Goal
Identificar imports que podem ser removidos

## Execution Steps

### 1. Find All Imports
**YOU MUST NOW find all import statements:**
```bash
grep -rn "^import" app/ src/ lib/ --include="*.ts" --include="*.tsx"
```

### 2. Check Usage
**YOU MUST NOW check if imports are used:**
```bash
# Para cada import encontrado
# Buscar se o símbolo importado é usado no arquivo
```

### 3. Generate Report
**YOU MUST NOW list unused imports:**
- Total imports: {COUNT}
- Unused imports: {COUNT}
- Files affected: {LIST}
```

### Exemplo 3: Análise de Performance

```markdown
---
description: Identifica potenciais problemas de performance
---

## Goal
Encontrar código que pode causar problemas de performance

## Execution Steps

### 1. Find Large Re-renders
**YOU MUST NOW find components that re-render frequently:**
```bash
# Buscar componentes sem React.memo
grep -rn "export.*function" components/ | grep -v "React.memo"
```

### 2. Find Expensive Operations in Render
**YOU MUST NOW find operations that should be memoized:**
```bash
# Buscar .map, .filter, .sort dentro de JSX
grep -rn "\.map\|\.filter\|\.sort" components/ --include="*.tsx"
```

### 3. Find Missing useMemo/useCallback
**YOU MUST NOW count optimization hooks:**
```bash
grep -rn "useMemo\|useCallback" components/ | wc -l
```

### 4. Display Recommendations
**YOU MUST NOW show performance issues:**
- Components without memo: {COUNT}
- Expensive operations in render: {COUNT}
- Missing useMemo/useCallback: {COUNT}
```

---

## 🎨 Padrões Avançados

### Pattern 1: Análise Condicional

```markdown
### 2. Check Framework
**YOU MUST NOW detect framework:**

1. **Check if Next.js:**
   ```bash
   grep -q "next" package.json && echo "Next.js detected"
   ```

2. **If Next.js, check App Router:**
   ```bash
   [ -d "app" ] && echo "Using App Router"
   ```

3. **Run framework-specific checks:**
   - If App Router: Check Server Components
   - If Pages Router: Check getServerSideProps
```

### Pattern 2: Análise Incremental

```markdown
### 3. Progressive Analysis
**YOU MUST NOW analyze in stages:**

1. **Quick scan (< 5 seconds):**
   - Count files
   - Detect patterns

2. **Deep analysis (if needed):**
   - Read file contents
   - Parse AST
   - Generate metrics

3. **Only if issues found:**
   - Detailed recommendations
   - Code examples
   - Fix commands
```

### Pattern 3: Comparação com Baseline

```markdown
### 4. Track Improvements
**YOU MUST NOW compare with previous run:**

1. **Load previous report:**
   ```bash
   cat .specswarm/previous-analysis.json
   ```

2. **Calculate delta:**
   - Previous score: {OLD_SCORE}
   - Current score: {NEW_SCORE}
   - Improvement: {DELTA}

3. **Display trend:**
   ```
   📈 Quality Trend
   ================

   Last Week: 52/100
   Today:     67/100
   Change:    +15 points ✅
   ```
```

---

## 🚀 Comandos Prontos para Usar

Criei 2 comandos customizados para você:

### 1. Template Genérico
**Arquivo:** `.claude/commands/custom-analysis-template.md`
**Uso:** Copie e adapte para suas necessidades

### 2. Análise de Componentes React
**Arquivo:** `.claude/commands/analyze-components.md`
**Uso:** `/analyze-components`
**Analisa:**
- Tamanho dos componentes
- TypeScript props
- Complexidade (hooks)
- Oportunidades de componentização

---

## 📋 Checklist para Criar Comando de Qualidade

- [ ] **Descrição clara** no frontmatter
- [ ] **Goal bem definido** (o que vai analisar)
- [ ] **Passos numerados** e sequenciais
- [ ] **Comandos Bash testados** (executáveis)
- [ ] **Display de resultados** formatado
- [ ] **Priorização de issues** (Critical/High/Med/Low)
- [ ] **Recomendações acionáveis** (como resolver)
- [ ] **Relatório salvo** em arquivo
- [ ] **Success criteria** definido
- [ ] **Testado em projeto real**

---

## 🎯 Próximos Passos

### 1. Teste os Comandos Criados
```bash
# Testar análise de componentes
/analyze-components

# Criar variações
/analyze-components --verbose
```

### 2. Crie Seus Próprios Comandos

**Ideias:**
- `/analyze-database-queries` - Verifica queries N+1
- `/analyze-bundle-size` - Analisa tamanho dos bundles
- `/analyze-accessibility` - Verifica a11y issues
- `/analyze-i18n` - Verifica traduções faltando
- `/analyze-env-vars` - Lista variáveis de ambiente usadas

### 3. Compartilhe com o Time

```bash
# Commitar comandos customizados
git add .claude/commands/
git commit -m "Add custom analysis commands"
git push
```

---

## 🔗 Recursos Adicionais

**Documentação Oficial:**
- Claude Code Slash Commands: https://github.com/anthropics/claude-code
- SpecSwarm Commands: ~/.claude/plugins/marketplaces/specswarm-marketplace/commands/

**Comandos Existentes para Estudar:**
```bash
ls ~/.claude/plugins/marketplaces/specswarm-marketplace/commands/
```

**Arquivo de Referência:**
- `analyze-quality.md` - Análise completa de qualidade
- `ship.md` - Workflow de deploy
- `security-audit.md` - Auditoria de segurança
- `refactor.md` - Refatoração guiada

---

## 💬 Dúvidas Comuns

**P: Onde devo criar meus comandos?**
R: `.claude/commands/` (local) ou `~/.claude/commands/` (global)

**P: Como listar comandos disponíveis?**
R: Digite `/` no chat e veja a lista

**P: Posso sobrescrever comandos do SpecSwarm?**
R: Sim, comandos locais têm prioridade sobre globais

**P: Como debugar um comando que não funciona?**
R: Adicione `echo` statements no Bash e leia o output

**P: Posso usar variáveis entre passos?**
R: Não diretamente. Use arquivos temporários ou capture output.

---

**Criado:** 2025-11-30
**Versão:** 1.0
**Autor:** Engenharia Reversa de /specswarm:analyze-quality
