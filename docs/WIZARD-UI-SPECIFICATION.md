# Especificação de UI: Wizard de Instalação SmartZap

> Documento técnico com especificações detalhadas de componentes para implementação do wizard de instalação, baseado nos padrões do CRM e integrado com o Design System existente do SmartZap.

---

## 1. Visão Geral

### Estrutura de Arquivos

```
app/
└── (auth)/
    └── install/
        ├── page.tsx              # Router (decide start vs wizard)
        ├── start/
        │   └── page.tsx          # Coleta de tokens (5 telas)
        └── wizard/
            └── page.tsx          # Provisioning automático

components/
└── install/
    ├── InstallLayout.tsx         # Layout base com gradient
    ├── StepDots.tsx              # Indicador de progresso (dots)
    ├── StepCard.tsx              # Card com glow para cada step
    ├── TokenInput.tsx            # Input especializado para tokens
    ├── ServiceIcon.tsx           # Ícones animados por serviço
    ├── ValidatingOverlay.tsx     # Overlay de validação
    ├── SuccessCheckmark.tsx      # Animação de sucesso
    ├── ErrorShake.tsx            # Feedback de erro com shake
    └── steps/
        ├── IdentityStep.tsx      # Tela 1: email + senha
        ├── VercelStep.tsx        # Tela 2: token Vercel
        ├── SupabaseStep.tsx      # Tela 3: PAT Supabase
        ├── QStashStep.tsx        # Tela 4: token + signing key
        └── RedisStep.tsx         # Tela 5: REST URL + token
```

---

## 2. Layout Base: InstallLayout

### Propósito
Container principal do wizard com background gradient, centralização e responsividade.

### Visual

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    ┌─────────────────────────┐                   │
│                    │       SmartZap          │ ← Logo animado    │
│                    │      Installation       │                   │
│                    └─────────────────────────┘                   │
│                                                                  │
│                        ○ ○ ● ○ ○                                 │ ← StepDots
│                                                                  │
│              ╔═══════════════════════════════════╗               │
│              ║                                   ║               │
│              ║          [Step Content]           ║ ← Card com glow
│              ║                                   ║               │
│              ╚═══════════════════════════════════╝               │
│                            ↑                                     │
│                    emerald glow sutil                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
           ↑
   Gradient diagonal: zinc-950 → zinc-900 → emerald-950/20
```

### Especificação Técnica

```tsx
// components/install/InstallLayout.tsx
'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface InstallLayoutProps {
  children: ReactNode;
  currentStep?: number;
  totalSteps?: number;
}

export function InstallLayout({
  children,
  currentStep = 1,
  totalSteps = 5
}: InstallLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 install-bg">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <h1 className="text-2xl font-display font-bold text-zinc-100">
          SmartZap
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Installation Wizard</p>
      </motion.div>

      {/* Step Dots */}
      <StepDots current={currentStep} total={totalSteps} />

      {/* Content */}
      <div className="w-full max-w-md mt-8">
        {children}
      </div>
    </div>
  );
}
```

### CSS (adicionar ao globals.css)

```css
/* Install wizard background */
.install-bg {
  background: linear-gradient(
    135deg,
    var(--ds-bg-base) 0%,
    var(--ds-bg-elevated) 50%,
    hsl(164 86% 16% / 0.1) 100%
  );
  background-attachment: fixed;
}

/* Animated gradient (opcional) */
.install-bg-animated {
  background: linear-gradient(
    -45deg,
    var(--ds-bg-base),
    var(--ds-bg-elevated),
    hsl(164 86% 16% / 0.15),
    var(--ds-bg-base)
  );
  background-size: 400% 400%;
  animation: gradientShift 15s ease infinite;
}

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

---

## 3. Componente: StepDots

### Propósito
Indicador de progresso visual com 5 dots, mostrando step atual e completados.

### Estados

| Estado | Visual | Escala |
|--------|--------|--------|
| Pendente | `bg-zinc-700` | 1.0x |
| Atual | `bg-emerald-500` | 1.2x + pulse |
| Completado | `bg-emerald-500/50` | 1.0x |

### Especificação Técnica

