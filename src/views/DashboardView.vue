<script setup>
/**
 * Dashboard.vue
 *
 * Panel de control principal. Reutiliza las clases de diseño globales
 * (data-card, action-header, estado-badge, spinner) ya establecidas en
 * CitasView.vue para mantener consistencia visual exacta con el resto
 * del sistema.
 */
import { onMounted } from 'vue'
import { useDashboard, UMBRAL_SALDO_BAJO } from '@/composables/useDashboard'
import { ESTADOS_SESION } from '@/composables/useCitas'

const {
  citasHoy, loading,
  resumenEstados, totalCitasHoy, ocupacionFisios,
  pacientesAgotados, pacientesBajos,
  fetchDashboard,
} = useDashboard()

onMounted(fetchDashboard)

const formatHora = (iso) => {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso))
}
</script>

<template>
  <div class="view-container">

    <!-- ── Encabezado ──────────────────────────────────────────────────── -->
    <div class="action-header">
      <div class="header-text">
        <h2>Dashboard</h2>
        <p>Resumen operativo del día.</p>
      </div>
      <button class="btn-secondary" @click="fetchDashboard" :disabled="loading">
        {{ loading ? 'Cargando...' : '🔄 Actualizar' }}
      </button>
    </div>

    <!-- ── Estado de carga global ─────────────────────────────────────── -->
    <div v-if="loading" class="data-card">
      <p class="empty-row">
        <span class="spinner" style="display:inline-block; margin-right:8px"></span>
        Cargando métricas del día...
      </p>
    </div>

    <template v-else>

      <!-- ── Fila de tarjetas resumen ──────────────────────────────────── -->
      <div class="stats-grid">

        <div class="data-card stat-card">
          <span class="stat-value">{{ totalCitasHoy }}</span>
          <span class="stat-label">Citas hoy</span>
        </div>

        <div class="data-card stat-card">
          <span class="stat-value">{{ resumenEstados.atendida }}</span>
          <span class="stat-label">Atendidas</span>
        </div>

        <div class="data-card stat-card">
          <span class="stat-value">{{ resumenEstados.reservada + resumenEstados.agendada }}</span>
          <span class="stat-label">Pendientes</span>
        </div>

        <div class="data-card stat-card alerta">
          <span class="stat-value">{{ resumenEstados.no_asistio }}</span>
          <span class="stat-label">Inasistencias</span>
        </div>

      </div>

      <!-- ── Detalle de estados de citas de hoy ──────────────────────────── -->
      <div class="data-card">
        <h3>Citas de hoy por estado</h3>
        <div class="estado-resumen-grid">
          <div v-for="(cantidad, key) in resumenEstados" :key="key" class="estado-resumen-item">
            <span
              class="estado-badge"
              :style="`color:${ESTADOS_SESION[key]?.color}; background:${ESTADOS_SESION[key]?.bg}`"
            >
              {{ ESTADOS_SESION[key]?.label ?? key }}
            </span>
            <span class="estado-resumen-cantidad">{{ cantidad }}</span>
          </div>
        </div>

        <div v-if="citasHoy.length === 0" class="empty-row">
          No hay citas registradas para hoy.
        </div>
      </div>

      <!-- ── Pacientes con saldo crítico ─────────────────────────────────── -->
      <div class="data-card">
        <h3>Pacientes con saldo de sesiones bajo o agotado</h3>
        <p class="subtitulo-card">
          Saldo bajo: {{ UMBRAL_SALDO_BAJO }} sesión(es) o menos. Contactarlos para ofrecer recarga.
        </p>

        <div v-if="pacientesAgotados.length === 0 && pacientesBajos.length === 0" class="empty-row">
          Ningún paciente con saldo crítico por el momento.
        </div>

        <div class="table-responsive" v-else>
          <table class="content-table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Paquete</th>
                <th>Sesiones restantes</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in pacientesAgotados" :key="'agotado-' + p.idPaquete">
                <td>
                  <span class="patient-name">{{ p.paciente_nombres }} {{ p.paciente_apellidos }}</span>
                  <span class="patient-detail">{{ p.paciente_celular }}</span>
                </td>
                <td>{{ p.nombre_paquete }}</td>
                <td>{{ p.sesiones_restantes }}</td>
                <td>
                  <span class="estado-badge" style="color:#991b1b; background:#fee2e2">Agotado</span>
                </td>
              </tr>
              <tr v-for="p in pacientesBajos" :key="'bajo-' + p.idPaquete">
                <td>
                  <span class="patient-name">{{ p.paciente_nombres }} {{ p.paciente_apellidos }}</span>
                  <span class="patient-detail">{{ p.paciente_celular }}</span>
                </td>
                <td>{{ p.nombre_paquete }}</td>
                <td>{{ p.sesiones_restantes }}</td>
                <td>
                  <span class="estado-badge" style="color:#854d0e; background:#fef9c3">Saldo bajo</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Ocupación de fisioterapeutas (solo los que atienden hoy) ────── -->
      <div class="data-card">
        <h3>Ocupación de fisioterapeutas — hoy</h3>

        <div v-if="ocupacionFisios.length === 0" class="empty-row">
          Ningún fisioterapeuta tiene citas asignadas hoy.
        </div>

        <div class="ocupacion-grid" v-else>
          <div v-for="f in ocupacionFisios" :key="f.idFisioterapeuta" class="ocupacion-item">
            <div class="ocupacion-header">
              <span class="staff-name">{{ f.nombre }}</span>
              <span class="staff-detail">{{ f.especialidad }}</span>
            </div>
            <div class="ocupacion-cifras">
              <span><strong>{{ f.totalCitas }}</strong> citas hoy</span>
              <span><strong>{{ f.atendidas }}</strong> atendidas</span>
              <span><strong>{{ f.pendientes }}</strong> pendientes</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Próximas citas del día (lista rápida) ───────────────────────── -->
      <div class="data-card">
        <h3>Próximas citas de hoy</h3>
        <div class="table-responsive">
          <table class="content-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Paciente</th>
                <th>Fisioterapeuta</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="citasHoy.length === 0">
                <td colspan="4" class="empty-row">No hay citas para hoy.</td>
              </tr>
              <tr v-else v-for="c in citasHoy" :key="c.idSesion">
                <td>{{ formatHora(c.fecha_hora) }}</td>
                <td>
                  <span class="patient-name">{{ c.paciente_nombres }} {{ c.paciente_apellidos }}</span>
                </td>
                <td>
                  <span class="staff-name">{{ c.fisio_nombres }} {{ c.fisio_apellidos }}</span>
                </td>
                <td>
                  <span
                    class="estado-badge"
                    :style="`color:${ESTADOS_SESION[c.estado]?.color}; background:${ESTADOS_SESION[c.estado]?.bg}`"
                  >
                    {{ ESTADOS_SESION[c.estado]?.label ?? c.estado }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </template>

  </div>
</template>

<style scoped>
/* Grid de tarjetas resumen */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  gap: 4px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--navy);
}

