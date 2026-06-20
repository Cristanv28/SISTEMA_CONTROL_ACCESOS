// ====================================================================
//                            js/index.js
// ====================================================================

const dbClient = window.supabase; // Cliente global de Supabase
let modalEmergenciaInstance;

document.addEventListener("DOMContentLoaded", () => {
    // Inicializar el modal de Bootstrap de forma segura
    const modalEl = document.getElementById('modalEmergencia');
    if (modalEl) {
        modalEmergenciaInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
        
        // EVENTO AUTOMÁTICO: Cuando se abra el modal, se cargan los códigos maestros
        modalEl.addEventListener('show.bs.modal', () => {
            cargarCodigos();
        });
    }

    // Vinculamos los eventos click a los botones usando los IDs del nuevo HTML limpio
    const btnActivar = document.getElementById("btnActivarEmergencia");
    const btnDesactivar = document.getElementById("btnDesactivarEmergencia");

    if (btnActivar) btnActivar.addEventListener("click", activarEmergencia);
    if (btnDesactivar) btnDesactivar.addEventListener("click", desactivarEmergencia);

    // Inicializar los componentes y consultas del sistema
    cargarContadoresGlobales();
    cargarModoAccesoActual();
    cargarMonitoreoTiempoReal();
    verificarEmergenciasActivas();

    // Evento visual: Cambia el borde del select según el color del código seleccionado
    const selectCodigoEl = document.getElementById('selectCodigoEmergencia');
    if (selectCodigoEl) {
        selectCodigoEl.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const color = selectedOption.getAttribute('data-color');
            if (color) {
                this.style.borderLeft = `5px solid ${color}`;
                this.style.fontWeight = 'bold';
            } else {
                this.style.borderLeft = '';
            }
        });
    }
});

/**
 * 1. RECOLECTA ESTADÍSTICAS EN TIEMPO REAL
 */
async function cargarContadoresGlobales() {
    try {
        const hoyStr = new Date().toISOString().split('T')[0];

        // A. Entradas de hoy
        const { count: entradasHoy, error: errEnt } = await dbClient
            .from('entradas_salidas')
            .select('*', { count: 'exact', head: true })
            .eq('fecha', hoyStr)
            .eq('tipo', 'Entrada');

        // B. Intentos denegados de hoy
        const { count: denegadosHoy, error: errDen } = await dbClient
            .from('accesos_denegados')
            .select('*', { count: 'exact', head: true });

        // C. Estudiantes Activos
        const { count: estActivos, error: errEst } = await dbClient
            .from('estudiantes')
            .select('*', { count: 'exact', head: true });

        // D. Docentes Activos
        const { count: docActivos, error: errDoc } = await dbClient
            .from('docentes')
            .select('*', { count: 'exact', head: true });

        // Inyectar valores de forma segura en el DOM
        if (!errEnt && document.getElementById('accesos_hoy')) document.getElementById('accesos_hoy').innerText = entradasHoy || 0;
        if (!errDen && document.getElementById('denegados_hoy')) document.getElementById('denegados_hoy').innerText = denegadosHoy || 0;
        if (!errEst && document.getElementById('statEstudiantes')) document.getElementById('statEstudiantes').innerText = estActivos || 0;
        if (!errDoc && document.getElementById('statDocentes')) document.getElementById('statDocentes').innerText = docActivos || 0;

    } catch (err) {
        console.error("Error al cargar contadores globales:", err.message);
    }
}

/**
 * 2. MONITOR DE ACTIVIDAD EN TIEMPO REAL (HISTORIAL RECIENTE)
 */
