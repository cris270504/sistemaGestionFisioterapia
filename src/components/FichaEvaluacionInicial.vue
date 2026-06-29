<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useEvaluacionInicial, ZONAS_CORPORALES } from '@/composables/useEvaluacionInicial'

const props = defineProps({
    idSesion: { type: [Number, String], required: true },
    idPaciente: { type: String, required: true },
    idFisioterapeuta: { type: String, required: true },
    modoLectura: { type: Boolean, default: false }
})

const {
    evaluacion, loading, guardandoSeccion, progreso,
    crearEvaluacionInicial, fetchEvaluacionPorSesion,
    guardarSeccion, actualizarZonasAfectadas,
} = useEvaluacionInicial()

const seccionesAbiertas = reactive({
    seccion_anamnesis: true,
    seccion_dolor: true,
    seccion_inspeccion_postural: false,
    seccion_palpacion: false,
    seccion_rom_articular: false,
    seccion_rom_columna: false,
    seccion_eval_muscular: false,
    seccion_flexibilidad: false,
    seccion_neurologica: false,
    seccion_pruebas_funcionales: false,
    seccion_tests_ortopedicos: false,
    seccion_marcha_equilibrio: false,
    seccion_eval_funcional: false,
    seccion_escalas_funcionales: false,
    seccion_diagnostico_fisio: true,
    seccion_objetivos: true,
    seccion_plan_tratamiento: true,
})

const toggleSeccion = (nombre) => {
    seccionesAbiertas[nombre] = !seccionesAbiertas[nombre]
}

const motivoConsulta = ref('')
const apuntesGenerales = ref('')
const zonasSeleccionadas = ref([])

const dataSecciones = reactive({
    seccion_anamnesis: {
        problema_principal: '', inicio_problema: '', tiempo_evolucion: '',
        zona_afectada: '', mecanismo_lesion: '', tratamientos_previos: '',
        medicacion_actual: '', antecedentes_relevantes: {},
    },
    seccion_dolor: {
        dolor_actual: null, dolor_maximo: null, dolor_minimo: null,
        dolor_nocturno: null, tipo_dolor: [], frecuencia: '',
        aumenta_con: '', alivia_con: '', localizacion: '',
        irradiacion: { presente: false, donde: '' },
    },
    seccion_inspeccion_postural: { anterior: '', lateral: '', posterior: '', observacion_general: '' },
    seccion_palpacion: { hallazgos: [], zona_dolorosa_especifica: '', observaciones: '' },
    seccion_rom_articular: { movimientos: [] },
    seccion_rom_columna: { movimientos: [] },
    seccion_eval_muscular: { musculos: [] },
    seccion_flexibilidad: { cadenas: [] },
    seccion_neurologica: { sensibilidad: '', reflejos: [], miotomas: '', dermatomas: '', signos_neurales: false },
    seccion_pruebas_funcionales: {
        marcha: '', escaleras: '', sentarse_levantarse: '',
        equilibrio_unipodal: { derecho_seg: null, izquierdo_seg: null },
        sentadilla: '', alcance_funcional: '',
        timed_up_and_go_seg: null, prueba_6min_caminando_m: null, otra: '',
    },
    seccion_tests_ortopedicos: {
        cervical: [], hombro: [], codo_muneca_mano: [],
        lumbar: [], cadera: [], rodilla: [], tobillo_pie: [],
    },
    seccion_marcha_equilibrio: {
        patron_marcha: [], romberg: null, romberg_sensibilizado: null,
        equilibrio_unipodal: { derecho_seg: null, izquierdo_seg: null },
        marcha_linea_recta: '', coordinacion_motora: '',
    },
    seccion_eval_funcional: {
        actividades_limitadas: [], limitacion_funcional_principal: '',
        actividad_mas_importante: '', objetivo_funcional_paciente: '',
    },
    seccion_escalas_funcionales: { escalas: [] },
    seccion_diagnostico_fisio: {
        alteraciones_encontradas: '', diagnostico_fisioterapeutico: '',
        pronostico_funcional: '', hallazgos: [],
    },
    seccion_objetivos: { objetivos: '' },
    seccion_plan_tratamiento: { plan: '' },
})

const SECCIONES_DEF = [
    { key: 'seccion_anamnesis', titulo: '2. Anamnesis / Historia clínica' },
    { key: 'seccion_dolor', titulo: '3. Evaluación del dolor' },
    { key: 'seccion_inspeccion_postural', titulo: '4. Inspección y observación postural' },
    { key: 'seccion_palpacion', titulo: '5. Palpación' },
    { key: 'seccion_rom_articular', titulo: '6. Rango de movimiento articular' },
    { key: 'seccion_rom_columna', titulo: '7. Rango de movimiento de columna' },
    { key: 'seccion_eval_muscular', titulo: '8. Evaluación muscular (escala Daniels)' },
    { key: 'seccion_flexibilidad', titulo: '9. Evaluación de flexibilidad' },
    { key: 'seccion_neurologica', titulo: '10. Evaluación neurológica básica' },
    { key: 'seccion_pruebas_funcionales', titulo: '11. Pruebas funcionales generales' },
    { key: 'seccion_tests_ortopedicos', titulo: '12. Test ortopédicos por zona' },
    { key: 'seccion_marcha_equilibrio', titulo: '13. Marcha, equilibrio y coordinación' },
    { key: 'seccion_eval_funcional', titulo: '14. Evaluación funcional del paciente' },
    { key: 'seccion_escalas_funcionales', titulo: '15. Escalas funcionales sugeridas' },
    { key: 'seccion_diagnostico_fisio', titulo: '16. Diagnóstico fisioterapéutico' },
    { key: 'seccion_objetivos', titulo: '17. Objetivos del tratamiento' },
    { key: 'seccion_plan_tratamiento', titulo: '18. Plan de tratamiento' },
]

const esSeccionResaltada = (key) => {
    if (key !== 'seccion_tests_ortopedicos') return false
    return zonasSeleccionadas.value.length > 0
}

let datosCargados = false;

