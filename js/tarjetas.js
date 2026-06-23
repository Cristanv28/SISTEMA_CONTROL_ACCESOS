// js/tarjetas.js
let modalRegistroInstance;
let rolSeleccionado = null;
let modoPersonaActual = 'existente'; // 'existente' | 'nueva'

// Mapa: que campo extra (ademas de "puesto") pide cada rol de empleado, y a que tabla va
const CONFIG_ROL_EMPLEADO = {
    'Docente':       { tabla: 'docentes',       campoExtra: 'departamento', label: 'Departamento' },
    'Administrativo': { tabla: 'administrativos', campoExtra: 'area',         label: 'Área' },
    'Director':       { tabla: 'directores',      campoExtra: 'departamento', label: 'Departamento' },
    'Coordinador':    { tabla: 'coordinadores',   campoExtra: 'programa',     label: 'Programa' },
    'Empleado':       { tabla: null,               campoExtra: null,           label: null } // solo tabla empleados, sin subtabla
};

document.addEventListener("DOMContentLoaded", () => {
    const modalEl = document.getElementById('modalRegistro');
    if (modalEl) modalRegistroInstance = new bootstrap.Modal(modalEl);

    cargarEstadisticas();
    cargarTablaTarjetas();
    cargarUsuariosSelect();
});

// 0. ABRIR EL MODAL DE REGISTRO
function abrirModalRegistro() {
    document.getElementById('pasoSeleccion').style.display = 'block';
    document.getElementById('pasoEsperando').style.display = 'none';
    document.getElementById('pasoExito').style.display = 'none';
    document.getElementById('bannerRegistro').style.display = 'none';

    // Reset de formulario de persona nueva
    document.getElementById('nuevoNombre').value = '';
    document.getElementById('nuevoApellido').value = '';
    document.getElementById('nuevoCorreo').value = '';
    document.getElementById('nuevoTelefono').value = '';
    document.getElementById('alumnoMatricula').value = '';
    document.getElementById('alumnoCarrera').value = ''; // Funciona igual con <select>
    document.getElementById('alumnoSemestre').value = '';
    document.getElementById('empleadoPuesto').value = '';
    document.getElementById('campoExtraRol').value = '';
    rolSeleccionado = null;
    document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('camposRolAlumno').style.display = 'none';
    document.getElementById('camposRolEmpleadoBase').style.display = 'none';

    cambiarModoPersona('existente');
    cargarUsuariosSelect();

    if (modalRegistroInstance) {
        modalRegistroInstance.show();
    } else {
        console.error("El modal de registro no se inicializo correctamente.");
    }
}

// Toggle entre "persona existente" y "persona nueva"
function cambiarModoPersona(modo) {
    modoPersonaActual = modo;
    const esExistente = modo === 'existente';

    document.getElementById('bloqueExistente').style.display = esExistente ? 'block' : 'none';
    document.getElementById('bloqueNueva').style.display = esExistente ? 'none' : 'block';

    document.getElementById('tabExistente').classList.toggle('active', esExistente);
    document.getElementById('tabNueva').classList.toggle('active', !esExistente);
}

// Click en una tarjeta de rol
function seleccionarRol(rol) {
    rolSeleccionado = rol;

    document.querySelectorAll('.role-card').forEach(c => {
        c.classList.toggle('selected', c.getAttribute('data-rol') === rol);
    });

    const esAlumno = rol === 'Alumno';
    document.getElementById('camposRolAlumno').style.display = esAlumno ? 'block' : 'none';
    document.getElementById('camposRolEmpleadoBase').style.display = esAlumno ? 'none' : 'block';

    if (!esAlumno) {
        const cfg = CONFIG_ROL_EMPLEADO[rol];
        const wrap = document.getElementById('campoExtraRolWrap');
        if (cfg && cfg.campoExtra) {
            wrap.style.display = 'block';
            document.getElementById('campoExtraRolLabel').innerText = cfg.label;
        } else {
            wrap.style.display = 'none'; // "Empleado" generico no necesita campo extra
        }
    }
}