```tsx
// components/install/StepDots.tsx
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StepDotsProps {
  current: number;
  total: number;
  completedSteps?: number[];
}

export function StepDots({ current, total, completedSteps = [] }: StepDotsProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isCompleted = completedSteps.includes(stepNum) || stepNum < current;

        return (
          <motion.div
            key={i}
            className={cn(
              'w-2.5 h-2.5 rounded-full transition-colors duration-200',
              isActive && 'bg-emerald-500',
              isCompleted && !isActive && 'bg-emerald-500/50',
              !isActive && !isCompleted && 'bg-zinc-700'
            )}
            animate={{
              scale: isActive ? 1.3 : 1,
            }}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 30,
            }}
          >
            {/* Pulse ring para step ativo */}
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-full bg-emerald-500/30"
                animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
```

---

## 4. Componente: StepCard

### Propósito
Card principal de cada step com glow effect, animação de entrada e suporte a estados.

### Visual

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║        [ServiceIcon]                                     ║
║                                                          ║
║        Título Principal                                  ║
║        Descrição secundária em zinc-400                  ║
║                                                          ║
║   ┌──────────────────────────────────────────────────┐   ║
║   │  Input de token...                               │   ║
║   └──────────────────────────────────────────────────┘   ║
║                                                          ║
║        [Link de ajuda]                                   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
           ↑
   box-shadow: 0 0 60px -15px emerald-500/20
   border: 1px solid zinc-800
   backdrop-blur: xl
```

### Especificação Técnica

```tsx
// components/install/StepCard.tsx
'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StepCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: 'emerald' | 'blue' | 'orange' | 'red';
}

const glowColors = {
  emerald: 'shadow-[0_0_60px_-15px_theme(colors.emerald.500/0.2)]',
  blue: 'shadow-[0_0_60px_-15px_theme(colors.blue.500/0.2)]',
  orange: 'shadow-[0_0_60px_-15px_theme(colors.orange.500/0.2)]',
  red: 'shadow-[0_0_60px_-15px_theme(colors.red.500/0.2)]',
};

export function StepCard({
  children,
  className,
  glowColor = 'emerald'
}: StepCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
      className={cn(
        // Base
        'relative p-8 rounded-2xl',
        // Background
        'bg-zinc-900/60 backdrop-blur-xl',
        // Border
        'border border-zinc-800/80',
        // Glow
        glowColors[glowColor],
        // Custom
        className
      )}
    >
      {/* Gradient overlay sutil no topo */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />

      {children}
    </motion.div>
  );
}
```

### CSS Helpers

```css
/* Focus glow no card quando input tem foco */
.step-card:focus-within {
  --tw-shadow: 0 0 80px -10px theme('colors.emerald.500/0.25');
  border-color: theme('colors.emerald.500/0.3');
}

/* Transition suave */
.step-card {
  transition: box-shadow 300ms ease, border-color 300ms ease;
}
```

---

## 5. Componente: TokenInput

### Propósito
Input especializado para tokens com:
- Máscara visual (•••••)
- Detecção de paste
- Feedback de validação
- Auto-submit trigger

### Estados

| Estado | Border | Background | Icon |
|--------|--------|------------|------|
| Default | `zinc-700` | `zinc-800/50` | - |
| Focus | `emerald-500` + glow | `zinc-800` | - |
| Validating | `emerald-500` + pulse | `zinc-800` | Spinner |
| Success | `emerald-500` | `emerald-500/10` | Check ✓ |
| Error | `red-500` + shake | `red-500/10` | X |

### Especificação Técnica

```tsx
// components/install/TokenInput.tsx
'use client';

import { useState, useRef, useEffect, ClipboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Loader2, Check, X, ClipboardPaste } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TokenInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  validating?: boolean;
  success?: boolean;
  error?: string;
  minLength?: number;
  autoSubmitLength?: number;
  onAutoSubmit?: () => void;
  className?: string;
}