watch(evaluacion, (nueva) => {
    if (!nueva || datosCargados) return // 👈 El escudo que bloquea el bucle

    motivoConsulta.value = nueva.motivo_paciente ?? ''
    apuntesGenerales.value = nueva.apuntes_generales ?? ''
    zonasSeleccionadas.value = nueva.zonas_afectadas ?? []

    for (const { key } of SECCIONES_DEF) {
        if (nueva[key]) {
            const baseData = nueva[key]

            // Garantizar estructura interna para evitar errores de v-model
            if (key === 'seccion_dolor' && !baseData.irradiacion) {
                baseData.irradiacion = { presente: false, donde: '' }
            }
            if (key === 'seccion_tests_ortopedicos') {
                ZONAS_CORPORALES.forEach(z => {
                    if (!baseData[z.id]) baseData[z.id] = []
                })
            }
            if ((key === 'seccion_pruebas_funcionales' || key === 'seccion_marcha_equilibrio') && !baseData.equilibrio_unipodal) {
                baseData.equilibrio_unipodal = { derecho_seg: null, izquierdo_seg: null }
            }

            dataSecciones[key] = baseData

            // Solo abrimos las secciones que ya tenían datos guardados de sesiones previas
            seccionesAbiertas[key] = true
        }
    }

    if (zonasSeleccionadas.value.length > 0) {
        seccionesAbiertas.seccion_tests_ortopedicos = true
    }

    // Cerramos la puerta: la hidratación inicial ha terminado
    datosCargados = true;
}, { immediate: true })

onMounted(async () => {
    await fetchEvaluacionPorSesion(props.idSesion)
})

const emit = defineEmits(['completado'])
const finalizarEvaluacionManual = () => {
    // El autoguardado ya hizo el trabajo pesado, solo avisamos que cerramos.
    emit('completado')
}

const fichaExiste = computed(() => !!evaluacion.value)

const handleCrearFicha = async () => {
    await crearEvaluacionInicial({
        idSesion: props.idSesion,
        idPaciente: props.idPaciente,
        idFisioterapeuta: props.idFisioterapeuta,
        motivoConsulta: motivoConsulta.value,
        apuntesGenerales: apuntesGenerales.value,
        zonasAfectadas: zonasSeleccionadas.value,
    })
}

const timersDebounce = {}
const programarGuardado = (key) => {
    if (!fichaExiste.value || props.modoLectura) return
    clearTimeout(timersDebounce[key])
    timersDebounce[key] = setTimeout(() => {
        guardarSeccion(key, dataSecciones[key])
    }, 800)
}

for (const { key } of SECCIONES_DEF) {
    watch(() => dataSecciones[key], () => programarGuardado(key), { deep: true })
}

const toggleZona = async (zonaId) => {
    if (props.modoLectura) return
    const idx = zonasSeleccionadas.value.indexOf(zonaId)
    if (idx >= 0) zonasSeleccionadas.value.splice(idx, 1)
    else zonasSeleccionadas.value.push(zonaId)

    if (fichaExiste.value) {
        await actualizarZonasAfectadas(zonasSeleccionadas.value)
    }
}
</script>

