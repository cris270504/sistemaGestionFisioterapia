import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { email, password, nombres, apellidos, rol, tipo_documento, numero_documento, celular, fecha_nacimiento } = await req.json()

    if (!email || !password) {
      throw new Error("El correo y la contraseña son obligatorios.")
    }

// 🛡️ PRE-VALIDACIÓN (DNI)
    if (numero_documento) {
      const { data: personaDni } = await supabaseAdmin
        .from('Persona')
        .select('numero_documento')
        .eq('numero_documento', numero_documento)
        .maybeSingle()
        
      if (personaDni) {
        // ✅ AHORA DEVOLVEMOS 200 PARA QUE VUE PUEDA LEER EL MENSAJE
        return new Response(
          JSON.stringify({ error: `El documento ${numero_documento} ya pertenece a otro paciente registrado.` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }
    }

    const safePassword = String(password);

    const { data: userAuth, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: safePassword,
      email_confirm: true,
      user_metadata: {
        nombres,
        apellidos,
        rol: rol || 'paciente',
        tipo_documento,
        numero_documento,
        celular,
        fecha_nacimiento
      }
    })

    if (authError) {
      // Si el error es por correo duplicado en Auth, lo traducimos
      if (authError.message.includes('already registered')) {
        throw new Error(`El correo ${email} ya está en uso por otra cuenta.`)
      }
      throw authError
    }

    return new Response(
      JSON.stringify({ user_id: userAuth.user.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    const mensajeReal = error instanceof Error ? error.message : String(error);
    
    // Si el error es por correo duplicado en Auth, lo traducimos al vuelo
    const textoFinal = mensajeReal.includes('already registered') 
      ? 'El correo proporcionado ya está en uso por otra cuenta.'
      : mensajeReal;

    // ✅ TAMBIÉN DEVOLVEMOS 200 AQUÍ PARA LOS ERRORES DE AUTH
    return new Response(
      JSON.stringify({ error: textoFinal }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})