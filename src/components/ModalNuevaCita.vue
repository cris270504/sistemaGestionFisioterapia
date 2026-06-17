<script setup>
/**
 * ModalNuevaCita.vue — v5 CICLOS DE TRATAMIENTO CONTINUOS
 * * MEJORAS:
 * - Implementación de las 3 modalidades del ciclo clínico.
 * - Algoritmo integrado para sugerencia óptima de Paquetes + Sesiones Sueltas.
 * - Capacidad de ajuste manual de combinación para la secretaria.
 * - Soporte para el Escenario B (Recarga de tratamiento existente) mediante props.
 * - Enlace a evaluaciones previas desvinculadas.
 * - Formateo y validación de horarios en zona horaria local (-05:00).
 */
import { ref, computed, watch } from 'vue'
import { MODALIDADES } from '@/composables/useCitas'
import { useSearch } from '@/composables/useSearch'
import { getTodayISO } from '@/lib/dateUtils'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  fisios: { type: Array, default: () => [] },
  pacientes: { type: Array, default: () => [] },
  tarifario: { type: Array, default: () => [] },
  paquetes: { type: Array, default: () => [] },
  loadingAccion: { type: Boolean, default: false },
  saldoPaciente: { type: [Number, null], default: null },
  obtenerSlots: { type: Function, required: true },
  onFetchSaldoPaciente: { type: Function, required: true },
  onFetchEvaluaciones: { type: Function, required: true }, // 👈 Recibe la función
  tratamientoARecargar: { type: Object, default: null }
})

const emit = defineEmits(['close', 'submit', 'paciente-changed', 'fisio-changed', 'reset-saldo'])

// ── Estados Principales del Formulario ───────────────────────────────────────
const idPaciente = ref(null)
const idFisioterapeuta = ref(null)
const fecha = ref('')
const hora = ref('')
const modalidad = ref(null)
const observaciones = ref('')

// Configuración matemática del Tratamiento / Masajes
const sesionesDeseadas = ref(1)
const inputPaquetes = ref(0)
const inputSueltas = ref(0)
const overrideSecretaria = ref(false)

// Vinculación con evaluaciones previas
const vieneDeEvaluacionPrevia = ref(false)
const idEvaluacionSesion = ref(null)
const evaluacionesDisponibles = ref([]) // Simulador de carga de evaluaciones huérfanas

// Sesiones opcionales para agendamiento en lote
const sesionesOpcionales = ref([])

// ── Computeds de Control de Flujo ───────────────────────────────────────────
const esRecarga = computed(() => !!props.tratamientoARecargar)

const modalidadActual = computed(() => {
  return MODALIDADES.find(m => m.id === modalidad.value) ?? null
})

const fechaMin = computed(() => getTodayISO())

// El agendamiento de sesiones futuras aplica a Tratamientos y Masajes con cantidad > 1
const permiteSesionesFuturas = computed(() => {
  if (modalidad.value === 'evaluacion_inicial') return false
  return sesionesDeseadas.value > 1
})

// ── Algoritmo Dinámico de Combinación Óptima (Catálogo) ──────────────────────
const paquetesDisponibles = computed(() => props.tarifario.filter(t => t.tipo === 'paquete'))
const paqueteSeleccionado = ref(null)
const precioSesionSuelta = computed(() => props.tarifario.find(t => t.tipo === 'sesion_suelta')?.precio || 0)
const precioMasajeSuelto = computed(() => props.tarifario.find(t => t.tipo === 'masaje')?.precio || 0)

const paqueteSeleccionadoData = computed(() => paquetesDisponibles.value.find(p => p.idServicio === paqueteSeleccionado.value))

// 1. Auto-seleccionar el paquete más grande por defecto SOLO al inicio
watch(paquetesDisponibles, (val) => {
  if (val.length > 0 && !paqueteSeleccionado.value) {
    // Ordenamos de mayor a menor y seleccionamos el primero
    const ordenados = [...val].sort((a, b) => (b.cantidad_sesiones || 1) - (a.cantidad_sesiones || 1))
    paqueteSeleccionado.value = ordenados[0].idServicio
  }
}, { immediate: true })

