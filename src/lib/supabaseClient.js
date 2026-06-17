import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/**
 * CORRECCIÓN CRÍTICA: Instancia única y centralizada de Supabase
 * v2.0 - Eliminada supabaseAux (redundante y causante de inconsistencias)
 * 
 * Configuración óptima para:
 * - Persistencia de sesión en localStorage
 * - Refresco automático de tokens
 * - Detección de sesión en URL (OAuth)
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
})

/**
 * Obtiene el usuario actual de forma segura
 * Valida que la sesión sea válida antes de devolver
 * 
 * @returns {Promise<Object|null>} Usuario de Supabase o null
 * @example
 * const user = await getCurrentUser()
 * if (user) console.log('Usuario autenticado:', user.email)
 */
export const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      console.error('Error obteniendo usuario:', error.message)
      return null
    }
    return user
  } catch (err) {
    console.error('Error en getCurrentUser:', err)
    return null
  }
}