<template>
    <div class="ficha-evaluacion-wrapper">

        <div v-if="!fichaExiste && !loading" class="cta-evaluacion-container">

            <div class="cta-header">
                <div class="cta-icon">📋</div>
                <h3 class="cta-evaluacion-title">Ficha de Evaluación Fisioterapéutica Integral</h3>
                <p class="cta-evaluacion-desc">
                    El paciente no cuenta con una evaluación inicial registrada para este episodio. Inicie el proceso de
                    evaluación de 16 secciones.
                </p>
            </div>

            <div class="cta-form-card">
                <div class="input-block">
                    <label>Motivo de consulta <span class="req">*</span></label>
                    <textarea v-model="motivoConsulta" rows="2" class="modern-textarea"
                        placeholder="Ej. Dolor agudo en rodilla derecha al caminar..."></textarea>
                </div>

                <div class="input-block">
                    <label>Apuntes generales <span class="req">*</span></label>
                    <textarea v-model="apuntesGenerales" rows="3" class="modern-textarea"
                        placeholder="Ej. Paciente refiere caída hace 3 días, presenta inflamación local..."></textarea>
                </div>

                <div class="input-block">
                    <label>Zonas afectadas <span class="sub-label">(Seleccione una o más)</span></label>
                    <div class="zonas-grid-modern">
                        <label v-for="zona in ZONAS_CORPORALES" :key="zona.id" class="zona-checkbox-card"
                            :class="{ 'selected': zonasSeleccionadas.includes(zona.id) }">
                            <input type="checkbox" class="hidden-checkbox"
                                :checked="zonasSeleccionadas.includes(zona.id)" @change="toggleZona(zona.id)" />
                            <span class="custom-checkbox"></span>
                            <span class="zona-name">{{ zona.label }}</span>
                        </label>
                    </div>
                </div>

                <div class="form-actions">
                    <button class="btn-iniciar-evaluacion" @click="handleCrearFicha"
                        :disabled="!motivoConsulta.trim() || !apuntesGenerales.trim()">
                        <span class="icono">✨</span> Crear Ficha de Evaluación
                    </button>
                </div>
            </div>
        </div>

        <div v-else-if="fichaExiste" class="evaluacion-form-content">

            <div class="evaluacion-header-progreso">
                <p class="progreso-texto">Progreso: <strong>{{ progreso.completadas }} / {{ progreso.total }}</strong>
                    secciones completadas</p>
                <div class="progreso-bar-bg">
                    <div class="progreso-bar-fill"
                        :style="{ width: `${(progreso.completadas / progreso.total) * 100}%` }"></div>
                </div>
            </div>

            <div class="seccion-zonas-edicion">
                <label class="seccion-label">Zonas corporales bajo evaluación en este episodio:</label>
                <div class="zonas-grid-inline">
                    <div v-for="zona in ZONAS_CORPORALES" :key="zona.id" class="zona-tag"
                        :class="{ active: zonasSeleccionadas.includes(zona.id) }">
                        <label>
                            <input type="checkbox" :disabled="modoLectura"
                                :checked="zonasSeleccionadas.includes(zona.id)" @change="toggleZona(zona.id)" />
                            {{ zona.label }}
                        </label>
                    </div>
                </div>
            </div>

            <div v-for="seccion in SECCIONES_DEF" :key="seccion.key" class="collapsible-seccion-card"
                :class="{ 'resaltada': esSeccionResaltada(seccion.key) }">
                <button type="button" class="seccion-toggle-head" @click="toggleSeccion(seccion.key)">
                    <span class="arrow">{{ seccionesAbiertas[seccion.key] ? '▼' : '▶' }}</span>
                    <span class="title">{{ seccion.titulo }}</span>
                    <span v-if="esSeccionResaltada(seccion.key)" class="badge-relevancia">🎯 Zona Crítica</span>
                    <span v-if="guardandoSeccion[seccion.key]" class="saving-indicator">🔄 Guardando...</span>
                </button>

                <div v-if="seccionesAbiertas[seccion.key]" class="seccion-body-fields">

                    <div v-if="seccion.key === 'seccion_anamnesis'" class="fields-group-layout">
                        <div class="field-item full-width">
                            <label>Problema principal</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_anamnesis.problema_principal" rows="2"></textarea>
                        </div>
                        <div class="field-item">
                            <label>Inicio del problema</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_anamnesis.inicio_problema" />
                        </div>
                        <div class="field-item">
                            <label>Tiempo de evolución</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_anamnesis.tiempo_evolucion" />
                        </div>
                        <div class="field-item">
                            <label>Zona afectada</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_anamnesis.zona_afectada" />
                        </div>
                        <div class="field-item full-width">
                            <label>Mecanismo de lesión</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_anamnesis.mecanismo_lesion" rows="2"></textarea>
                        </div>
                        <div class="field-item full-width">
                            <label>Tratamientos previos</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_anamnesis.tratamientos_previos" rows="2"></textarea>
                        </div>
                        <div class="field-item full-width">
                            <label>Medicación actual</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_anamnesis.medicacion_actual" />
                        </div>
                        <div class="field-item full-width sub-checkboxes-block">
                            <label class="sub-label">Antecedentes relevantes:</label>
                            <div class="checkboxes-sub-grid">
                                <div v-for="ant in ['cirugias_previas', 'fracturas', 'luxaciones', 'esguinces', 'hernia_discal', 'diabetes', 'hipertension', 'enf_reumatologica', 'problema_neurologico', 'alergias', 'dolor_irradiado', 'hormigueo_adormecimiento']"
                                    :key="ant">
                                    <label class="check-box-label">
                                        <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                            v-model="dataSecciones.seccion_anamnesis.antecedentes_relevantes[ant]" />
                                        {{ ant.replaceAll('_', ' ') }}
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_dolor'" class="fields-group-layout">
                        <div class="field-item third-width">
                            <label>Dolor actual (/10)</label>
                            <input type="number" class="modern-input" :disabled="modoLectura" min="0" max="10"
                                v-model.number="dataSecciones.seccion_dolor.dolor_actual" />
                        </div>
                        <div class="field-item third-width">
                            <label>Dolor máximo (/10)</label>
                            <input type="number" class="modern-input" :disabled="modoLectura" min="0" max="10"
                                v-model.number="dataSecciones.seccion_dolor.dolor_maximo" />
                        </div>
                        <div class="field-item third-width">
                            <label>Dolor mínimo (/10)</label>
                            <input type="number" class="modern-input" :disabled="modoLectura" min="0" max="10"
                                v-model.number="dataSecciones.seccion_dolor.dolor_minimo" />
                        </div>
                        <div class="field-item full-width">
                            <label class="check-box-label">
                                <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                    v-model="dataSecciones.seccion_dolor.dolor_nocturno" />
                                Presenta dolor nocturno
                            </label>
                        </div>
                        <div class="field-item full-width sub-checkboxes-block">
                            <label class="sub-label">Tipo de dolor:</label>
                            <div class="checkboxes-sub-grid">
                                <div v-for="tipo in ['Punzante', 'Quemante', 'Eléctrico', 'Profundo']" :key="tipo">
                                    <label class="check-box-label">
                                        <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                            :value="tipo" v-model="dataSecciones.seccion_dolor.tipo_dolor" />
                                        {{ tipo }}
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="field-item">
                            <label>Frecuencia</label>
                            <select class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_dolor.frecuencia">
                                <option value="">Seleccione...</option>
                                <option value="Constante">Constante</option>
                                <option value="Intermitente">Intermitente</option>
                            </select>
                        </div>
                        <div class="field-item">
                            <label>Aumenta con</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_dolor.aumenta_con" />
                        </div>
                        <div class="field-item">
                            <label>Alivia con</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_dolor.alivia_con" />
                        </div>
                        <div class="field-item">
                            <label>Localización</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_dolor.localizacion" />
                        </div>
                        <div class="field-item full-width inline-inputs-row">
                            <label class="check-box-label">
                                <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                    v-model="dataSecciones.seccion_dolor.irradiacion.presente" />
                                ¿Presenta irradiación?
                            </label>
                            <input v-if="dataSecciones.seccion_dolor.irradiacion.presente"
                                class="modern-input flex-grow-input" :disabled="modoLectura" type="text"
                                placeholder="¿Dónde?" v-model="dataSecciones.seccion_dolor.irradiacion.donde" />
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_inspeccion_postural'" class="fields-group-layout">
                        <div class="field-item full-width">
                            <label>Vista anterior (Cabeza, hombros, pelvis, rodillas, pies)</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_inspeccion_postural.anterior" rows="2"></textarea>
                        </div>
                        <div class="field-item full-width">
                            <label>Vista lateral (Cabeza adelantada, cifosis, lordosis, pelvis, rodillas)</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_inspeccion_postural.lateral" rows="2"></textarea>
                        </div>
                        <div class="field-item full-width">
                            <label>Vista posterior (Escápulas, columna, pliegues, apoyo plantar)</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_inspeccion_postural.posterior" rows="2"></textarea>
                        </div>
                        <div class="field-item full-width">
                            <label>Observación general (Inflamación, edema, cicatrices, atrofia, asimetrías)</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_inspeccion_postural.observacion_general"
                                rows="2"></textarea>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_palpacion'" class="fields-group-layout">
                        <div class="field-item full-width sub-checkboxes-block">
                            <label class="sub-label">Hallazgos a la palpación:</label>
                            <div class="checkboxes-sub-grid">
                                <div v-for="h in ['Dolor a la palpación', 'Espasmo muscular', 'Puntos gatillo', 'Temperatura aumentada', 'Inflamación', 'Edema', 'Cicatrices', 'Adherencias', 'Crepitación', 'Alteración sensibilidad', 'Tensión muscular']"
                                    :key="h">
                                    <label class="check-box-label">
                                        <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                            :value="h" v-model="dataSecciones.seccion_palpacion.hallazgos" />
                                        {{ h }}
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="field-item full-width">
                            <label>Zona dolorosa específica</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_palpacion.zona_dolorosa_especifica" />
                        </div>
                        <div class="field-item full-width">
                            <label>Observaciones de palpación</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_palpacion.observaciones" rows="2"></textarea>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_rom_articular'" class="dynamic-table-section">
                        <button type="button" class="btn-table-add" v-if="!modoLectura"
                            @click="dataSecciones.seccion_rom_articular.movimientos.push({ nombre: '', activo: null, pasivo: null, dolor: false, observacion: '' })">
                            ➕ Agregar movimiento articular
                        </button>
                        <div class="table-rows-container">
                            <div class="dynamic-table-header">
                                <span>Movimiento</span><span>Activo (°)</span><span>Pasivo
                                    (°)</span><span>Dolor</span><span
                                    class="flex-grow-input">Observación</span><span></span>
                            </div>
                            <div v-for="(mov, i) in dataSecciones.seccion_rom_articular.movimientos" :key="i"
                                class="dynamic-table-row">
                                <input type="text" class="modern-input" placeholder="Ej. Flexión hombro"
                                    :disabled="modoLectura" v-model="mov.nombre" />
                                <input type="number" class="modern-input" placeholder="°" :disabled="modoLectura"
                                    v-model.number="mov.activo" />
                                <input type="number" class="modern-input" placeholder="°" :disabled="modoLectura"
                                    v-model.number="mov.pasivo" />
                                <label class="check-box-label centered-checkbox"><input type="checkbox"
                                        class="modern-checkbox" :disabled="modoLectura" v-model="mov.dolor" /></label>
                                <input type="text" class="modern-input flex-grow-input" placeholder="Limitación..."
                                    :disabled="modoLectura" v-model="mov.observacion" />
                                <button type="button" class="btn-row-remove" v-if="!modoLectura"
                                    @click="dataSecciones.seccion_rom_articular.movimientos.splice(i, 1)">❌</button>
                            </div>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_rom_columna'" class="dynamic-table-section">
                        <button type="button" class="btn-table-add" v-if="!modoLectura"
                            @click="dataSecciones.seccion_rom_columna.movimientos.push({ nombre: '', conservado: false, limitado: false, dolor: false, observaciones: '' })">
                            ➕ Agregar movimiento de columna
                        </button>
                        <div class="table-rows-container">
                            <div class="dynamic-table-header">
                                <span>Movimiento</span><span>Conservado</span><span>Limitado</span><span>Dolor</span><span
                                    class="flex-grow-input">Observaciones</span><span></span>
                            </div>
                            <div v-for="(mov, i) in dataSecciones.seccion_rom_columna.movimientos" :key="i"
                                class="dynamic-table-row">
                                <input type="text" class="modern-input" placeholder="Ej. Flexión lumbar"
                                    :disabled="modoLectura" v-model="mov.nombre" />
                                <label class="check-box-label centered-checkbox"><input type="checkbox"
                                        class="modern-checkbox" :disabled="modoLectura"
                                        v-model="mov.conservado" /></label>
                                <label class="check-box-label centered-checkbox"><input type="checkbox"
                                        class="modern-checkbox" :disabled="modoLectura"
                                        v-model="mov.limitado" /></label>
                                <label class="check-box-label centered-checkbox"><input type="checkbox"
                                        class="modern-checkbox" :disabled="modoLectura" v-model="mov.dolor" /></label>
                                <input type="text" class="modern-input flex-grow-input" placeholder="Detalle..."
                                    :disabled="modoLectura" v-model="mov.observaciones" />
                                <button type="button" class="btn-row-remove" v-if="!modoLectura"
                                    @click="dataSecciones.seccion_rom_columna.movimientos.splice(i, 1)">❌</button>
                            </div>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_eval_muscular'" class="dynamic-table-section">
                        <div class="table-clinical-tip">
                            💡 <strong>Escala Daniels:</strong> 0: Sin contracción | 1: Contracción palpable | 2: Sin
                            gravedad | 3: Contra gravedad | 4: Resistencia moderada | 5: Fuerza normal.
                        </div>
                        <button type="button" class="btn-table-add" v-if="!modoLectura"
                            @click="dataSecciones.seccion_eval_muscular.musculos.push({ grupo: '', derecho: null, izquierdo: null, dolor: false, observacion: '' })">
                            ➕ Agregar músculo / grupo muscular
                        </button>
                        <div class="table-rows-container">
                            <div class="dynamic-table-header">
                                <span>Músculo</span><span>Der (0-5)</span><span>Izq (0-5)</span><span>Dolor</span><span
                                    class="flex-grow-input">Observación</span><span></span>
                            </div>
                            <div v-for="(m, i) in dataSecciones.seccion_eval_muscular.musculos" :key="i"
                                class="dynamic-table-row">
                                <input type="text" class="modern-input" placeholder="Ej. Flexores"
                                    :disabled="modoLectura" v-model="m.grupo" />
                                <input type="number" class="modern-input" min="0" max="5" placeholder="/5"
                                    :disabled="modoLectura" v-model.number="m.derecho" />
                                <input type="number" class="modern-input" min="0" max="5" placeholder="/5"
                                    :disabled="modoLectura" v-model.number="m.izquierdo" />
                                <label class="check-box-label centered-checkbox"><input type="checkbox"
                                        class="modern-checkbox" :disabled="modoLectura" v-model="m.dolor" /></label>
                                <input type="text" class="modern-input flex-grow-input" placeholder="Detalle..."
                                    :disabled="modoLectura" v-model="m.observacion" />
                                <button type="button" class="btn-row-remove" v-if="!modoLectura"
                                    @click="dataSecciones.seccion_eval_muscular.musculos.splice(i, 1)">❌</button>
                            </div>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_flexibilidad'" class="dynamic-table-section">
                        <button type="button" class="btn-table-add" v-if="!modoLectura"
                            @click="dataSecciones.seccion_flexibilidad.cadenas.push({ nombre: '', normal: false, acortado: false, dolor: false, observaciones: '' })">
                            ➕ Agregar músculo / cadena
                        </button>
                        <div class="table-rows-container">
                            <div class="dynamic-table-header">
                                <span>Músculo/Cadena</span><span>Normal</span><span>Acortado</span><span>Dolor</span><span
                                    class="flex-grow-input">Observaciones</span><span></span>
                            </div>
                            <div v-for="(c, i) in dataSecciones.seccion_flexibilidad.cadenas" :key="i"
                                class="dynamic-table-row">
                                <input type="text" class="modern-input" placeholder="Ej. Isquiotibiales"
                                    :disabled="modoLectura" v-model="c.nombre" />
                                <label class="check-box-label centered-checkbox"><input type="checkbox"
                                        class="modern-checkbox" :disabled="modoLectura" v-model="c.normal" /></label>
                                <label class="check-box-label centered-checkbox"><input type="checkbox"
                                        class="modern-checkbox" :disabled="modoLectura" v-model="c.acortado" /></label>
                                <label class="check-box-label centered-checkbox"><input type="checkbox"
                                        class="modern-checkbox" :disabled="modoLectura" v-model="c.dolor" /></label>
                                <input type="text" class="modern-input flex-grow-input" placeholder="Detalle..."
                                    :disabled="modoLectura" v-model="c.observaciones" />
                                <button type="button" class="btn-row-remove" v-if="!modoLectura"
                                    @click="dataSecciones.seccion_flexibilidad.cadenas.splice(i, 1)">❌</button>
                            </div>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_neurologica'" class="fields-group-layout">
                        <div class="field-item">
                            <label>Sensibilidad</label>
                            <select class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_neurologica.sensibilidad">
                                <option value="">Seleccione...</option>
                                <option value="Normal">Normal</option>
                                <option value="Disminuida">Disminuida</option>
                                <option value="Aumentada">Aumentada</option>
                                <option value="Alterada">Alterada</option>
                            </select>
                        </div>
                        <div class="field-item full-width sub-checkboxes-block">
                            <label class="sub-label">Reflejos evaluados:</label>
                            <div class="checkboxes-sub-grid">
                                <div v-for="r in ['Bicipital', 'Tricipital', 'Rotuliano', 'Aquiliano']" :key="r">
                                    <label class="check-box-label">
                                        <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                            :value="r" v-model="dataSecciones.seccion_neurologica.reflejos" />
                                        {{ r }}
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="field-item">
                            <label>Miotomas</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                placeholder="Ej. Conservado / Déficit leve"
                                v-model="dataSecciones.seccion_neurologica.miotomas" />
                        </div>
                        <div class="field-item">
                            <label>Dermatomas</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                placeholder="Ej. Sin alteración"
                                v-model="dataSecciones.seccion_neurologica.dermatomas" />
                        </div>
                        <div class="field-item full-width">
                            <label class="check-box-label">
                                <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                    v-model="dataSecciones.seccion_neurologica.signos_neurales" />
                                Presenta signos neurales positivos
                            </label>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_pruebas_funcionales'" class="fields-group-layout">
                        <div class="field-item">
                            <label>Marcha</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                placeholder="Ej. Normal / Alterada"
                                v-model="dataSecciones.seccion_pruebas_funcionales.marcha" />
                        </div>
                        <div class="field-item">
                            <label>Subir/bajar escaleras</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                placeholder="Ej. Sin dificultad"
                                v-model="dataSecciones.seccion_pruebas_funcionales.escaleras" />
                        </div>
                        <div class="field-item">
                            <label>Sentarse y levantarse</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                placeholder="Ej. Normal / Doloroso"
                                v-model="dataSecciones.seccion_pruebas_funcionales.sentarse_levantarse" />
                        </div>
                        <div class="field-item inline-inputs-row">
                            <label>Equilibrio unipodal:</label>
                            <input type="number" class="modern-input" placeholder="Der (seg)" :disabled="modoLectura"
                                v-model.number="dataSecciones.seccion_pruebas_funcionales.equilibrio_unipodal.derecho_seg" />
                            <input type="number" class="modern-input" placeholder="Izq (seg)" :disabled="modoLectura"
                                v-model.number="dataSecciones.seccion_pruebas_funcionales.equilibrio_unipodal.izquierdo_seg" />
                        </div>
                        <div class="field-item">
                            <label>Sentadilla</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                placeholder="Ej. Completa / Parcial"
                                v-model="dataSecciones.seccion_pruebas_funcionales.sentadilla" />
                        </div>
                        <div class="field-item">
                            <label>Alcance funcional</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                placeholder="Ej. Normal / Limitado"
                                v-model="dataSecciones.seccion_pruebas_funcionales.alcance_funcional" />
                        </div>
                        <div class="field-item third-width">
                            <label>Timed Up and Go</label>
                            <div class="input-with-suffix">
                                <input type="number" class="modern-input" :disabled="modoLectura"
                                    v-model.number="dataSecciones.seccion_pruebas_funcionales.timed_up_and_go_seg" />
                                <span>seg</span>
                            </div>
                        </div>
                        <div class="field-item third-width">
                            <label>Prueba 6 min. caminando</label>
                            <div class="input-with-suffix">
                                <input type="number" class="modern-input" :disabled="modoLectura"
                                    v-model.number="dataSecciones.seccion_pruebas_funcionales.prueba_6min_caminando_m" />
                                <span>m</span>
                            </div>
                        </div>
                        <div class="field-item third-width">
                            <label>Otra prueba</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_pruebas_funcionales.otra" />
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_tests_ortopedicos'" class="orthogonal-sub-zones-container">
                        <div v-for="zona in ZONAS_CORPORALES" :key="zona.id" class="orthogonal-zone-card"
                            :class="{ 'highlighted-zone': zonasSeleccionadas.includes(zona.id) }">
                            <div class="zone-card-head">
                                <h5>{{ zona.label }}</h5>
                            </div>
                            <button type="button" class="btn-table-add sub-button" v-if="!modoLectura"
                                @click="dataSecciones.seccion_tests_ortopedicos[zona.id].push({ test: '', evalua: '', resultado: null, observacion: '' })">
                                ➕ Añadir test de {{ zona.label }}
                            </button>
                            <div class="table-rows-container sub-table-rows">
                                <div v-if="dataSecciones.seccion_tests_ortopedicos[zona.id].length > 0"
                                    class="dynamic-table-header">
                                    <span>Test</span><span>Evalúa</span><span>Resultado</span><span
                                        class="flex-grow-input">Observación</span><span></span>
                                </div>
                                <div v-for="(t, i) in dataSecciones.seccion_tests_ortopedicos[zona.id]" :key="i"
                                    class="dynamic-table-row sub-row">
                                    <input type="text" class="modern-input" placeholder="Test (ej. Spurling)"
                                        :disabled="modoLectura" v-model="t.test" />
                                    <input type="text" class="modern-input" placeholder="Evalúa" :disabled="modoLectura"
                                        v-model="t.evalua" />
                                    <select class="modern-input" :disabled="modoLectura" v-model="t.resultado">
                                        <option :value="null">—</option>
                                        <option value="+">Positivo (+)</option>
                                        <option value="-">Negativo (-)</option>
                                    </select>
                                    <input type="text" class="modern-input flex-grow-input" placeholder="Observación"
                                        :disabled="modoLectura" v-model="t.observacion" />
                                    <button type="button" class="btn-row-remove" v-if="!modoLectura"
                                        @click="dataSecciones.seccion_tests_ortopedicos[zona.id].splice(i, 1)">❌</button>
                                </div>
                                <p v-if="dataSecciones.seccion_tests_ortopedicos[zona.id].length === 0"
                                    class="empty-sub-table-text">Sin tests registrados para esta zona corporal.</p>
                            </div>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_marcha_equilibrio'" class="fields-group-layout">
                        <div class="field-item full-width sub-checkboxes-block">
                            <label class="sub-label">Patrón de marcha:</label>
                            <div class="checkboxes-sub-grid">
                                <div v-for="p in ['Marcha normal', 'Marcha antálgica', 'Claudicante', 'Espástica', 'Atáxica', 'Con arrastre', 'Usa bastón/muleta', 'Dolor al apoyo', 'Asimetría', 'Inestabilidad', 'Menor longitud de paso']"
                                    :key="p">
                                    <label class="check-box-label">
                                        <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                            :value="p"
                                            v-model="dataSecciones.seccion_marcha_equilibrio.patron_marcha" />
                                        {{ p }}
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="field-item">
                            <label>Romberg</label>
                            <select class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_marcha_equilibrio.romberg">
                                <option :value="null">Seleccione...</option>
                                <option value="+">Positivo</option>
                                <option value="-">Negativo</option>
                            </select>
                        </div>
                        <div class="field-item">
                            <label>Romberg sensibilizado</label>
                            <select class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_marcha_equilibrio.romberg_sensibilizado">
                                <option :value="null">Seleccione...</option>
                                <option value="+">Positivo</option>
                                <option value="-">Negativo</option>
                            </select>
                        </div>
                        <div class="field-item inline-inputs-row">
                            <label>Equilibrio unipodal:</label>
                            <input type="number" class="modern-input" placeholder="Der (seg)" :disabled="modoLectura"
                                v-model.number="dataSecciones.seccion_marcha_equilibrio.equilibrio_unipodal.derecho_seg" />
                            <input type="number" class="modern-input" placeholder="Izq (seg)" :disabled="modoLectura"
                                v-model.number="dataSecciones.seccion_marcha_equilibrio.equilibrio_unipodal.izquierdo_seg" />
                        </div>
                        <div class="field-item">
                            <label>Marcha en línea recta</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                placeholder="Ej. Normal / Alterada"
                                v-model="dataSecciones.seccion_marcha_equilibrio.marcha_linea_recta" />
                        </div>
                        <div class="field-item">
                            <label>Coordinación motora</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                placeholder="Ej. Normal / Alterada"
                                v-model="dataSecciones.seccion_marcha_equilibrio.coordinacion_motora" />
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_eval_funcional'" class="fields-group-layout">
                        <div class="field-item full-width sub-checkboxes-block">
                            <label class="sub-label">Actividades limitadas:</label>
                            <div class="checkboxes-sub-grid">
                                <div v-for="a in ['Caminar', 'Correr', 'Subir escaleras', 'Bajar escaleras', 'Agacharse', 'Levantar objetos', 'Dormir', 'Vestirse', 'Peinarse', 'Trabajar', 'Realizar deporte', 'Cargar peso', 'Estar sentado', 'Estar de pie', 'Actividades domésticas']"
                                    :key="a">
                                    <label class="check-box-label">
                                        <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                            :value="a"
                                            v-model="dataSecciones.seccion_eval_funcional.actividades_limitadas" />
                                        {{ a }}
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="field-item full-width">
                            <label>Limitación funcional principal</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_eval_funcional.limitacion_funcional_principal"
                                rows="2"></textarea>
                        </div>
                        <div class="field-item">
                            <label>Actividad más importante para el paciente</label>
                            <input type="text" class="modern-input" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_eval_funcional.actividad_mas_importante" />
                        </div>
                        <div class="field-item full-width">
                            <label>Objetivo funcional del paciente</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_eval_funcional.objetivo_funcional_paciente"
                                rows="2"></textarea>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_escalas_funcionales'" class="dynamic-table-section">
                        <button type="button" class="btn-table-add" v-if="!modoLectura"
                            @click="dataSecciones.seccion_escalas_funcionales.escalas.push({ zona: '', escala: '', resultado: '' })">
                            ➕ Agregar escala
                        </button>
                        <div class="table-rows-container">
                            <div class="dynamic-table-header">
                                <span>Zona / Condición</span><span>Escala sugerida</span><span
                                    class="flex-grow-input">Resultado</span><span></span>
                            </div>
                            <div v-for="(e, i) in dataSecciones.seccion_escalas_funcionales.escalas" :key="i"
                                class="dynamic-table-row">
                                <input type="text" class="modern-input" placeholder="Ej. Lumbar" :disabled="modoLectura"
                                    v-model="e.zona" />
                                <input type="text" class="modern-input" placeholder="Ej. Oswestry"
                                    :disabled="modoLectura" v-model="e.escala" />
                                <input type="text" class="modern-input flex-grow-input" placeholder="Resultado..."
                                    :disabled="modoLectura" v-model="e.resultado" />
                                <button type="button" class="btn-row-remove" v-if="!modoLectura"
                                    @click="dataSecciones.seccion_escalas_funcionales.escalas.splice(i, 1)">❌</button>
                            </div>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_diagnostico_fisio'" class="fields-group-layout">
                        <div class="field-item full-width">
                            <label>Alteraciones encontradas</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_diagnostico_fisio.alteraciones_encontradas"
                                rows="2"></textarea>
                        </div>
                        <div class="field-item full-width">
                            <label>Diagnóstico fisioterapéutico</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_diagnostico_fisio.diagnostico_fisioterapeutico"
                                rows="2"></textarea>
                        </div>
                        <div class="field-item full-width">
                            <label>Pronóstico funcional</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_diagnostico_fisio.pronostico_funcional"
                                rows="2"></textarea>
                        </div>
                        <div class="field-item full-width sub-checkboxes-block">
                            <label class="sub-label">Hallazgos principales:</label>
                            <div class="checkboxes-sub-grid">
                                <div v-for="h in ['Dolor', 'Disminución ROM', 'Debilidad muscular', 'Acortamiento', 'Alteración postural', 'Alteración marcha', 'Déficit equilibrio', 'Compromiso neural', 'Limitación funcional', 'Inflamación', 'Inestabilidad']"
                                    :key="h">
                                    <label class="check-box-label">
                                        <input type="checkbox" class="modern-checkbox" :disabled="modoLectura"
                                            :value="h" v-model="dataSecciones.seccion_diagnostico_fisio.hallazgos" />
                                        {{ h }}
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="seccion.key === 'seccion_objetivos'" class="fields-group-layout">
                        <div class="field-item full-width">
                            <label>Objetivos del tratamiento</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_objetivos.objetivos" rows="4"></textarea>
                        </div>
                    </div>
                    <div v-if="seccion.key === 'seccion_plan_tratamiento'" class="fields-group-layout">
                        <div class="field-item full-width">
                            <label>Plan de tratamiento fisioterapéutico</label>
                            <textarea class="modern-textarea" :disabled="modoLectura"
                                v-model="dataSecciones.seccion_plan_tratamiento.plan" rows="4"></textarea>
                        </div>
                    </div>

                </div>
            </div>

            <div class="form-actions" style="margin-top: 30px;" v-if="!modoLectura">
                <button type="button" class="btn-iniciar-evaluacion" @click="finalizarEvaluacionManual">
                    <span class="icono">💾</span> Guardar Ficha Integral y Finalizar Sesión
                </button>
            </div>
        </div>
    </div>

