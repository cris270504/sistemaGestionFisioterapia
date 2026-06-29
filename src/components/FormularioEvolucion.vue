<script setup>
import { ref, onMounted } from 'vue'
import { useEvolucionSesion } from '@/composables/useEvolucionSesion'

const props = defineProps({
    idSesion: { type: [Number, String], required: true },
    idEvaluacionInicialRef: { type: [Number, String], default: null }, // para el botón "Ver ficha inicial"
})

const emit = defineEmits(['guardado', 'ver-ficha-inicial'])

const { loading, registrarEvolucion } = useEvolucionSesion()

// ── Campos del formulario ────────────────────────────────────────────────
const dolorEva = ref(0)
const funcionEstado = ref('')       // 'mejoro' | 'igual' | 'empeoro'
const funcionDetalle = ref('')
const notasEvolucion = ref('')
const indicaciones = ref('')
const darDeAlta = ref(false)        // Controla la finalización del tratamiento

// ── Mediciones puntuales opcionales ───────────────────────────────────────
const medicionesExtra = ref([]) 

const agregarMedicion = () => {
    medicionesExtra.value.push({ idEvaluacion: null, resultado: null, observacion: '' })
}

const quitarMedicion = (index) => {
    medicionesExtra.value.splice(index, 1)
}

// ── Construir notas_evolucion combinando los campos ─────────────────────
const construirNotasEvolucion = () => {
    const partes = []
    if (dolorEva.value !== null) partes.push(`Dolor EVA: ${dolorEva.value}/10`)
    if (funcionEstado.value) partes.push(`Función: ${funcionEstado.value.toUpperCase()}`)
    if (funcionDetalle.value) partes.push(`Detalle función: ${funcionDetalle.value}`)
    if (notasEvolucion.value) partes.push(`Evolución: ${notasEvolucion.value}`)
    return partes.join(' | ')
}

const handleGuardar = async () => {
    
    // 2. Filtramos las mediciones extra
    const mediciones = [...medicionesExtra.value.filter(m => m.idEvaluacion && m.resultado !== null)]

    // 4. Enviamos todo a Supabase
    const ok = await registrarEvolucion({
        idSesion: props.idSesion,
        notasEvolucion: construirNotasEvolucion(),
        indicaciones: indicaciones.value,
        mediciones,
        darDeAlta: darDeAlta.value
    })

    // 5. Limpiamos el formulario si todo salió bien
    if (ok) {
        emit('guardado')
        dolorEva.value = 0
        funcionEstado.value = ''
        funcionDetalle.value = ''
        notasEvolucion.value = ''
        indicaciones.value = ''
        medicionesExtra.value = []
        darDeAlta.value = false
    }
}
</script>

