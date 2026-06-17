<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabaseClient'
import logoImg from '@/components/icons/MovyBalanceLoguito.png'

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle'])

const route = useRoute()
const router = useRouter()

// Estado reactivo para almacenar el rol del usuario
const userRole = ref(null)

// Recuperar el rol desde los user_metadata del JWT
const fetchUserRole = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    userRole.value = user.user_metadata?.rol || 'paciente'
  }
}

// Matriz base de navegación (Tus SVGs y rutas originales)
const navItems = [
  {
    label: 'Dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    name: 'dashboard'
  },
  {
    label: 'Pacientes',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    name: 'pacientes'
  },
  {
    label: 'Citas / Agenda',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    name: 'citas'
  },
  {
    label: 'Expedientes',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    name: 'expedientes'
  },
    {
    label: 'Tarifario',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    name: 'tarifario'
  },
  {
    label: 'Mi Horario',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', // Ícono de Reloj
    name: 'horarios'
  },
  {
    label: 'Configuración',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    name: 'configuracion'
  }
]

// Determinar el texto adaptativo del botón de Citas/Agenda
const labelCitas = computed(() => {
  return userRole.value === 'paciente' ? 'Citas' : 'Agenda'
})

// Filtrar las rutas visibles basándose en la configuración del router
const visibleNavItems = computed(() => {
  if (!userRole.value) return []

  // 👈 LA SOLUCIÓN: Si el rol es admin, muestra absolutamente todo el catálogo de botones
  if (userRole.value === 'admin') {
    return navItems
  }

  // Si no es admin, filtra de forma estricta según el router
  return navItems.filter(item => {
    const routeRecord = router.resolve({ name: item.name })
    if (!routeRecord.meta || !routeRecord.meta.roles) return true
    return routeRecord.meta.roles.includes(userRole.value)
  })
})

const isActive = (name) => route.name === name

const navigate = (name) => {
  router.push({ name })
}

onMounted(() => {
  fetchUserRole()
})
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">

    <div class="sidebar-logo">
      <img :src="logoImg" alt="MovyBalance" class="logo-img" />
      <Transition name="fade-label">
        <span v-if="!collapsed" class="logo-label">MovyBalance</span>
      </Transition>
    </div>

    <nav class="sidebar-nav">
      <button v-for="item in visibleNavItems" :key="item.name" class="nav-item" :class="{ active: isActive(item.name) }"
        @click="navigate(item.name)" :title="collapsed ? (item.name === 'citas' ? labelCitas : item.label) : ''">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round">
          <path :d="item.icon" />
        </svg>
        <Transition name="fade-label">
          <span v-if="!collapsed" class="nav-label">
            {{ item.name === 'citas' ? labelCitas : item.label }}
          </span>
        </Transition>
        <span v-if="!collapsed && isActive(item.name)" class="active-indicator"></span>
      </button>
    </nav>

    <button class="collapse-btn" @click="emit('toggle')" :title="collapsed ? 'Expandir' : 'Colapsar'">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round">
        <path v-if="!collapsed" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
        <path v-else d="M13 5l7 7-7 7M6 5l7 7-7 7" />
      </svg>
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  --navy: #1a3a6e;
  --blue: #4a90c4;
  --blue-pale: #dceef8;
  --white: #ffffff;
  --gray-100: #f1f5f9;
  --sidebar-w: 230px;
  --sidebar-w-collapsed: 64px;
  --transition: 0.28s cubic-bezier(0.4, 0, 0.2, 1);

  width: var(--sidebar-w);
  min-height: 100vh;
  background: var(--navy);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex-shrink: 0;
  transition: width var(--transition);
  overflow: hidden;
  position: relative;
  z-index: 100;
  box-shadow: 2px 0 12px rgba(26, 58, 110, 0.18);
}

.sidebar.collapsed {
  width: var(--sidebar-w-collapsed);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 76px;
  overflow: hidden;
}

.logo-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 8px;
  background: white;
  padding: 2px;
  flex-shrink: 0;
}

.logo-label {
  font-family: 'Playfair Display', serif;
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 8px;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
  transition: background var(--transition), color var(--transition);
  position: relative;
  text-align: left;
  width: 100%;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.nav-item.active {
  background: rgba(74, 144, 196, 0.22);
  color: #ffffff;
}

.nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.nav-label {
  overflow: hidden;
  white-space: nowrap;
}

.active-indicator {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--blue);
  border-radius: 3px 0 0 3px;
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px;
  padding: 10px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.collapse-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.collapse-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.fade-label-enter-active {
  transition: opacity 0.2s ease 0.1s, transform 0.2s ease 0.1s;
}

.fade-label-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.fade-label-enter-from {
  opacity: 0;
  transform: translateX(-8px);
}

.fade-label-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    z-index: 200;
  }
}
</style>