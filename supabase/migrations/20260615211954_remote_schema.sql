


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."estado_Tratamiento" AS ENUM (
    'en_progreso',
    'finalizado',
    'abandonado'
);


ALTER TYPE "public"."estado_Tratamiento" OWNER TO "postgres";


CREATE TYPE "public"."estado_financiero_paquete" AS ENUM (
    'pendiente',
    'parcial',
    'pagado',
    'vencido',
    'cancelado'
);


ALTER TYPE "public"."estado_financiero_paquete" OWNER TO "postgres";


CREATE TYPE "public"."estado_pago" AS ENUM (
    'pendiente',
    'completado',
    'reembolsado',
    'fallido'
);


ALTER TYPE "public"."estado_pago" OWNER TO "postgres";


CREATE TYPE "public"."estado_promocion" AS ENUM (
    'activa',
    'inactiva'
);


ALTER TYPE "public"."estado_promocion" OWNER TO "postgres";


CREATE TYPE "public"."estado_sesion" AS ENUM (
    'reservada',
    'agendada',
    'atendida',
    'cancelada',
    'no_asistio',
    'reprogramada'
);


ALTER TYPE "public"."estado_sesion" OWNER TO "postgres";


CREATE TYPE "public"."metodo_pago" AS ENUM (
    'efectivo',
    'tarjeta',
    'yape',
    'plin'
);


ALTER TYPE "public"."metodo_pago" OWNER TO "postgres";


CREATE TYPE "public"."tipo_descuento" AS ENUM (
    'porcentaje',
    'monto_fijo'
);


ALTER TYPE "public"."tipo_descuento" OWNER TO "postgres";


CREATE TYPE "public"."tipo_documento" AS ENUM (
    'DNI',
    'CE',
    'PAS'
);


ALTER TYPE "public"."tipo_documento" OWNER TO "postgres";


CREATE TYPE "public"."tipo_saldo" AS ENUM (
    'paquete',
    'sesion_suelta',
    'bonificacion'
);


ALTER TYPE "public"."tipo_saldo" OWNER TO "postgres";


CREATE TYPE "public"."tipo_sesion" AS ENUM (
    'evaluacion',
    'tratamiento_control'
);


ALTER TYPE "public"."tipo_sesion" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_sesiones_futuras"("p_id_tratamiento" bigint, "p_id_fisioterapeuta" "uuid", "p_id_paciente" "uuid", "p_total_sesiones" smallint, "p_fecha_primera" timestamp with time zone, "p_intervalo_dias" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  i int;
BEGIN
  FOR i IN 2..p_total_sesiones LOOP
    INSERT INTO public."Sesion" (
      "idTratamiento", "idFisioterapeuta", "idPaciente",
      numero_sesion, fecha_hora, estado
    ) VALUES (
      p_id_tratamiento,
      p_id_fisioterapeuta,
      p_id_paciente,
      i,
      p_fecha_primera + ((i - 1) * p_intervalo_dias * INTERVAL '1 day'),
      'confirmada'
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."crear_sesiones_futuras"("p_id_tratamiento" bigint, "p_id_fisioterapeuta" "uuid", "p_id_paciente" "uuid", "p_total_sesiones" smallint, "p_fecha_primera" timestamp with time zone, "p_intervalo_dias" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_gestion_sesiones_inteligente"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Aquí NO usamos NEW.sesiones_disponibles porque no existe en Sesion
    -- Actualizamos directamente la tabla de saldos
    IF NEW.estado = 'atendida' THEN
        UPDATE public."Saldo_Sesiones"
        SET "sesiones_disponibles" = "sesiones_disponibles" - 1
        WHERE "idPaciente" = NEW."idPaciente";
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_gestion_sesiones_inteligente"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_gestionar_sesiones_atencion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
    -- Solo actuar si el estado cambió a 'atendida' y antes no lo estaba
    IF NEW.estado = 'atendida' AND (OLD.estado IS DISTINCT FROM 'atendida') THEN
        
        -- 1. DESCONTAR SESIÓN (Solo si NO es evaluación)
        -- Si tu lógica es que la evaluación es gratuita, no restes nada.
        IF NEW.tipo <> 'evaluacion' THEN
            UPDATE "Saldo_Sesiones" 
            SET "sesiones_disponibles" = "sesiones_disponibles" - 1
            WHERE "idPaciente" = NEW."idPaciente" 
            AND "sesiones_disponibles" > 0;
        END IF;

        -- 2. Lógica especial si fuera necesario (opcional)
        -- Si la evaluación DEBE contar como una sesión usada, quita el IF anterior.
        -- Si la evaluación es "gratuita" y no debe restar saldo, el IF anterior es correcto.
    END IF;

    RETURN NEW;
END;$$;


ALTER FUNCTION "public"."fn_gestionar_sesiones_atencion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_rol"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'rol'),
    'sin_rol'
  );
$$;


ALTER FUNCTION "public"."get_my_rol"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public."Persona" (
    "idPersona", 
    "nombres", 
    "apellidos", 
    "tipo_documento", 
    "numero_documento", 
    "celular",
    "fecha_nacimiento"
  )
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'nombres', 'Nuevo'), 
    COALESCE(NEW.raw_user_meta_data->>'apellidos', 'Usuario'),
    (COALESCE(NEW.raw_user_meta_data->>'tipo_documento', 'DNI'))::text::public.tipo_documento, 
    NEW.raw_user_meta_data->>'numero_documento',   
    NEW.raw_user_meta_data->>'celular',
    (NULLIF(NEW.raw_user_meta_data->>'fecha_nacimiento', ''))::date           
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_estado_financiero_paquete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_monto_total numeric(10,2);
    v_monto_pagado numeric(10,2);
    v_saldo_pendiente numeric(10,2);
    v_fecha_vencimiento date;
    v_estado_actual public.estado_financiero_paquete;
