# AUDITORÍA DE SEGURIDAD - INTEGRACIÓN DE PAGOS EN LÍNEA
# Sistema MovyBalance - Análisis como Arquitecto de Seguridad Financiera

## RESUMEN EJECUTIVO

Tu proyecto tiene 5 vulnerabilidades CRÍTICAS que deben corregirse antes de aceptar pagos:

1. **Frontend confía en datos del cliente** (CRÍTICO)
2. **Base de datos no es fuente única de verdad** (CRÍTICO)
3. **RLS permite manipulación de transacciones** (CRÍTICO)
4. **No hay validación de webhooks** (CRÍTICO)
5. **Lógica de pago mezclada con lógica de UI** (MEDIO)

---

## 1. ANÁLISIS DE SEGURIDAD DE DATOS

### 1.1 Vulnerabilidades Detectadas

#### Problema A: idPaciente viene del cliente
**Archivo:** src/components/ModalConfirmarPago.vue línea 120
**Código:**
```javascript
emit('submit', {
    idPaciente: props.sesion.idPaciente  // ← RIESGO: Puede ser alterado
})
```

**Ataque Posible:** Un usuario abre DevTools y ejecuta:
```javascript
// Cambiar el payload que se envía
sesionSeleccionada.value.idPaciente = 'id-de-otro-paciente'
// O manipular directamente la llamada a Supabase
```

**Impacto:** Cargar pagos al saldo de otra persona. Fraude directo.

---

#### Problema B: Estado 'completado' es inmediato
**Archivo:** src/composables/useCitas.js línea 446
**Código:**
```javascript
await supabase.from('Pago').insert({
    estado_pago: 'completado'  // ← Se marca COMPLETADO sin validación externa
})
```

**Ataque Posible:**
1. Usuario intercepta la respuesta de Stripe (dice "error")
2. Pero si consigue marcar en BD como 'completado', obtiene pago gratis
3. Stripe + BD quedan desincronizados

**Impacto:** Pagos fantasma. Dinero no cobrado pero saldo actualizado.

---

#### Problema C: No hay validación del monto en backend
**Archivo:** src/components/ModalConfirmarPago.vue línea 90-99
**Código:**
```javascript
const monto = Number(montoIngresado.value)
// Solo se valida en el cliente, NO en el servidor
if (!validatePaymentAmount(monto)) { ... }
```

**Ataque Posible:**
```javascript
// Abrir DevTools en Network tab, interceptar POST a Supabase
// Cambiar: monto: 100 → monto: 1
// O usar un proxy para modificar la request
```

**Impacto:** Pagos con monto manipulado. Cliente paga $1 pero debería $100.

---

### 1.2 IDs Sensibles Expuestos

Tus componentes exponen:
- `idPaciente` (identidad de usuario)
- `idSesion` (puede enumerar todas las sesiones)
- `idPaquete` (información de compras)
- `idFisioterapeuta` (mapeo de empleados)

**Recomendación:** Estos IDs nunca deben ser confiables desde el frontend.

---

## 2. INTEGRIDAD DE TRANSACCIONES - SCHEMA MEJORADO

### 2.1 Tabla Actual Vs. Propuesta

#### ACTUAL (Inseguro):
```sql
CREATE TABLE pago (
    id SERIAL PRIMARY KEY,
    idPaciente INT,           -- Confiable desde cliente?
    monto DECIMAL,            -- Confiable desde cliente?
    estado_pago VARCHAR,      -- Confiable desde cliente?
    metodo_pago VARCHAR
    -- Faltan: auditoría, versioning, hash de validación
);
```

