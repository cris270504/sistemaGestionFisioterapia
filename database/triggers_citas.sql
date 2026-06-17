[
  {
    "nombre_trigger": "trigger_actualizar_finanzas_paquete",
    "tabla_afectada": "Pago",
    "codigo_sql": "CREATE TRIGGER trigger_actualizar_finanzas_paquete AFTER INSERT OR UPDATE OF monto ON public.\"Pago\" FOR EACH ROW WHEN ((new.\"idPaquete\" IS NOT NULL)) EXECUTE FUNCTION registrar_estado_financiero_paquete()"
  },
  {
    "nombre_trigger": "trg_abono_sesiones",
    "tabla_afectada": "Sesion",
    "codigo_sql": "CREATE TRIGGER trg_abono_sesiones AFTER INSERT ON public.\"Sesion\" FOR EACH ROW EXECUTE FUNCTION fn_gestion_sesiones_inteligente()"
  },
  {
    "nombre_trigger": "trg_descuento_sesiones",
    "tabla_afectada": "Sesion",
    "codigo_sql": "CREATE TRIGGER trg_descuento_sesiones AFTER UPDATE ON public.\"Sesion\" FOR EACH ROW EXECUTE FUNCTION fn_gestion_sesiones_inteligente()"
  },
  {
    "nombre_trigger": "trigger_guardián_estados_sesion",
    "tabla_afectada": "Sesion",
    "codigo_sql": "CREATE TRIGGER \"trigger_guardián_estados_sesion\" BEFORE UPDATE ON public.\"Sesion\" FOR EACH ROW EXECUTE FUNCTION validar_transicion_estado_sesion()"
  },
  {
    "nombre_trigger": "trg_gestionar_sesiones",
    "tabla_afectada": "Sesion",
    "codigo_sql": "CREATE TRIGGER trg_gestionar_sesiones AFTER UPDATE ON public.\"Sesion\" FOR EACH ROW EXECUTE FUNCTION fn_gestionar_sesiones_atencion()"
  },
  {
    "nombre_trigger": "trg_validar_fecha_cita",
    "tabla_afectada": "Sesion",
    "codigo_sql": "CREATE TRIGGER trg_validar_fecha_cita BEFORE INSERT OR UPDATE ON public.\"Sesion\" FOR EACH ROW EXECUTE FUNCTION validar_fecha_cita_futura()"
  }
]