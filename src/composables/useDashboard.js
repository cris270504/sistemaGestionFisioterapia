/**
 * useDashboard.js
 *
 * Composable para las métricas agregadas del Dashboard:
 *  1. Citas de hoy, agrupadas por estado
 *  2. Pacientes con saldo de sesiones bajo o agotado (acción proactiva
 *     para la secretaria: ofrecer recarga antes de que se corte el
 *     tratamiento del paciente)
 *  3. Resumen de ocupación de fisioterapeutas (solo los que tienen
 *     citas hoy, sin cálculo de % de capacidad — ver decisión registrada
 *     abajo)
 *
 * DECISIONES DE NEGOCIO CONFIRMADAS:
 *  - Umbral de saldo crítico: agotado = 0, bajo = 1-2 (ajustable en
 *    UMBRAL_SALDO_BAJO más abajo, y en la vista SQL v_pacientes_saldo_critico)
 *  - Ocupación de fisioterapeutas: solo se listan los que tienen al menos
 *    una cita hoy. No se calcula % de ocupación contra capacidad máxima
 *    (eso requeriría definir cuántos slots tiene cada fisio por Horario,
 *    decisión que se dejó pendiente para una iteración futura).
 */

import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

// Umbral de saldo bajo, documentado aquí para que sea fácil de ajustar.
// Debe coincidir con el WHERE de v_pacientes_saldo_critico en la BD.
export const UMBRAL_SALDO_BAJO = 2

export function useDashboard() {
  const { showAlert } = useAlert()

  // ── Estado ────────────────────────────────────────────────────────────
  const citasHoy           = ref([])
  const pacientesSaldoBajo = ref([])
  const loading            = ref(false)

  // ── Computed: conteos por estado de cita ─────────────────────────────
  const resumenEstados = computed(() => {
    const base = { reservada: 0, agendada: 0, atendida: 0, cancelada: 0, no_asistio: 0, reprogramada: 0 }
    for (const c of citasHoy.value) {
      if (base[c.estado] !== undefined) base[c.estado]++
    }
    return base
  })

  const totalCitasHoy = computed(() => citasHoy.value.length)

  // ── Computed: ocupación por fisioterapeuta (solo los que atienden hoy) ─
  const ocupacionFisios = computed(() => {
    const mapa = new Map()

    for (const c of citasHoy.value) {
      const key = c.idFisioterapeuta
      if (!mapa.has(key)) {
        mapa.set(key, {
          idFisioterapeuta: key,
          nombre: `${c.fisio_nombres ?? ''} ${c.fisio_apellidos ?? ''}`.trim(),
          especialidad: c.fisio_especialidad,
          totalCitas: 0,
          atendidas: 0,
          pendientes: 0,
        })
      }
      const entry = mapa.get(key)
      entry.totalCitas++
      if (c.estado === 'atendida') entry.atendidas++
      if (['reservada', 'agendada'].includes(c.estado)) entry.pendientes++
    }

    return Array.from(mapa.values()).sort((a, b) => b.totalCitas - a.totalCitas)
  })

  // ── Computed: separar pacientes agotados vs. bajos ───────────────────
  const pacientesAgotados = computed(() =>
    pacientesSaldoBajo.value.filter(p => p.nivel_alerta === 'agotado')
  )
  const pacientesBajos = computed(() =>
    pacientesSaldoBajo.value.filter(p => p.nivel_alerta === 'bajo')
  )

  // ── fetchCitasHoy ──────────────────────────────────────────────────────
  const fetchCitasHoy = async () => {
    try {
      const hoy = new Date()
      const yyyy = hoy.getFullYear()
      const mm   = String(hoy.getMonth() + 1).padStart(2, '0')
      const dd   = String(hoy.getDate()).padStart(2, '0')

      // Rango explícito en horario de Perú (-05:00), igual que en useCitas
      const inicio = `${yyyy}-${mm}-${dd}T00:00:00-05:00`
      const fin    = `${yyyy}-${mm}-${dd}T23:59:59-05:00`

      const { data, error } = await supabase
        .from('v_dashboard_citas_hoy')
        .select('*')
        .gte('fecha_hora', inicio)
        .lte('fecha_hora', fin)
        .order('fecha_hora', { ascending: true })

      if (error) throw error
      citasHoy.value = data ?? []
    } catch (err) {
      showAlert('Error al cargar las citas de hoy: ' + err.message, 'error')
    }
  }

  // ── fetchPacientesSaldoBajo ────────────────────────────────────────────
  const fetchPacientesSaldoBajo = async () => {
    try {
      const { data, error } = await supabase
        .from('v_pacientes_saldo_critico')
        .select('*')
        .order('sesiones_restantes', { ascending: true })

      if (error) throw error
      pacientesSaldoBajo.value = data ?? []
    } catch (err) {
      showAlert('Error al cargar pacientes con saldo bajo: ' + err.message, 'error')
    }
  }

  // ── fetchDashboard: carga todo en paralelo ────────────────────────────
  const fetchDashboard = async () => {
    loading.value = true
    try {
      await Promise.all([
        fetchCitasHoy(),
        fetchPacientesSaldoBajo(),
      ])
    } finally {
      loading.value = false
    }
  }

  return {
    // Estado
    citasHoy,
    pacientesSaldoBajo,
    loading,
    // Computed
    resumenEstados,
    totalCitasHoy,
    ocupacionFisios,
    pacientesAgotados,
    pacientesBajos,
    // Acciones
    fetchDashboard,
    fetchCitasHoy,
    fetchPacientesSaldoBajo,
  }
}