export function TokenInput({
  value,
  onChange,
  placeholder = 'Cole seu token aqui...',
  validating = false,
  success = false,
  error,
  minLength = 20,
  autoSubmitLength,
  onAutoSubmit,
  className,
}: TokenInputProps) {
  const [showValue, setShowValue] = useState(false);
  const [justPasted, setJustPasted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-submit quando atingir tamanho
  useEffect(() => {
    if (
      autoSubmitLength &&
      value.length >= autoSubmitLength &&
      !validating &&
      !error &&
      onAutoSubmit
    ) {
      const timer = setTimeout(onAutoSubmit, 800);
      return () => clearTimeout(timer);
    }
  }, [value, autoSubmitLength, validating, error, onAutoSubmit]);

  // Feedback visual de paste
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    setJustPasted(true);
    setTimeout(() => setJustPasted(false), 1000);
  };

  const isError = !!error;
  const displayValue = showValue ? value : value.replace(/./g, '•');

  return (
    <div className={cn('relative', className)}>
      <motion.div
        animate={isError ? { x: [-4, 4, -4, 4, 0] } : {}}
        transition={{ duration: 0.4 }}
        className={cn(
          'relative flex items-center gap-2',
          'px-4 py-3 rounded-xl',
          'bg-zinc-800/50 border',
          'transition-all duration-200',
          // States
          !isError && !success && !validating && 'border-zinc-700 focus-within:border-emerald-500 focus-within:shadow-[0_0_0_3px_theme(colors.emerald.500/0.15)]',
          validating && 'border-emerald-500/50 animate-pulse',
          success && 'border-emerald-500 bg-emerald-500/10',
          isError && 'border-red-500 bg-red-500/10 shadow-[0_0_0_3px_theme(colors.red.500/0.15)]',
        )}
      >
        <input
          ref={inputRef}
          type={showValue ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={validating || success}
          className={cn(
            'flex-1 bg-transparent outline-none',
            'text-zinc-100 placeholder:text-zinc-500',
            'font-mono text-sm',
            'disabled:opacity-50'
          )}
        />

        {/* Status icons */}
        <AnimatePresence mode="wait">
          {validating && (
            <motion.div
              key="validating"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            </motion.div>
          )}
          {success && !validating && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Check className="w-5 h-5 text-emerald-500" />
            </motion.div>
          )}
          {isError && !validating && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <X className="w-5 h-5 text-red-500" />
            </motion.div>
          )}
          {!validating && !success && !isError && value.length > 0 && (
            <motion.button
              key="toggle"
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showValue ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Paste indicator */}
      <AnimatePresence>
        {justPasted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -bottom-6 left-0 flex items-center gap-1 text-xs text-emerald-400"
          >
            <ClipboardPaste className="w-3 h-3" />
            Token colado!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mt-2 text-sm text-red-400"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Character counter (opcional) */}
      {minLength && value.length > 0 && !success && (
        <div className="absolute -bottom-6 right-0 text-xs text-zinc-500">
          {value.length}/{minLength}+ caracteres
        </div>
      )}
    </div>
  );
}
```

---

## 6. Componente: ServiceIcon

### Propósito
Ícones animados para cada serviço, com cores específicas e animações de estado.

### Mapeamento de Serviços

| Serviço | Ícone | Cor | Animação |
|---------|-------|-----|----------|
| Identity | `User` | zinc-400 | Fade in |
| Vercel | `Triangle` | white | Rotation sutil |
| Supabase | `Database` | emerald-500 | Scale pulse |
| QStash | `Zap` | orange-500 | Lightning flash |
| Redis | `Server` | red-500 | Blink |

### Especificação Técnica

```tsx
// components/install/ServiceIcon.tsx
'use client';

import { motion } from 'framer-motion';
import {
  User,
  Triangle,
  Database,
  Zap,
  Server,
  LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Service = 'identity' | 'vercel' | 'supabase' | 'qstash' | 'redis';

interface ServiceIconProps {
  service: Service;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

const serviceConfig: Record<Service, {
  icon: LucideIcon;
  color: string;
  bgColor: string;
}> = {
  identity: {
    icon: User,
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-800',
  },
  vercel: {
    icon: Triangle,
    color: 'text-white',
    bgColor: 'bg-zinc-800',
  },
  supabase: {
    icon: Database,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  qstash: {
    icon: Zap,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  redis: {
    icon: Server,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
};

const sizes = {
  sm: 'w-10 h-10',
  md: 'w-14 h-14',
  lg: 'w-20 h-20',
};

const iconSizes = {
  sm: 'w-5 h-5',
  md: 'w-7 h-7',
  lg: 'w-10 h-10',
};

export function ServiceIcon({
  service,
  size = 'md',
  animated = true
}: ServiceIconProps) {
  const config = serviceConfig[service];
  const Icon = config.icon;

  return (
    <motion.div
      initial={animated ? { opacity: 0, scale: 0.8 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'flex items-center justify-center rounded-2xl',
        sizes[size],
        config.bgColor,
        'border border-white/5'
      )}
    >
      <Icon className={cn(iconSizes[size], config.color)} />
    </motion.div>
  );
}
```

---

## 7. Componente: ValidatingOverlay

### Propósito
Overlay que aparece durante validação de tokens com spinner e mensagens contextuais.

### Especificação Técnica

```tsx
// components/install/ValidatingOverlay.tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface ValidatingOverlayProps {
  isVisible: boolean;
  message: string;
  subMessage?: string;
}

export function ValidatingOverlay({
  isVisible,
  message,
  subMessage
}: ValidatingOverlayProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/80 backdrop-blur-sm rounded-2xl z-10"
        >
          {/* Spinner */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="mb-4"
          >
            <Loader2 className="w-10 h-10 text-emerald-500" />
          </motion.div>

          {/* Messages */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-zinc-100 font-medium"
          >
            {message}
          </motion.p>

          {subMessage && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-sm text-zinc-400 mt-1"
            >
              {subMessage}
            </motion.p>
          )}

          {/* Pulsing dots */}
          <div className="flex gap-1 mt-4">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

## 8. Componente: SuccessCheckmark

### Propósito
Animação de checkmark que aparece após validação bem-sucedida, antes de avançar.

### Especificação Técnica

```tsx
// components/install/SuccessCheckmark.tsx
'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useEffect } from 'react';

interface SuccessCheckmarkProps {
  onComplete?: () => void;
  delay?: number;
}

export function SuccessCheckmark({
  onComplete,
  delay = 1200
}: SuccessCheckmarkProps) {
  useEffect(() => {
    if (onComplete) {
      const timer = setTimeout(onComplete, delay);
      return () => clearTimeout(timer);
    }
  }, [onComplete, delay]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-12"
    >
      {/* Circle with checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="relative"
      >
        {/* Glow ring */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0.5, 0], scale: [1, 1.5] }}
          transition={{ duration: 1, repeat: 2 }}
          className="absolute inset-0 rounded-full bg-emerald-500/30"
        />

        {/* Circle */}
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center border-2 border-emerald-500">
          {/* Check icon with draw animation */}
          <motion.div
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <Check className="w-10 h-10 text-emerald-500" strokeWidth={3} />
          </motion.div>
        </div>
      </motion.div>

      {/* Text */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-4 text-lg font-medium text-zinc-100"
      >
        Validado com sucesso!
      </motion.p>
    </motion.div>
  );
}
```

---

## 9. Transições entre Steps

### Padrão de Animação

```tsx
// Usar AnimatePresence com mode="wait" para transições suaves
import { AnimatePresence, motion } from 'framer-motion';

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

// No componente principal
const [step, setStep] = useState(1);
const [direction, setDirection] = useState(1);

const goNext = () => {
  setDirection(1);
  setStep(s => s + 1);
};

const goBack = () => {
  setDirection(-1);
  setStep(s => s - 1);
};

// JSX
<AnimatePresence mode="wait" custom={direction}>
  <motion.div
    key={step}
    custom={direction}
    variants={stepVariants}
    initial="enter"
    animate="center"
    exit="exit"
    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
  >
    {renderStep(step)}
  </motion.div>
</AnimatePresence>
```

---

## 10. Exemplo de Step Completo: VercelStep

```tsx
// components/install/steps/VercelStep.tsx
'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { StepCard } from '../StepCard';
import { ServiceIcon } from '../ServiceIcon';
import { TokenInput } from '../TokenInput';
import { ValidatingOverlay } from '../ValidatingOverlay';
import { SuccessCheckmark } from '../SuccessCheckmark';

interface VercelStepProps {
  onComplete: (token: string, project: any) => void;
}

export function VercelStep({ onComplete }: VercelStepProps) {
  const [token, setToken] = useState('');
  const [validating, setValidating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    setValidating(true);
    setError(null);

    try {
      const res = await fetch('/api/installer/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          domain: window.location.hostname
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Token inválido');
      }

      setSuccess(true);
      // Aguarda animação de sucesso antes de avançar
      setTimeout(() => onComplete(token, data.project), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar token');
    } finally {
      setValidating(false);
    }
  };

  if (success) {
    return (
      <StepCard>
        <SuccessCheckmark />
      </StepCard>
    );
  }

  return (
    <StepCard className="relative">
      <ValidatingOverlay
        isVisible={validating}
        message="Verificando token..."
        subMessage="Procurando seu projeto na Vercel"
      />

      <div className="flex flex-col items-center text-center">
        {/* Icon */}
        <ServiceIcon service="vercel" size="lg" />

        {/* Title */}
        <h2 className="mt-6 text-xl font-semibold text-zinc-100">
          Conecte sua conta Vercel
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          Cole seu token de acesso para continuar
        </p>

        {/* Input */}
        <div className="w-full mt-6">
          <TokenInput
            value={token}
            onChange={setToken}
            placeholder="Vercel Access Token"
            validating={validating}
            error={error || undefined}
            autoSubmitLength={24}
            onAutoSubmit={handleValidate}
          />
        </div>

        {/* Help link */}
        <a
          href="https://vercel.com/account/tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-emerald-400 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Onde encontrar meu token?
        </a>
      </div>
    </StepCard>
  );
}
```

---

## 11. Mensagens por Step

| Step | Título | Descrição | Help Link Text |
|------|--------|-----------|----------------|
| Identity | Crie sua conta | Email e senha para acessar o painel | - |
| Vercel | Conecte sua conta Vercel | Cole seu token de acesso | Onde encontrar meu token? |
| Supabase | Configure o banco de dados | Cole seu Personal Access Token | Como criar um PAT? |
| QStash | Configure filas de mensagens | Token e Signing Key do Upstash QStash | Onde encontrar no console? |
| Redis | Configure cache de webhooks | URL e Token REST do Upstash Redis | Como criar um Redis? |

### Mensagens de Validação

| Step | Validando | Sucesso | Erro Comum |
|------|-----------|---------|------------|
| Vercel | "Verificando token..." / "Procurando seu projeto" | "Projeto encontrado!" | "Token inválido ou expirado" |
| Supabase | "Validando PAT..." | "Acesso confirmado!" | "PAT deve começar com sbp_" |
| QStash | "Verificando QStash..." | "Configuração válida!" | "Token ou Signing Key inválidos" |
| Redis | "Testando conexão..." / "Fazendo PING" | "Redis respondendo!" | "Credenciais inválidas" |

---

## 12. Responsividade

### Breakpoints

| Tamanho | Max-width do Card | Padding | Fonte título |
|---------|-------------------|---------|--------------|
| Mobile (<640px) | 100% - 32px | p-6 | text-lg |
| Tablet (640-768px) | 400px | p-6 | text-xl |
| Desktop (>768px) | 440px | p-8 | text-xl |

### CSS

```css
/* Mobile-first */
.install-card {
  @apply w-full p-6;
}

@media (min-width: 640px) {
  .install-card {
    @apply max-w-[400px] p-6;
  }
}

@media (min-width: 768px) {
  .install-card {
    @apply max-w-[440px] p-8;
  }
}
```

---

## 13. Acessibilidade

### Checklist

- [ ] Todos os inputs têm `label` associado (visualmente oculto se necessário)
- [ ] Estados de erro anunciados por `aria-live="polite"`
- [ ] Focus trapping no card durante validação
- [ ] Animações respeitam `prefers-reduced-motion`
- [ ] Contraste mínimo 4.5:1 para textos
- [ ] Ícones decorativos têm `aria-hidden="true"`

### Exemplo de Reduced Motion

```tsx
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

const transition = prefersReducedMotion
  ? { duration: 0 }
  : { type: 'spring', stiffness: 300, damping: 30 };
```

---

## 14. Dependências

```json
{
  "dependencies": {
    "framer-motion": "^11.x",
    "lucide-react": "^0.x",
    "@radix-ui/react-slot": "^1.x"
  }
}
```

> **Nota:** Framer Motion já está no projeto. Verificar versão e atualizar se necessário para suporte a `AnimatePresence mode="wait"`.

---

## Próximos Passos

1. [ ] Criar componentes base (`InstallLayout`, `StepCard`, `TokenInput`)
2. [ ] Implementar `ServiceIcon` com todos os ícones
3. [ ] Criar `ValidatingOverlay` e `SuccessCheckmark`
4. [ ] Implementar cada step individual
5. [ ] Montar página `/install/start` com state machine
6. [ ] Testar fluxo completo com animações
7. [ ] Ajustar responsividade
8. [ ] Testes de acessibilidade