// 2. Watcher ÚNICO y estable para el cálculo matemático
watch([sesionesDeseadas, modalidad, paqueteSeleccionado], ([cant, mod, idPaquete]) => {
  if (mod === 'masaje') {
    inputPaquetes.value = 0
    inputSueltas.value = cant
    return
  }

  if (mod === 'tratamiento' && !overrideSecretaria.value) {
    if (!idPaquete || paquetesDisponibles.value.length === 0) {
      inputPaquetes.value = 0
      inputSueltas.value = cant
      return
    }

    const paqueteActivo = paquetesDisponibles.value.find(p => p.idServicio === idPaquete)
    const size = paqueteActivo?.cantidad_sesiones || 1

    // Matemática simple respetando el paquete elegido en el select
    inputPaquetes.value = Math.floor(cant / size)
    inputSueltas.value = cant % size
  }
})

// 3. Recálculo si la secretaria desmarca el checkbox manual
watch(overrideSecretaria, (manual) => {
  if (!manual && modalidad.value === 'tratamiento' && paqueteSeleccionadoData.value) {
    const size = paqueteSeleccionadoData.value.cantidad_sesiones || 1
    inputPaquetes.value = Math.floor(sesionesDeseadas.value / size)
    inputSueltas.value = sesionesDeseadas.value % size
  }
})

// Cálculo final en tiempo real del Costo Total
const precioEstimado = computed(() => {
  const mod = modalidad.value
  if (!mod || mod === 'evaluacion_inicial') return 0
  if (mod === 'masaje') return sesionesDeseadas.value * precioMasajeSuelto.value
  
  if (mod === 'tratamiento') {
    const precioPaquete = paqueteSeleccionadoData.value?.precio || 0
    return (inputPaquetes.value * precioPaquete) + (inputSueltas.value * precioSesionSuelta.value)
  }
  return 0
})


watch(paqueteSeleccionado, (nuevoIdPaquete) => {
  if (modalidad.value === 'tratamiento' && !overrideSecretaria.value && nuevoIdPaquete) {
    const paqueteManual = paquetesDisponibles.value.find(p => p.idServicio === nuevoIdPaquete)
    if (paqueteManual) {
      const size = paqueteManual.cantidad_sesiones || 1
      inputPaquetes.value = Math.floor(sesionesDeseadas.value / size)
      inputSueltas.value = sesionesDeseadas.value % size
    }
  }
})

const maxSesionesAdicionales = computed(() => {
  if (esRecarga.value || vieneDeEvaluacionPrevia.value) return sesionesDeseadas.value
  // Si es un ciclo nuevo, la sesión #1 ya se agenda en la parte superior,
  // por lo que las opcionales solo pueden ser (Total - 1)
  return Math.max(0, sesionesDeseadas.value - 1)
})

const puedeAgregarMasSesiones = computed(() => sesionesOpcionales.value.length < maxSesionesAdicionales.value)

watch(maxSesionesAdicionales, (max) => {
  if (sesionesOpcionales.value.length > max) {
    sesionesOpcionales.value = sesionesOpcionales.value.slice(0, max)
  }
})

// ── Buscadores Inteligentes (useSearch) ─────────────────────────────────────
const {
  searchQuery: searchPaciente,
  filteredItems: pacientesFiltrados
} = useSearch(computed(() => props.pacientes), (p) => {
  const nombre = nombrePaciente(p).toLowerCase()
  const doc = p.Persona?.numero_documento?.toLowerCase() || ''
  return `${nombre} ${doc}`
})

const showPacienteList = ref(false)

const {
  searchQuery: searchFisio,
  filteredItems: fisiosFiltrados
} = useSearch(computed(() => props.fisios), (f) => nombreFisio(f).toLowerCase())

const showFisioList = ref(false)

// ── Selección de Entidades ──────────────────────────────────────────────────
const seleccionarPaciente = async (p) => {
  idPaciente.value = p.idPaciente
  searchPaciente.value = nombrePaciente(p)
  showPacienteList.value = false
  emit('reset-saldo')

  // Cargamos el saldo
  await props.onFetchSaldoPaciente(p.idPaciente)

  // ✅ REEMPLAZO DEL SIMULADOR: Llamamos a la BD real
  const evaluacionesRaw = await props.onFetchEvaluaciones(p.idPaciente)

  // Formateamos para que el <select> se vea bonito (Ej: "Lun 15 Jun, 08:00 AM")
  evaluacionesDisponibles.value = evaluacionesRaw.map(ev => {
    const fechaFormateada = new Intl.DateTimeFormat('es-PE', {
      weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Lima'
    }).format(new Date(ev.fecha_hora))

    return {
      idSesion: ev.idSesion,
      label: `${fechaFormateada} — ${ev.observaciones || 'Sin observaciones'}`
    }
  })
}