BEGIN
    -- 1. Obtenemos los datos del paquete afectado
    SELECT monto_total, monto_pagado, fecha_vencimiento, estado_pago 
    INTO v_monto_total, v_monto_pagado, v_fecha_vencimiento, v_estado_actual
    FROM public."Paquete" 
    WHERE "idPaquete" = NEW."idPaquete";

    -- Si el administrador canceló manualmente la deuda, se respeta el candado de tu matriz
    IF v_estado_actual = 'cancelado' THEN
        RETURN NEW;
    END IF;

    v_saldo_pendiente := v_monto_total - v_monto_pagado;

    -- 2. Aplicamos las Reglas de Negocio exactas de tu matriz
    IF v_monto_pagado = 0 THEN
        UPDATE public."Paquete" SET estado_pago = 'pendiente' WHERE "idPaquete" = NEW."idPaquete";
    ELSIF v_saldo_pendiente = 0 THEN
        UPDATE public."Paquete" SET estado_pago = 'pagado' WHERE "idPaquete" = NEW."idPaquete";
    ELSIF v_saldo_pendiente > 0 AND v_fecha_vencimiento < CURRENT_DATE THEN
        UPDATE public."Paquete" SET estado_pago = 'vencido' WHERE "idPaquete" = NEW."idPaquete";
    ELSIF v_monto_pagado > 0 AND v_saldo_pendiente > 0 THEN
        UPDATE public."Paquete" SET estado_pago = 'parcial' WHERE "idPaquete" = NEW."idPaquete";
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."registrar_estado_financiero_paquete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_fecha_cita_futura"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Solo validamos la fecha si es una inserción nueva, 
    -- o si es una actualización donde la fecha_hora realmente cambió.
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora) THEN
        IF NEW.fecha_hora < (now() - interval '5 minutes') THEN
            RAISE EXCEPTION 'Regla de negocio: La fecha y hora de la cita no puede ser en el pasado.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validar_fecha_cita_futura"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_transicion_estado_sesion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$BEGIN
    -- 1. Regla: Una sesión atendida es un documento clínico sellado. No se toca.
    IF OLD.estado = 'atendida' AND NEW.estado != 'atendida' THEN
        RAISE EXCEPTION 'Validación Clínica: Una sesión ya atendida no puede cambiar de estado.';
    END IF;

    -- 2. Regla: Una sesión cancelada queda congelada.
    IF OLD.estado = 'cancelada' THEN
        RAISE EXCEPTION 'Validación Administrativa: Una sesión cancelada no puede ser modificada.';
    END IF;

    -- 3. Regla: El paciente faltó. No puedes decir que sí vino después.
    IF OLD.estado = 'no_asistio' AND NEW.estado = 'atendida' THEN
        RAISE EXCEPTION 'Validación Operativa: No se puede marcar como atendida una sesión con estado no_asistio.';
    END IF;

    -- 4. Regla: Solo las citas agendadas (y pagadas/válidas) pasan a atención.
    IF NEW.estado = 'atendida' AND OLD.estado != 'agendada' THEN
        RAISE EXCEPTION 'Validación Operativa: Solo las sesiones en estado agendada pueden pasar a atendidas.';
    END IF;

    IF NEW.estado = 'atendida' AND NEW.estado_pago != 'pagado' THEN
        RAISE EXCEPTION 'No se puede atender la sesión: El pago está pendiente o incompleto.';
    END IF;

    -- 5. Regla: Control de Reprogramación Única (Candado Avanzado)
    IF NEW.estado = 'reprogramada' AND OLD.estado = 'reprogramada' THEN
        RAISE EXCEPTION 'Validación Operativa: Una sesión reprogramada queda bloqueada para posteriores modificaciones.';
    END IF;

    IF NEW.estado = 'reprogramada' AND OLD."idSesionOriginal" IS NOT NULL THEN
        RAISE EXCEPTION 'Validación de Negocio: Esta cita ya es fruto de una reprogramación previa. No se permite re-reprogramar.';
    END IF;

    RETURN NEW;
END;$$;


ALTER FUNCTION "public"."validar_transicion_estado_sesion"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."Antecedentes" (
    "idAntecedentes" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idPaciente" "uuid" NOT NULL,
    "alergias" "text",
    "familiares" "text",
    "traumatologicos" "text",
    "quirurgicos" "text",
    "observaciones" "text",
    "update_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL
);


ALTER TABLE "public"."Antecedentes" OWNER TO "postgres";


ALTER TABLE "public"."Antecedentes" ALTER COLUMN "idAntecedentes" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Antecedentes_idAntecedentes_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Catalogo_Servicio" (
    "idServicio" bigint NOT NULL,
    "nombre" character varying NOT NULL,
    "tipo" character varying NOT NULL,
    "cantidad_sesiones" smallint DEFAULT 1 NOT NULL,
    "precio" numeric(10,2) NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "precio_base" numeric(10,2) DEFAULT 0,
    "cantidad_sesiones_incluidas" integer DEFAULT 1,
    CONSTRAINT "Catalogo_Servicio_tipo_check" CHECK ((("tipo")::"text" = ANY ((ARRAY['sesion_suelta'::character varying, 'paquete'::character varying])::"text"[])))
);


ALTER TABLE "public"."Catalogo_Servicio" OWNER TO "postgres";


ALTER TABLE "public"."Catalogo_Servicio" ALTER COLUMN "idServicio" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Catalogo_Servicio_idServicio_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Evaluacion" (
    "idEvaluacion" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nombre" character varying NOT NULL,
    "descripcion" "text",
    "valor_min" smallint NOT NULL,
    "valor_max" smallint NOT NULL
);


ALTER TABLE "public"."Evaluacion" OWNER TO "postgres";


ALTER TABLE "public"."Evaluacion" ALTER COLUMN "idEvaluacion" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Evaluacion_idEvaluacion_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Evaluacion_inicial" (
    "idEvaluacionInicial" bigint NOT NULL,
    "idPaciente" "uuid" NOT NULL,
    "idFisioterapeuta" "uuid" NOT NULL,
    "fecha" timestamp with time zone DEFAULT "now"() NOT NULL,
    "motivo_consulta" "text" NOT NULL,
    "apuntes_generales" "text" NOT NULL,
    "ejercicios_realizados" "text",
    "observaciones" "text",
    "idSesion" bigint NOT NULL,
    "idTratamiento" bigint
);


ALTER TABLE "public"."Evaluacion_inicial" OWNER TO "postgres";