</template>

<style scoped>
/* ── CONTENEDOR GENERAL DEL PASO 0 ── */
.cta-evaluacion-container {
    background-color: #f0fdfa;
    border: 2px dashed #99f6e4;
    border-radius: 16px;
    padding: 40px;
    margin: 20px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
}

.cta-header {
    text-align: center;
    max-width: 500px;
}

.cta-icon {
    font-size: 48px;
    margin-bottom: 8px;
}

.cta-evaluacion-title {
    color: #0f766e;
    font-size: 24px;
    font-weight: 700;
    margin: 0 0 12px 0;
}

.cta-evaluacion-desc {
    color: #475569;
    font-size: 15px;
    line-height: 1.6;
    margin: 0;
}

.cta-form-card {
    background: #ffffff;
    border-radius: 12px;
    padding: 32px;
    width: 100%;
    max-width: 650px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.025);
    border: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.input-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: left;
}

.input-block label {
    font-size: 14px;
    font-weight: 600;
    color: #334155;
}

.input-block .req {
    color: #ef4444;
}

.input-block .sub-label {
    font-weight: 400;
    color: #64748b;
    font-size: 13px;
    margin-left: 4px;
}

/* ── ESTILOS DE TEXTAREA E INPUTS MODERNOS ── */
.modern-textarea,
.modern-input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    font-family: inherit;
    font-size: 14.5px;
    color: #1e293b;
    background-color: #f8fafc;
    transition: all 0.2s ease;
    box-sizing: border-box;
}