const seleccionarFisio = (f) => {
  idFisioterapeuta.value = f.idFisioterapeuta
  searchFisio.value = nombreFisio(f)
  showFisioList.value = false
}

// ── Control de Slots de Horarios ────────────────────────────────────────────
const slotsDisponibles = ref([])
const loadingSlots = ref(false)

const slotsFiltrados = computed(() => {
  if (loadingSlots.value) return []
  const ahora = new Date()
  const fechaHoy = ahora.toISOString().split('T')[0]

  if (fecha.value !== fechaHoy) return slotsDisponibles.value

  const horaActual = ahora.getHours()
  const minActual = ahora.getMinutes()

  return slotsDisponibles.value.filter(slot => {
    const [h, m] = slot.split(':').map(Number)
    return h > horaActual || (h === horaActual && m > minActual)
  })
})

watch([idFisioterapeuta, fecha, modalidad], async ([idFisio, f, mod]) => {
  if (!idFisio || !f || !mod) {
    slotsDisponibles.value = []
    hora.value = ''
    return
  }
  loadingSlots.value = true
  try {
    const duracion = mod === 'masaje' ? 60 : 20
    slotsDisponibles.value = await props.obtenerSlots(idFisio, f, duracion)
  } catch (error) {
    slotsDisponibles.value = []
  } finally {
    if (!slotsDisponibles.value.includes(hora.value)) hora.value = ''
    loadingSlots.value = false
  }
})

// ── Agendamiento en Lote (Sesiones Opcionales) ──────────────────────────────
const agregarSesionOpcional = () => {
  sesionesOpcionales.value.push({ fecha: '', hora: '', slots: [], loading: false })
}

const buscarSlotsParaOpcional = async (index) => {
  const s = sesionesOpcionales.value[index]
  if (!s.fecha || !idFisioterapeuta.value) return

  s.loading = true
  s.hora = ''
  try {
    const horarios = await props.obtenerSlots(idFisioterapeuta.value, s.fecha, 60)
    s.slots = horarios
  } catch (e) {
    s.slots = []
  } finally {
    s.loading = false
  }
}

// ── Control de Apertura y Reseteo ───────────────────────────────────────────
watch(() => props.isOpen, (abierto) => {
  if (abierto) resetForm()
})

const resetForm = () => {
  if (props.tratamientoARecargar) {
    modalidad.value = 'tratamiento'
    sesionesDeseadas.value = 5
    overrideSecretaria.value = false
    idPaciente.value = props.tratamientoARecargar.idPaciente
    idFisioterapeuta.value = props.tratamientoARecargar.idFisioterapeuta
  } else {
    idPaciente.value = null
    searchPaciente.value = ''
    idFisioterapeuta.value = null
    searchFisio.value = ''
    modalidad.value = null
    sesionesDeseadas.value = 1
    overrideSecretaria.value = false
    vieneDeEvaluacionPrevia.value = false
    idEvaluacionSesion.value = null
  }
  fecha.value = ''
  hora.value = ''
  observaciones.value = ''
  slotsDisponibles.value = []
  sesionesOpcionales.value = []
}

// ── Envío del Formulario ────────────────────────────────────────────────────
const handleSubmit = () => {
  const sesionesExtra = sesionesOpcionales.value
    .filter(s => s.fecha && s.hora)
    .map(s => `${s.fecha}T${s.hora}:00-05:00`)

  const payload = {
    idPaciente: idPaciente.value,
    idFisioterapeuta: idFisioterapeuta.value,
    fecha_hora: fecha.value && hora.value ? `${fecha.value}T${hora.value}:00-05:00` : null,
    modalidad: modalidad.value,
    observaciones: observaciones.value,
    sesionesOpcionales: sesionesExtra,

    // Propiedades de la transacción de ciclo clínico continuo
    idTratamientoExistente: props.tratamientoARecargar?.idTratamiento || null,
    vieneDeEvaluacionPrevia: vieneDeEvaluacionPrevia.value,
    idEvaluacionSesion: vieneDeEvaluacionPrevia.value ? idEvaluacionSesion.value : null,

    tratamientoConfig: {
      sesionesDeseadas: sesionesDeseadas.value,
      paquetes: inputPaquetes.value,
      sueltas: inputSueltas.value,
      costoTotal: precioEstimado.value,
      tamanoPaquete: paqueteSeleccionadoData.value?.cantidad_sesiones || 1 // ✅ AHORA SÍ ESTÁ ADENTRO
    }
  }

  emit('submit', payload)
}