ALTER TABLE "public"."Evaluacion_inicial" ALTER COLUMN "idEvaluacionInicial" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Evaluacion_inicial_idEvaluacionInicial_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Fisioterapeuta" (
    "idFisioterapeuta" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "especialidad" character varying NOT NULL
);


ALTER TABLE "public"."Fisioterapeuta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Historial_estado_sesion" (
    "idHistorial" bigint NOT NULL,
    "idSesion" bigint NOT NULL,
    "estado_anterior" character varying NOT NULL,
    "estado_nuevo" character varying NOT NULL,
    "fecha_cambio" timestamp with time zone DEFAULT "now"() NOT NULL,
    "usuario_responsable" "uuid" NOT NULL,
    "observacion" "text"
);


ALTER TABLE "public"."Historial_estado_sesion" OWNER TO "postgres";


ALTER TABLE "public"."Historial_estado_sesion" ALTER COLUMN "idHistorial" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Historial_estado_sesion_idHistorial_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Horario" (
    "idHorario" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idFisioterapeuta" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "dia_semana" smallint NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fin" time without time zone NOT NULL,
    CONSTRAINT "Horario_dia_semana_check" CHECK ((("dia_semana" >= 1) AND ("dia_semana" <= 7)))
);


ALTER TABLE "public"."Horario" OWNER TO "postgres";


ALTER TABLE "public"."Horario" ALTER COLUMN "idHorario" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Horario_idHorario_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Paciente" (
    "idPaciente" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "direccion" character varying
);


ALTER TABLE "public"."Paciente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Pago" (
    "idPago" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idPaciente" "uuid" NOT NULL,
    "idSesion" bigint,
    "monto" numeric(10,2) NOT NULL,
    "metodo_pago" "public"."metodo_pago" NOT NULL,
    "estado_pago" "public"."estado_pago" DEFAULT 'completado'::"public"."estado_pago" NOT NULL,
    "id_transaccion_pasarela" "text",
    "idPaquete" bigint,
    "numero_operacion" character varying(50),
    "idPromocion" bigint,
    CONSTRAINT "pago_monto_check" CHECK (("monto" > 0.00))
);


ALTER TABLE "public"."Pago" OWNER TO "postgres";


ALTER TABLE "public"."Pago" ALTER COLUMN "idPago" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Pago_idPago_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Paquete" (
    "idPaquete" bigint NOT NULL,
    "idPaciente" "uuid" NOT NULL,
    "nombre_paquete" character varying NOT NULL,
    "total_sesiones" integer NOT NULL,
    "monto_total" numeric(10,2) NOT NULL,
    "monto_pagado" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "fecha_inicio" "date" DEFAULT CURRENT_DATE NOT NULL,
    "fecha_vencimiento" "date",
    "estado_pago" "public"."estado_financiero_paquete" DEFAULT 'pendiente'::"public"."estado_financiero_paquete" NOT NULL,
    "idPromocion" bigint,
    "idServicio" bigint,
    CONSTRAINT "paquete_monto_pagado_check" CHECK (("monto_pagado" >= 0.00)),
    CONSTRAINT "paquete_monto_total_check" CHECK (("monto_total" > 0.00))
);


ALTER TABLE "public"."Paquete" OWNER TO "postgres";


ALTER TABLE "public"."Paquete" ALTER COLUMN "idPaquete" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Paquete_idPaquete_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Persona" (
    "idPersona" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nombres" character varying NOT NULL,
    "apellidos" character varying NOT NULL,
    "celular" "text",
    "fecha_nacimiento" "date",
    "tipo_documento" "public"."tipo_documento" NOT NULL,
    "numero_documento" "text",
    CONSTRAINT "Persona_celular_check" CHECK ((("celular" IS NULL) OR ("length"("celular") = 9))),
    CONSTRAINT "Persona_numero_documento_check" CHECK (("length"("numero_documento") <= 12)),
    CONSTRAINT "check_documento_peru" CHECK ((("numero_documento" IS NULL) OR ((("tipo_documento" = 'DNI'::"public"."tipo_documento") AND ("numero_documento" ~ '^[0-9]{8}$'::"text")) OR (("tipo_documento" = 'CE'::"public"."tipo_documento") AND ("numero_documento" ~ '^[a-zA-Z0-9]{8,12}$'::"text")) OR (("tipo_documento" = 'PAS'::"public"."tipo_documento") AND ("numero_documento" ~ '^[a-zA-Z0-9]{6,12}$'::"text")))))
);


ALTER TABLE "public"."Persona" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Promocion" (
    "idPromocion" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nombre" character varying NOT NULL,
    "tipo_descuento" "public"."tipo_descuento" NOT NULL,
    "valor" numeric NOT NULL,
    "fecha_inicio" timestamp with time zone NOT NULL,
    "fecha_fin" timestamp with time zone NOT NULL,
    "estado" "public"."estado_promocion" NOT NULL,
    "es_global" boolean NOT NULL
);


ALTER TABLE "public"."Promocion" OWNER TO "postgres";


ALTER TABLE "public"."Promocion" ALTER COLUMN "idPromocion" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Promocion_idPromocion_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Saldo_Sesiones" (
    "idSaldo" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idPaciente" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "sesiones_disponibles" smallint DEFAULT '0'::smallint NOT NULL,
    "tipo_saldo" "public"."tipo_saldo" NOT NULL
);


ALTER TABLE "public"."Saldo_Sesiones" OWNER TO "postgres";


ALTER TABLE "public"."Saldo_Sesiones" ALTER COLUMN "idSaldo" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Saldo_Sesiones_idSaldo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Secretaria" (
    "idSecretaria" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."Secretaria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Sesion" (
    "idSesion" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idTratamiento" bigint,
    "idFisioterapeuta" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "numero_sesion" smallint NOT NULL,
    "fecha_hora" timestamp with time zone NOT NULL,
    "notas_evolucion" "text",
    "estado" "public"."estado_sesion" DEFAULT 'reservada'::"public"."estado_sesion" NOT NULL,
    "indicaciones" "text",
    "expires_at" timestamp with time zone,
    "observaciones" "text",
    "idPaquete" bigint,
    "idSesionOriginal" bigint,
    "idPaciente" "uuid" NOT NULL,
    "tipo" "public"."tipo_sesion" DEFAULT 'tratamiento_control'::"public"."tipo_sesion" NOT NULL,
    "paciente_en_sala" boolean DEFAULT false NOT NULL,
    "idServicio" bigint,
    "sesiones_a_generar" integer DEFAULT 0,
    "estado_pago" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "id_transaccion_referencia" "text",
    CONSTRAINT "Sesion_estado_pago_check" CHECK (("estado_pago" = ANY (ARRAY['pendiente'::"text", 'parcial'::"text", 'pagado'::"text", 'cortesía'::"text"])))
);


