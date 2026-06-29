<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'
import FichaEvaluacionInicial from '@/components/FichaEvaluacionInicial.vue'

const route = useRoute()
const router = useRouter()
const idPaciente = route.params.idPaciente

const loading = ref(true)
const paciente = ref(null)
const sesionesRaw = ref([])
const evaluacionesRaw = ref([])

// Estado para el Modal de la Ficha Madre
const showModalFicha = ref(false)
const sesionEvalParaModal = ref(null)

const cargarHistorial = async () => {
    loading.value = true
    try {
        // 1. Cargar datos básicos del Paciente
        const { data: dataPaciente, error: errPaciente } = await supabase
            .from('Paciente')
            .select(`
                idPaciente,
                Persona (nombres, apellidos, numero_documento, fecha_nacimiento, celular)
            `)
            .eq('idPaciente', idPaciente)
            .single()
            
        if (errPaciente) throw errPaciente
        paciente.value = dataPaciente.Persona

        // 2. Cargar TODAS las sesiones ATENDIDAS de este paciente
        const { data: dataSesiones, error: errSesiones } = await supabase
            .from('Sesion')
            .select(`
                idSesion, idTratamiento, numero_sesion, fecha_hora, tipo, 
                es_evaluacion_inicial, notas_evolucion, indicaciones, evolucion_clinica,
                Fisioterapeuta ( Persona (nombres, apellidos) )
            `)
            .eq('idPaciente', idPaciente)
            .eq('estado', 'atendida')
            .order('fecha_hora', { ascending: false }) // Cronológico inverso (más reciente primero)

        if (errSesiones) throw errSesiones
        sesionesRaw.value = dataSesiones

        // 3. Cargar las Evaluaciones Iniciales (Fichas) de este paciente
        const { data: dataEvaluaciones, error: errEval } = await supabase
            .from('Evaluacion_inicial')
            .select('idSesion, idTratamiento, diagnostico_fisioterapeutico, motivo_paciente')
            .eq('idPaciente', idPaciente)

        if (errEval) throw errEval
        evaluacionesRaw.value = dataEvaluaciones

    } catch (error) {
        console.error("Error al cargar historia clínica:", error)
    } finally {
        loading.value = false
    }
}

// ── AGRUPACIÓN POR TRATAMIENTO ──
// Toma todas las sesiones y las agrupa bajo su respectivo "Episodio Clínico"
const historialAgrupado = computed(() => {
    const grupos = {}

    sesionesRaw.value.forEach(sesion => {
        // Usamos idTratamiento como llave. Si es null, lo mandamos a un grupo "General"
        const keyId = sesion.idTratamiento || 'general'
        
        if (!grupos[keyId]) {
            // Buscamos si existe la Ficha Madre para este tratamiento
            const fichaMadre = evaluacionesRaw.value.find(e => e.idTratamiento === sesion.idTratamiento)
            
            grupos[keyId] = {
                idTratamiento: sesion.idTratamiento,
                // Usamos el diagnóstico como título si existe, sino un nombre genérico
                titulo: fichaMadre?.diagnostico_fisioterapeutico || (keyId === 'general' ? 'Atenciones Generales' : `Episodio Clínico #${keyId}`),
                motivo: fichaMadre?.motivo_paciente || null,
                idSesionFicha: fichaMadre?.idSesion || null,
                sesiones: []
            }
        }
        
        grupos[keyId].sesiones.push(sesion)
    })

    return Object.values(grupos)
})

const abrirFichaMadre = (idSesionOriginal) => {
    // Le pasamos el ID de la sesión donde se creó la evaluación al modal
    sesionEvalParaModal.value = sesionesRaw.value.find(s => s.idSesion === idSesionOriginal)
    showModalFicha.value = true
}

// ── UTILIDADES ──
const formatearFecha = (iso) => {
    return new Intl.DateTimeFormat('es-PE', { 
        timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(iso))
}

const calcularEdad = (fechaNacimiento) => {
    if (!fechaNacimiento) return 'No registrada'
    const hoy = new Date()
    const nac = new Date(fechaNacimiento)
    let edad = hoy.getFullYear() - nac.getFullYear()
    if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) edad--
    return `${edad} años`
}

onMounted(() => { cargarHistorial() })
</script>

