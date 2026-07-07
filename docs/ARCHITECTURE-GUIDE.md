# Guia de Arquitetura: Começando Certo

Lições aprendidas da refatoração do SmartZap. Siga este guia para evitar retrabalho.

## TL;DR - A Regra de Ouro

```
┌─────────────────────────────────────────────────────────────┐
│  NUNCA escreva lógica de negócio dentro de componentes      │
│  ou hooks. Sempre extraia para funções puras primeiro.      │
└─────────────────────────────────────────────────────────────┘
```

---

## Estrutura de Pastas (Dia 1)

Crie esta estrutura **antes** de escrever qualquer código:

```
src/
├── lib/
│   ├── business/          ← Lógica de negócio PURA (sem React)
│   │   ├── [domain]/      # Ex: campaign/, contact/, template/
│   │   │   ├── rules.ts       # Regras de negócio
│   │   │   ├── validation.ts  # Validações
│   │   │   ├── transforms.ts  # Transformações de dados
│   │   │   └── index.ts       # Barrel export
│   │   └── index.ts
│   ├── utils/             ← Utilitários genéricos
│   └── constants.ts       ← Constantes da aplicação
│
├── services/              ← API clients (fetch puro)
│   ├── [domain]Service.ts
│   └── index.ts
│
├── types/                 ← Tipos TypeScript
│   ├── [domain].types.ts
│   └── index.ts
│
├── hooks/                 ← Apenas state management React
│   └── use[Domain].ts
│
└── components/            ← Apenas UI
    ├── ui/                # Primitivos (Button, Input)
    └── features/          # Features específicas
        └── [domain]/
```

---

## As 5 Regras de Ouro

### 1. Lógica de Negócio = Funções Puras

**❌ ERRADO** (lógica dentro do hook):
```typescript
// hooks/useContacts.ts
export function useContacts() {
  const [contacts, setContacts] = useState([])

  // ❌ Lógica de negócio DENTRO do hook
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (tagFilter && !c.tags?.includes(tagFilter)) {
        return false
      }
      return true
    })
  }, [contacts, searchTerm, tagFilter])
}
```

**✅ CERTO** (lógica extraída):
```typescript
// lib/business/contact/filtering.ts
export interface ContactFilterCriteria {
  searchTerm?: string
  tagFilter?: string
}

export function filterContacts(
  contacts: Contact[],
  criteria: ContactFilterCriteria
): Contact[] {
  return contacts.filter(c => {
    if (criteria.searchTerm && !c.name.toLowerCase().includes(criteria.searchTerm.toLowerCase())) {
      return false
    }
    if (criteria.tagFilter && !c.tags?.includes(criteria.tagFilter)) {
      return false
    }
    return true
  })
}

// hooks/useContacts.ts
import { filterContacts } from '@/lib/business/contact'

export function useContacts() {
  const [contacts, setContacts] = useState([])

  // ✅ Hook apenas ORQUESTRA, não implementa
  const filteredContacts = useMemo(
    () => filterContacts(contacts, { searchTerm, tagFilter }),
    [contacts, searchTerm, tagFilter]
  )
}
```

### 2. Services = Fetch Puro (Sem Estado)

**❌ ERRADO**:
```typescript
// services/contactService.ts
import { useQuery } from '@tanstack/react-query' // ❌ React no service!

export function useContactService() { // ❌ Hook no service!
  return useQuery(['contacts'], fetchContacts)
}
```

**✅ CERTO**:
```typescript
// services/contactService.ts
export const contactService = {
  async list(): Promise<Contact[]> {
    const res = await fetch('/api/contacts')
    if (!res.ok) throw new Error('Failed to fetch')
    return res.json()
  },

  async getById(id: string): Promise<Contact | null> {
    const res = await fetch(`/api/contacts/${id}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error('Failed to fetch')
    return res.json()
  },

  async create(data: CreateContactInput): Promise<Contact> {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error('Failed to create')
    return res.json()
  }
}