ALTER TABLE "public"."Sesion" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Sesion_Evaluacion" (
    "idSesionEvaluacion" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idSesion" bigint NOT NULL,
    "idEvaluacion" bigint NOT NULL,
    "resultado" smallint NOT NULL,
    "observacion" "text"
);


ALTER TABLE "public"."Sesion_Evaluacion" OWNER TO "postgres";


ALTER TABLE "public"."Sesion_Evaluacion" ALTER COLUMN "idSesionEvaluacion" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Sesion_Evaluacion_idSesionEvaluacion_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."Sesion" ALTER COLUMN "idSesion" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Sesion_idSesion_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Terminos_Condiciones" (
    "idTerminosCondiciones" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" character varying NOT NULL,
    "contenido" "text" NOT NULL,
    "fecha_publicacion" timestamp without time zone NOT NULL,
    "estado" "public"."estado_promocion" NOT NULL
);


ALTER TABLE "public"."Terminos_Condiciones" OWNER TO "postgres";


ALTER TABLE "public"."Terminos_Condiciones" ALTER COLUMN "idTerminosCondiciones" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Terminos_Condiciones_idTerminosCondiciones_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Tratamiento" (
    "idTratamiento" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idPaciente" "uuid" NOT NULL,
    "idFisioterapeuta" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "motivo_consulta" "text" NOT NULL,
    "diagnostico" "text" NOT NULL,
    "resultado" "text",
    "estado" "public"."estado_Tratamiento" DEFAULT 'en_progreso'::"public"."estado_Tratamiento" NOT NULL,
    "total_sesiones" smallint
);


ALTER TABLE "public"."Tratamiento" OWNER TO "postgres";


ALTER TABLE "public"."Tratamiento" ALTER COLUMN "idTratamiento" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Tratamiento_idTratamiento_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."v_saldo_paquete" AS
SELECT
    NULL::bigint AS "idPaquete",
    NULL::"uuid" AS "idPaciente",
    NULL::character varying AS "nombre_paquete",
    NULL::integer AS "total_sesiones",
    NULL::bigint AS "sesiones_consumidas",
    NULL::bigint AS "sesiones_restantes",
    NULL::"public"."estado_financiero_paquete" AS "estado_pago";


ALTER VIEW "public"."v_saldo_paquete" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_citas_detalladas" AS
 SELECT "s"."idSesion",
    "s"."created_at",
    "s"."idTratamiento",
    "s"."idFisioterapeuta",
    "s"."numero_sesion",
    "s"."fecha_hora",
    "s"."notas_evolucion",
    "s"."estado",
    "s"."indicaciones",
    "s"."expires_at",
    "s"."observaciones",
    "s"."idPaquete",
    "s"."idSesionOriginal",
    "s"."idPaciente",
    "s"."tipo",
    "s"."paciente_en_sala",
    "s"."idServicio",
    "s"."sesiones_a_generar",
    "s"."estado_pago",
    "s"."id_transaccion_referencia",
    "f"."especialidad" AS "fisio_especialidad",
    "per_p"."nombres" AS "paciente_nombres",
    "per_p"."apellidos" AS "paciente_apellidos",
    "per_f"."nombres" AS "fisio_nombres",
    "per_f"."apellidos" AS "fisio_apellidos"
   FROM (((("public"."Sesion" "s"
     LEFT JOIN "public"."Fisioterapeuta" "f" ON (("s"."idFisioterapeuta" = "f"."idFisioterapeuta")))
     LEFT JOIN "public"."Persona" "per_f" ON (("f"."idFisioterapeuta" = "per_f"."idPersona")))
     LEFT JOIN "public"."Paciente" "p" ON (("s"."idPaciente" = "p"."idPaciente")))
     LEFT JOIN "public"."Persona" "per_p" ON (("p"."idPaciente" = "per_p"."idPersona")));


ALTER VIEW "public"."vw_citas_detalladas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_saldo_paciente" AS
 SELECT "idPaciente",
    "sum"("sesiones_disponibles") AS "total_disponible"
   FROM "public"."Saldo_Sesiones"
  GROUP BY "idPaciente";


ALTER VIEW "public"."vw_saldo_paciente" OWNER TO "postgres";


ALTER TABLE ONLY "public"."Antecedentes"
    ADD CONSTRAINT "Antecedentes_idPaciente_unique" UNIQUE ("idPaciente");



ALTER TABLE ONLY "public"."Antecedentes"
    ADD CONSTRAINT "Antecedentes_pkey" PRIMARY KEY ("idAntecedentes");



ALTER TABLE ONLY "public"."Catalogo_Servicio"
    ADD CONSTRAINT "Catalogo_Servicio_pkey" PRIMARY KEY ("idServicio");



ALTER TABLE ONLY "public"."Evaluacion"
    ADD CONSTRAINT "Evaluacion_pkey" PRIMARY KEY ("idEvaluacion");



ALTER TABLE ONLY "public"."Fisioterapeuta"
    ADD CONSTRAINT "Fisioterapeuta_pkey" PRIMARY KEY ("idFisioterapeuta");



ALTER TABLE ONLY "public"."Horario"
    ADD CONSTRAINT "Horario_pkey" PRIMARY KEY ("idHorario");



ALTER TABLE ONLY "public"."Paciente"
    ADD CONSTRAINT "Paciente_pkey" PRIMARY KEY ("idPaciente");



ALTER TABLE ONLY "public"."Persona"
    ADD CONSTRAINT "Persona_numero_documento_key" UNIQUE ("numero_documento");



ALTER TABLE ONLY "public"."Persona"
    ADD CONSTRAINT "Persona_pkey" PRIMARY KEY ("idPersona");



