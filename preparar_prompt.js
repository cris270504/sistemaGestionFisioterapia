import fs from 'fs';
import path from 'path';

// ==========================================
// 1. CONFIGURA TUS ARCHIVOS AQUÍ
// ==========================================
const modulosParaAuditar = {
    database_schema: [
        './supabase/migrations/20260615211954_remote_schema.sql' // 👈 Asegúrate de poner el nombre real aquí
    ],
    database_logic: [],
    frontend_composables: [
        './src/composables/useCitas.js',
    ],
    frontend_components: [
        './src/components/ModalNuevaCita.vue',
        './src/components/ModalReprogramarCita.vue'
    ]
};

// ==========================================
// 2. LÓGICA DEL SCRIPT 
// ==========================================
const cwd = process.cwd();
const outputFilePath = path.join(cwd, 'prompt_para_claude.txt');

let promptFinal = `<contexto>
Soy desarrollador de un sistema de gestión para una clínica de fisioterapia usando Vue.js y Supabase (PostgreSQL). Quiero que actúes como un Tech Lead Senior y hagas una auditoría estricta buscando malas prácticas, vulnerabilidades, redundancias lógicas y posibles cuellos de botella. Limítate a analizar este módulo específico.
</contexto>\n\n`;

const limpiarVue = (contenido) => {
    let limpio = contenido.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    return limpio.replace(/\n\s*\n/g, '\n\n');
};

for (const [etiqueta, rutas] of Object.entries(modulosParaAuditar)) {
    if (rutas.length === 0) continue;

    promptFinal += `<${etiqueta}>\n`;
    
    rutas.forEach(ruta => {
        try {
            const absolutePath = path.resolve(cwd, ruta);
            let contenido = fs.readFileSync(absolutePath, 'utf8');

            if (ruta.endsWith('.vue')) {
                contenido = limpiarVue(contenido);
            }

            promptFinal += `--- ${path.basename(ruta)} ---\n`;
            promptFinal += `${contenido.trim()}\n\n`;
        } catch (error) {
            console.error(`⚠️ No se pudo leer el archivo: ${ruta}`);
            console.error(`Error: ${error.message}\n`);
        }
    });

    promptFinal += `</${etiqueta}>\n\n`;
}

fs.writeFileSync(outputFilePath, promptFinal, 'utf8');
console.log(`✅ ¡Éxito! Tu prompt optimizado se ha guardado en: prompt_para_claude.txt`);
console.log(`Pesa aproximadamente ${(fs.statSync(outputFilePath).size / 1024).toFixed(2)} KB.`);