// hooks/useContacts.ts - React Query AQUI
import { useQuery } from '@tanstack/react-query'
import { contactService } from '@/services'

export function useContacts() {
  return useQuery(['contacts'], () => contactService.list())
}
```

### 3. Types = Um Arquivo por Domínio

**❌ ERRADO**:
```typescript
// types.ts (arquivo gigante com 2000 linhas)
export interface Contact { ... }
export interface Campaign { ... }
export interface Template { ... }
export type ContactStatus = ...
export type CampaignStatus = ...
// ... 500 tipos misturados
```

**✅ CERTO**:
```typescript
// types/contact.types.ts
export interface Contact {
  id: string
  name: string
  phone: string
  // ...
}

export type ContactStatus = 'active' | 'blocked' | 'unsubscribed'

// types/campaign.types.ts
export interface Campaign {
  id: string
  name: string
  // ...
}

export enum CampaignStatus {
  DRAFT = 'draft',
  SENDING = 'sending',
  // ...
}

// types/index.ts (barrel export)
export * from './contact.types'
export * from './campaign.types'
export * from './template.types'
```

### 4. Componentes = Apenas Renderização

**❌ ERRADO**:
```tsx
// components/ContactList.tsx
export function ContactList() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // ❌ Fetch dentro do componente
  useEffect(() => {
    setLoading(true)
    fetch('/api/contacts')
      .then(r => r.json())
      .then(setContacts)
      .finally(() => setLoading(false))
  }, [])

  // ❌ Lógica dentro do componente
  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return <div>...</div>
}
```

**✅ CERTO**:
```tsx
// components/ContactList.tsx
import { useContacts } from '@/hooks/useContacts'

export function ContactList() {
  const {
    contacts,      // Já filtrados
    isLoading,
    searchTerm,
    setSearchTerm
  } = useContacts()

  // ✅ Componente só renderiza
  if (isLoading) return <Skeleton />

  return (
    <div>
      <SearchInput value={searchTerm} onChange={setSearchTerm} />
      {contacts.map(c => <ContactCard key={c.id} contact={c} />)}
    </div>
  )
}
```

### 5. Hooks = Apenas Orquestração de Estado

O hook é o "controller" que conecta business logic + services + React state:

```typescript
// hooks/useContacts.ts
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactService } from '@/services'
import { filterContacts, validateContact } from '@/lib/business/contact'

export function useContacts() {
  // Estado local
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Fetch via service
  const query = useQuery(['contacts'], () => contactService.list())

  // Lógica via business layer
  const filteredContacts = useMemo(
    () => filterContacts(query.data ?? [], { searchTerm }),
    [query.data, searchTerm]
  )

  // Mutations
  const queryClient = useQueryClient()
  const createMutation = useMutation({
    mutationFn: (data: CreateContactInput) => {
      // Validação via business layer
      const validation = validateContact(data)
      if (!validation.valid) throw new Error(validation.error)
      return contactService.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contacts'])
    }
  })

  return {
    contacts: filteredContacts,
    isLoading: query.isLoading,
    searchTerm,
    setSearchTerm,
    selectedIds,
    setSelectedIds,
    createContact: createMutation.mutate,
    isCreating: createMutation.isPending,
  }
}
```

---

## Checklist: Novo Projeto

### Dia 1: Setup

- [ ] Criar estrutura de pastas (lib/business, services, types, hooks, components)
- [ ] Configurar path aliases (`@/lib`, `@/services`, etc.)
- [ ] Criar arquivos index.ts (barrel exports) em cada pasta
- [ ] Configurar ESLint com regras de import

### Antes de Cada Feature

Ordem de implementação:

```
1. types/[domain].types.ts     ← Defina os tipos primeiro
2. lib/business/[domain]/      ← Implemente lógica pura
3. services/[domain]Service.ts ← Implemente API client
4. hooks/use[Domain].ts        ← Conecte tudo
5. components/features/[domain] ← UI por último
```

### Regras ESLint Recomendadas

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    // Proíbe imports de React em lib/business
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['react', 'react-dom', '@tanstack/react-query'],
            message: 'Não use React em lib/business/ - apenas funções puras!'
          }
        ]
      }
    ]
  },
  overrides: [
    {
      // Apenas hooks e components podem usar React
      files: ['hooks/**', 'components/**'],
      rules: {
        'no-restricted-imports': 'off'
      }
    }
  ]
}
```