ALTER TABLE ONLY "public"."Promocion"
    ADD CONSTRAINT "Promocion_pkey" PRIMARY KEY ("idPromocion");



ALTER TABLE ONLY "public"."Saldo_Sesiones"
    ADD CONSTRAINT "Saldo_Sesiones_pkey" PRIMARY KEY ("idSaldo");



ALTER TABLE ONLY "public"."Sesion_Evaluacion"
    ADD CONSTRAINT "Sesion_Evaluacion_pkey" PRIMARY KEY ("idSesionEvaluacion");



ALTER TABLE ONLY "public"."Sesion"
    ADD CONSTRAINT "Sesion_pkey" PRIMARY KEY ("idSesion");



ALTER TABLE ONLY "public"."Terminos_Condiciones"
    ADD CONSTRAINT "Terminos_Condiciones_pkey" PRIMARY KEY ("idTerminosCondiciones");



ALTER TABLE ONLY "public"."Tratamiento"
    ADD CONSTRAINT "Tratamiento_pkey" PRIMARY KEY ("idTratamiento");



ALTER TABLE ONLY "public"."Evaluacion_inicial"
    ADD CONSTRAINT "evaluacion_inicial_idSesion_key" UNIQUE ("idSesion");



ALTER TABLE ONLY "public"."Evaluacion_inicial"
    ADD CONSTRAINT "evaluacion_inicial_pkey" PRIMARY KEY ("idEvaluacionInicial");



ALTER TABLE ONLY "public"."Historial_estado_sesion"
    ADD CONSTRAINT "historial_estado_sesion_pkey" PRIMARY KEY ("idHistorial");



ALTER TABLE ONLY "public"."Pago"
    ADD CONSTRAINT "pago_pkey" PRIMARY KEY ("idPago");



ALTER TABLE ONLY "public"."Paquete"
    ADD CONSTRAINT "paquete_pkey" PRIMARY KEY ("idPaquete");



ALTER TABLE ONLY "public"."Secretaria"
    ADD CONSTRAINT "secretaria_pkey" PRIMARY KEY ("idSecretaria");



CREATE OR REPLACE VIEW "public"."v_saldo_paquete" AS
 SELECT "p"."idPaquete",
    "p"."idPaciente",
    "p"."nombre_paquete",
    "p"."total_sesiones",
    "count"("s"."idSesion") FILTER (WHERE ("s"."estado" <> ALL (ARRAY['cancelada'::"public"."estado_sesion", 'reprogramada'::"public"."estado_sesion"]))) AS "sesiones_consumidas",
    ("p"."total_sesiones" - "count"("s"."idSesion") FILTER (WHERE ("s"."estado" <> ALL (ARRAY['cancelada'::"public"."estado_sesion", 'reprogramada'::"public"."estado_sesion"])))) AS "sesiones_restantes",
    "p"."estado_pago"
   FROM ("public"."Paquete" "p"
     LEFT JOIN "public"."Sesion" "s" ON (("s"."idPaquete" = "p"."idPaquete")))
  GROUP BY "p"."idPaquete";



CREATE OR REPLACE TRIGGER "trg_abono_sesiones" AFTER INSERT ON "public"."Sesion" FOR EACH ROW EXECUTE FUNCTION "public"."fn_gestion_sesiones_inteligente"();



CREATE OR REPLACE TRIGGER "trg_descuento_sesiones" AFTER UPDATE ON "public"."Sesion" FOR EACH ROW EXECUTE FUNCTION "public"."fn_gestion_sesiones_inteligente"();



CREATE OR REPLACE TRIGGER "trg_gestionar_sesiones" AFTER UPDATE ON "public"."Sesion" FOR EACH ROW EXECUTE FUNCTION "public"."fn_gestionar_sesiones_atencion"();



CREATE OR REPLACE TRIGGER "trg_validar_fecha_cita" BEFORE INSERT OR UPDATE ON "public"."Sesion" FOR EACH ROW EXECUTE FUNCTION "public"."validar_fecha_cita_futura"();



CREATE OR REPLACE TRIGGER "trigger_actualizar_finanzas_paquete" AFTER INSERT OR UPDATE OF "monto" ON "public"."Pago" FOR EACH ROW WHEN (("new"."idPaquete" IS NOT NULL)) EXECUTE FUNCTION "public"."registrar_estado_financiero_paquete"();



CREATE OR REPLACE TRIGGER "trigger_guardián_estados_sesion" BEFORE UPDATE ON "public"."Sesion" FOR EACH ROW EXECUTE FUNCTION "public"."validar_transicion_estado_sesion"();



ALTER TABLE ONLY "public"."Antecedentes"
    ADD CONSTRAINT "Antecedentes_idPaciente_fkey" FOREIGN KEY ("idPaciente") REFERENCES "public"."Paciente"("idPaciente") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Evaluacion_inicial"
    ADD CONSTRAINT "Eval_idTratamiento_fkey" FOREIGN KEY ("idTratamiento") REFERENCES "public"."Tratamiento"("idTratamiento") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Evaluacion_inicial"
    ADD CONSTRAINT "Evaluacion_inicial_idSesion_fkey" FOREIGN KEY ("idSesion") REFERENCES "public"."Sesion"("idSesion") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Fisioterapeuta"
    ADD CONSTRAINT "Fisioterapeuta_idFisioterapeuta_fkey" FOREIGN KEY ("idFisioterapeuta") REFERENCES "public"."Persona"("idPersona");



