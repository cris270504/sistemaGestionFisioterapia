/**
 * useEvaluacionInicial.js
 *
 * Composable para la Ficha de Evaluación Fisioterapéutica Integral
 * (las 18 secciones que se llenan UNA SOLA VEZ por episodio/lesión).
 *
 * Relación con el esquema:
 *  - Evaluacion_inicial.idSesion (UNIQUE, NOT NULL) → Sesion con
 *    tipo='evaluacion' y es_evaluacion_inicial=true
 *  - Cada seccion_* es una columna jsonb independiente → se puede
 *    guardar parcialmente sin afectar las demás secciones (autosave)
 *  - zonas_afectadas (text[]) controla qué subsecciones de tests
 *    ortopédicos se resaltan en el frontend
 *
 * Diseño de autosave: cada sección se guarda con su propio UPDATE,
 * usando debounce, para que el fisioterapeuta no pierda el trabajo
 * si cierra la pestaña a mitad de la ficha.
 */

import { ref, reactive, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

// ─── Catálogo de zonas corporales (sección 12: tests ortopédicos) ─────────
export const ZONAS_CORPORALES = [
  { id: 'cervical',         label: 'Columna cervical' },
  { id: 'hombro',           label: 'Hombro' },
  { id: 'codo_muneca_mano', label: 'Codo, muñeca y mano' },
  { id: 'lumbar',           label: 'Columna lumbar' },
  { id: 'cadera',           label: 'Cadera' },
  { id: 'rodilla',          label: 'Rodilla' },
  { id: 'tobillo_pie',      label: 'Tobillo y pie' },
]

// ─── Nombres de las 16 columnas seccion_* (para iterar genéricamente) ─────
const SECCIONES = [
  'seccion_anamnesis',
  'seccion_dolor',
  'seccion_inspeccion_postural',
  'seccion_palpacion',
  'seccion_rom_articular',
  'seccion_rom_columna',
  'seccion_eval_muscular',
  'seccion_flexibilidad',
  'seccion_neurologica',
  'seccion_pruebas_funcionales',
  'seccion_tests_ortopedicos',
  'seccion_marcha_equilibrio',
  'seccion_eval_funcional',
  'seccion_escalas_funcionales',
  'seccion_diagnostico_fisio',
  'seccion_objetivos',
  'seccion_plan_tratamiento',
]

export function useEvaluacionInicial() {
  const { showAlert } = useAlert()

  const evaluacion        = ref(null)   // fila completa de Evaluacion_inicial
  const loading           = ref(false)
  const guardandoSeccion  = reactive({}) // { seccion_dolor: true/false, ... } por sección

  // ── Progreso de llenado (para barra de avance en UI) ────────────────────
  const progreso = computed(() => {
    if (!evaluacion.value) return { completadas: 0, total: SECCIONES.length }
    const completadas = SECCIONES.filter(s => evaluacion.value[s] !== null && evaluacion.value[s] !== undefined).length
    return { completadas, total: SECCIONES.length }
  })

  // ─────────────────────────────────────────────────────────────────────
  // CREAR la evaluación inicial (vinculada a una Sesion ya existente)
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {Object} datos
   *   - idSesion          bigint NOT NULL — la Sesion tipo='evaluacion'
   *   - idPaciente         uuid NOT NULL
   *   - idFisioterapeuta   uuid NOT NULL
   *   - motivoConsulta     text NOT NULL (campo obligatorio del esquema)
   *   - apuntesGenerales   text NOT NULL (campo obligatorio del esquema)
   *   - zonasAfectadas     string[] opcional
   */
  const crearEvaluacionInicial = async (datos) => {
    const {
      idSesion, idPaciente, idFisioterapeuta,
      motivoConsulta, apuntesGenerales,
      zonasAfectadas = [],
    } = datos

    if (!idSesion)         { showAlert('Falta vincular la sesión de evaluación.', 'error'); return false }
    if (!idPaciente)       { showAlert('Falta el paciente.', 'error'); return false }
    if (!idFisioterapeuta) { showAlert('Falta el fisioterapeuta.', 'error'); return false }
    if (!motivoConsulta?.trim())   { showAlert('El motivo de consulta es obligatorio.', 'error'); return false }
    if (!apuntesGenerales?.trim()) { showAlert('Los apuntes generales son obligatorios.', 'error'); return false }

    loading.value = true
    try {
      const { data, error } = await supabase
        .from('Evaluacion_inicial')
        .insert({
          idSesion,
          idPaciente,
          idFisioterapeuta,
          motivo_paciente:    motivoConsulta.trim(),
          apuntes_generales:  apuntesGenerales.trim(),
          zonas_afectadas:    zonasAfectadas,
        })
        .select()
        .single()

      if (error) throw error
      evaluacion.value = data
      showAlert('✅ Ficha de evaluación inicial creada.', 'success')
      return data

    } catch (err) {
      if (err.code === '23505') {
        // Viola evaluacion_inicial_idSesion_key (UNIQUE) — ya existe una ficha para esa Sesion
        showAlert('Ya existe una ficha de evaluación para esta sesión.', 'error')
      } else {
        showAlert('Error al crear la evaluación inicial: ' + err.message, 'error')
      }
      return false
    } finally {
      loading.value = false
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // CARGAR la evaluación por idSesion (caso típico: abrir la ficha
  // desde la cita ya agendada del tipo 'evaluacion')
  // ─────────────────────────────────────────────────────────────────────
  const fetchEvaluacionPorSesion = async (idSesion) => {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('Evaluacion_inicial')
        .select('*')
        .eq('idSesion', idSesion)
        .maybeSingle() // puede no existir aún si la sesión no se ha atendido

      if (error) throw error
      evaluacion.value = data
      return data
    } catch (err) {
      showAlert('Error al cargar la evaluación: ' + err.message, 'error')
      return null
    } finally {
      loading.value = false
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // CARGAR todas las evaluaciones de un paciente (para la Historia Clínica)
  // ─────────────────────────────────────────────────────────────────────
  const fetchEvaluacionesPaciente = async (idPaciente) => {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('Evaluacion_inicial')
        .select(`
          idEvaluacionInicial, fecha, motivo_paciente, zonas_afectadas,
          idSesion, idTratamiento,
          seccion_diagnostico_fisio, seccion_objetivos
        `)
        .eq('idPaciente', idPaciente)
        .order('fecha', { ascending: false })

      if (error) throw error
      return data ?? []
    } catch (err) {
      showAlert('Error al cargar evaluaciones del paciente: ' + err.message, 'error')
      return []
    } finally {
      loading.value = false
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // GUARDAR UNA SECCIÓN (autosave independiente, no bloquea las demás)
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {string} nombreSeccion  uno de SECCIONES (ej. 'seccion_dolor')
   * @param {Object} valor          el objeto jsonb a guardar en esa columna
   */
  const guardarSeccion = async (nombreSeccion, valor) => {
    if (!evaluacion.value?.idEvaluacionInicial) {
      showAlert('No hay una evaluación inicial activa para guardar.', 'error')
      return false
    }
    if (!SECCIONES.includes(nombreSeccion)) {
      showAlert('Sección desconocida: ' + nombreSeccion, 'error')
      return false
    }

    guardandoSeccion[nombreSeccion] = true
    try {
      const { error } = await supabase
        .from('Evaluacion_inicial')
        .update({ [nombreSeccion]: valor })
        .eq('idEvaluacionInicial', evaluacion.value.idEvaluacionInicial)

      if (error) throw error

      // Reflejar el cambio localmente sin re-fetch completo
      evaluacion.value = { ...evaluacion.value, [nombreSeccion]: valor }
      return true
    } catch (err) {
      showAlert(`Error al guardar la sección: ${err.message}`, 'error')
      return false
    } finally {
      guardandoSeccion[nombreSeccion] = false
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // ACTUALIZAR zonas afectadas (controla qué tests ortopédicos resaltar)
  // ─────────────────────────────────────────────────────────────────────
  const actualizarZonasAfectadas = async (zonas) => {
    if (!evaluacion.value?.idEvaluacionInicial) return false
    try {
      const { error } = await supabase
        .from('Evaluacion_inicial')
        .update({ zonas_afectadas: zonas })
        .eq('idEvaluacionInicial', evaluacion.value.idEvaluacionInicial)

      if (error) throw error
      evaluacion.value = { ...evaluacion.value, zonas_afectadas: zonas }
      return true
    } catch (err) {
      showAlert('Error al actualizar zonas afectadas: ' + err.message, 'error')
      return false
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // VINCULAR la evaluación a un Tratamiento (cuando el fisio decide que
  // el paciente requiere sesiones de seguimiento — Escenario A del
  // diseño de "Ciclos de Tratamiento")
  // ─────────────────────────────────────────────────────────────────────
  const vincularATratamiento = async (idTratamiento) => {
    if (!evaluacion.value?.idEvaluacionInicial) return false
    try {
      const { error } = await supabase
        .from('Evaluacion_inicial')
        .update({ idTratamiento })
        .eq('idEvaluacionInicial', evaluacion.value.idEvaluacionInicial)

      if (error) throw error
      evaluacion.value = { ...evaluacion.value, idTratamiento }
      return true
    } catch (err) {
      showAlert('Error al vincular el tratamiento: ' + err.message, 'error')
      return false
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Registrar mediciones numéricas iniciales en Sesion_Evaluacion
  // (EVA inicial, grados ROM, fuerza Daniels) — usa el idSesion de la
  // evaluación inicial, igual que se hace para evolución de seguimiento.
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {Array} mediciones  [{ idEvaluacion, resultado, observacion }]
   *   idEvaluacion = FK al catálogo Evaluacion (ej. "Escala EVA", "ROM flexión rodilla")
   */
  const registrarMedicionesIniciales = async (mediciones) => {
    if (!evaluacion.value?.idSesion) {
      showAlert('No hay sesión de evaluación vinculada.', 'error')
      return false
    }
    if (!mediciones?.length) return true // nada que insertar

    loading.value = true
    try {
      const filas = mediciones.map(m => ({
        idSesion:    evaluacion.value.idSesion,
        idEvaluacion: m.idEvaluacion,
        resultado:   m.resultado,
        observacion: m.observacion || null,
      }))

      const { error } = await supabase
        .from('Sesion_Evaluacion')
        .insert(filas)

      if (error) throw error
      showAlert('✅ Mediciones iniciales registradas.', 'success')
      return true
    } catch (err) {
      showAlert('Error al registrar mediciones: ' + err.message, 'error')
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    // Estado
    evaluacion,
    loading,
    guardandoSeccion,
    progreso,
    // Acciones
    crearEvaluacionInicial,
    fetchEvaluacionPorSesion,
    fetchEvaluacionesPaciente,
    guardarSeccion,
    actualizarZonasAfectadas,
    vincularATratamiento,
    registrarMedicionesIniciales,
  }
}