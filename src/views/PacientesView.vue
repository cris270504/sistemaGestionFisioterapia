<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'
import FormularioPacienteModal from '@/components/FormularioPacienteModal.vue'

const { showAlert, showConfirm } = useAlert()

// Estados operativos
const pacientesList = ref([])
const searchQuery = ref('')
const isModalOpen = ref(false)
const selectedPaciente = ref(null)

const fetchPacientes = async () => {
    try {
        const { data, error } = await supabase
            .from('Paciente')
            .select(`
                idPaciente,
                direccion,
                created_at,
                Persona (
                  idPersona,
                  nombres,
                  apellidos,
                  tipo_documento,
                  numero_documento,
                  celular,
                  fecha_nacimiento
                )
            `)

        if (error) throw error
        pacientesList.value = data || []
    } catch (error) {
        showAlert('Error al cargar la nómina de pacientes: ' + error.message, 'error')
    }
}

const filteredPacientes = computed(() => {
    const query = searchQuery.value.toLowerCase().trim()
    if (!query) return pacientesList.value

    return pacientesList.value.filter(p => {
        const nombreCompleto = `${p.Persona?.nombres} ${p.Persona?.apellidos}`.toLowerCase()
        const doc = p.Persona?.numero_documento || ''
        return nombreCompleto.includes(query) || doc.includes(query)
    })
})

// Controladores de Apertura Dinámica
const openCreateForm = () => {
    selectedPaciente.value = null 
    isModalOpen.value = true
}

const openEditForm = (paciente) => {
    selectedPaciente.value = paciente 
    isModalOpen.value = true
}

const handleDeletePaciente = async (idPersonaReal) => {
    const confirmado = await showConfirm('¿Estás seguro de eliminar este paciente? Esto borrará permanentemente sus accesos al sistema y su historial.')
    
    if (!confirmado) return

    try {
        const { error } = await supabase
            .from('Persona')
            .delete()
            .eq('idPersona', idPersonaReal)

        if (error) throw error

        showAlert('Se elimnó al paciente del sistema. ', 'success')
        await fetchPacientes() 
    } catch (error) {
        showAlert('No se pudo eliminar el registro: ' + error.message, 'error')
    }
}

onMounted(() => {
    fetchPacientes()
})
</script>

<template>
    <div class="view-container">

        <div class="action-header">
            <div class="header-text">
                <h2>Gestión de Pacientes</h2>
                <p>Control de admisiones y gestión de accesos para pacientes de MovyBalance.</p>
            </div>
            <button class="primary-btn" @click="openCreateForm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                    stroke-linejoin="round" class="btn-icon">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Registrar Paciente
            </button>
        </div>

        <div class="data-card"
            style="padding: 16px; border-bottom: none; border-bottom-left-radius: 0; border-bottom-right-radius: 0;">
            <div class="input-group" style="max-width: 400px;">
                <input v-model="searchQuery" type="text" placeholder="Buscar por nombre o documento..."
                    style="background: #ffffff;" />
            </div>
        </div>

        <div class="data-card" style="border-top-left-radius: 0; border-top-right-radius: 0;">
            <div class="table-responsive">
                <table class="content-table">
                    <thead>
                        <tr>
                            <th>Paciente</th>
                            <th>Documento</th>
                            <th>Celular</th>
                            <th>Dirección Residencial</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="paciente in filteredPacientes" :key="paciente.idPaciente">
                            <td class="patient-name">
                                {{ paciente.Persona?.nombres }} {{ paciente.Persona?.apellidos }}
                            </td>
                            <td>{{ paciente.Persona?.tipo_documento }}: {{ paciente.Persona?.numero_documento }}</td>
                            <td>{{ paciente.Persona?.celular || '-' }}</td>
                            <td>{{ paciente.direccion || '-' }}</td>
                            <td>
                                <button @click="openEditForm(paciente)" class="btn-secondary"
                                    style="padding: 6px 14px; font-size: 12px; border-radius: 6px; margin-right: 8px;">
                                    Editar
                                </button>
                                <button @click="handleDeletePaciente(paciente.Persona?.idPersona)" class="btn-secondary"
                                    style="padding: 6px 14px; font-size: 12px; border-radius: 6px; background: #fee2e2; color: #ef4444;">
                                    Eliminar
                                </button>
                            </td>
                        </tr>
                        <tr v-if="filteredPacientes.length === 0">
                            <td colspan="5" class="empty-row">No se encontraron pacientes registrados.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <FormularioPacienteModal 
            :is-open="isModalOpen" 
            :paciente-data="selectedPaciente" 
            @close="isModalOpen = false"
            @refresh="fetchPacientes" 
        />
    </div>
</template>

<style scoped></style>