async function cargarMonitoreoTiempoReal() {
    try {
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
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Sin actividad registrada el día de hoy.</td></tr>`;
            return;
        }

        data.forEach(reg => {
            const nombre = reg.nombre ? `${reg.nombre} ${reg.apellido || ''}` : `Usuario #${reg.id_usuario || 'Anon'}`;
            const badgeTipo = reg.tipo === 'Entrada' 
                ? `<span class="badge bg-success-subtle text-success text-uppercase">Entrada</span>`
                : `<span class="badge bg-primary-subtle text-primary text-uppercase">Salida</span>`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${nombre}</strong></td>
                    <td><span class="text-muted" style="font-size:0.85rem;">Identificador Biométrico/NFC</span></td>
                    <td>${badgeTipo}</td>
                    <td class="font-monospace" style="font-size:0.85rem;">${reg.fecha || ''} ${reg.hora || ''}</td>
                </tr>
            `;
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
        const { data, error } = await dbClient
            .from('modo_acceso')
            .select('modo')
            .eq('id', 1)
            .maybeSingle();

        if (error || !data) return;

        const radio = document.querySelector(`input[name="modoAcceso"][value="${data.modo}"]`);
        if (radio) radio.checked = true;

        actualizarBadgeModo(data.modo);
    } catch (err) { 
        console.error("Error al obtener el modo de acceso:", err.message); 
    }
}

async function activarRestriccion() {
    const seleccionado = document.querySelector('input[name="modoAcceso"]:checked').value;
    try {
        const { error } = await dbClient
            .from('modo_acceso')
            .update({ modo: seleccionado })
            .eq('id', 1);

        if (error) throw error;
        actualizarBadgeModo(seleccionado);
        alert(`Modo de restricción actualizado con éxito a: ${seleccionado.toUpperCase()}`);
    } catch (err) {
        alert("Error al aplicar la restricción: " + err.message);
    }
}

function actualizarBadgeModo(modo) {
    const badge = document.getElementById('modoActualBadge');
    if (!badge) return;
    if (modo === 'normal') {
        badge.innerHTML = `<span class="badge bg-success px-3 py-1.5">MODO ACTUAL: NORMAL</span>`;
    } else {
        badge.innerHTML = `<span class="badge bg-warning text-dark px-3 py-1.5">MODO ACTUAL: ${modo.toUpperCase()}</span>`;
    }
}

/**
 * 4. GESTIÓN DEL MÓDULO DE EMERGENCIAS 
 */
async function cargarCodigos() {
    try {
        console.log("Cargando códigos de emergencia maestros...");
        const select = document.getElementById('selectCodigoEmergencia') || document.getElementById('selectCodigo');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Selecciona un código maestro --</option>';

        // CONSULTA CORREGIDA: descripcion y codigo en lugar de nombre
        const { data, error } = await dbClient
            .from('codigos_emergencia')
            .select('id, codigo, descripcion, color')
            .eq('activo', true);

        if (error) throw error;
        
        if (!data || data.length === 0) {
            select.innerHTML += '<option value="" disabled>No hay códigos activos en la Base de Datos</option>';
            return;
        }

        data.forEach(item => {
            select.innerHTML += `
                <option value="${item.id}" data-color="${item.color ? item.color.toLowerCase() : ''}">
                    ⚠️ [${item.codigo}] - ${item.descripcion}
                </option>
            `;
        });
        console.log("¡Códigos inyectados con éxito en el select!");
    } catch (err) { 
        console.error("Error al traer códigos de emergencia:", err.message); 
    }
}

async function verificarEmergenciasActivas() {
    try {
        // CONSULTA CORREGIDA: Filtramos por la columna 'activo' (true) en lugar de 'estado'
        const { data, error } = await dbClient
            .from('emergencias_activas')
            .select('*')
            .eq('activo', true)
            .limit(1);

        if (error) throw error;

        const banner = document.getElementById('bannerEmergencia');
        if (!banner) return;

        if (data && data.length > 0) {
            const emergencia = data[0];
            banner.style.display = 'block';
            if (emergencia.tipo === 'lockdown') {
                banner.className = "alert bg-danger text-center fw-bold mb-4";
                banner.innerHTML = "🚨 LOCKDOWN ACTIVADO: EL ACCESO ESTÁ COMPLETAMENTE BLOQUEADO 🔒";
            } else {
                banner.className = "alert bg-warning text-dark text-center fw-bold mb-4";
                banner.innerHTML = "🚪 EVACUACIÓN ACTIVA: PUERTAS ABIERTAS Y ACCESOS DE SALIDA LIBERADOS 🏃‍♂️";
            }
        } else {
            banner.style.display = 'none';
        }
    } catch (err) { 
        console.error("Error al comprobar banderas de emergencia:", err.message); 
    }
}
async function activarEmergencia() {
    const codigoId = document.getElementById('selectCodigoEmergencia').value;
    const tipoElemento = document.querySelector('input[name="tipoAccion"]:checked');

    const tipo = tipoElemento ? tipoElemento.value.toLowerCase() : 'lockdown';
    const codigoIdFinal = codigoId !== "" ? codigoId : null;

    try {
        // CORRECCIÓN SÚPER CRÍTICA: Mandamos 'activo: true' y 'codigo_id'
        const { error: errActiva } = await dbClient
            .from('emergencias_activas')
            .insert([{ 
                tipo: tipo, 
                codigo_id: codigoIdFinal, 
                activo: true 
            }]);

        if (errActiva) throw errActiva;

        // Cambiar el modo de acceso en las compuertas
        const modoBloqueo = (tipo === 'lockdown') ? 'bloqueo_total' : 'normal';
        await dbClient.from('modo_acceso').update({ modo: modoBloqueo }).eq('id', 1);

        if (modalEmergenciaInstance) modalEmergenciaInstance.hide();
        
        // Refrescar componentes de la pantalla
        verificarEmergenciasActivas();
        cargarModoAccesoActual();
        
        alert(`🚨 ¡Protocolo de ${tipo.toUpperCase()} propagado de forma exitosa!`);

    } catch (err) {
        alert("Error al activar emergencia: " + err.message);
    }
    // Si el socket está abierto, le avisa de golpe al ESP32 qué tipo de emergencia es
    if (esp32Socket && esp32Socket.readyState === WebSocket.OPEN) {
    esp32Socket.send(`EMERGENCIA:${tipo}`);
    }
}

async function desactivarEmergencia() {
    try {
        // Pasamos el registro activo a false e inyectamos fecha de cierre
        const { error } = await dbClient
            .from('emergencias_activas')
            .update({ 
                activo: false,
                desactivado_en: new Date().toISOString()
            })
            .eq('activo', true);

        if (error) throw error;

        // Regresar la restricción de las puertas al modo normal
        await dbClient.from('modo_acceso').update({ modo: 'normal' }).eq('id', 1);

        if (modalEmergenciaInstance) modalEmergenciaInstance.hide();
        
        // Sincronizar vista de nuevo
        verificarEmergenciasActivas();
        cargarModoAccesoActual();
        
        alert("Sistema normalizado. Parámetros de control reestablecidos.");
    } catch (err) {
        alert("Error al desactivar protocolo: " + err.message);
    }
}

/**
 * 5. CONEXIÓN WEBSOCKET CON ESP32
 */
const esp32Socket = new WebSocket("ws://192.168.101.200:81");

esp32Socket.onopen = () => {
    console.log("✅ Conexión WebSocket establecida con el ESP32 Principal");
};

esp32Socket.onmessage = (event) => {
    const mensaje = event.data;
    console.log("Mensaje desde el ESP32:", mensaje);

    if (mensaje.startsWith("SCAN_REGISTRO:")) {
        const uidCapturado = mensaje.split(":")[1];
        const inputUID = document.getElementById("uid_codigo") || document.getElementById("inputTarjeta"); 
        
        if (inputUID) {
            inputUID.value = uidCapturado;
            alert("¡Tarjeta detectada en el lector! UID copiado: " + uidCapturado);
        }
    }
};

esp32Socket.onerror = (error) => {
    console.error("Error en el socket del ESP32:", error);
};