.stat-label {
  font-size: 12.5px;
  color: var(--gray-500);
  font-weight: 500;
}

.stat-card.alerta .stat-value { color: #ef4444; }

/* Resumen de estados */
.estado-resumen-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.estado-resumen-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--gray-50);
  border-radius: var(--radius-sm);
  border: 1px solid var(--gray-100);
}

.estado-resumen-cantidad {
  font-size: 18px;
  font-weight: 700;
  color: var(--navy);
}

.subtitulo-card {
  font-size: 12.5px;
  color: var(--gray-500);
  margin: 4px 0 12px;
}

/* Ocupación de fisioterapeutas */
.ocupacion-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 12px;
}

.ocupacion-item {
  padding: 14px 16px;
  background: var(--gray-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--gray-100);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ocupacion-header {
  display: flex;
  flex-direction: column;
}

.ocupacion-cifras {
  display: flex;
  gap: 14px;
  font-size: 12.5px;
  color: var(--gray-500);
}

.ocupacion-cifras strong {
  color: var(--navy);
  font-size: 14px;
}

@media (max-width: 1024px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr; }
}


/* Mejora el padding interno de las tarjetas (data-card) */
.data-card {
    background: #ffffff;
    border-radius: var(--radius-md);
    padding: 24px; /* Asegura que lo que está adentro no toque el borde */
    border: 1px solid var(--gray-200);
    margin-bottom: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
</style>