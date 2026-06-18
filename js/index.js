// js/index.js

// Apuntamos al cliente global de Supabase configurado en tu script maestro
const dbClient = window.db || window.supabase;

let modalEmergenciaInstance;

document.addEventListener("DOMContentLoaded", () => {
    const modalEl = document.getElementById('modalEmergencia');
    if (modalEl) modalEmergenciaInstance = bootstrap.Modal.getOrCreateInstance(modalEl);

    // Inicializar lógica de la plataforma
    cargarContadoresGlobales();
    cargarModoAccesoActual();
    cargarMonitoreoTiempoReal();
    verificarEmergenciasActivas();
});

/**
 * 1. ESTADÍSTICAS GLOBALES (CON BLOQUES TRY/CATCH INDEPENDIENTES)
 */
async function cargarContadoresGlobales() {
    const hoyStr = new Date().toISOString().split('T')[0];

    // A. Entradas de hoy
    try {
        const { count: entradasHoy, error } = await dbClient
            .from('entradas_salidas')
            .select('*', { count: 'exact', head: true })
            .eq('fecha', hoyStr)
            .eq('tipo', 'Entrada');
        
        if (!error && document.getElementById('accesos_hoy')) {
            document.getElementById('accesos_hoy').innerText = entradasHoy || 0;
        }
    } catch (err) { console.error("Error en contador entradas:", err.message); }

    // B. Intentos denegados
    try {
        const { count: denegadosHoy, error } = await dbClient
            .from('accesos_denegados')
            .select('*', { count: 'exact', head: true });
        
        if (!error && document.getElementById('denegados_hoy')) {
            document.getElementById('denegados_hoy').innerText = denegadosHoy || 0;
        }
    } catch (err) { console.error("Error en contador denegados:", err.message); }

    // C. Estudiantes Totales / Activos
    // Nota: Eliminamos el filtro .eq('estado', 'Activo') para evitar el error 400 si la columna no existe
    try {
        const { count: estActivos, error } = await dbClient
            .from('estudiantes')
            .select('*', { count: 'exact', head: true });

        if (!error && document.getElementById('statEstudiantes')) {
            document.getElementById('statEstudiantes').innerText = estActivos || 0;
        }
    } catch (err) { console.error("Error en contador estudiantes:", err.message); }

    // D. Docentes Totales / Activos
    try {
        const { count: docActivos, error } = await dbClient
            .from('docentes')
            .select('*', { count: 'exact', head: true });

        if (!error && document.getElementById('statDocentes')) {
            document.getElementById('statDocentes').innerText = docActivos || 0;
        }
    } catch (err) { console.error("Error en contador docentes:", err.message); }
}

/**
 * 2. MONITOR DE ACTIVIDAD EN TIEMPO REAL
 */