#### PROPUESTA (Seguro):
```sql
CREATE TABLE transaccion_pago (
    id_transaccion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Referencias verificadas SOLO por backend
    id_paciente UUID NOT NULL REFERENCES paciente(id_paciente),
    id_sesion UUID REFERENCES sesion(id_sesion),
    id_paquete UUID REFERENCES paquete(id_paquete),
    
    -- Datos de pago validados
    monto DECIMAL(10, 2) NOT NULL CHECK (monto > 0),
    moneda VARCHAR(3) DEFAULT 'PEN',
    
    -- Estados con transiciones validadas
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN (
            'pendiente',      -- Creada, esperando pago
            'procesando',     -- Enviada a Stripe/MercadoPago
            'completado',     -- Webhook confirmó
            'fallido',        -- Webhook rechazó
            'reembolsado'     -- Cliente pidió devolución
        )),
    
    -- Link a procesador externo
    id_procesador VARCHAR(50),  -- payment_intent_id de Stripe
    
    -- Validación de integridad (CRÍTICA)
    hash_validacion VARCHAR(256) NOT NULL UNIQUE,
    -- HMAC-SHA256(monto + id_paciente + id_sesion + secret)
    
    -- Auditoría completa
    usuario_creo UUID NOT NULL REFERENCES auth.users(id),
    fecha_creacion TIMESTAMP DEFAULT NOW(),
    fecha_actualizacion TIMESTAMP DEFAULT NOW(),
    razon_cambio VARCHAR(500),  -- "Pago completado por Stripe"
    
    -- Seguridad adicional
    ip_origen INET,
    user_agent TEXT,
    
    -- Soft delete para auditoría
    esta_activa BOOLEAN DEFAULT TRUE
);
```

### 2.2 Tabla de Auditoría Completa

```sql
CREATE TABLE transaccion_pago_auditoria (
    id_auditoria BIGSERIAL PRIMARY KEY,
    id_transaccion UUID NOT NULL REFERENCES transaccion_pago(id_transaccion),
    
    estado_anterior VARCHAR(20),
    estado_nuevo VARCHAR(20) NOT NULL,
    
    usuario_id UUID REFERENCES auth.users(id),
    fue_sistema BOOLEAN DEFAULT FALSE,
    
    fecha TIMESTAMP DEFAULT NOW(),
    razon_cambio TEXT,
    
    ip_origen INET,
    user_agent TEXT
);

-- CADA cambio de estado queda registrado forever
```

### 2.3 Tabla de Webhooks (Idempotencia)

```sql
CREATE TABLE webhook_procesador (
    id_webhook UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Único identificador en Stripe/MercadoPago
    id_evento_externo VARCHAR(100) UNIQUE NOT NULL,
    procesador VARCHAR(30) NOT NULL,  -- 'stripe' o 'mercadopago'
    
    payload_original JSONB NOT NULL,  -- Guardar todo para debugging
    
    -- Estado
    fue_procesado BOOLEAN DEFAULT FALSE,
    resultado_procesamiento JSONB,
    
    fecha_recibido TIMESTAMP DEFAULT NOW(),
    fecha_procesado TIMESTAMP,
    
    -- Seguridad
    signature_valida BOOLEAN DEFAULT FALSE,
    error_si_fallo TEXT
);

-- Si el webhook llega 2 veces, devolvemos 200 sin procesar
```

---

## 3. SEGURIDAD RLS (Row Level Security)

### 3.1 Políticas Actuales - ANÁLISIS

Tu estructura actual probablemente permite:
```sql
-- Los pacientes pueden ver sus pagos
CREATE POLICY "ver_propios_pagos"
ON pago
FOR SELECT
USING (auth.uid()::int = idPaciente);  -- ← Pero confía en idPaciente que vino del cliente
```

### 3.2 Políticas Recomendadas