.modern-textarea {
    resize: vertical;
    min-height: 80px;
}

.modern-textarea:focus,
.modern-input:focus {
    outline: none;
    border-color: #0f766e;
    background-color: #ffffff;
    box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.15);
}

.modern-textarea::placeholder,
.modern-input::placeholder {
    color: #94a3b8;
}

.input-with-suffix {
    display: flex;
    align-items: center;
    gap: 8px;
}

.input-with-suffix span {
    color: #64748b;
    font-size: 14px;
    font-weight: 500;
}

/* ── GRID DE ZONAS (PASO 0) ── */
.zonas-grid-modern {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
}

.zona-checkbox-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.zona-checkbox-card:hover {
    border-color: #5eead4;
    background-color: #f0fdfa;
}

.zona-checkbox-card.selected {
    border-color: #0f766e;
    background-color: #f0fdfa;
    box-shadow: 0 1px 2px rgba(15, 118, 110, 0.1);
}

.hidden-checkbox {
    display: none;
}

.custom-checkbox {
    width: 20px;
    height: 20px;
    border: 2px solid #cbd5e1;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.zona-checkbox-card.selected .custom-checkbox {
    background-color: #0f766e;
    border-color: #0f766e;
}

.zona-checkbox-card.selected .custom-checkbox::after {
    content: '✓';
    color: white;
    font-size: 14px;
    font-weight: bold;
}