// 1. ESTADÍSTICAS RECOLECTADAS DE TU TABLA PERSONAS
async function cargarEstadisticas() {
    try {
        const { data, error, count } = await supabase
            .from('personas')
            .select('*', { count: 'exact' });

        if (error) throw error;

        const total = count || 0;
        const activos = data.filter(p => p.activo === true).length;
        const inactivos = total - activos;

        document.getElementById('totalTarjetas').innerText = total;
        document.getElementById('tarjetasActivas').innerText = activos;
        document.getElementById('tarjetasInactivas').innerText = inactivos;
    } catch (err) {
        console.error("Error en estadísticas:", err.message);
    }
}

// 2. MUESTRA LAS PERSONAS REGISTRADAS CON SUS ROLES Y DETALLES DINÁMICOS
async function cargarTablaTarjetas() {
    try {
        // Hacemos una consulta relacional para jalar datos de roles, estudiantes o empleados en cascada
        const { data, error } = await supabase
            .from('personas')
            .select(`
                id, nombre, apellido, activo, created_at,
                roles ( nombre ),
                estudiantes ( matricula, carrera, semestre ),
                empleados ( 
                    id, puesto,
                    docentes ( departamento ),
                    administrativos ( area ),
                    directores ( departamento ),
                    coordinadores ( programa )
                )
            `)
            .order('nombre', { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById('tablaTarjetas');
        if (!tbody) return;
        tbody.innerHTML = "";

        data.forEach(p => {
            // Manejo de estados visuales
            let badgeEstado = p.activo
                ? `<span class="badge-tipo badge-ok">Activo</span>`
                : `<span class="badge-tipo badge-deny">Inactivo</span>`;

            // Detectar el nombre del Rol asignado
            const nombreRol = p.roles ? p.roles.nombre : 'Sin Rol';
            
            // Render de estilos según el tipo de rol
            let badgeRol = `<span class="badge-tipo badge-salida">${nombreRol}</span>`;
            if (nombreRol === 'Alumno') badgeRol = `<span class="badge-tipo badge-entrada">${nombreRol}</span>`;

            // Extraer detalles específicos según el rol (Soporta objetos o arreglos de Supabase)
            const est = Array.isArray(p.estudiantes) ? p.estudiantes[0] : p.estudiantes;
            const emp = Array.isArray(p.empleados) ? p.empleados[0] : p.empleados;

            let detallePrincipal = '—';
            let detalleSecundario = '—';

            if (nombreRol === 'Alumno' && est) {
                detallePrincipal = est.carrera || '—';
                detalleSecundario = `Matrícula: ${est.matricula || '—'}`;
            } else if (emp) {
                detallePrincipal = emp.puesto || '—';
                
                // Buscar subtablas de empleados
                if (nombreRol === 'Docente' && emp.docentes) {
                    const doc = Array.isArray(emp.docentes) ? emp.docentes[0] : emp.docentes;
                    detalleSecundario = doc ? `Depto: ${doc.departamento}` : '—';
                } else if (nombreRol === 'Administrativo' && emp.administrativos) {
                    const adm = Array.isArray(emp.administrativos) ? emp.administrativos[0] : emp.administrativos;
                    detalleSecundario = adm ? `Área: ${adm.area}` : '—';
                } else if (nombreRol === 'Director' && emp.directores) {
                    const dir = Array.isArray(emp.directores) ? emp.directores[0] : emp.directores;
                    detalleSecundario = dir ? `Depto: ${dir.departamento}` : '—';
                } else if (nombreRol === 'Coordinador' && emp.coordinadores) {
                    const coor = Array.isArray(emp.coordinadores) ? emp.coordinadores[0] : emp.coordinadores;
                    detalleSecundario = coor ? `Prog: ${coor.programa}` : '—';
                }
            }

            // Generación dinámica de botones de Acción
            let botonEstado = p.activo 
                ? `<button class="btn-danger-custom py-1 px-2 me-1" onclick="desactivarPersona(${p.id})">Desactivar</button>`
                : `<button class="btn-success-custom py-1 px-2 me-1" onclick="activarPersona(${p.id})">Activar</button>`;
            
            let botonEliminar = `<button class="btn-delete-custom py-1 px-2" onclick="eliminarPersona(${p.id})">Eliminar</button>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="mono-text">${p.id}</td>
                <td><strong>${p.nombre} ${p.apellido}</strong></td>
                <td>${badgeRol}</td>
                <td>${detallePrincipal}</td>
                <td class="mono-text">${detalleSecundario}</td>
                <td>${badgeEstado}</td>
                <td class="mono-text">${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                <td>
                    <div class="d-flex">
                        ${botonEstado}
                        ${botonEliminar}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Error al cargar tabla:", err.message);
    }
}

// 3. LLENAR EL SELECT DEL MODAL (modo "persona existente")
async function cargarUsuariosSelect() {
    try {
        const { data, error } = await supabase
            .from('personas')
            .select('id, nombre, apellido')
            .eq('activo', true);

        if (error) throw error;

        const select = document.getElementById('selectUsuarioRegistro');
        if (!select) return;
        select.innerHTML = '<option value="">— Selecciona una persona —</option>';

        data.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.text = `${p.nombre} ${p.apellido}`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("Error al cargar select:", err.message);
    }
}

// Busca el id del rol en la tabla "roles" por nombre
async function obtenerRolId(nombreRol) {
    const { data, error } = await supabase
        .from('roles')
        .select('id')
        .eq('nombre', nombreRol)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error(`No existe el rol "${nombreRol}" en la tabla roles. Agrégalo primero.`);
    return data.id;
}

// Crea la persona nueva + su subtabla de rol en cascada.
async function crearPersonaNuevaConRol() {
    const nombre = document.getElementById('nuevoNombre').value.trim();
    const apellido = document.getElementById('nuevoApellido').value.trim();

    if (!nombre || !apellido) throw new Error("Nombre y apellido son obligatorios.");
    if (!rolSeleccionado) throw new Error("Selecciona un tipo de persona (rol).");

    const rolId = await obtenerRolId(rolSeleccionado);

    // 1. Insert en personas
    const { data: personaInsertada, error: errPersona } = await supabase
        .from('personas')
        .insert([{ nombre, apellido, rol_id: rolId, activo: true }])
        .select('id')
        .single();

    if (errPersona) throw errPersona;
    const personaId = personaInsertada.id;

    if (rolSeleccionado === 'Alumno') {
        const matricula = document.getElementById('alumnoMatricula').value.trim();
        const carrera = document.getElementById('alumnoCarrera').value; // Recupera el valor del select de forma directa

        if (!matricula || !carrera) {
            throw new Error("Matrícula y carrera son obligatorios para Alumno.");
        }

        const { error: errEst } = await supabase
            .from('estudiantes')
            .insert([{ matricula, persona_id: personaId, carrera, estado: 'Activo' }]);

        if (errEst) throw errEst;

    } else {
        const puesto = document.getElementById('empleadoPuesto').value.trim();
        if (!puesto) throw new Error("El puesto es obligatorio.");

        const { data: empleadoInsertado, error: errEmp } = await supabase
            .from('empleados')
            .insert([{ persona_id: personaId, puesto, estado: 'Activo' }])
            .select('id')
            .single();

        if (errEmp) throw errEmp;
        const empleadoId = empleadoInsertado.id;

        const cfg = CONFIG_ROL_EMPLEADO[rolSeleccionado];
        if (cfg && cfg.tabla) {
            const valorExtra = document.getElementById('campoExtraRol').value.trim();
            if (!valorExtra) throw new Error(`El campo "${cfg.label}" es obligatorio.`);

            const filaExtra = { empleado_id: empleadoId, estado: 'Activo' };
            filaExtra[cfg.campoExtra] = valorExtra;

            const { error: errSub } = await supabase.from(cfg.tabla).insert([filaExtra]);
            if (errSub) throw errSub;
        }
    }

    return personaId;
}

// 4. MODO REGISTRO: obtiene persona_id y arranca el "modo escucha"
async function iniciarModoRegistro() {
    let personaId;

    try {
        if (modoPersonaActual === 'existente') {
            personaId = document.getElementById('selectUsuarioRegistro').value;
            if (!personaId) return alert("Por favor, selecciona una persona primero.");
        } else {
            personaId = await crearPersonaNuevaConRol();
        }
    } catch (err) {
        alert("Error al preparar el registro: " + err.message);
        return;
    }

    document.getElementById('pasoSeleccion').style.display = 'none';
    document.getElementById('pasoEsperando').style.display = 'block';
    document.getElementById('bannerRegistro').style.display = 'block';

    try {
        const { error } = await supabase
            .from('registro_tarjeta_pendiente')
            .insert([{ persona_id: parseInt(personaId), activo: true }]);

        if (error) throw error;

        setTimeout(async () => {
            await supabase
                .from('registro_tarjeta_pendiente')
                .update({ activo: false })
                .eq('persona_id', parseInt(personaId));

            document.getElementById('pasoEsperando').style.display = 'none';
            document.getElementById('pasoExito').style.display = 'block';
            document.getElementById('msgExitoRegistro').innerText = `Vinculado con éxito al ID Persona: ${personaId}`;

            cargarEstadisticas();
            cargarTablaTarjetas();
            setTimeout(() => {
                modalRegistroInstance.hide();
                cancelarModoRegistro();
            }, 2500);

        }, 4000);

    } catch (err) {
        console.error("Error iniciando modo registro:", err.message);
        cancelarModoRegistro();
    }
}

function cancelarModoRegistro() {
    document.getElementById('bannerRegistro').style.display = 'none';
}

// ACCIÓN: DESACTIVAR PERSONA
async function desactivarPersona(id) {
    if (confirm("¿Seguro que deseas desactivar a esta persona?")) {
        const { error } = await supabase
            .from('personas')
            .update({ activo: false })
            .eq('id', id);
        if (!error) { cargarEstadisticas(); cargarTablaTarjetas(); }
    }
}

// ACCIÓN: ACTIVAR PERSONA
async function activarPersona(id) {
    if (confirm("¿Deseas activar nuevamente a esta persona?")) {
        const { error } = await supabase
            .from('personas')
            .update({ activo: true }) 
            .eq('id', id);
        if (!error) { cargarEstadisticas(); cargarTablaTarjetas(); }
    }
}

// ACCIÓN: ELIMINAR PERSONA (Elimina de forma física de la DB)
async function eliminarPersona(id) {
    if (confirm(" ¡ADVERTENCIA!\n¿Seguro que deseas ELIMINAR por completo a esta persona? Esto borrará sus registros asociados.")) {
        const { error } = await supabase
            .from('personas')
            .delete()
            .eq('id', id);
            
        if (error) {
            alert("Error al eliminar: " + error.message);
        } else {
            cargarEstadisticas();
            cargarTablaTarjetas();
        }
    }
}

// Asegúrate de que esto esté al final de tu js/tarjetas.js
function filtrarTarjetas(valorFiltro) {
    if (!valorFiltro) {
        const select = document.querySelector('select[onchange*="filtrarTarjetas"]');
        valorFiltro = select ? select.value : '';
    }
    const filtro = valorFiltro.toLowerCase().trim();
    const filas = document.querySelectorAll('#tablaTarjetas tr');

    filas.forEach(tr => {
        if (!filtro || filtro === 'todos' || filtro === '') {
            tr.style.display = '';
            return;
        }
        const textoRol = tr.cells[2] ? tr.cells[2].innerText.toLowerCase() : '';
        const textoEstado = tr.cells[5] ? tr.cells[5].innerText.toLowerCase() : '';

        if (textoRol.includes(filtro) || textoEstado.includes(filtro)) {
            tr.style.display = '';
        } else {
            tr.style.display = 'none';
        }
    });
}