ALTER TABLE ONLY "public"."Horario"
    ADD CONSTRAINT "Horario_idFisioterapeuta_fkey" FOREIGN KEY ("idFisioterapeuta") REFERENCES "public"."Fisioterapeuta"("idFisioterapeuta") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Paciente"
    ADD CONSTRAINT "Paciente_idPaciente_fkey" FOREIGN KEY ("idPaciente") REFERENCES "public"."Persona"("idPersona") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Pago"
    ADD CONSTRAINT "Pago_idPromocion_fkey" FOREIGN KEY ("idPromocion") REFERENCES "public"."Promocion"("idPromocion") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Paquete"
    ADD CONSTRAINT "Paquete_idPromocion_fkey" FOREIGN KEY ("idPromocion") REFERENCES "public"."Promocion"("idPromocion") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Persona"
    ADD CONSTRAINT "Persona_idPersona_fkey" FOREIGN KEY ("idPersona") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Saldo_Sesiones"
    ADD CONSTRAINT "Saldo_Sesiones_idPaciente_fkey" FOREIGN KEY ("idPaciente") REFERENCES "public"."Paciente"("idPaciente") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Sesion_Evaluacion"
    ADD CONSTRAINT "Sesion_Evaluacion_idEvaluacion_fkey" FOREIGN KEY ("idEvaluacion") REFERENCES "public"."Evaluacion"("idEvaluacion") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Sesion_Evaluacion"
    ADD CONSTRAINT "Sesion_Evaluacion_idSesion_fkey" FOREIGN KEY ("idSesion") REFERENCES "public"."Sesion"("idSesion") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Sesion"
    ADD CONSTRAINT "Sesion_idFisioterapeuta_fkey" FOREIGN KEY ("idFisioterapeuta") REFERENCES "public"."Fisioterapeuta"("idFisioterapeuta") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Sesion"
    ADD CONSTRAINT "Sesion_idPaciente_fkey" FOREIGN KEY ("idPaciente") REFERENCES "public"."Paciente"("idPaciente") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Sesion"
    ADD CONSTRAINT "Sesion_idPaquete_fkey" FOREIGN KEY ("idPaquete") REFERENCES "public"."Paquete"("idPaquete") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Sesion"
    ADD CONSTRAINT "Sesion_idSesionOriginal_fkey" FOREIGN KEY ("idSesionOriginal") REFERENCES "public"."Sesion"("idSesion") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Sesion"
    ADD CONSTRAINT "Sesion_idTratamiento_fkey" FOREIGN KEY ("idTratamiento") REFERENCES "public"."Tratamiento"("idTratamiento") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Tratamiento"
    ADD CONSTRAINT "Tratamiento_idFisioterapeuta_fkey" FOREIGN KEY ("idFisioterapeuta") REFERENCES "public"."Fisioterapeuta"("idFisioterapeuta") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Tratamiento"
    ADD CONSTRAINT "Tratamiento_idPaciente_fkey" FOREIGN KEY ("idPaciente") REFERENCES "public"."Paciente"("idPaciente") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Evaluacion_inicial"
    ADD CONSTRAINT "eval_idfisioterapeuta_fkey" FOREIGN KEY ("idFisioterapeuta") REFERENCES "public"."Fisioterapeuta"("idFisioterapeuta") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Evaluacion_inicial"
    ADD CONSTRAINT "eval_idpaciente_fkey" FOREIGN KEY ("idPaciente") REFERENCES "public"."Paciente"("idPaciente") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Historial_estado_sesion"
    ADD CONSTRAINT "historial_idsesion_fkey" FOREIGN KEY ("idSesion") REFERENCES "public"."Sesion"("idSesion") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Pago"
    ADD CONSTRAINT "pago_idpaciente_fkey" FOREIGN KEY ("idPaciente") REFERENCES "public"."Paciente"("idPaciente") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."Pago"
    ADD CONSTRAINT "pago_idpaquete_fkey" FOREIGN KEY ("idPaquete") REFERENCES "public"."Paquete"("idPaquete") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Pago"
    ADD CONSTRAINT "pago_idsesion_fkey" FOREIGN KEY ("idSesion") REFERENCES "public"."Sesion"("idSesion") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Paquete"
    ADD CONSTRAINT "paquete_idpaciente_fkey" FOREIGN KEY ("idPaciente") REFERENCES "public"."Paciente"("idPaciente") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."Paquete"
    ADD CONSTRAINT "paquete_idservicio_fkey" FOREIGN KEY ("idServicio") REFERENCES "public"."Catalogo_Servicio"("idServicio") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."Secretaria"
    ADD CONSTRAINT "secretaria_idsecretaria_fkey" FOREIGN KEY ("idSecretaria") REFERENCES "public"."Persona"("idPersona") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Sesion"
    ADD CONSTRAINT "sesion_idservicio_fkey" FOREIGN KEY ("idServicio") REFERENCES "public"."Catalogo_Servicio"("idServicio") ON UPDATE CASCADE ON DELETE RESTRICT;



CREATE POLICY "Admin_All_Catalogo" ON "public"."Catalogo_Servicio" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text"));



ALTER TABLE "public"."Antecedentes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Auto-gestión o Control de Admin" ON "public"."Persona" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "idPersona") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text"))) WITH CHECK ((("auth"."uid"() = "idPersona") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text")));



ALTER TABLE "public"."Catalogo_Servicio" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Eval_Ini_All_Policy" ON "public"."Evaluacion_inicial" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text"]))) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text"])));



CREATE POLICY "Eval_Ini_Select_Policy" ON "public"."Evaluacion_inicial" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "idPaciente") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text", 'secretaria'::"text"]))));



ALTER TABLE "public"."Evaluacion" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Evaluacion_Admin_Policy" ON "public"."Evaluacion" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text"));



CREATE POLICY "Evaluacion_Select_Policy" ON "public"."Evaluacion" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."Evaluacion_inicial" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Fisio_Select_Policy" ON "public"."Fisioterapeuta" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Fisio_Write_Policy" ON "public"."Fisioterapeuta" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text"));



ALTER TABLE "public"."Fisioterapeuta" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Historial_Select_Policy" ON "public"."Historial_estado_sesion" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'fisioterapeuta'::"text", 'admin'::"text"])));



ALTER TABLE "public"."Historial_estado_sesion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Horario" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Horario_All_Policy" ON "public"."Horario" TO "authenticated" USING ((("auth"."uid"() = "idFisioterapeuta") AND ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text"])))) WITH CHECK ((("auth"."uid"() = "idFisioterapeuta") AND ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text"]))));



CREATE POLICY "Horario_Select_Policy" ON "public"."Horario" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."Paciente" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Paciente_Select_Policy" ON "public"."Paciente" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "idPaciente") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'fisioterapeuta'::"text", 'admin'::"text"]))));



CREATE POLICY "Paciente_Write_Policy" ON "public"."Paciente" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text", 'paciente'::"text"]))) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text", 'paciente'::"text"])));