.zona-name {
    font-size: 14.5px;
    color: #334155;
    font-weight: 500;
}

/* ── LAYOUT DE CAMPOS AGRUPADOS (FORMULARIO PRINCIPAL) ── */
.fields-group-layout {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    padding: 20px 16px;
    background: #ffffff;
}

.field-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 calc(50% - 20px);
    min-width: 250px;
}

.field-item.full-width {
    flex: 1 1 100%;
}

.field-item.third-width {
    flex: 1 1 calc(33.333% - 20px);
    min-width: 150px;
}

.field-item label {
    font-size: 13px;
    font-weight: 600;
    color: #475569;
}

.inline-inputs-row {
    flex-direction: row;
    align-items: center;
    gap: 16px;
}

/* ── CHECKBOXES INTERNOS SUB-GRID ── */
.sub-checkboxes-block {
    background: #f8fafc;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
}

.checkboxes-sub-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    margin-top: 8px;
}

.check-box-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #334155;
    cursor: pointer;
}

.modern-checkbox {
    width: 16px;
    height: 16px;
    accent-color: #0f766e;
    cursor: pointer;
}

/* ── TABLAS DINÁMICAS (ROM, MUSCULAR, ETC) ── */
.dynamic-table-section {
    padding: 20px 16px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.table-clinical-tip {
    font-size: 13px;
    color: #0f766e;
    background: #ccfbf1;
    padding: 10px 16px;
    border-radius: 6px;
}

.btn-table-add {
    align-self: flex-start;
    background: #f1f5f9;
    color: #0f766e;
    border: 1px dashed #cbd5e1;
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}

.btn-table-add:hover {
    background: #e2e8f0;
}

.table-rows-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.dynamic-table-header {
    display: flex;
    gap: 12px;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
}

.dynamic-table-header span {
    flex: 1;
}

.dynamic-table-row {
    display: flex;
    gap: 12px;
    align-items: center;
    background: #f8fafc;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
}

.dynamic-table-row>* {
    flex: 1;
}

.dynamic-table-row .flex-grow-input {
    flex: 2;
}

.centered-checkbox {
    justify-content: center;
}

.btn-row-remove {
    flex: 0 0 auto !important;
    width: 32px;
    height: 32px;
    background: #fee2e2;
    border: none;
    border-radius: 6px;
    color: #ef4444;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.btn-row-remove:hover {
    background: #fca5a5;
}

/* ── SUB-ZONAS ORTOPÉDICAS ── */
.orthogonal-sub-zones-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px 16px;
}