const hidePacienteDelay = () => setTimeout(() => { showPacienteList.value = false }, 200)
const hideFisioDelay = () => setTimeout(() => { showFisioList.value = false }, 200)

const nombreFisio = (f) => `${f.Persona?.nombres ?? ''} ${f.Persona?.apellidos ?? ''} — ${f.especialidad}`.trim()
const nombrePaciente = (p) => `${p.Persona?.nombres ?? ''} ${p.Persona?.apellidos ?? ''}`.trim()
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window modal-cita">

        <div class="modal-header">
          <h3>{{ esRecarga ? 'Recargar Sesiones de Tratamiento' : 'Registrar Nueva Cita / Ciclo' }}</h3>
          <button class="close-x" @click="emit('close')" :disabled="loadingAccion">&times;</button>
        </div>

        <form @submit.prevent="handleSubmit" class="modal-form" novalidate>

          <div v-if="esRecarga" class="resumen-box"
            style="border-color: #0f766e; background: #f0fdfa; margin-bottom: 15px;">
            <span class="resumen-icono">🔄</span>
            <div>
              <strong>Paciente: {{ tratamientoARecargar.nombrePaciente }}</strong>
              <p>Tratamiento #{{ tratamientoARecargar.idTratamiento }} — Cuenta actualmente con {{
                tratamientoARecargar.sesionesRestantes }} sesiones en su saldo.</p>
            </div>
          </div>

          <div v-if="!esRecarga" class="form-section">
            <p class="section-label">1. Participantes</p>
            <div class="form-grid">

              <div class="input-group" style="position: relative;">
                <label>Paciente <span class="req">*</span></label>
                <input type="text" v-model="searchPaciente" @focus="showPacienteList = true" @blur="hidePacienteDelay"
                  placeholder="🔍 Buscar por nombre o DNI..." required class="search-input"
                  :class="{ 'is-selected': idPaciente }" />
                <span v-if="idPaciente" class="valid-check">✅</span>

                <div v-if="idPaciente" class="field-hint" style="margin-top: 5px;">
                  <span>Saldo actual disponible: </span>
                  <strong :class="saldoPaciente > 0 ? 'text-green' : 'text-red'">
                    {{ saldoPaciente }} sesiones
                  </strong>
                </div>

                <ul v-if="showPacienteList && pacientesFiltrados.length > 0" class="options-list">
                  <li v-for="p in pacientesFiltrados" :key="p.idPaciente" @click="seleccionarPaciente(p)">
                    <div class="li-name">{{ p.Persona?.nombres }} {{ p.Persona?.apellidos }}</div>
                    <div class="li-sub">Doc: {{ p.Persona?.numero_documento || 'S/N' }}</div>
                  </li>
                </ul>
              </div>

              <div class="input-group" style="position: relative;">
                <label>Fisioterapeuta Evalúa <span class="req">*</span></label>
                <input type="text" v-model="searchFisio" @focus="showFisioList = true" @blur="hideFisioDelay"
                  placeholder="🔍 Buscar especialista..." required class="search-input"
                  :class="{ 'is-selected': idFisioterapeuta }" />
                <span v-if="idFisioterapeuta" class="valid-check">✅</span>

                <ul v-if="showFisioList && fisiosFiltrados.length > 0" class="options-list">
                  <li v-for="f in fisiosFiltrados" :key="f.idFisioterapeuta" @click="seleccionarFisio(f)">
                    <div class="li-name">{{ f.Persona?.nombres }} {{ f.Persona?.apellidos }}</div>
                    <div class="li-sub">{{ f.especialidad }}</div>
                  </li>
                </ul>
              </div>

            </div>
          </div>

          <div v-if="!esRecarga" class="form-section">
            <p class="section-label">2. Modalidad de atención <span class="req">*</span></p>
            <div class="modalidad-grid">
              <button v-for="m in MODALIDADES" :key="m.id" type="button" class="modalidad-card"
                :class="{ selected: modalidad === m.id }" :style="modalidad === m.id ? `--card-color: ${m.color}` : ''"
                @click="modalidad = m.id">
                <span class="modalidad-icono">{{ m.icono }}</span>
                <span class="modalidad-nombre">{{ m.label }}</span>
                <span class="modalidad-desc">{{ m.descripcion }}</span>
              </button>
            </div>
          </div>

          <Transition name="slide-input">
            <div v-if="['tratamiento', 'masaje'].includes(modalidad)" class="form-section"
              style="background: #f8fafc; padding: 15px; border-radius: 8px;">
              <p class="section-label" style="color: #0f766e;">3. Configuración de Sesiones</p>

              <div class="form-grid" style="margin-top: 5px;">
                <div class="input-group">
                  <label>¿Cuántas sesiones en total necesita?</label>
                  <input type="number" v-model.number="sesionesDeseadas" min="1" max="50" required />
                </div>

                <div v-if="modalidad === 'tratamiento'" class="input-group">
                  <label>Paquete a aplicar</label>
                  <select v-model="paqueteSeleccionado" @change="overrideSecretaria = false" required>
                    <option v-for="p in paquetesDisponibles" :key="p.idServicio" :value="p.idServicio">
                      {{ p.nombre }} ({{ p.cantidad_sesiones }} ses.) — S/ {{ p.precio }}
                    </option>
                  </select>
                </div>
              </div>

              <div v-if="modalidad === 'tratamiento'" class="form-grid" style="margin-top: 10px;">
                <div class="input-group span-2">
                  <label>Desglose Tarifario Sugerido</label>
                  <div class="preview-calculo"
                    style="padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; font-size: 12.5px;">
                    <div>📦 Paquete "{{ paqueteSeleccionadoData?.nombre || 'Base' }}" ({{
                      paqueteSeleccionadoData?.cantidad_sesiones || 1 }} ses.): <strong>{{ inputPaquetes }}</strong> (S/
                      {{ (inputPaquetes * (paqueteSeleccionadoData?.precio || 0)).toFixed(2) }})</div>
                    <div>💆 Sesiones sueltas: <strong>{{ inputSueltas }}</strong> (S/ {{ (inputSueltas *
                      precioSesionSuelta).toFixed(2) }})</div>
                  </div>

                  <div style="margin-top: 5px;">
                    <input type="checkbox" id="chkManual" v-model="overrideSecretaria" />
                    <label for="chkManual"
                      style="font-size: 11.5px; margin-left: 5px; cursor: pointer; color: #475569;">Ajustar combinación
                      manualmente</label>
                  </div>
                </div>
              </div>

              <div v-if="overrideSecretaria && modalidad === 'tratamiento'" class="form-grid style-manual"
                style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                <div class="input-group">
                  <label>Modificar Paquetes</label>
                  <input type="number" v-model.number="inputPaquetes" min="0" />
                </div>
                <div class="input-group">
                  <label>Modificar Sueltas</label>
                  <input type="number" v-model.number="inputSueltas" min="0" />
                </div>
              </div>
            </div>
          </Transition>

          <Transition name="slide-input">
            <div v-if="modalidad === 'tratamiento' && !esRecarga && evaluacionesDisponibles.length > 0"
              class="form-section">
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="chkVieneEval" v-model="vieneDeEvaluacionPrevia" />
                <label for="chkVieneEval" style="font-weight: 700; font-size: 12px; cursor: pointer; color: #0f766e;">
                  ¿Este tratamiento corresponde a una evaluación ya realizada antes?
                </label>
              </div>

              <div v-if="vieneDeEvaluacionPrevia" class="input-group" style="margin-top: 8px;">
                <label>Seleccionar Evaluación del Historial <span class="req">*</span></label>
                <select v-model="idEvaluacionSesion" required>
                  <option value="null" disabled>— Seleccione la evaluación previa —</option>
                  <option v-for="ev in evaluacionesDisponibles" :key="ev.idSesion" :value="ev.idSesion">
                    {{ ev.label }}
                  </option>
                </select>
                <p class="field-hint nota-evaluacion">
                  💡 Al seleccionar esto, el tratamiento se anclará a esa cita y no se agendará una nueva evaluación
                  diagnóstica hoy.
                </p>
              </div>
            </div>
          </Transition>

          <div v-if="modalidad && !(vieneDeEvaluacionPrevia && !esRecarga)" class="form-section">
            <p class="section-label">
              {{ modalidad === 'evaluacion_inicial' ? '3.' : '4.' }} Fecha y Horario de Atención
            </p>
            <div class="form-grid">
              <div class="input-group">
                <label>{{ modalidad === 'tratamiento' ? 'Fecha Primera Sesión' : 'Fecha de la Cita' }} <span
                    class="req">*</span></label>
                <input type="date" v-model="fecha" :min="fechaMin"
                  :required="!(vieneDeEvaluacionPrevia && !esRecarga)" />
              </div>
              <div class="input-group">
                <label>Horario disponible <span class="req">*</span></label>
                <select v-model="hora" :required="!(vieneDeEvaluacionPrevia && !esRecarga)"
                  :disabled="!fecha || !idFisioterapeuta || loadingSlots">
                  <option value="" disabled>
                    {{
                      loadingSlots ? 'Buscando huecos libres...' :
                        (!idFisioterapeuta ? '⚠️ Falta Especialista' :
                          (!fecha ? '⚠️ Falta Fecha' : '— Seleccione hora —'))
                    }}
                  </option>
                  <option v-for="slot in slotsFiltrados" :key="slot" :value="slot">{{ slot }}</option>
                </select>
              </div>

              <div class="input-group span-2">
                <label>Observaciones Clínicas / Administrativas</label>
                <input type="text" v-model="observaciones"
                  placeholder="Ej: Dolor lumbar crónico, requiere compresión fría" maxlength="200" />
              </div>
            </div>
          </div>

          <Transition name="slide-input">
            <div v-if="permiteSesionesFuturas && !(vieneDeEvaluacionPrevia && !esRecarga)" class="form-section"
              style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px dashed #0ea5e9;">
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <p class="section-label" style="color: #0ea5e9;">Agendar Siguientes Sesiones en Agenda</p>
                <span style="font-size: 11px; font-weight: bold; color: #475569;">{{ sesionesOpcionales.length }} de {{
                  maxSesionesAdicionales }} posibles</span>
              </div>
              <p class="field-hint">Si el paciente ya definió su disponibilidad, programe hasta {{
                maxSesionesAdicionales }} sesiones adicionales.</p>

              <div v-for="(sesion, index) in sesionesOpcionales" :key="index" class="form-grid"
                style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                <div class="input-group">
                  <label>Fecha Terápica {{ (vieneDeEvaluacionPrevia || esRecarga) ? index + 1 : index + 2 }}</label>
                  <input type="date" v-model="sesion.fecha" :min="fechaMin" @change="buscarSlotsParaOpcional(index)" />
                </div>
                <div class="input-group">
                  <label>Hora</label>
                  <select v-model="sesion.hora" :disabled="!sesion.fecha || sesion.loading">
                    <option value="" disabled>{{ sesion.loading ? 'Buscando huecos...' : (sesion.fecha ? '— Seleccione hora —' : '⚠️ Elija fecha') }}</option>
                    <option v-for="slot in sesion.slots" :key="slot" :value="slot">{{ slot }}</option>
                  </select>
                </div>
                <div style="grid-column: span 2; text-align: right;">
                  <button type="button" @click="sesionesOpcionales.splice(index, 1)"
                    style="color: #ef4444; background: none; border: none; font-size: 12px; cursor: pointer; font-weight: bold;">
                    &times; Remover esta fecha
                  </button>
                </div>
              </div>

              <button type="button" class="btn-secondary" @click="agregarSesionOpcional"
                :disabled="!puedeAgregarMasSesiones" style="margin-top: 12px; width: 100%; justify-content: center;"
                :style="!puedeAgregarMasSesiones ? 'opacity: 0.5; cursor: not-allowed;' : ''">
                {{ puedeAgregarMasSesiones ? '+ Programar otra fecha en lote' : 'Límite de sesiones alcanzado' }}
              </button>
            </div>
          </Transition>

          <div v-if="modalidad" class="resumen-box" :style="`border-color: ${modalidadActual?.color || '#cbd5e1'}`">
            <span class="resumen-icono">{{ modalidadActual?.icono || '💰' }}</span>
            <div style="width: 100%;">
              <strong>Monto Total de Operación Administrativa</strong>
              <p v-if="modalidad === 'tratamiento'">
                Cobro combinado de {{ sesionesDeseadas }} sesiones clínicas de fisioterapia.
              </p>
              <p v-else-if="modalidad === 'masaje'">
                Cobro por tarifa plana de {{ sesionesDeseadas }} sesiones de masajes relajantes/descontracturantes.
              </p>
              <p v-else>Consulta diagnóstica inicial sin costo para el paciente.</p>

              <div class="precio-badge" style="margin-top: 10px; font-size: 15px; padding: 6px 12px;">
                Total a Pagar en Caja: <strong>S/ {{ Number(precioEstimado).toFixed(2) }}</strong>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')" :disabled="loadingAccion">
              Cancelar
            </button>
            <button type="submit" class="btn-primary-submit"
              :disabled="loadingAccion || !idPaciente || !idFisioterapeuta || (!modalidad) || (!fecha && !(vieneDeEvaluacionPrevia && !esRecarga))">
              <span v-if="loadingAccion" class="btn-spinner"></span>
              <span v-else>{{ esRecarga ? 'Confirmar Recarga de Saldo' : 'Registrar Operación' }}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-cita {
  max-width: 640px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--gray-100);
}

