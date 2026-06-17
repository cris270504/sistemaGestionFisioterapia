<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCitas, ESTADOS_SESION } from '@/composables/useCitas'
import { useAlert } from '@/composables/useAlert'
import { supabase } from '@/lib/supabaseClient'
import { getTodayISO, getDateISO } from '@/lib/dateUtils'
import ModalNuevaCita from '@/components/ModalNuevaCita.vue'
import ModalConfirmarPago from '@/components/ModalConfirmarPago.vue'
import ModalReprogramarCita from '@/components/ModalReprogramarCita.vue'

const router = useRouter()
const tarifario = ref([]);

const {
  citas, fisios, pacientes, paquetes, loading, loadingAccion,
  esFisioterapeuta, esPaciente, puedeGestionar,
  initUser, fetchCitas, fetchFisios, fetchPacientes,
  fetchHorarioFisio, fetchPaquetesPaciente, fetchPaquetesCatalogo,
  crearCita, registrarCheckIn, confirmarPago, cancelarCita, marcarInasistencia,
  iniciarAtencion, confirmarAsistencia, fetchTarifario, saldoPaciente, obtenerSlotsDisponibles, fetchSaldoPaciente,
  formatFechaHora, getEstadoInfo, nombreCompleto, reprogramarCita, fetchEvaluacionesHuerfanas
} = useCitas()

const { showAlert, showConfirm } = useAlert()


const columnas = computed(() => {
  const base = ['paciente', 'fisioterapeuta', 'fecha', 'estado', 'acciones']

  // Si es paciente, ocultamos la columna de Acciones
  if (esPaciente.value) {
    return base.filter(c => c !== 'acciones')
  }

  return base
})

// ── Estado local de UI ────────────────────────────────────────────────────────
const viewMode = ref('list')
const showModalNueva = ref(false)
const showModalPago = ref(false)
const showModalCancelacion = ref(false)
const showModalDetalle = ref(false)
const showModalReprogramar = ref(false)
const sesionSeleccionada = ref(null)
const motivoCancelacion = ref('')

const filtroFecha = ref(getTodayISO())
const filtroEstado = ref('')
const filtroFisio = ref('')
const calDate = ref(new Date())

const tituloVista = computed(() => esPaciente.value ? 'Mis Citas' : esFisioterapeuta.value ? 'Mi Agenda' : 'Agenda General')
const subtituloVista = computed(() => esPaciente.value ? 'Estado de tus citas.' : esFisioterapeuta.value ? 'Tus turnos asignados.' : 'Gestión y reservas.')
const mesActualNombre = computed(() => new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(calDate.value))

// Agrega esto en tu <script setup>, cerca de tus otras funciones "handle..."
const handleNuevaCita = async (payload) => {
  if (await crearCita(payload)) {
    showModalNueva.value = false;
    await cargarCitas();
  }
}

const diasCalendario = computed(() => {
  const year = calDate.value.getFullYear(), month = calDate.value.getMonth()
  const startDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const dias = []
  for (let i = 0; i < startDay; i++) dias.push(null)
  for (let i = 1; i <= daysInMonth; i++) dias.push(i)
  return dias
})

const prevMonth = () => { calDate.value = new Date(calDate.value.getFullYear(), calDate.value.getMonth() - 1, 1); cargarCitas() }
const nextMonth = () => { calDate.value = new Date(calDate.value.getFullYear(), calDate.value.getMonth() + 1, 1); cargarCitas() }