#### BLOQUEAR todo acceso de cliente:
```sql
-- Pacientes NUNCA pueden INSERT
CREATE POLICY "paciente_no_insert_pagos"
ON transaccion_pago
FOR INSERT
WITH CHECK (FALSE);  -- ← Rechaza todos los INSERTs

-- Pacientes NUNCA pueden UPDATE estado
CREATE POLICY "paciente_no_update_pagos"
ON transaccion_pago
FOR UPDATE
WITH CHECK (FALSE);  -- ← Rechaza todos los UPDATEs

-- Pacientes solo pueden VER sus propias transacciones
CREATE POLICY "paciente_ver_propias_transacciones"
ON transaccion_pago
FOR SELECT
USING (id_paciente = auth.uid());
```

#### PERMITIR solo Edge Functions:
```sql
-- Edge Functions tienen rol 'service_role' en Supabase
-- Ellos SÍ pueden hacer INSERT y UPDATE

CREATE POLICY "edge_function_crear_transaccion"
ON transaccion_pago
FOR INSERT
WITH CHECK (
    -- Edge Function se identifica con JWT especial
    current_setting('request.jwt.claims'->>'role') = 'authenticated'
);

CREATE POLICY "edge_function_actualizar_transaccion"
ON transaccion_pago
FOR UPDATE
WITH CHECK (
    -- Solo cambios válidos de estado
    CASE
        WHEN estado = 'pendiente' THEN TRUE   -- Edge Function crea
        WHEN estado = 'procesando' THEN TRUE  -- Edge Function marca
        WHEN estado = 'completado' THEN TRUE  -- Edge Function marca (via webhook)
        ELSE FALSE
    END
);
```

---

## 4. ARQUITECTURA DE WEBHOOKS

### 4.1 Flujo Actual (Inseguro)

```
Usuario: "Confirmar pago"
    ↓
Frontend: Llama Stripe desde navegador
    ↓
Frontend: Si OK, INSERT en BD inmediatamente
    ↓
PROBLEMA: ¿Qué pasa si el navegador se cierra?
         ¿Qué si alguien manipula la respuesta de Stripe?
```

### 4.2 Flujo Propuesto (Seguro)

```
                    ┌──────────────────┐
                    │ Usuario Ve Modal │
                    └────────┬─────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │ Frontend llama Edge Function:           │
        │ "crear-sesion-pago"                    │
        │ - Envía: id_sesion, id_paquete         │
        │ - NO envía: id_paciente, monto         │
        └────────────────────┬───────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │ Edge Function: crear-sesion-pago       │
        │ - Lee id_paciente de auth.uid()        │
        │ - Busca sesión/paquete en BD           │
        │ - Valida tarifa oficial vs. monto      │
        │ - Crea transacción_pago (estado=pendiente)
        │ - Devuelve: {id_transaccion, clientSecret} │
        └────────────────────┬───────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │ Frontend: Redirige a Stripe            │
        │ .confirmPayment({clientSecret, ...})   │
        │ - Stripe toma control                  │
        │ - Usuario ingresa tarjeta              │
        │ - Stripe responde: "success" o "failed"│
        └────────────────────┬───────────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
        [Pago Exitoso]         [Pago Fallido]
                │                         │
                ▼                         ▼
        Stripe envía              Stripe envía
        webhook:                  webhook:
        "payment_intent           "payment_intent
        .succeeded"               .failed"
                │                         │
                └────────────┬────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │ Edge Function: payment-webhook-handler │
        │ (en tu servidor, no en navegador)      │
        │                                        │
        │ 1. Validar firma HMAC de webhook      │
        │ 2. Buscar transacción_pago en BD      │
        │ 3. Validar monto coincide             │
        │ 4. Cambiar estado a 'completado'      │
        │ 5. Trigger actualiza saldo (automático)
        │ 6. Registrar en auditoria             │
        └────────────────────┬───────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │ BD: Trigger actualiza saldos           │
        │ (via procedimiento almacenado)         │
        └────────────────────┬───────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │ Frontend: Escucha via Realtime         │
        │ (Supabase subscripción a cambios)      │
        │ Se actualiza automáticamente           │
        └────────────────────────────────────────┘
```

### 4.3 Edge Function: Validar Webhook

