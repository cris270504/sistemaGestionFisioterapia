/**
 * useSearch.js - Composable reutilizable para búsqueda y filtrado
 * 
 * BENEFICIO: Elimina 2+ implementaciones de búsqueda
 * Usado por: ModalNuevaCita, ModalReprogramarCita, etc.
 */

import { ref, computed, unref } from 'vue'

/**
 * Composable para búsqueda y filtrado de items
 * 
 * @param {Array} items - Array de items a filtrar
 * @param {Function} getDisplayText - Función que extrae el texto a buscar de cada item
 * @returns {Object} { searchQuery, filteredItems, hasResults, clearSearch, setSearch }
 * 
 * @example
 * const { searchQuery: searchPaciente, filteredItems: pacientesFiltrados } = 
 *   useSearch(props.pacientes, (p) => `${p.Persona?.nombres} ${p.Persona?.apellidos}`)
 * 
 * En template:
 * v-model="searchPaciente"
 * v-for="p in pacientesFiltrados"
 */
export function useSearch(items = [], getDisplayText) {
  const searchQuery = ref('')

  const filteredItems = computed(() => {
    // unref(items) extrae el valor real si es un array, un ref o un computed
    const source = unref(items) || []

    if (!searchQuery.value.trim()) return source

    const q = searchQuery.value.toLowerCase().trim()
    return source.filter(item => {
      const displayText = getDisplayText(item).toLowerCase()
      return displayText.includes(q)
    })
  })

  /**
   * Limpia la búsqueda
   */
  const clearSearch = () => {
    searchQuery.value = ''
  }

  /**
   * Establece un query de búsqueda
   */
  const setSearch = (query) => {
    searchQuery.value = query
  }

  /**
   * Indica si hay resultados
   */
  const hasResults = computed(() => {
    return filteredItems.value.length > 0
  })

  /**
   * Número de resultados encontrados
   */
  const resultsCount = computed(() => {
    return filteredItems.value.length
  })

  return {
    searchQuery,
    filteredItems,
    hasResults,
    resultsCount,
    clearSearch,
    setSearch
  }
}