.orthogonal-zone-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    background: #ffffff;
}

.orthogonal-zone-card.highlighted-zone {
    border-color: #5eead4;
    box-shadow: 0 0 0 1px #5eead4;
}

.zone-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.zone-card-head h5 {
    margin: 0;
    font-size: 15px;
    color: #1e293b;
}

.btn-table-add.sub-button {
    margin-bottom: 12px;
    font-size: 13px;
    padding: 6px 12px;
}

.sub-table-rows {
    background: transparent;
    padding: 0;
}

.sub-row {
    background: #ffffff;
}

.empty-sub-table-text {
    font-size: 13px;
    color: #94a3b8;
    font-style: italic;
    margin: 0;
}

/* ── BARRA SUPERIOR Y ACORDEÓN ── */
.evaluacion-form-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.evaluacion-header-progreso {
    background: #ffffff;
    padding: 16px 20px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
}

.progreso-texto {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #475569;
}

.progreso-bar-bg {
    height: 8px;
    background: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
}

.progreso-bar-fill {
    height: 100%;
    background: #0f766e;
    transition: width 0.3s ease;
}

.seccion-zonas-edicion {
    background: #ffffff;
    padding: 16px 20px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
}

.seccion-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #475569;
    margin-bottom: 12px;
}

.zonas-grid-inline {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.zona-tag {
    background: #f1f5f9;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 13px;
    border: 1px solid #cbd5e1;
}

.zona-tag.active {
    background: #ccfbf1;
    border-color: #5eead4;
    color: #0f766e;
    font-weight: 500;
}

.zona-tag label {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
}

.collapsible-seccion-card {
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
    transition: border-color 0.2s;
}

.collapsible-seccion-card.resaltada {
    border-color: #5eead4;
    box-shadow: 0 2px 4px rgba(94, 234, 212, 0.2);
}

.seccion-toggle-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    background: #f8fafc;
    border: none;
    border-bottom: 1px solid transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s;
}

