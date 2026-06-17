import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'

import AppLayout from '@/layouts/AppLayout.vue'
import LoginView from '@/views/LoginView.vue'
import DashboardView from '@/views/DashboardView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false }
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: DashboardView
        },
        {
          path: 'pacientes',
          name: 'pacientes',
          component: () => import('@/views/PacientesView.vue'),
          meta: { roles: ['secretaria', 'admin'] } // Roles que pueden ver pacientes
        },
        {
          path: 'citas',
          name: 'citas',
          component: () => import('@/views/CitasView.vue'),
          meta: { roles: ['secretaria', 'fisioterapeuta', 'admin', 'paciente'] }
        },
        {
          path: 'expedientes',
          name: 'expedientes',
          component: () => import('@/views/ExpedientesView.vue'),
          meta: { roles: ['fisioterapeuta', 'admin'] } // Solo el área clínica
        },
        {
          path: 'configuracion',
          name: 'configuracion',
          component: () => import('@/views/ConfiguracionView.vue'),
          meta: { roles: ['admin'] } // 👈 CLAVE 1: Solo el Administrador puede acceder a esta ruta
        },
        {
          path: 'tarifario',
          name: 'tarifario',
          component: () => import('@/components/GestorTarifario.vue'), // O '@/views/GestorTarifario.vue' si lo guardaste ahí
          meta: { roles: ['admin'] } // Bloqueo estricto: Solo tú
        },
        {
          path: 'mi-perfil',
          name: 'miperfil',
          component: () => import('@/views/PerfilView.vue'),
          meta: { roles: ['secretaria', 'fisioterapeuta', 'admin', 'paciente'] }
        },
        {
          path: 'horarios',
          name: 'horarios',
          component: () => import('@/views/HorariosView.vue'),
          meta: { roles: ['fisioterapeuta'] } // Solo equipo clínico / gestión
        },
        {
          path: 'atencion/:idSesion', 
          name: 'atencion',
          component: () => import('@/views/AtencionView.vue'),
          meta: { roles: ['fisioterapeuta', 'admin'] } // Solo equipo clínico y admin
        },
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// --- GUARD DE NAVEGACIÓN GLOBAL CON CONTROL DE ROLES ---
router.beforeEach(async (to) => {
  const { data: { user } } = await supabase.auth.getUser()
  const requiereAutenticacion = to.matched.some(record => record.meta.requiresAuth)

  // 1. Si la ruta requiere autenticación y no hay sesión activa -> Expulsar al Login
  if (requiereAutenticacion && !user) {
    return { name: 'login' }
  }

  // 2. Si el usuario ya está logueado e intenta ir al login -> Mandarlo al Dashboard
  if (to.name === 'login' && user) {
    return { name: 'dashboard' }
  }

  const rolesPermitidos = to.matched.find(record => record.meta.roles)?.meta.roles

  if (user && rolesPermitidos) {
    const userRol = user.user_metadata?.rol

    if (userRol === 'admin') {
      return // Admin pasa libre
    }

    if (!rolesPermitidos.includes(userRol)) {
      return { name: 'dashboard' } // Expulsar si no tiene permisos
    }
  }
})

export default router