<template>
    <div class="view-container historia-view">
        
        <div class="action-header">
            <div class="header-text">
                <h2>Historia Clínica del Paciente</h2>
                <p>Línea de tiempo de tratamientos y evoluciones.</p>
            </div>
            <button class="btn-secondary" @click="router.back()">
                &larr; Volver
            </button>
        </div>

        <div v-if="loading" class="loading-state">
            <span class="spinner"></span> Cargando expediente clínico...
        </div>

        <div v-else-if="paciente" class="historia-content">
            
            <div class="paciente-banner">
                <div class="avatar-circle">
                    {{ paciente.nombres.charAt(0) }}{{ paciente.apellidos.charAt(0) }}
                </div>
                <div class="paciente-info">
                    <h3 class="nombre">{{ paciente.nombres }} {{ paciente.apellidos }}</h3>
                    <div class="tags-container">
                        <span class="tag"><strong>Doc:</strong> {{ paciente.numero_documento }}</span>
                        <span class="tag"><strong>Edad:</strong> {{ calcularEdad(paciente.fecha_nacimiento) }}</span>
                        <span class="tag" v-if="paciente.celular"><strong>Cel:</strong> {{ paciente.celular }}</span>
                    </div>
                </div>
            </div>

            <div v-if="historialAgrupado.length === 0" class="empty-state">
                <h4>Sin registros clínicos</h4>
                <p>El paciente aún no cuenta con sesiones atendidas en su historial.</p>
            </div>

            <div v-else class="tratamientos-lista">
                <div v-for="(grupo, index) in historialAgrupado" :key="index" class="tratamiento-card">
                    
                    <div class="tratamiento-header">
                        <div class="tratamiento-titulos">
                            <span class="badge-episodio">Episodio / Tratamiento</span>
                            <h4 class="diagnostico">{{ grupo.titulo }}</h4>
                            <p v-if="grupo.motivo" class="motivo"><strong>Motivo original:</strong> {{ grupo.motivo }}</p>
                        </div>
                        <button v-if="grupo.idSesionFicha" class="btn-ver-ficha" @click="abrirFichaMadre(grupo.idSesionFicha)">
                            Ver Ficha Inicial
                        </button>
                    </div>

                    <div class="timeline-container">
                        <div v-for="sesion in grupo.sesiones" :key="sesion.idSesion" class="timeline-node">
                            <div class="timeline-dot"></div>
                            
                            <div class="sesion-card">
                                <div class="sesion-head">
                                    <span class="fecha">{{ formatearFecha(sesion.fecha_hora) }}</span>
                                    <span class="sesion-numero">
                                        {{ sesion.es_evaluacion_inicial ? 'Evaluación' : `Sesión #${sesion.numero_sesion}` }}
                                    </span>
                                </div>
                                
                                <div class="fisio-name">
                                    👨‍⚕️ Atendido por: {{ sesion.Fisioterapeuta?.Persona?.nombres }} {{ sesion.Fisioterapeuta?.Persona?.apellidos }}
                                </div>

                                <div v-if="sesion.evolucion_clinica && sesion.evolucion_clinica.eva !== undefined" class="metricas-rapidas">
                                    <span class="metrica-badge eva">Dolor EVA: <strong>{{ sesion.evolucion_clinica.eva }}/10</strong></span>
                                    <span class="metrica-badge estado" :class="sesion.evolucion_clinica.funcion">Estado: <strong>{{ sesion.evolucion_clinica.funcion }}</strong></span>
                                </div>

                                <div class="sesion-notas">
                                    <p v-if="sesion.notas_evolucion" class="nota-texto">
                                        <strong>Evolución / Procedimiento:</strong><br/>
                                        {{ sesion.notas_evolucion }}
                                    </p>
                                    <p v-if="sesion.indicaciones" class="nota-texto indicaciones">
                                        <strong>Indicaciones para casa:</strong><br/>
                                        {{ sesion.indicaciones }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

        </div>

        <Transition name="fade-modal">
            <div v-if="showModalFicha && sesionEvalParaModal" class="modal-overlay" @click.self="showModalFicha = false">
                <div class="modal-window ficha-modal">
                    <div class="modal-header">
                        <h3>Ficha de Evaluación Inicial Original</h3>
                        <button class="close-x" @click="showModalFicha = false">&times;</button>
                    </div>
                    <div class="modal-form" style="overflow-y: auto; padding: 20px;">
                        <FichaEvaluacionInicial 
                            :idSesion="sesionEvalParaModal.idSesion"
                            :idTratamiento="sesionEvalParaModal.idTratamiento"
                            :idPaciente="idPaciente"
                            :idFisioterapeuta="sesionEvalParaModal.idFisioterapeuta || 'sys'"
                            :modoLectura="true" 
                        />
                    </div>
                    <div class="modal-actions" style="padding: 15px; border-top: 1px solid #eee;">
                         <button class="btn-secondary" @click="showModalFicha = false">Cerrar Ficha</button>
                    </div>
                </div>
            </div>
        </Transition>

    </div>
</template>

<style scoped>
/* ── VARIABLES Y CONTENEDOR ── */
.historia-view { max-width: 1000px; margin: 0 auto; }
.loading-state { padding: 60px; text-align: center; color: #64748b; font-size: 16px; }
.historia-content { display: flex; flex-direction: column; gap: 24px; }

/* ── BANNER DEL PACIENTE ── */
.paciente-banner {
    display: flex; align-items: center; gap: 20px;
    background: #ffffff; padding: 24px; border-radius: 12px;
    border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.avatar-circle {
    width: 64px; height: 64px; border-radius: 50%;
    background: #e0f2fe; color: #0284c7; font-size: 22px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
}
.paciente-info .nombre { margin: 0 0 8px 0; font-size: 22px; color: #1e293b; }
.tags-container { display: flex; gap: 12px; flex-wrap: wrap; }
.tag { background: #f8fafc; padding: 4px 10px; border-radius: 6px; font-size: 13.5px; color: #475569; border: 1px solid #e2e8f0; }

/* ── ESTADO VACÍO ── */
.empty-state { text-align: center; padding: 60px 20px; background: #ffffff; border-radius: 12px; border: 1px dashed #cbd5e1; }
.empty-state .icon { font-size: 48px; margin-bottom: 12px; opacity: 0.8; }
.empty-state h4 { color: #334155; margin: 0 0 8px 0; font-size: 18px; }
.empty-state p { color: #64748b; margin: 0; }

/* ── TRATAMIENTOS Y TIMELINE ── */
.tratamientos-lista { display: flex; flex-direction: column; gap: 32px; }

.tratamiento-card {
    background: #ffffff; border-radius: 16px; padding: 24px;
    border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
}

.tratamiento-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 20px; margin-bottom: 24px; border-bottom: 1px solid #f1f5f9;
}
.badge-episodio { display: inline-block; background: #fef3c7; color: #a16207; font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; text-transform: uppercase; }
.tratamiento-titulos .diagnostico { margin: 0 0 6px 0; font-size: 20px; color: #0f766e; }
.tratamiento-titulos .motivo { margin: 0; font-size: 14.5px; color: #64748b; }

.btn-ver-ficha {
    background: #ccfbf1; color: #0f766e; border: 1px solid #99f6e4;
    padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-ver-ficha:hover { background: #99f6e4; }

/* ── LÍNEA DE TIEMPO (TIMELINE) ── */
.timeline-container { position: relative; padding-left: 20px; }
.timeline-container::before {
    content: ''; position: absolute; top: 0; bottom: 0; left: 6px;
    width: 2px; background: #e2e8f0;
}

.timeline-node { position: relative; padding-bottom: 32px; }
.timeline-node:last-child { padding-bottom: 0; }
.timeline-node:last-child::before { display: none; } /* Ocultar línea extra al final */

.timeline-dot {
    position: absolute; top: 0; left: -21px; width: 14px; height: 14px;
    border-radius: 50%; background: #0f766e; border: 3px solid #ffffff;
    box-shadow: 0 0 0 1px #e2e8f0; z-index: 1;
}

.sesion-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; transition: transform 0.2s; }
.sesion-card:hover { transform: translateX(4px); border-color: #cbd5e1; }

.sesion-head { display: flex; justify-content: space-between; margin-bottom: 8px; }
.sesion-head .fecha { font-weight: 700; color: #334155; font-size: 15px; }
.sesion-head .sesion-numero { background: #e2e8f0; color: #475569; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 12px; }

.fisio-name { font-size: 13.5px; color: #64748b; margin-bottom: 12px; }

.metricas-rapidas { display: flex; gap: 12px; margin-bottom: 16px; }
.metrica-badge { font-size: 13px; padding: 4px 10px; border-radius: 6px; border: 1px solid; }
.metrica-badge.eva { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
.metrica-badge.estado { background: #f1f5f9; border-color: #cbd5e1; color: #334155; text-transform: capitalize; }
.metrica-badge.estado.mejoro { background: #dcfce7; border-color: #5eead4; color: #115e59; }
.metrica-badge.estado.empeoro { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }

.nota-texto { margin: 0 0 12px 0; font-size: 14.5px; color: #334155; line-height: 1.6; white-space: pre-wrap; }
.nota-texto:last-child { margin-bottom: 0; }
.nota-texto.indicaciones { background: #fffbeb; padding: 12px; border-radius: 8px; border-left: 3px solid #fbbf24; }

/* ── MODAL ── */
.ficha-modal { max-width: 900px !important; max-height: 95vh; display: flex; flex-direction: column; }

@media (max-width: 600px) {
    .tratamiento-header { flex-direction: column; gap: 16px; }
    .sesion-head { flex-direction: column; gap: 4px; }
    .btn-ver-ficha { width: 100%; text-align: center; }
}
</style>