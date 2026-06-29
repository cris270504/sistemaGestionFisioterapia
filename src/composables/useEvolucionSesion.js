/**
 * useEvolucionSesion.js
 *
 * Composable para el registro RÁPIDO de evolución en sesiones de
 * seguimiento (Sesion.tipo = 'tratamiento_control'), equivalente a la
 * sección 19 "Evolución / reevaluación" de la ficha física.
 *
 * A diferencia de useEvaluacionInicial, esto NO repite las 18 secciones.
 * Solo registra: Fecha (ya viene de Sesion.fecha_hora), Dolor EVA,
 * ROM/Fuerza puntual, Función, y Observaciones/ajustes — usando los
 * campos ya existentes en Sesion (notas_evolucion, indicaciones) más
 * filas en Sesion_Evaluacion para las métricas numéricas del catálogo.
 */

import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

export function useEvolucionSesion() {
  const { showAlert } = useAlert()

  const loading = ref(false)

  // ─────────────────────────────────────────────────────────────────────
  // Catálogo de métricas disponibles para evolución (tabla Evaluacion)
  // ─────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────
  // Registrar la evolución de una sesión de seguimiento ya atendida
  // ─────────────────────────────────────────────────────────────────────
  /**
   * @param {Object} datos
   *   - idSesion        bigint NOT NULL (la Sesion tipo='tratamiento_control')
   *   - notasEvolucion  text — resumen libre de cómo evoluciona el paciente
   *   - indicaciones    text — ajustes al plan / tarea para casa
   *   - mediciones      Array<{ idEvaluacion, resultado, observacion }>
   *                      ej: [{ idEvaluacion: 3, resultado: 4, observacion: 'EVA bajó de 7 a 4' }]
   */
  const registrarEvolucion = async ({ idSesion, notasEvolucion, indicaciones, mediciones = [] }) => {
    if (!idSesion) { showAlert('Falta indicar la sesión.', 'error'); return false }
    if (!notasEvolucion?.trim()) { showAlert('Debe registrar al menos una nota de evolución.', 'error'); return false }

    loading.value = true
    try {
      // 1. Actualizar la nota de evolución y las indicaciones en la Sesion
      const { error: errSesion } = await supabase
        .from('Sesion')
        .update({
          notas_evolucion: notasEvolucion.trim(),
          indicaciones: indicaciones?.trim() || null,
        })
        .eq('idSesion', idSesion)

      if (errSesion) throw errSesion

      // 2. Insertar las mediciones numéricas puntuales de esta sesión
      //    (ej. EVA de hoy, grado ROM puntual que se quiso corroborar)
      if (mediciones.length > 0) {
        const filas = mediciones.map(m => ({
          idSesion,
          idEvaluacion: m.idEvaluacion,
          resultado: m.resultado,
          observacion: m.observacion || null,
        }))

        if (darDeAlta.value) {
          const { error: errAlta } = await supabase
            .from('Tratamiento')
            .update({ estado: 'finalizado' }) // Asumiendo que tienes esta columna
            .eq('idTratamiento', sesion.idTratamiento)

          if (errAlta) console.error("Error al dar de alta:", errAlta)
        }

        const { error: errMed } = await supabase
          .from('Sesion_Evaluacion')
          .insert(filas)

        if (errMed) throw errMed
      }

      showAlert('✅ Evolución registrada.', 'success')
      return true

    } catch (err) {
      showAlert('Error al registrar la evolución: ' + err.message, 'error')
      return false
    } finally {
      loading.value = false
    }
  }
  const darDeAlta = ref(false) // Vinculado al checkbox


  // ─────────────────────────────────────────────────────────────────────
  // Obtener el historial de evolución (timeline) de un Tratamiento
  // ─────────────────────────────────────────────────────────────────────
  /**
   * Trae todas las sesiones de seguimiento de un tratamiento, ordenadas
   * por fecha, con sus notas y mediciones — esto es el "rotativo" que
   * la fisioterapeuta describió.
   */
  const fetchTimelineEvolucion = async (idTratamiento) => {
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('Sesion')
        .select(`
          idSesion, fecha_hora, numero_sesion, estado,
          notas_evolucion, indicaciones,
          Sesion_Evaluacion (
            idSesionEvaluacion, resultado, observacion,
            Evaluacion ( idEvaluacion, nombre, valor_min, valor_max )
          )
        `)
        .eq('idTratamiento', idTratamiento)
        .eq('tipo', 'tratamiento_control')
        .order('fecha_hora', { ascending: true })

      if (error) throw error
      return data ?? []
    } catch (err) {
      showAlert('Error al cargar el historial de evolución: ' + err.message, 'error')
      return []
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    registrarEvolucion,
    fetchTimelineEvolucion,
  }
}