async function cargarMonitoreoTiempoReal() {
    try {
        // Hacemos una consulta limpia a entradas_salidas
        const { data, error } = await dbClient
            .from('entradas_salidas')
            .select('*')
            .order('fecha_registro', { ascending: false })
            .limit(8);

        if (error) throw error;
        
        const tbody = document.getElementById('tablaActividad');
        if (!tbody) return;
        tbody.innerHTML = "";

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Sin actividad registrada.</td></tr>`;
            return;
        }

        data.forEach(reg => {
            // Ajuste dinámico por si manejas nombre directo o relacional
            const nombreUsuario = reg.nombre ? `${reg.nombre} ${reg.apellido || ''}` : `Usuario #${reg.id_usuario || 'Anon'}`;
            const badge = reg.tipo === 'Entrada' 
                ? `<span class="badge bg-success">Entrada</span>` 
                : `<span class="badge bg-primary">Salida</span>`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${nombreUsuario}</strong></td>
                    <td><span class="text-muted" style="font-size:0.85rem;">NFC / Biométrico</span></td>
                    <td>${badge}</td>
                    <td class="font-monospace" style="font-size:0.85rem;">${reg.fecha || ''} ${reg.hora || ''}</td>
                </tr>`;
        });
    } catch (err) { 
        console.error("Error en monitoreo de tiempo real:", err.message); 
    }
}

/**
 * 3. CONTROL DE RESTRICCIONES (TABLA modo_acceso)
 */
async function cargarModoAccesoActual() {
    try {
        const { data, error } = await dbClient.from('modo_acceso').select('modo').eq('id', 1).maybeSingle();
        if (error || !data) return;
        
        const radio = document.querySelector(`input[name="modoAcceso"][value="${data.modo}"]`);
        if (radio) radio.checked = true;
        actualizarBadgeModo(data.modo);
    } catch (err) { console.error("Error cargando modo de acceso:", err.message); }
}

async function activarRestriccion() {
    const elementoCheck = document.querySelector('input[name="modoAcceso"]:checked');
    if (!elementoCheck) return;
    const seleccionado = elementoCheck.value;
    
    try {
        const { error } = await dbClient.from('modo_acceso').update({ modo: seleccionado }).eq('id', 1);
        if (error) throw error;
        actualizarBadgeModo(seleccionado);
        alert("Restricción de acceso actualizada.");
    } catch (err) { alert("No se pudo aplicar la restricción: " + err.message); }
}

function actualizarBadgeModo(modo) {
    const badge = document.getElementById('modoActualBadge');
    if (badge) {
        badge.innerHTML = `<span class="badge ${modo === 'normal' ? 'bg-success' : 'bg-warning text-dark'} px-3 py-2">MODO ACTUAL: ${modo.toUpperCase()}</span>`;
    }
}

/**
 * 4. SISTEMA DE EMERGENCIAS
 */
async function cargarCodigos() {
    try {
        // Consultamos usando tu columna booleana 'activo'
        const { data, error } = await dbClient
            .from('codigos_emergencia')
            .select('codigo, descripcion, color, telefono')
            .eq('activo', true);

        if (error) throw error;
        const select = document.getElementById('selectCodigo');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Selecciona un código maestro --</option>';
        if (!data || data.length === 0) {
            select.innerHTML += '<option value="" disabled>No hay códigos activos en la Base de Datos</option>';
            return;
        }

        data.forEach(item => {
            select.innerHTML += `<option value="${item.codigo}">⚠️ [${item.codigo}] - ${item.descripcion}</option>`;
        });
    } catch (err) { 
        console.error("Error al traer códigos de emergencia:", err.message); 
    }
}

async function verificarEmergenciasActivas() {
    try {
        // Quitamos filtros estrictos de texto para evitar el 400 Bad Request
        const { data, error } = await dbClient
            .from('emergencias_activas')
            .select('*')
            .limit(1);

        if (error) throw error;
        
        const banner = document.getElementById('bannerEmergencia');
        if (!banner) return;

        if (data && data.length > 0) {
            const emergencia = data[0];
            banner.style.display = 'block';
            banner.className = emergencia.tipo === 'lockdown' ? "alert bg-danger text-center fw-bold mb-4" : "alert bg-warning text-dark text-center fw-bold mb-4";
            banner.innerHTML = emergencia.tipo === 'lockdown' ? "🚨 LOCKDOWN ACTIVADO: ACCESO TOTALMENTE BLOQUEADO 🔒" : "🚪 EVACUACIÓN ACTIVA: ACCESOS LIBERADOS 🏃‍♂️";
        } else {
            banner.style.display = 'none';
        }
    } catch (err) { 
        console.error("Error verificando banderas de emergencia:", err.message); 
    }
}

async function activarEmergencia() {
    const codigo = document.getElementById('selectCodigo').value;
    const tipoElemento = document.querySelector('input[name="tipoEmergencia"]:checked');
    if (!codigo) return alert("Selecciona un código de autorización válido.");
    const tipo = tipoElemento ? tipoElemento.value : 'lockdown';

    try {
        const { error: errActiva } = await dbClient.from('emergencias_activas').insert([{ tipo: tipo, estado: 'Activo' }]);
        if (errActiva) throw errActiva;

        await dbClient.from('modo_acceso').update({ modo: tipo === 'lockdown' ? 'bloqueo_total' : 'normal' }).eq('id', 1);
        
        if (modalEmergenciaInstance) modalEmergenciaInstance.hide();
        verificarEmergenciasActivas();
        cargarModoAccesoActual();
        alert("¡Protocolo de emergencia desplegado!");
    } catch (err) { alert("Error al activar protocolo: " + err.message); }
}

async function desactivarEmergencia() {
    try {
        // Limpieza de contingencias
        await dbClient.from('emergencias_activas').delete().neq('tipo', 'sistema_vacio_limpieza');
        await dbClient.from('modo_acceso').update({ modo: 'normal' }).eq('id', 1);
        
        if (modalEmergenciaInstance) modalEmergenciaInstance.hide();
        verificarEmergenciasActivas();
        cargarModoAccesoActual();
        alert("Sistema restablecido a modo normal.");
    } catch (err) { alert("Error al desactivar protocolo: " + err.message); }
}

const esp32Socket = new WebSocket("ws://192.168.101.200:81");

esp32Socket.onopen = () => {
    console.log("✅ Conexión WebSocket establecida con el ESP32 Principal");
};

esp32Socket.onmessage = (event) => {
    const mensaje = event.data;
    console.log("Mensaje desde el ESP32:", mensaje);

    // Si el ESP32 manda la señal de captura de registro
    if (mensaje.startsWith("SCAN_REGISTRO:")) {
        const uidCapturado = mensaje.split(":")[1];
        
        // Buscamos el input de tu interfaz donde se debe poner el código RFID
        const inputUID = document.getElementById("uid_codigo") || document.getElementById("inputTarjeta"); 
        
        if (inputUID) {
            inputUID.value = uidCapturado;
            // Opcional: Un pitido o notificación visual en la web
            alert("¡Tarjeta detectada en el lector! UID copiado: " + uidCapturado);
        }
    }
};

esp32Socket.onerror = (error) => {
    console.error("Error en el socket del ESP32:", error);
};