ALTER TABLE "public"."Pago" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Pago_Insert_Policy" ON "public"."Pago" FOR INSERT TO "authenticated" WITH CHECK (((((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'paciente'::"text") AND ("auth"."uid"() = "idPaciente")) OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text"]))));



CREATE POLICY "Pago_Select_Policy" ON "public"."Pago" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "idPaciente") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text"]))));



ALTER TABLE "public"."Paquete" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Paquete_Select_Policy" ON "public"."Paquete" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "idPaciente") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text", 'fisioterapeuta'::"text"]))));



CREATE POLICY "Paquete_Write_Policy" ON "public"."Paquete" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text"]))) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text"])));



CREATE POLICY "Permitir borrado a personal autorizado" ON "public"."Persona" FOR DELETE TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'secretaria'::"text"])));



CREATE POLICY "Permitir gestión total de antecedentes al staff autenticado" ON "public"."Antecedentes" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."Persona" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Persona_Insert_Policy" ON "public"."Persona" FOR INSERT TO "authenticated" WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text", 'paciente'::"text"])));



CREATE POLICY "Persona_Select_Policy" ON "public"."Persona" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "idPersona") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'fisioterapeuta'::"text", 'admin'::"text"]))));



CREATE POLICY "Persona_Update_Policy" ON "public"."Persona" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "idPersona") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text"]))));



ALTER TABLE "public"."Promocion" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Promocion_Admin_Policy" ON "public"."Promocion" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text"));



CREATE POLICY "Promocion_Select_Policy" ON "public"."Promocion" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."Saldo_Sesiones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Secretaria" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Seguridad Absoluta: Solo el Admin Real inserta secretarias" ON "public"."Secretaria" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."Persona"
  WHERE (("Persona"."idPersona" = "auth"."uid"()) AND ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text")))));



ALTER TABLE "public"."Sesion" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Sesion_Eval_All_Policy" ON "public"."Sesion_Evaluacion" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text"]))) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text"])));



CREATE POLICY "Sesion_Eval_Select_Policy" ON "public"."Sesion_Evaluacion" FOR SELECT TO "authenticated" USING ((((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text", 'secretaria'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."Sesion" "s"
  WHERE (("s"."idSesion" = "s"."idSesion") AND ("s"."idPaciente" = "auth"."uid"()))))));



ALTER TABLE "public"."Sesion_Evaluacion" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Sesion_Insert_Policy" ON "public"."Sesion" FOR INSERT TO "authenticated" WITH CHECK (((((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'paciente'::"text") AND ("auth"."uid"() = "idPaciente")) OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text"]))));



CREATE POLICY "Sesion_Select_Policy" ON "public"."Sesion" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "idPaciente") OR (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'fisioterapeuta'::"text") AND ("auth"."uid"() = "idFisioterapeuta")) OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['admin'::"text", 'secretaria'::"text"]))));



CREATE POLICY "Sesion_Update_Policy" ON "public"."Sesion" FOR UPDATE TO "authenticated" USING ((((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text"])) OR (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'fisioterapeuta'::"text") AND ("auth"."uid"() = "idFisioterapeuta"))));



CREATE POLICY "Solo Admin puede insertar o modificar secretarias" ON "public"."Secretaria" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text"));



CREATE POLICY "Staff y Admin pueden leer datos de secretarias" ON "public"."Secretaria" FOR SELECT TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['secretaria'::"text", 'admin'::"text", 'fisioterapeuta'::"text"])));



CREATE POLICY "Staff_Select_Catalogo" ON "public"."Catalogo_Servicio" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Terminos_Admin_Policy" ON "public"."Terminos_Condiciones" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = 'admin'::"text"));



ALTER TABLE "public"."Terminos_Condiciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Terminos_Select_Policy" ON "public"."Terminos_Condiciones" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."Tratamiento" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Tratamiento_All_Policy" ON "public"."Tratamiento" TO "authenticated" USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text"]))) WITH CHECK (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text"])));



CREATE POLICY "Tratamiento_Select_Policy" ON "public"."Tratamiento" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "idPaciente") OR ((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'rol'::"text") = ANY (ARRAY['fisioterapeuta'::"text", 'admin'::"text", 'secretaria'::"text"]))));