<template>
    <div class="evolucion-wrapper">
        
        <div class="evolucion-header">
            <div class="header-titulos">
                <span class="icono">📝</span>
                <div>
                    <h3 class="titulo">Evolución Clínica Rápida</h3>
                    <p class="subtitulo">Registro de control y progreso fisioterapéutico</p>
                </div>
            </div>
            <button v-if="idEvaluacionInicialRef" class="btn-ver-ficha" @click="emit('ver-ficha-inicial', idEvaluacionInicialRef)">
                📄 Consultar Ficha Inicial
            </button>
        </div>

        <div class="evolucion-body">
            
            <div class="form-grid-2">
                <div class="input-block card-style">
                    <label>Nivel de Dolor Actual (EVA)</label>
                    <div class="eva-container">
                        <input type="range" min="0" max="10" v-model.number="dolorEva" class="eva-slider" />
                        <div class="eva-badge" :class="{'bajo': dolorEva <= 3, 'medio': dolorEva > 3 && dolorEva <= 7, 'alto': dolorEva > 7}">
                            {{ dolorEva }}<span>/10</span>
                        </div>
                    </div>
                    <div class="eva-labels">
                        <span>Sin dolor</span>
                        <span>Dolor máximo</span>
                    </div>
                </div>

                <div class="input-block card-style">
                    <label>Evolución de la Función Fisiológica</label>
                    <div class="segmented-control">
                        <label class="segment-btn" :class="{ 'active mejoro': funcionEstado === 'mejoro' }">
                            <input type="radio" value="mejoro" v-model="funcionEstado" class="hidden-radio">
                            👍 Mejoró
                        </label>
                        <label class="segment-btn" :class="{ 'active igual': funcionEstado === 'igual' }">
                            <input type="radio" value="igual" v-model="funcionEstado" class="hidden-radio">
                            ➖ Igual
                        </label>
                        <label class="segment-btn" :class="{ 'active empeoro': funcionEstado === 'empeoro' }">
                            <input type="radio" value="empeoro" v-model="funcionEstado" class="hidden-radio">
                            👎 Empeoró
                        </label>
                    </div>
                    <input type="text" class="modern-input mt-2" placeholder="Detalle funcional (Ej: Mayor rango al caminar)..." v-model="funcionDetalle" />
                </div>
            </div>

            <div class="input-block">
                <label>Observaciones del Procedimiento / Ajustes al Plan <span class="req">*</span></label>
                <textarea class="modern-textarea" v-model="notasEvolucion" rows="3" placeholder="Detalle las técnicas aplicadas hoy o cambios en el tratamiento..."></textarea>
            </div>

            <div class="input-block">
                <label>Indicaciones y Tareas para Casa</label>
                <textarea class="modern-textarea" v-model="indicaciones" rows="2" placeholder="Ej: Compresas frías 15 min, evitar cargar peso..."></textarea>
            </div>

            <div class="alta-medica-box" :class="{ 'active': darDeAlta }">
                <label class="alta-label">
                    <div class="checkbox-wrapper">
                        <input type="checkbox" v-model="darDeAlta" class="hidden-checkbox" />
                        <div class="custom-checkbox"></div>
                    </div>
                    <span>🩺 Dar de Alta al Paciente (Finalizar Tratamiento)</span>
                </label>
                <p v-if="darDeAlta" class="alta-warning">
                    Al guardar, el tratamiento se marcará como <strong>"Finalizado"</strong> en el historial clínico. Solo haga esto si el paciente ya ha recuperado su funcionalidad.
                </p>
            </div>

            <div class="form-actions">
                <button type="button" class="btn-primary" @click="handleGuardar" :disabled="loading || !notasEvolucion.trim()">
                    <span v-if="loading" class="spinner"></span>
                    <span v-else>💾 Registrar Evolución Clínica</span>
                </button>
            </div>
            
        </div>
    </div>
</template>

<style scoped>
/* ── CONTENEDOR PRINCIPAL ── */
.evolucion-wrapper {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    overflow: hidden;
}

