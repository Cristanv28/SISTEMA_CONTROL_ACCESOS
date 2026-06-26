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

    // Vinculamos los eventos click a los botones
    const btnActivar = document.getElementById("btnActivarEmergencia");
    const btnDesactivar = document.getElementById("btnDesactivarEmergencia");

    if (btnActivar) btnActivar.addEventListener("click", activarEmergencia);
    if (btnDesactivar) btnDesactivar.addEventListener("click", desactivarEmergencia);

    // Inicializar los componentes y consultas del sistema
    cargarContadoresGlobales();
    cargarModoAccesoActual();
    cargarMonitoreoTiempoReal();
    verificarEmergenciasActivas();

    // Consultas de respaldo cada 3 segundos
    setInterval(() => {
        cargarContadoresGlobales();
        cargarMonitoreoTiempoReal();
    }, 3000);

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

        // B. Salidas de hoy
        const { count: salidasHoy, error: errSal } = await dbClient
            .from('entradas_salidas')
            .select('*', { count: 'exact', head: true })
            .eq('fecha', hoyStr)
            .eq('tipo', 'Salida');

        // C. Intentos denegados de hoy
        const { count: denegadosHoy, error: errDen } = await dbClient
            .from('accesos_denegados')
            .select('*', { count: 'exact', head: true });

        // D. Estudiantes Activos
        const { count: estActivos, error: errEst } = await dbClient
            .from('estudiantes')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'Activo'); // O la bandera que uses para activos

        // E. Docentes Activos
        const { count: docActivos, error: errDoc } = await dbClient
            .from('docentes')
            .select('*', { count: 'exact', head: true });

        // F. Administrativos Activos
        const { count: adminActivos, error: errAdmin } = await dbClient
            .from('administrativos')
            .select('*', { count: 'exact', head: true });

        // G. Empleados Activos
         const { count: empleadosActivos, error: errEmp } = await dbClient
            .from('empleados')
            .select('*', { count: 'exact', head: true });

        // Inyectar valores en el DOM de forma segura
        if (!errEnt && document.getElementById('accesos_hoy')) document.getElementById('accesos_hoy').innerText = entradasHoy || 0;
        if (!errSal && document.getElementById('salidas_hoy')) document.getElementById('salidas_hoy').innerText = salidasHoy || 0;
        if (!errDen && document.getElementById('denegados_hoy')) document.getElementById('denegados_hoy').innerText = denegadosHoy || 0;
        if (!errEst && document.getElementById('statEstudiantes')) document.getElementById('statEstudiantes').innerText = estActivos || 0;
        if (!errDoc && document.getElementById('statDocentes')) document.getElementById('statDocentes').innerText = docActivos || 0;
        if (!errAdmin && document.getElementById('statAdministrativos')) document.getElementById('statAdministrativos').innerText = adminActivos || 0;
        if (!errEmp && document.getElementById('statEmpleados')) document.getElementById('statEmpleados').innerText = empleadosActivos || 0;

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
            .select(`
                *,
                personas (
                    nombre,
                    apellido
                )
            `)
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
            const nombre = reg.personas ? `${reg.personas.nombre} ${reg.personas.apellido}` : `Usuario #${reg.persona_id}`;
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
                     [${item.codigo}] - ${item.descripcion}
                </option>
            `;
        });
        console.log("¡Códigos inyectados con éxito!");
    } catch (err) { 
        console.error("Error al traer códigos de emergencia:", err.message); 
    }
}

async function verificarEmergenciasActivas() {
    try {
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
                banner.innerHTML = "  EL ACCESO ESTÁ COMPLETAMENTE BLOQUEADO  ";
            } else {
                banner.className = "alert bg-warning text-dark text-center fw-bold mb-4";
                banner.innerHTML = "  PUERTAS ABIERTAS Y ACCESOS DE SALIDA LIBERADAS  ";
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
        // 1. Guardar en Supabase. El ESP32 Principal lo leerá al hacer su pooling constante.
        const { error: errActiva } = await dbClient
            .from('emergencias_activas')
            .insert([{ 
                tipo: tipo, 
                codigo_id: codigoIdFinal, 
                activo: true 
            }]);

        if (errActiva) throw errActiva;

        // 2. Cambiar modo de acceso
        const modoBloqueo = (tipo === 'lockdown') ? 'bloqueo_total' : 'normal';
        await dbClient.from('modo_acceso').update({ modo: modoBloqueo }).eq('id', 1);

        if (modalEmergenciaInstance) modalEmergenciaInstance.hide();
        
        verificarEmergenciasActivas();
        cargarModoAccesoActual();
        
        alert(`¡Protocolo de ${tipo.toUpperCase()} guardado en Base de Datos con éxito!`);

    } catch (err) {
        alert("Error al activar emergencia: " + err.message);
    }
}

async function desactivarEmergencia() {
    try {
        // 1. Desactivar en Supabase
        const { error } = await dbClient
            .from('emergencias_activas')
            .update({ 
                activo: false,
                desactivado_en: new Date().toISOString()
            })
            .eq('activo', true);

        if (error) throw error;

        // 2. Regresar compuertas a la normalidad
        await dbClient.from('modo_acceso').update({ modo: 'normal' }).eq('id', 1);

        if (modalEmergenciaInstance) modalEmergenciaInstance.hide();
        
        verificarEmergenciasActivas();
        cargarModoAccesoActual();
        
        alert("Sistema normalizado en base de datos. Parámetros reestablecidos.");
    } catch (err) {
        alert("Error al desactivar protocolo: " + err.message);
    }
}


// =============================================================
// REALTIME SUPABASE (Gestión centralizada de eventos en tiempo real)
// =============================================================

// Canal 1: Historial y Contadores
dbClient
.channel('realtime-entradas-salidas')
.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'entradas_salidas' },
    () => {
        cargarContadoresGlobales();
        cargarMonitoreoTiempoReal();
    }
)
.subscribe();

// Canal 2: Cambios de Modo o Emergencias (Reemplaza los avisos WebSocket)
dbClient
.channel('realtime-alertas')
.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'emergencias_activas' },
    () => {
        verificarEmergenciasActivas();
    }
)
.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'modo_acceso' },
    () => {
        cargarModoAccesoActual();
    }
)
.subscribe();

// Canal 3: Escaneo para Modo Registro (Rellena el Input automáticamente si se escanea tarjeta)
dbClient
.channel('realtime-registro-pendiente')
.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'tarjeta_registro' },
    (payload) => {
        // Cuando el ESP32 de entrada inserta con éxito la nueva tarjeta vinculada:
        const uidCapturado = payload.new.uid_tarjeta;
        const inputUID = document.getElementById("uid_codigo") || document.getElementById("inputTarjeta"); 
        
        if (inputUID) {
            inputUID.value = uidCapturado;
            alert("¡Tarjeta vinculada con éxito desde el Lector de Entrada! UID: " + uidCapturado);
        }
    }
)
.subscribe();