---

## Teste Mental: "Posso Usar em Svelte?"

Antes de commitar, pergunte-se:

> "Se eu copiar este arquivo para um projeto Svelte, ele funciona sem modificações?"

- **lib/business/** → ✅ Sim (funções puras)
- **services/** → ✅ Sim (fetch puro)
- **types/** → ✅ Sim (TypeScript puro)
- **hooks/** → ❌ Não (React-specific) - OK!
- **components/** → ❌ Não (React-specific) - OK!

Se você encontrar lógica de negócio em hooks ou components que **deveria** funcionar em Svelte, extraia para lib/business/.

---

## Template de Novo Domínio

Quando adicionar uma nova feature (ex: "invoices"):

```bash
# 1. Tipos
touch types/invoice.types.ts

# 2. Business logic
mkdir -p lib/business/invoice
touch lib/business/invoice/{rules,validation,transforms,index}.ts

# 3. Service
touch services/invoiceService.ts

# 4. Hook
touch hooks/useInvoices.ts

# 5. Components
mkdir -p components/features/invoices
touch components/features/invoices/{InvoiceList,InvoiceCard,InvoiceForm}.tsx
```

### Conteúdo Inicial

```typescript
// types/invoice.types.ts
export interface Invoice {
  id: string
  amount: number
  status: InvoiceStatus
  // ...
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

// lib/business/invoice/validation.ts
import type { Invoice } from '@/types'

export interface InvoiceValidationResult {
  valid: boolean
  errors: string[]
}

export function validateInvoice(invoice: Partial<Invoice>): InvoiceValidationResult {
  const errors: string[] = []

  if (!invoice.amount || invoice.amount <= 0) {
    errors.push('Amount must be positive')
  }

  return { valid: errors.length === 0, errors }
}

// lib/business/invoice/index.ts
export * from './validation'
export * from './rules'
export * from './transforms'

// services/invoiceService.ts
import type { Invoice } from '@/types'

export const invoiceService = {
  async list(): Promise<Invoice[]> {
    const res = await fetch('/api/invoices')
    if (!res.ok) throw new Error('Failed to fetch invoices')
    return res.json()
  },
  // ...
}

// hooks/useInvoices.ts
import { useQuery } from '@tanstack/react-query'
import { invoiceService } from '@/services'
import { validateInvoice } from '@/lib/business/invoice'

export function useInvoices() {
  const query = useQuery(['invoices'], () => invoiceService.list())
  // ...
  return { invoices: query.data ?? [], isLoading: query.isLoading }
}
```

---

## Resumo: O Que Evita Retrabalho

| Princípio | Benefício |
|-----------|-----------|
| Lógica em funções puras | Testável, portável, reutilizável |
| Services sem estado | Funciona com qualquer framework |
| Tipos por domínio | Fácil de encontrar e manter |
| Hooks como orquestradores | Substituível por Svelte stores |
| Componentes só renderizam | Menos bugs, mais simples |

**Tempo investido no início: ~2 horas**
**Tempo economizado depois: ~40 horas de refatoração**

---

## Referências

- [Bulletproof React](https://github.com/alan2207/bulletproof-react) - Arquitetura similar
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) - Conceitos base
- [Colocation](https://kentcdodds.com/blog/colocation) - Onde colocar cada coisa