.form-section:last-of-type {
  border-bottom: none;
}

.precio-badge {
  margin-top: 8px;
  padding: 4px 8px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  display: inline-block;
  border-radius: 4px;
  font-size: 13px;
}

.section-label {
  margin: 0;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--navy);
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.req {
  color: #ef4444;
}

.search-input {
  width: 100%;
  padding-right: 30px !important;
}

.search-input.is-selected {
  background-color: #f0fdf4 !important;
  border-color: #10b981 !important;
  color: #065f46;
  font-weight: 600;
}

.valid-check {
  position: absolute;
  right: 10px;
  top: 28px;
  font-size: 14px;
  pointer-events: none;
}

.options-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-sm);
  max-height: 180px;
  overflow-y: auto;
  z-index: 50;
  margin: 4px 0 0 0;
  padding: 0;
  list-style: none;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.options-list li {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--gray-50);
  transition: background 0.2s;
}

.options-list li:hover {
  background: #f0f7ff;
}

.li-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--navy);
}

.li-sub {
  font-size: 11.5px;
  color: var(--gray-500);
}

.modalidad-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
}

.modalidad-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--gray-200);
  background: var(--gray-50);
  cursor: pointer;
  text-align: left;
  transition: 0.2s;
}

.modalidad-card:hover {
  border-color: var(--blue);
  background: #f0f7ff;
}