.seccion-toggle-head:hover {
    background: #f1f5f9;
}

.seccion-toggle-head .arrow {
    font-size: 12px;
    color: #64748b;
    width: 16px;
}

.seccion-toggle-head .title {
    font-size: 15px;
    font-weight: 600;
    color: #1e293b;
    flex: 1;
}

.badge-relevancia {
    background: #fef08a;
    color: #854d0e;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 12px;
    text-transform: uppercase;
}

.saving-indicator {
    font-size: 12px;
    color: #0f766e;
    font-style: italic;
}

.seccion-body-fields {
    border-top: 1px solid #e2e8f0;
}

/* ── BOTÓN DE ACCIÓN PASO 0 ── */
.form-actions {
    display: flex;
    justify-content: center;
    margin-top: 16px;
    padding-top: 24px;
    border-top: 1px solid #f1f5f9;
}

.btn-iniciar-evaluacion {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 32px;
    width: 100%;
    background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%);
    color: #ffffff;
    font-size: 16px;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 4px 6px -1px rgba(13, 148, 136, 0.25);
    transition: all 0.2s ease-in-out;
}

.btn-iniciar-evaluacion:hover:not(:disabled) {
    background: linear-gradient(135deg, #0d9488 0%, #14b8a6 100%);
    transform: translateY(-2px);
}

.btn-iniciar-evaluacion:disabled {
    background: #e2e8f0;
    color: #94a3b8;
    cursor: not-allowed;
    box-shadow: none;
}

/* Responsivo para tablas */
@media (max-width: 768px) {
    .dynamic-table-header {
        display: none;
    }

    .dynamic-table-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
    }

    .dynamic-table-row>* {
        flex: auto;
    }
}
</style>