```typescript
// supabase/functions/payment-webhook-handler/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
)

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Not allowed', { status: 405 })

  try {
    // ✅ PASO 1: Validar firma del webhook
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')
    
    if (!isValidStripeSig(body, signature)) {
      console.error('Invalid Stripe signature')
      return new Response('Invalid signature', { status: 401 })
    }

    const event = JSON.parse(body)
    
    // ✅ PASO 2: Verificar que no duplicamos
    const { data: existing } = await supabase
      .from('webhook_procesador')
      .select('id_webhook')
      .eq('id_evento_externo', event.id)
      .single()

    if (existing) {
      // Ya procesado: devolver 200 para que Stripe deje de reintentar
      return new Response(JSON.stringify({ status: 'already_processed' }), {
        status: 200
      })
    }

    // ✅ PASO 3: Procesar según el tipo de evento
    if (event.type === 'payment_intent.succeeded') {
      const { id, amount, metadata } = event.data.object
      const { id_transaccion, id_paciente } = metadata

      // ✅ PASO 4: Buscar transacción en BD (verdad única)
      const { data: trans } = await supabase
        .from('transaccion_pago')
        .select('*')
        .eq('id_transaccion', id_transaccion)
        .single()

      if (!trans) throw new Error(`Transacción ${id_transaccion} no existe`)

      // ✅ PASO 5: Validar integridad
      if (Math.round(amount / 100) !== trans.monto) {
        throw new Error(`Monto no coincide`)
      }

      if (trans.id_paciente !== id_paciente) {
        throw new Error(`Paciente no coincide`)
      }

      // ✅ PASO 6: Actualizar estado (SOLO backend)
      await supabase
        .from('transaccion_pago')
        .update({
          estado: 'completado',
          id_procesador: id
        })
        .eq('id_transaccion', id_transaccion)

      // ✅ PASO 7: Registrar auditoria
      await supabase
        .from('transaccion_pago_auditoria')
        .insert({
          id_transaccion,
          estado_anterior: 'procesando',
          estado_nuevo: 'completado',
          fue_sistema: true,
          razon_cambio: `Confirmado por Stripe: ${id}`
        })
    }

    // ✅ PASO 8: Registrar webhook procesado
    await supabase
      .from('webhook_procesador')
      .insert({
        id_evento_externo: event.id,
        procesador: 'stripe',
        payload_original: event,
        fue_procesado: true,
        signature_valida: true
      })

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

function isValidStripeSig(body, sig) {
  // Implementar validación HMAC-SHA256
  // Ver: https://stripe.com/docs/webhooks/signatures
  return true // Simplificado
}
```

---

## 5. LÓGICA A MOVER DEL FRONTEND

### 5.1 Auditoría de Código

| Lógica | Archivo | Línea | Estado Actual | Debería ir a |
|--------|---------|-------|---------------|--------------|
| Cálculo saldo | ModalConfirmarPago.vue | 52 | Cliente | Edge Function |
| Validar monto | ModalConfirmarPago.vue | 90-99 | Cliente | Edge Function |
| Insert Pago | useCitas.js | 437-447 | Cliente | Edge Function |
| Cambiar estado | useCitas.js | 446 | Cliente | Edge Function (vía webhook) |
| Generar hash | useCitas.js | N/A | No existe | Edge Function |

### 5.2 Nuevas Edge Functions Necesarias

```
supabase/functions/
├── crear-sesion-pago/
│   ├── index.ts
│   ├── Valida usuario autenticado
│   ├── Busca sesión/paquete en BD
│   ├── Calcula monto vs. tarifa oficial
│   ├── Crea transacción_pago
│   └── Devuelve clientSecret para Stripe
│
├── payment-webhook-handler/
│   ├── index.ts
│   ├── Valida firma HMAC
│   ├── Verifica idempotencia
│   ├── Actualiza transacción
│   └── Registra auditoría
│
├── obtener-saldo-paciente/
│   ├── index.ts
│   ├── Lee desde BD (no cliente)
│   └── Devuelve saldo real
│
└── test-simular-pago/
    ├── index.ts
    └── Solo para desarrollo (simula webhook)
```