CREATE POLICY "public can read persons" ON "public"."Persona" FOR SELECT TO "authenticated" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."crear_sesiones_futuras"("p_id_tratamiento" bigint, "p_id_fisioterapeuta" "uuid", "p_id_paciente" "uuid", "p_total_sesiones" smallint, "p_fecha_primera" timestamp with time zone, "p_intervalo_dias" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."crear_sesiones_futuras"("p_id_tratamiento" bigint, "p_id_fisioterapeuta" "uuid", "p_id_paciente" "uuid", "p_total_sesiones" smallint, "p_fecha_primera" timestamp with time zone, "p_intervalo_dias" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_sesiones_futuras"("p_id_tratamiento" bigint, "p_id_fisioterapeuta" "uuid", "p_id_paciente" "uuid", "p_total_sesiones" smallint, "p_fecha_primera" timestamp with time zone, "p_intervalo_dias" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_gestion_sesiones_inteligente"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_gestion_sesiones_inteligente"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_gestion_sesiones_inteligente"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_gestionar_sesiones_atencion"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_gestionar_sesiones_atencion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_gestionar_sesiones_atencion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_rol"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_rol"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_rol"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."registrar_estado_financiero_paquete"() TO "anon";
GRANT ALL ON FUNCTION "public"."registrar_estado_financiero_paquete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."registrar_estado_financiero_paquete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validar_fecha_cita_futura"() TO "anon";
GRANT ALL ON FUNCTION "public"."validar_fecha_cita_futura"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validar_fecha_cita_futura"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validar_transicion_estado_sesion"() TO "anon";
GRANT ALL ON FUNCTION "public"."validar_transicion_estado_sesion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validar_transicion_estado_sesion"() TO "service_role";
























GRANT ALL ON TABLE "public"."Antecedentes" TO "anon";
GRANT ALL ON TABLE "public"."Antecedentes" TO "authenticated";
GRANT ALL ON TABLE "public"."Antecedentes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Antecedentes_idAntecedentes_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Antecedentes_idAntecedentes_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Antecedentes_idAntecedentes_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Catalogo_Servicio" TO "anon";
GRANT ALL ON TABLE "public"."Catalogo_Servicio" TO "authenticated";
GRANT ALL ON TABLE "public"."Catalogo_Servicio" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Catalogo_Servicio_idServicio_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Catalogo_Servicio_idServicio_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Catalogo_Servicio_idServicio_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Evaluacion" TO "anon";
GRANT ALL ON TABLE "public"."Evaluacion" TO "authenticated";
GRANT ALL ON TABLE "public"."Evaluacion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Evaluacion_idEvaluacion_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Evaluacion_idEvaluacion_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Evaluacion_idEvaluacion_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Evaluacion_inicial" TO "anon";
GRANT ALL ON TABLE "public"."Evaluacion_inicial" TO "authenticated";
GRANT ALL ON TABLE "public"."Evaluacion_inicial" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Evaluacion_inicial_idEvaluacionInicial_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Evaluacion_inicial_idEvaluacionInicial_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Evaluacion_inicial_idEvaluacionInicial_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Fisioterapeuta" TO "anon";
GRANT ALL ON TABLE "public"."Fisioterapeuta" TO "authenticated";
GRANT ALL ON TABLE "public"."Fisioterapeuta" TO "service_role";



GRANT ALL ON TABLE "public"."Historial_estado_sesion" TO "anon";
GRANT ALL ON TABLE "public"."Historial_estado_sesion" TO "authenticated";
GRANT ALL ON TABLE "public"."Historial_estado_sesion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Historial_estado_sesion_idHistorial_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Historial_estado_sesion_idHistorial_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Historial_estado_sesion_idHistorial_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Horario" TO "anon";
GRANT ALL ON TABLE "public"."Horario" TO "authenticated";
GRANT ALL ON TABLE "public"."Horario" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Horario_idHorario_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Horario_idHorario_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Horario_idHorario_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Paciente" TO "anon";
GRANT ALL ON TABLE "public"."Paciente" TO "authenticated";
GRANT ALL ON TABLE "public"."Paciente" TO "service_role";



GRANT ALL ON TABLE "public"."Pago" TO "anon";
GRANT ALL ON TABLE "public"."Pago" TO "authenticated";
GRANT ALL ON TABLE "public"."Pago" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Pago_idPago_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Pago_idPago_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Pago_idPago_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Paquete" TO "anon";
GRANT ALL ON TABLE "public"."Paquete" TO "authenticated";
GRANT ALL ON TABLE "public"."Paquete" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Paquete_idPaquete_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Paquete_idPaquete_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Paquete_idPaquete_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Persona" TO "anon";
GRANT ALL ON TABLE "public"."Persona" TO "authenticated";
GRANT ALL ON TABLE "public"."Persona" TO "service_role";



GRANT ALL ON TABLE "public"."Promocion" TO "anon";
GRANT ALL ON TABLE "public"."Promocion" TO "authenticated";
GRANT ALL ON TABLE "public"."Promocion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Promocion_idPromocion_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Promocion_idPromocion_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Promocion_idPromocion_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Saldo_Sesiones" TO "anon";
GRANT ALL ON TABLE "public"."Saldo_Sesiones" TO "authenticated";
GRANT ALL ON TABLE "public"."Saldo_Sesiones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Saldo_Sesiones_idSaldo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Saldo_Sesiones_idSaldo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Saldo_Sesiones_idSaldo_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Secretaria" TO "anon";
GRANT ALL ON TABLE "public"."Secretaria" TO "authenticated";
GRANT ALL ON TABLE "public"."Secretaria" TO "service_role";



GRANT ALL ON TABLE "public"."Sesion" TO "anon";
GRANT ALL ON TABLE "public"."Sesion" TO "authenticated";
GRANT ALL ON TABLE "public"."Sesion" TO "service_role";



GRANT ALL ON TABLE "public"."Sesion_Evaluacion" TO "anon";
GRANT ALL ON TABLE "public"."Sesion_Evaluacion" TO "authenticated";
GRANT ALL ON TABLE "public"."Sesion_Evaluacion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Sesion_Evaluacion_idSesionEvaluacion_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Sesion_Evaluacion_idSesionEvaluacion_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Sesion_Evaluacion_idSesionEvaluacion_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Sesion_idSesion_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Sesion_idSesion_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Sesion_idSesion_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Terminos_Condiciones" TO "anon";
GRANT ALL ON TABLE "public"."Terminos_Condiciones" TO "authenticated";
GRANT ALL ON TABLE "public"."Terminos_Condiciones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Terminos_Condiciones_idTerminosCondiciones_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Terminos_Condiciones_idTerminosCondiciones_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Terminos_Condiciones_idTerminosCondiciones_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Tratamiento" TO "anon";
GRANT ALL ON TABLE "public"."Tratamiento" TO "authenticated";
GRANT ALL ON TABLE "public"."Tratamiento" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Tratamiento_idTratamiento_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Tratamiento_idTratamiento_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Tratamiento_idTratamiento_seq" TO "service_role";



GRANT ALL ON TABLE "public"."v_saldo_paquete" TO "anon";
GRANT ALL ON TABLE "public"."v_saldo_paquete" TO "authenticated";
GRANT ALL ON TABLE "public"."v_saldo_paquete" TO "service_role";



GRANT ALL ON TABLE "public"."vw_citas_detalladas" TO "anon";
GRANT ALL ON TABLE "public"."vw_citas_detalladas" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_citas_detalladas" TO "service_role";



GRANT ALL ON TABLE "public"."vw_saldo_paciente" TO "anon";
GRANT ALL ON TABLE "public"."vw_saldo_paciente" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_saldo_paciente" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

alter table "public"."Catalogo_Servicio" drop constraint "Catalogo_Servicio_tipo_check";

alter table "public"."Catalogo_Servicio" add constraint "Catalogo_Servicio_tipo_check" CHECK (((tipo)::text = ANY ((ARRAY['sesion_suelta'::character varying, 'paquete'::character varying])::text[]))) not valid;

alter table "public"."Catalogo_Servicio" validate constraint "Catalogo_Servicio_tipo_check";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