const citasDelDia = (dia) => {
  if (!dia) return []
  const dateStr = `${calDate.value.getFullYear()}-${String(calDate.value.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return citas.value.filter(c => c.fecha_hora && c.fecha_hora.startsWith(dateStr))
}

const formatSoloHora = (iso) => new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const nombrePacienteFlat = (sesion) => `${sesion?.paciente_nombres || ''} ${sesion?.paciente_apellidos || ''}`.trim() || '—';
const nombreFisioFlat = (sesion) => `${sesion?.fisio_nombres || ''} ${sesion?.fisio_apellidos || ''}`.trim() || '—';

onMounted(async () => {
  await initUser()

  if (puedeGestionar.value) {
    // Cargamos de forma independiente. Si uno falla, el otro carga igual.
    const promises = [fetchFisios(), fetchPacientes()];
    if (fetchPaquetesCatalogo) promises.push(fetchPaquetesCatalogo());

    promises.push(
      // Verifica que esta consulta traiga 'idServicio', 'nombre', 'precio' y 'tipo'
      supabase.from('Catalogo_Servicio').select('idServicio, nombre, precio, tipo, cantidad_sesiones').eq('activo', true)
        .then(({ data }) => { tarifario.value = data || [] })
    );

    await Promise.allSettled(promises);
  }

  await cargarCitas()
})

const cargarCitas = async () => {
  const filtros = {}
  if (viewMode.value === 'calendar') {
    const y = calDate.value.getFullYear(), m = calDate.value.getMonth()
    filtros.rangoInicio = new Date(y, m, 1, 0, 0, 0).toISOString()
    filtros.rangoFin = new Date(y, m + 1, 0, 23, 59, 59).toISOString()
  } else {
    if (filtroFecha.value) filtros.fecha = filtroFecha.value
  }
  if (filtroEstado.value) filtros.estado = filtroEstado.value
  if (filtroFisio.value) filtros.idFisioterapeuta = filtroFisio.value
  await fetchCitas(filtros)
}

watch(viewMode, () => cargarCitas())

// ── Acciones de la tabla ──────────────────────────────────────────────────────
const abrirDetalleCalendario = (cita) => {
  sesionSeleccionada.value = cita; // ¿Cita realmente trae el idSesion?
  showModalDetalle.value = true
}
const abrirModalPago = (sesion) => { sesionSeleccionada.value = sesion; showModalPago.value = true; showModalDetalle.value = false }

const handleConfirmarPago = async (payload) => {
  if (await confirmarPago(payload)) { showModalPago.value = false; await cargarCitas() }
}
const handleCheckIn = async (sesion) => {
  // 1. Ejecutar el check-in
  const exito = await registrarCheckIn(sesion);

  if (exito) {
    // ✅ CORRECCIÓN CRÍTICA: Actualiza manualmente la reactividad
    // Esto le dice a Vue: "este objeto cambió, vuelve a evaluar los v-if"
    sesion.paciente_en_sala = true;

    // 2. Si quieres asegurar todo, recarga la lista
    await cargarCitas();
  }
}
const abrirModalCancelacion = (sesion) => {
  sesionSeleccionada.value = sesion; motivoCancelacion.value = ''; showModalCancelacion.value = true; showModalDetalle.value = false
}

const abrirModalReprogramar = (sesion) => {
  sesionSeleccionada.value = sesion
  showModalReprogramar.value = true
  showModalDetalle.value = false
}

const handleReprogramar = async (payload) => {
  if (await reprogramarCita(payload)) {
    showModalReprogramar.value = false
    await cargarCitas()
  }
}

const handleConfirmarCancelacion = async () => {
  if (!motivoCancelacion.value.trim()) return showAlert('Debe indicar el motivo.', 'error')
  if (await cancelarCita({ idSesion: sesionSeleccionada.value.idSesion, motivo: motivoCancelacion.value.trim() })) {
    showModalCancelacion.value = false; await cargarCitas()
  }
}
const handleInasistencia = async (sesion) => {
  if (await showConfirm(`¿Marcar inasistencia de ${nombreCompleto(sesion.Paciente?.Persona)}?`) && await marcarInasistencia(sesion.idSesion)) await cargarCitas()
}
const abrirModalNueva = async () => {
  // Ahora supabase ya está definido porque lo importaste arriba
  if (!tarifario.value || tarifario.value.length === 0) {
    const { data: dataTarifario, error } = await supabase // ✅ Ya no dará error aquí
      .from('Catalogo_Servicio')
      .select('*')
      .eq('activo', true);

    if (error) {
      showAlert('Error al cargar catálogo: ' + error.message, 'error');
      return;
    }
    tarifario.value = dataTarifario || [];
  }

  if (!tarifario.value || tarifario.value.length === 0) {
    showAlert('⚠️ No es posible registrar citas: No hay servicios ni tarifas configuradas en el catálogo.', 'error')
    return
  }

  showModalNueva.value = true
}

const handleAtender = (sesion) => {
  router.push({ name: 'atencion', params: { idSesion: sesion.idSesion } })
}

const handleConfirmarAsistencia = async (sesion) => {
  const confirmado = await showConfirm(`¿El paciente ${nombreCompleto(sesion.Paciente?.Persona)} ha confirmado su asistencia telefónicamente?`)
  if (!confirmado) return
  if (await confirmarAsistencia(sesion.idSesion)) {
    await cargarCitas()
    showModalDetalle.value = false
  }
}

const accionesDe = (sesion) => {
  const e = sesion?.estado;
  const enSala = !!sesion?.paciente_en_sala;

  // ✅ IDENTIFICADOR DE GRATUIDAD:
  // Es gratis estrictamente si es tipo evaluación y no trae cargos adicionales 
  // (ni paquetes, ni servicios extra, ni sesiones a generar).
  const esGratis = sesion?.tipo === 'evaluacion' &&
    !sesion?.idPaquete &&
    !sesion?.idServicio &&
    (!sesion?.sesiones_a_generar || sesion?.sesiones_a_generar === 0);

  // Un pago está pendiente si dice 'pendiente' o 'parcial', Y ADEMÁS no es una cita gratuita
  const pagoPendiente = (sesion?.estado_pago === 'pendiente' || sesion?.estado_pago === 'parcial') && !esGratis;

  return {
    // Solo en reservada
    puedeConfirmarAsistencia: puedeGestionar.value && e === 'reservada' && sesion?.tipo === 'evaluacion',

    // El pago se puede hacer si está reservada o agendada, y hay una deuda real
    puedeConfirmarPago: puedeGestionar.value && ['reservada', 'agendada'].includes(e) && pagoPendiente,

    // Check-in y faltó (solo si está agendada y aún no entra a sala)
    puedeCheckIn: puedeGestionar.value && e === 'agendada' && !enSala,
    puedeInasistencia: puedeGestionar.value && e === 'agendada' && !enSala,

    // Atender solo si está en sala y NO debe nada (o es gratis)
    puedeAtender: esFisioterapeuta.value && e === 'agendada' && enSala && !pagoPendiente,

    // Reprogramar y Cancelar (antes de que entre a sala)
    puedeReprogramar: puedeGestionar.value && ['reservada', 'agendada'].includes(e) && !sesion?.idSesionOriginal && !enSala,
    puedeCancelar: puedeGestionar.value && ['reservada', 'agendada'].includes(e) && !enSala,
  }
}

const obtenerSituacionCita = (sesion) => {
  // 1. Evaluación Inicial
  if (sesion.tipo === 'evaluacion') return { label: 'Evaluación Inicial', color: '#0f766e' };

  // 2. Si es tratamiento, diferenciamos si es la primera o de seguimiento
  // Asumimos que si numero_sesion es 1, es la primera sesión de tratamiento
  if (sesion.numero_sesion === 1) return { label: 'Primera Sesión', color: '#2563eb' };

  // 3. Si no es ninguna de las anteriores, es seguimiento
  return { label: 'Sesión de Seguimiento', color: '#64748b' };
};
</script>

<template>
  <div class="view-container">

    <div class="action-header">
      <div class="header-text">
        <h2>{{ tituloVista }}</h2>
        <p>{{ subtituloVista }}</p>
      </div>

      <div class="header-actions-group">
        <div class="view-switch">
          <button type="button" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">📄 Lista</button>
          <button type="button" :class="{ active: viewMode === 'calendar' }" @click="viewMode = 'calendar'">📅
            Calendario</button>
        </div>

        <button v-if="puedeGestionar" class="primary-btn" @click="abrirModalNueva">
          <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clip-rule="evenodd" />
          </svg>
          Nueva Cita
        </button>
      </div>
    </div>

    <div v-if="viewMode === 'list'">
      <div v-if="!esPaciente" class="filtros-bar data-card">
        <div class="input-group">
          <label>Fecha</label><input type="date" v-model="filtroFecha" @change="cargarCitas" />
        </div>
        <div class="input-group">
          <label>Estado</label>
          <select v-model="filtroEstado" @change="cargarCitas">
            <option value="">Todos</option>
            <option v-for="(info, key) in ESTADOS_SESION" :key="key" :value="key">{{ info.label }}</option>
          </select>
        </div>
        <div v-if="puedeGestionar" class="input-group">
          <label>Fisioterapeuta</label>
          <select v-model="filtroFisio" @change="cargarCitas">
            <option value="">Todos</option>
            <option v-for="f in fisios" :key="f.idFisioterapeuta" :value="f.idFisioterapeuta">{{ f.Persona?.nombres }}
              {{ f.Persona?.apellidos }}</option>
          </select>
        </div>
        <button class="btn-secondary" @click="cargarCitas" :disabled="loading">{{ loading ? 'Cargando...' :
          '🔄Actualizar' }}</button>
      </div>

      <div class="data-card">
        <div class="table-responsive">
          <table class="content-table">
            <thead>
              <tr>
                <th v-if="columnas.includes('paciente')">Paciente</th>
                <th v-if="columnas.includes('fisioterapeuta')">Fisioterapeuta</th>
                <th>Fecha y hora</th>
                <th>Estado</th>
                <th v-if="columnas.includes('acciones')">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td :colspan="columnas.length" class="empty-row"><span class="spinner"
                    style="display:inline-block; margin-right:8px"></span> Cargando citas...</td>
              </tr>
              <tr v-else-if="citas.length === 0">
                <td :colspan="columnas.length" class="empty-row">No hay citas para los filtros.</td>
              </tr>
              <tr v-else v-for="sesion in citas" :key="sesion.idSesion">
                <td v-if="columnas.includes('paciente')">
                  <span class="patient-name">{{ nombrePacienteFlat(sesion) }}</span>
                  <span v-if="sesion.paciente_celular" class="patient-detail">{{ sesion.paciente_celular }}</span>
                </td>

                <td v-if="columnas.includes('fisioterapeuta')">
                  <span class="staff-name">{{ nombreFisioFlat(sesion) }}</span>
                  <span class="staff-detail">{{ sesion.fisio_especialidad }}</span>
                </td>
                <td>
                  <span class="fecha-hora">{{ formatFechaHora(sesion.fecha_hora) }}</span>
                  <span v-if="sesion.paciente_en_sala" class="sala-badge">🟢 En sala</span>
                  <span class="situacion-badge" :style="{ color: obtenerSituacionCita(sesion).color }">
                    {{ obtenerSituacionCita(sesion).label }}
                  </span>
                </td>
                <td>
                  <span class="estado-badge"
                    :style="`color:${getEstadoInfo(sesion.estado).color}; background:${getEstadoInfo(sesion.estado).bg}`">
                    {{ getEstadoInfo(sesion.estado).label }}
                  </span>
                </td>
                <td v-if="columnas.includes('acciones')">
                  <div class="acciones-cell">
                    <button v-if="accionesDe(sesion).puedeAtender" class="accion-btn atender"
                      @click="handleAtender(sesion)">🩺 Atender</button>
                    <button v-if="accionesDe(sesion).puedeConfirmarAsistencia" class="accion-btn confirmar"
                      @click="handleConfirmarAsistencia(sesion)" :disabled="loadingAccion"
                      title="Confirmar asistencia por teléfono">📞 Confirmar</button>
                    <button v-if="accionesDe(sesion).puedeConfirmarPago" class="accion-btn pago"
                      @click="abrirModalPago(sesion)" title="Confirmar pago">💳 Pago</button>
                    <button v-if="accionesDe(sesion).puedeCheckIn" class="accion-btn checkin"
                      @click="handleCheckIn(sesion)" :disabled="loadingAccion">✅ Check-in</button>
                    <button v-if="accionesDe(sesion).puedeInasistencia" class="accion-btn inasistencia"
                      @click="handleInasistencia(sesion)" :disabled="loadingAccion">❌ Faltó</button>
                    <button v-if="accionesDe(sesion).puedeReprogramar" class="accion-btn reprogramar"
                      @click="abrirModalReprogramar(sesion)">🔄 Reprogramar</button>
                    <button v-if="accionesDe(sesion).puedeCancelar" class="accion-btn cancelar"
                      @click="abrirModalCancelacion(sesion)" :disabled="loadingAccion">🗑 Cancelar</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-else class="data-card calendar-container">
      <div class="calendar-header">
        <button @click="prevMonth" class="btn-cal-nav" :disabled="loading">&larr;</button>
        <h3 class="cal-month">{{ mesActualNombre }} <span v-if="loading" class="spinner"
            style="width: 14px; height: 14px; margin-left: 8px;"></span></h3>
        <button @click="nextMonth" class="btn-cal-nav" :disabled="loading">&rarr;</button>
      </div>

      <div class="calendar-grid">
        <div class="cal-day-name">Dom</div>
        <div class="cal-day-name">Lun</div>
        <div class="cal-day-name">Mar</div>
        <div class="cal-day-name">Mié</div>
        <div class="cal-day-name">Jue</div>
        <div class="cal-day-name">Vie</div>
        <div class="cal-day-name">Sáb</div>

        <div v-for="(dia, index) in diasCalendario" :key="index" class="cal-cell" :class="{ empty: !dia }">
          <span v-if="dia" class="cal-date-number">{{ dia }}</span>
          <div v-if="dia" class="cal-appointments">
            <button v-for="cita in citasDelDia(dia)" :key="cita.idSesion" class="cita-tag"
              :style="`border-left-color: ${getEstadoInfo(cita.estado).color}`" @click="abrirDetalleCalendario(cita)">
              <span class="cita-time">{{ formatSoloHora(cita.fecha_hora) }}</span>
              <span class="cita-name">{{ nombrePacienteFlat(cita).split(' ')[0] }}</span>
              <span class="situacion-dot" :style="`background: ${obtenerSituacionCita(cita).color}`"></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <Transition name="fade-modal">
      <div v-if="showModalDetalle && sesionSeleccionada" class="modal-overlay" @click.self="showModalDetalle = false">
        <div class="modal-window" style="max-width: 380px;">
          <div class="modal-header">
            <h3>Detalles de la Cita</h3>
            <button class="close-x" @click="showModalDetalle = false">&times;</button>
          </div>
          <div class="modal-form">
            <div class="detalle-info">
              <p><strong>Paciente:</strong> {{ nombrePacienteFlat(sesionSeleccionada) }}</p>
              <p><strong>Especialista:</strong> {{ nombreFisioFlat(sesionSeleccionada) }}</p>
              <p><strong>Fecha y Hora:</strong> {{ formatFechaHora(sesionSeleccionada.fecha_hora) }}</p>
              <p><strong>Estado:</strong>
                <span class="estado-badge"
                  :style="`margin-left: 6px; color:${getEstadoInfo(sesionSeleccionada.estado).color}; background:${getEstadoInfo(sesionSeleccionada.estado).bg}`">
                  {{ getEstadoInfo(sesionSeleccionada.estado).label }}
                </span>
                <span v-if="sesionSeleccionada.paciente_en_sala" class="sala-badge"
                  style="display:inline-block; margin-left: 8px;">🟢 En sala</span>
              </p>
              <p v-if="sesionSeleccionada.observaciones"><strong>Notas:</strong> {{ sesionSeleccionada.observaciones }}
              </p>
            </div>

            <div class="modal-actions" style="margin-top: 20px; justify-content: flex-start; flex-wrap: wrap;"
              v-if="puedeGestionar || esFisioterapeuta">
              <button v-if="accionesDe(sesionSeleccionada).puedeAtender" class="accion-btn atender"
                @click="handleAtender(sesionSeleccionada)">🩺 Atender</button>
              <button v-if="accionesDe(sesionSeleccionada).puedeConfirmarAsistencia" class="accion-btn confirmar"
                @click="handleConfirmarAsistencia(sesionSeleccionada)">📞 Confirmar</button>
              <button v-if="accionesDe(sesionSeleccionada).puedeConfirmarPago" class="accion-btn pago"
                @click="abrirModalPago(sesionSeleccionada)">💳 Pago</button>
              <button v-if="accionesDe(sesionSeleccionada).puedeCheckIn" class="accion-btn checkin"
                @click="handleCheckIn(sesionSeleccionada)">✅ Check-in</button>
              <button v-if="accionesDe(sesionSeleccionada).puedeInasistencia" class="accion-btn inasistencia"
                @click="handleInasistencia(sesionSeleccionada)">❌ Faltó</button>
              <!-- ✅ Aquí está ahora el botón en el Calendario -->
              <button v-if="accionesDe(sesionSeleccionada).puedeReprogramar" class="accion-btn reprogramar"
                @click="abrirModalReprogramar(sesionSeleccionada)">🔄 Reprogramar</button>
              <button v-if="accionesDe(sesionSeleccionada).puedeCancelar" class="accion-btn cancelar"
                @click="abrirModalCancelacion(sesionSeleccionada)">🗑 Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <ModalNuevaCita :tarifario="tarifario" :isOpen="showModalNueva" :fisios="fisios" :pacientes="pacientes"
      :paquetes="paquetes" :loadingAccion="loadingAccion" :saldoPaciente="saldoPaciente"
      :obtenerSlots="obtenerSlotsDisponibles" :onFetchSaldoPaciente="fetchSaldoPaciente"
      :onFetchEvaluaciones="fetchEvaluacionesHuerfanas" @close="showModalNueva = false" @submit="handleNuevaCita"
      @paciente-changed="fetchPaquetesPaciente" @fisio-changed="fetchHorarioFisio"
      @reset-saldo="saldoPaciente = null" />
    <ModalConfirmarPago :isOpen="showModalPago" :sesion="sesionSeleccionada" :loadingAccion="loadingAccion"
      @close="showModalPago = false" @submit="handleConfirmarPago" />
    <ModalReprogramarCita :isOpen="showModalReprogramar" :sesion="sesionSeleccionada" :fisios="fisios"
      :loadingAccion="loadingAccion" @close="showModalReprogramar = false" @submit="handleReprogramar" />

    <Transition name="fade-modal">
      <div v-if="showModalCancelacion" class="modal-overlay" @click.self="showModalCancelacion = false">
        <div class="modal-window modal-cancelacion">
          <div class="modal-header">
            <h3>Cancelar Cita</h3>
            <button class="close-x" @click="showModalCancelacion = false" :disabled="loadingAccion">&times;</button>
          </div>
          <div class="modal-form">
            <div class="cancelacion-info" v-if="sesionSeleccionada">
              <div class="cancelacion-row"><span class="cancelacion-label">Paciente</span><span
                  class="cancelacion-val">{{ nombreCompleto(sesionSeleccionada.Paciente?.Persona) }}</span></div>
              <div class="cancelacion-row"><span class="cancelacion-label">Fecha y hora</span><span
                  class="cancelacion-val">{{ formatFechaHora(sesionSeleccionada.fecha_hora) }}</span></div>
            </div>
            <div class="input-group">
              <label>Motivo de cancelación <span class="req">*</span></label>
              <textarea v-model="motivoCancelacion" placeholder="Describe el motivo..." rows="3"
                maxlength="300"></textarea>
              <span class="char-count">{{ motivoCancelacion.length }}/300</span>
            </div>
            <div class="cancelacion-aviso">⚠️ Esta acción no se puede deshacer. La sesión pasará a estado "Cancelada" de
              forma permanente.</div>
            <div class="modal-actions">
              <button type="button" class="btn-secondary" @click="showModalCancelacion = false"
                :disabled="loadingAccion">Volver</button>
              <button type="button" class="btn-danger" @click="handleConfirmarCancelacion"
                :disabled="loadingAccion || !motivoCancelacion.trim()">
                <span v-if="loadingAccion" class="btn-spinner"></span><span v-else>Confirmar Cancelación</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Encabezado y Switch */
.header-actions-group {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.view-switch {
  display: flex;
  background: var(--gray-100);
  border-radius: 8px;
  padding: 4px;
  border: 1px solid var(--gray-200);
}

.view-switch button {
  border: none;
  background: transparent;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-500);
  border-radius: 6px;
  cursor: pointer;
  transition: 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.view-switch button.active {
  background: white;
  color: var(--navy);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Filtros (Lista) */
.filtros-bar {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 16px 20px;
  flex-wrap: wrap;
}

.filtros-bar .input-group {
  min-width: 160px;
  flex: 1;
}

/* Tabla (Lista) */
.fecha-hora {
  display: block;
  font-size: 13px;
  color: var(--navy);
  font-weight: 500;
}

.sala-badge {
  display: block;
  font-size: 11px;
  color: #10b981;
  margin-top: 2px;
  font-weight: 600;
}

.patient-name,
.staff-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--navy);
}

.patient-detail,
.staff-detail {
  display: block;
  font-size: 11.5px;
  color: var(--gray-500);
}

.estado-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 11.5px;
  font-weight: 600;
}

.acciones-cell {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.accion-btn {
  padding: 5px 10px;
  border-radius: 6px;
  border: none;
  font-family: 'DM Sans', sans-serif;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition);
  white-space: nowrap;
}

.accion-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.accion-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.accion-btn.atender {
  background: #e0e7ff;
  color: #4338ca;
  border: 1px solid #c7d2fe;
}

.accion-btn.confirmar {
  background: #e0f2fe;
  color: #0284c7;
  border: 1px solid #bae6fd;
}

.accion-btn.pago {
  background: #dbeafe;
  color: #1e40af;
}

.accion-btn.checkin {
  background: #d1fae5;
  color: #065f46;
}

.accion-btn.inasistencia {
  background: #fee2e2;
  color: #991b1b;
}

.accion-btn.cancelar {
  background: #f3f4f6;
  color: #374151;
}

/* ✅ Estilo rescatado de media queries */
.accion-btn.reprogramar {
  background: #ffedd5;
  color: #c2410c;
  border: 1px solid #fdba74;
}

/* ── Estilos del Calendario Mensual ── */
.calendar-container {
  padding: 20px;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.cal-month {
  font-size: 18px;
  color: var(--navy);
  text-transform: capitalize;
  margin: 0;
  display: flex;
  align-items: center;
}

.btn-cal-nav {
  background: var(--gray-100);
  border: none;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  color: var(--navy);
  font-size: 16px;
  transition: background 0.2s;
}

.btn-cal-nav:hover:not(:disabled) {
  background: var(--gray-200);
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border: 1px solid var(--gray-200);
  border-radius: 8px;
  overflow: hidden;
  background: var(--gray-200);
  gap: 1px;
}

.cal-day-name {
  background: var(--gray-50);
  padding: 10px;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--gray-500);
}

.cal-cell {
  min-height: 110px;
  padding: 6px;
  background: white;
}

.cal-cell.empty {
  background: #f8fafc;
}

.cal-date-number {
  font-size: 12px;
  font-weight: 600;
  color: var(--gray-500);
  display: block;
  margin-bottom: 6px;
  text-align: right;
}

.cal-appointments {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cita-tag {
  display: flex;
  gap: 4px;
  align-items: center;
  text-align: left;
  background: var(--gray-50);
  border: 1px solid var(--gray-200);
  border-left-width: 4px;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 10.5px;
  font-family: inherit;
  cursor: pointer;
  width: 100%;
  transition: 0.2s;
}

.cita-tag:hover {
  filter: brightness(0.95);
}

.cita-time {
  font-weight: 700;
  color: var(--gray-700);
}

.cita-name {
  font-weight: 500;
  color: var(--navy);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.detalle-info {
  background: var(--gray-50);
  padding: 14px;
  border-radius: 8px;
  border: 1px solid var(--gray-200);
}

.detalle-info p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--navy);
}

.detalle-info p:last-child {
  margin-bottom: 0;
}

.modal-cancelacion {
  max-width: 460px;
}

.cancelacion-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: var(--gray-50);
  border-radius: var(--radius-sm);
  border: 1px solid var(--gray-200);
  margin-bottom: 16px;
}

.cancelacion-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.cancelacion-label {
  color: var(--gray-500);
  font-weight: 500;
}

.cancelacion-val {
  color: var(--navy);
  font-weight: 600;
}

.char-count {
  font-size: 11px;
  color: var(--gray-500);
  text-align: right;
  margin-top: 2px;
}

.cancelacion-aviso {
  font-size: 12px;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin-bottom: 8px;
}

.req {
  color: #ef4444;
}

.btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition), opacity var(--transition);
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .calendar-grid {
    grid-template-columns: 1fr;
    gap: 0;
    border: none;
  }

  .cal-day-name {
    display: none;
  }

  .cal-cell {
    border: 1px solid var(--gray-200);
    margin-bottom: 10px;
    border-radius: 8px;
    min-height: auto;
  }

  .cal-cell.empty {
    display: none;
  }

  .cal-date-number {
    text-align: left;
    background: var(--gray-50);
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
    margin-bottom: 8px;
  }
}

.situacion-badge {
  display: block;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  margin-top: 2px;
}

.situacion-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: auto;
}
</style>