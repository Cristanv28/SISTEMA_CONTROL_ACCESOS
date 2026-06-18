// js/index.js

let modalEmergenciaInstance;

document.addEventListener("DOMContentLoaded", () => {
    // Inicializar el modal de Bootstrap de forma segura
    const modalEl = document.getElementById('modalEmergencia');
    if (modalEl) modalEmergenciaInstance = bootstrap.Modal.getOrCreateInstance(modalEl);

    // Inicializar los componentes y consultas del sistema con Supabase
    cargarContadoresGlobales();
    cargarModoAccesoActual();
    cargarMonitoreoTiempoReal();
    verificarEmergenciasActivas();

    // Evento visual opcional: Cambia el borde del select según el color del código seleccionado
    const selectCodigoEl = document.getElementById('selectCodigo');
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
        const { count: entradasHoy, error: errEnt } = await supabase
            .from('entradas_salidas')
            .select('*', { count: 'exact', head: true })
            .eq('fecha', hoyStr)
            .eq('tipo', 'Entrada');

        // B. Intentos denegados de hoy
        const { count: denegadosHoy, error: errDen } = await supabase
            .from('accesos_denegados')
            .select('*', { count: 'exact', head: true });

        // C. Estudiantes Activos
        const { count: estActivos, error: errEst } = await supabase
            .from('estudiantes')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'Activo');

        // D. Docentes Activos
        const { count: docActivos, error: errDoc } = await supabase
            .from('docentes')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'Activo');

        // Inyectar valores de forma segura en el DOM si los contenedores existen
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
        const { data, error } = await supabase
            .from('entradas_salidas')
            .select(`
                tipo,
                fecha,
                hora,
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
            const nombre = reg.personas ? `${reg.personas.nombre} ${reg.personas.apellido}` : 'Desconocido';
            const badgeTipo = reg.tipo === 'Entrada' 
                ? `<span class="badge bg-success-subtle text-success text-uppercase">Entrada</span>`
                : `<span class="badge bg-primary-subtle text-primary text-uppercase">Salida</span>`;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${nombre}</strong></td>
                    <td><span class="text-muted" style="font-size:0.85rem;">Identificador Biométrico/NFC</span></td>
                    <td>${badgeTipo}</td>
                    <td class="font-monospace" style="font-size:0.85rem;">${reg.fecha} ${reg.hora}</td>
                </tr>
            `;
        });

    } catch (err) {
        console.error("Error en monitoreo de tiempo real:", err.message);
    }
}

/**
 * 3. CONTROL DE RESTRICCIONES RECTAS (TABLA modo_acceso)
 */
async function cargarModoAccesoActual() {
    try {
        const { data, error } = await supabase
            .from('modo_acceso')
            .select('modo')
            .eq('id', 1)
            .single();

        if (error || !data) return;

        // Seleccionar el radio button según el valor actual en la Base de Datos
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
        const { error } = await supabase
            .from('modo_acceso')
            .update({ modo: seleccionado, actualizado_en: new Date() })
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
 * 4. GESTIÓN DEL MODULO DE EMERGENCIAS
 */
async function cargarCodigos() {
    try {
        // Mapeo directo y seguro a las columnas de tu esquema real
        const { data, error } = await supabase
            .from('codigos_emergencia')
            .select('id, codigo, descripcion, color, telefono')
            .eq('activo', true); // Filtro booleano correcto (true/false)

        if (error) throw error;

        const select = document.getElementById('selectCodigo');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Selecciona un código maestro --</option>';

        if (!data || data.length === 0) {
            select.innerHTML += '<option value="" disabled>No hay códigos de emergencia activos en la BD</option>';
            return;
        }

        data.forEach(item => {
            const infoTel = item.telefono ? ` (Tel: ${item.telefono})` : '';
            select.innerHTML += `
                <option value="${item.codigo}" data-color="${item.color}">
                    ⚠️ [${item.codigo}] - ${item.descripcion}${infoTel}
                </option>
            `;
        });
    } catch (err) {
        console.error("Error cargando códigos de emergencia:", err.message);
    }
}

async function verificarEmergenciasActivas() {
    try {
        const { data, error } = await supabase
            .from('emergencias_activas')
            .select('tipo, estado')
            .eq('estado', 'Activo')
            .maybeSingle();

        const banner = document.getElementById('bannerEmergencia');
        if (!banner) return;

        if (data) {
            banner.style.display = 'block';
            if (data.tipo === 'lockdown') {
                banner.className = "alert bg-danger text-center fw-bold mb-4";
                banner.innerHTML = "🚨 LOCKDOWN ACTIVADO: EL ACCESO AL ESTABLECIMIENTO ESTÁ COMPLETAMENTE BLOQUEADO 🔒";
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
    const codigo = document.getElementById('selectCodigo').value;
    const tipo = document.querySelector('input[name="tipoEmergencia"]:checked').value;

    if (!codigo) return alert("Debe seleccionar un código de autorización maestro para proceder.");

    try {
        // 1. Insertar el estado activo en la tabla de emergencias_activas
        const { error: errActiva } = await supabase
            .from('emergencias_activas')
            .insert([{ tipo: tipo, estado: 'Activo' }]);

        if (errActiva) throw errActiva;

        // 2. Colocar las compuertas físicas en bloqueo o apertura dependiendo del tipo
        const modoBloqueo = (tipo === 'lockdown') ? 'bloqueo_total' : 'normal';
        await supabase.from('modo_acceso').update({ modo: modoBloqueo }).eq('id', 1);

        if (modalEmergenciaInstance) modalEmergenciaInstance.hide();
        
        // Refrescar componentes de la pantalla
        verificarEmergenciasActivas();
        cargarModoAccesoActual();
        
        alert("¡Protocolo de emergencia propagado de forma exitosa!");

    } catch (err) {
        alert("Error al activar emergencia: " + err.message);
    }
}

async function desactivarEmergencia() {
    try {
        // 1. Limpiar registros activos de la tabla emergencias_activas
        const { error } = await supabase
            .from('emergencias_activas')
            .delete()
            .neq('estado', 'Normalizado'); // Remueve trazas activas para reestablecer

        if (error) throw error;

        // 2. Regresar la restricción de las puertas al modo normal
        await supabase.from('modo_acceso').update({ modo: 'normal' }).eq('id', 1);

        if (modalEmergenciaInstance) modalEmergenciaInstance.hide();
        
        // Sincronizar vista de nuevo
        verificarEmergenciasActivas();
        cargarModoAccesoActual();
        
        alert("Sistema normalizado. Parámetros de control reestablecidos.");
    } catch (err) {
        alert("Error al desactivar protocolo: " + err.message);
    }
}