.modalidad-card.selected {
  border-color: var(--card-color, var(--navy));
  background: color-mix(in srgb, var(--card-color, var(--navy)) 8%, white);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--card-color, var(--navy)) 15%, transparent);
}

.modalidad-icono {
  font-size: 20px;
  line-height: 1;
}

.modalidad-nombre {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--navy);
}

.modalidad-desc {
  font-size: 11px;
  color: var(--gray-500);
  line-height: 1.4;
}

.field-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--gray-500);
  line-height: 1.4;
}

.field-hint.warn {
  color: #b45309;
}

.resumen-box {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--gray-200);
  background: var(--gray-50);
}

.resumen-box strong {
  font-size: 13px;
  color: var(--navy);
  display: block;
  margin-bottom: 2px;
}

.resumen-box p {
  margin: 0;
  font-size: 12px;
  color: var(--gray-500);
}

.text-green {
  color: #10b981;
  font-weight: 700;
}

.text-red {
  color: #ef4444;
  font-weight: 700;
}

.nota-evaluacion {
  margin-top: 4px !important;
  color: #0f766e !important;
  font-style: italic;
}

.resumen-icono {
  font-size: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

@media (max-width: 600px) {
  .modalidad-grid {
    grid-template-columns: 1fr;
  }
}
</style>