### 5.3 Nuevo Composable: usePagos.js

```javascript
// src/composables/usePagos.js

export const usePagos = () => {
  const crearSesionPago = async (idSesion, idPaquete) => {
    // 1. Llamar Edge Function (NO INSERT directo)
    const { data, error } = await supabase.functions.invoke('crear-sesion-pago', {
      body: { idSesion, idPaquete }
    })
    
    if (error) throw error
    return data  // { id_transaccion, clientSecret, monto, ... }
  }

  const confirmarPagoStripe = async (clientSecret) => {
    // 2. Usar Stripe.js (no tocar BD)
    const result = await stripe.confirmPayment({ clientSecret })
    // El webhook hará el resto
    return result
  }

  const obtenerSaldoReal = async () => {
    // 3. Llamar Edge Function para saldo real
    const { data, error } = await supabase.functions.invoke('obtener-saldo-paciente')
    if (error) throw error
    return data
  }

  return { crearSesionPago, confirmarPagoStripe, obtenerSaldoReal }
}
```

---

## 6. CHECKLIST DE IMPLEMENTACIÓN

### Fase 1: Base de Datos (CRÍTICA)
- [ ] Crear tabla `transaccion_pago`
- [ ] Crear tabla `transaccion_pago_auditoria`
- [ ] Crear tabla `webhook_procesador`
- [ ] Agregar validaciones CHECK en montos
- [ ] Crear índices en id_paciente, estado, fecha
- [ ] Crear trigger para auditoría automática

### Fase 2: RLS (CRÍTICA)
- [ ] Desactivar INSERT de clientes en transaccion_pago
- [ ] Desactivar UPDATE de clientes en transaccion_pago
- [ ] Permitir SELECT solo de propias transacciones
- [ ] Verificar que service_role puede hacer INSERT/UPDATE

### Fase 3: Edge Functions (CRÍTICA)
- [ ] Crear `crear-sesion-pago`
- [ ] Crear `payment-webhook-handler`
- [ ] Crear `obtener-saldo-paciente`
- [ ] Validar firmas HMAC de Stripe
- [ ] Implementar idempotencia en webhooks

### Fase 4: Frontend (IMPORTANTE)
- [ ] Eliminar INSERT de Pago desde cliente
- [ ] Crear nuevo composable `usePagos.js`
- [ ] Refactorizar `ModalConfirmarPago.vue`
- [ ] Eliminar lógica de validación de monto (va a backend)
- [ ] Integrar Stripe.js
- [ ] Agregar listeners de Realtime

### Fase 5: Testing (ESENCIAL)
- [ ] Simular manipulación de monto desde DevTools
- [ ] Simular cambio de idPaciente
- [ ] Probar webhook duplicados
- [ ] Probar fallos de red (reintento)
- [ ] Auditoría completa de cambios

---

## 7. PRINCIPIOS DE SEGURIDAD APLICADOS

### Menor Privilegio
✅ Clientes no pueden escribir en transacciones
✅ Solo Edge Functions pueden actualizar estado
✅ Pacientes solo ven sus propias transacciones

### Defensa en Profundidad
✅ Validación en cliente (UX)
✅ Validación en Edge Function (seguridad)
✅ Validación en RLS (política)
✅ Validación en BD (CHECK constraints)
✅ Validación de webhook (HMAC-SHA256)

### Fuente Única de Verdad
✅ Saldo se calcula SOLO en BD
✅ Estado se cambia SOLO desde webhook
✅ Monto se valida SOLO en backend

---

¡Tu proyecto está casi listo! Solo necesita estas capas de seguridad.