/* ── CABECERA ── */
.evolucion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8fafc;
    padding: 16px 24px;
    border-bottom: 1px solid #e2e8f0;
}
.header-titulos { display: flex; align-items: center; gap: 12px; }
.header-titulos .icono { font-size: 28px; }
.header-titulos .titulo { margin: 0 0 4px 0; font-size: 18px; color: #0f766e; font-weight: 700; }
.header-titulos .subtitulo { margin: 0; font-size: 13px; color: #64748b; }

.btn-ver-ficha {
    background: #ffffff; color: #0f766e; border: 1px solid #cbd5e1;
    padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px;
    cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.btn-ver-ficha:hover { background: #f0fdfa; border-color: #5eead4; }

/* ── CUERPO DEL FORMULARIO ── */
.evolucion-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

.form-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }

.input-block { display: flex; flex-direction: column; gap: 8px; }
.input-block label { font-size: 14px; font-weight: 600; color: #334155; }
.input-block .req { color: #ef4444; }

.card-style { background: #f8fafc; padding: 16px; border-radius: 10px; border: 1px solid #e2e8f0; }

/* ── INPUTS MODERNOS ── */
.modern-input, .modern-textarea {
    width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px;
    font-family: inherit; font-size: 14px; color: #1e293b; background-color: #ffffff;
    transition: all 0.2s ease; box-sizing: border-box;
}
.modern-textarea { resize: vertical; }
.modern-input:focus, .modern-textarea:focus { outline: none; border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.15); }
.mt-2 { margin-top: 12px; }

/* ── SLIDER EVA ── */
.eva-container { display: flex; align-items: center; gap: 16px; margin-top: 8px; }
.eva-slider {
    flex-grow: 1; height: 6px; -webkit-appearance: none; appearance: none;
    background: linear-gradient(to right, #22c55e, #eab308, #ef4444);
    border-radius: 4px; outline: none;
}
.eva-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 20px; height: 20px; border-radius: 50%;
    background: #ffffff; border: 3px solid #334155; cursor: pointer;
}
.eva-badge {
    display: flex; align-items: baseline; gap: 2px;
    font-size: 24px; font-weight: 800; padding: 4px 12px; border-radius: 8px; color: #ffffff;
}
.eva-badge span { font-size: 14px; font-weight: 600; opacity: 0.8; }
.eva-badge.bajo { background: #22c55e; }
.eva-badge.medio { background: #eab308; }
.eva-badge.alto { background: #ef4444; }

.eva-labels { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 600; text-transform: uppercase; }

/* ── BOTONES SEGMENTADOS (FUNCIÓN) ── */
.segmented-control { display: flex; background: #e2e8f0; border-radius: 8px; padding: 4px; gap: 4px; }
.segment-btn {
    flex: 1; text-align: center; padding: 8px 0; border-radius: 6px;
    font-size: 14px; font-weight: 600; color: #475569; cursor: pointer; transition: all 0.2s;
}
.hidden-radio { display: none; }
.segment-btn:hover { background: #cbd5e1; }
.segment-btn.active.mejoro { background: #dcfce7; color: #166534; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.segment-btn.active.igual { background: #ffffff; color: #334155; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
.segment-btn.active.empeoro { background: #fee2e2; color: #991b1b; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }

/* ── MEDICIONES EXTRAS ── */
.mediciones-section { border-top: 1px dashed #cbd5e1; padding-top: 20px; }
.mediciones-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.mediciones-header label { font-size: 14px; font-weight: 600; color: #334155; }
.btn-outline-small { background: #f8fafc; color: #0284c7; border: 1px solid #bae6fd; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
.btn-outline-small:hover { background: #e0f2fe; }

.empty-hint { font-size: 13px; color: #94a3b8; font-style: italic; margin: 0; }
.mediciones-list { display: flex; flex-direction: column; gap: 12px; }
.medicion-row { display: flex; gap: 10px; align-items: center; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; }
.w-24 { width: 100px; }
.flex-grow { flex-grow: 1; }
.btn-remove { background: #fee2e2; border: none; border-radius: 6px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.btn-remove:hover { background: #fca5a5; }

/* ── ALTA MÉDICA ── */
.alta-medica-box {
    margin-top: 10px; padding: 16px; background: #ffffff; border: 2px dashed #cbd5e1;
    border-radius: 10px; transition: all 0.3s ease;
}
.alta-medica-box.active { background: #f0fdfa; border: 2px solid #14b8a6; }
.alta-label { display: flex; align-items: center; gap: 12px; cursor: pointer; color: #0f766e; font-size: 16px; font-weight: 700; }
.checkbox-wrapper { position: relative; width: 24px; height: 24px; }
.hidden-checkbox { opacity: 0; width: 100%; height: 100%; position: absolute; cursor: pointer; z-index: 2; }
.custom-checkbox { position: absolute; top: 0; left: 0; width: 24px; height: 24px; border: 2px solid #cbd5e1; border-radius: 6px; background: #fff; transition: all 0.2s; }
.hidden-checkbox:checked ~ .custom-checkbox { background: #0f766e; border-color: #0f766e; }
.hidden-checkbox:checked ~ .custom-checkbox::after {
    content: '✓'; position: absolute; color: white; font-size: 16px; font-weight: bold; top: 50%; left: 50%; transform: translate(-50%, -50%);
}
.alta-warning { margin: 8px 0 0 36px; font-size: 13.5px; color: #0f766e; line-height: 1.5; background: #ccfbf1; padding: 10px; border-radius: 6px; }

/* ── ACCIONES ── */
.form-actions { display: flex; justify-content: flex-end; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
.btn-primary {
    background: #0f766e; color: #ffffff; border: none; padding: 12px 24px; border-radius: 8px;
    font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s;
    display: flex; align-items: center; gap: 8px;
}
.btn-primary:hover:not(:disabled) { background: #0d9488; }
.btn-primary:disabled { background: #94a3b8; cursor: not-allowed; }

/* Responsividad */
@media (max-width: 600px) {
    .evolucion-header { flex-direction: column; align-items: flex-start; gap: 12px; }
    .form-grid-2 { grid-template-columns: 1fr; }
    .medicion-row { flex-wrap: wrap; }
    .medicion-row .modern-input { flex: 1 1 100%; }
    .w-24 { width: 100%; }
}
</style>