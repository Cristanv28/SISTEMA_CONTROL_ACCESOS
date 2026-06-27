// js/facial.js

let modalFaceInstance;
let modoFaceActual = 'existente';
let rolFaceSeleccionado = null;

const CONFIG_ROL_FACE = {
    'Docente':        { tabla: 'docentes',       campoExtra: 'departamento', label: 'Departamento' },
    'Administrativo': { tabla: 'administrativos', campoExtra: 'area',         label: 'Área' },
    'Director':       { tabla: 'directores',      campoExtra: 'departamento', label: 'Departamento' },
    'Coordinador':    { tabla: 'coordinadores',   campoExtra: 'programa',     label: 'Programa' },
    'Empleado':       { tabla: null,               campoExtra: null,           label: null }
};

document.addEventListener("DOMContentLoaded", () => {
    const modalEl = document.getElementById('modalFaceID');
    if (modalEl) modalFaceInstance = new bootstrap.Modal(modalEl);

    cargarEstadisticasFace();
    cargarTablaFaceID();
    cargarUsuariosFaceSelect();
});

// ─── MODAL ────────────────────────────────────────────
function abrirModalFaceID() {
    // Reset pasos
    document.getElementById('pasoSeleccionFace').style.display  = 'block';
    document.getElementById('pasoCapturandoFace').style.display = 'none';
    document.getElementById('pasoExitoFace').style.display      = 'none';

    // Reset campos
    document.getElementById('faceNombre').value   = '';
    document.getElementById('faceApellido').value = '';
    document.getElementById('faceCorreo').value   = '';
    document.getElementById('faceTelefono').value = '';
    document.getElementById('faceMatricula').value = '';
    document.getElementById('faceCarrera').value  = '';
    document.getElementById('faceSemestre').value = '';
    document.getElementById('facePuesto').value   = '';
    document.getElementById('faceExtraValor').value = '';

    rolFaceSeleccionado = null;
    document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('faceCamposAlumno').style.display  = 'none';
    document.getElementById('faceCamposEmpleado').style.display = 'none';

    cambiarModoFace('existente');
    cargarUsuariosFaceSelect();

    if (modalFaceInstance) modalFaceInstance.show();
}

function cambiarModoFace(modo) {
    modoFaceActual = modo;
    const esExistente = modo === 'existente';
    document.getElementById('bloqueFaceExistente').style.display = esExistente ? 'block' : 'none';
    document.getElementById('bloqueFaceNueva').style.display     = esExistente ? 'none'  : 'block';
    document.getElementById('tabFaceExistente').classList.toggle('active',  esExistente);
    document.getElementById('tabFaceNueva').classList.toggle('active', !esExistente);
}

function seleccionarRolFace(rol) {
    rolFaceSeleccionado = rol;
    document.querySelectorAll('.role-card').forEach(c => {
        c.classList.toggle('selected', c.getAttribute('data-rol') === rol);
    });

    const esAlumno = rol === 'Alumno';
    document.getElementById('faceCamposAlumno').style.display   = esAlumno ? 'block' : 'none';
    document.getElementById('faceCamposEmpleado').style.display = esAlumno ? 'none'  : 'block';

    if (!esAlumno) {
        const cfg = CONFIG_ROL_FACE[rol];
        const wrap = document.getElementById('faceExtraWrap');
        if (cfg && cfg.campoExtra) {
            wrap.style.display = 'block';
            document.getElementById('faceExtraLabel').innerText = cfg.label;
        } else {
            wrap.style.display = 'none';
        }
    }
}

// ─── SELECT USUARIOS ──────────────────────────────────
async function cargarUsuariosFaceSelect() {
    try {
        const { data, error } = await supabase
            .from('personas')
            .select('id, nombre, apellido')
            .eq('activo', true);

        if (error) throw error;

        const select = document.getElementById('selectUsuarioFaceID');
        select.innerHTML = '<option value="">— Selecciona una persona —</option>';
        data.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.text  = `${p.nombre} ${p.apellido}`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("Error cargando select facial:", err.message);
    }
}

// ─── CREAR PERSONA NUEVA ──────────────────────────────
async function obtenerRolId(nombreRol) {
    const { data, error } = await supabase
        .from('roles').select('id').eq('nombre', nombreRol).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`No existe el rol "${nombreRol}"`);
    return data.id;
}

async function crearPersonaNuevaFace() {
    const nombre   = document.getElementById('faceNombre').value.trim();
    const apellido = document.getElementById('faceApellido').value.trim();

    if (!nombre || !apellido) throw new Error("Nombre y apellido son obligatorios.");
    if (!rolFaceSeleccionado)  throw new Error("Selecciona un tipo de persona.");

    const rolId = await obtenerRolId(rolFaceSeleccionado);

    const { data: persona, error: errP } = await supabase
        .from('personas')
        .insert([{ nombre, apellido, rol_id: rolId, activo: true }])
        .select('id').single();

    if (errP) throw errP;
    const personaId = persona.id;

    if (rolFaceSeleccionado === 'Alumno') {
        const matricula = document.getElementById('faceMatricula').value.trim();
        const carrera   = document.getElementById('faceCarrera').value;
        if (!matricula || !carrera) throw new Error("Matrícula y carrera son obligatorios.");

        const { error: errE } = await supabase
            .from('estudiantes')
            .insert([{ matricula, persona_id: personaId, carrera, estado: 'Activo' }]);
        if (errE) throw errE;

    } else {
        const puesto = document.getElementById('facePuesto').value.trim();
        if (!puesto) throw new Error("El puesto es obligatorio.");

        const { data: emp, error: errEmp } = await supabase
            .from('empleados')
            .insert([{ persona_id: personaId, puesto, estado: 'Activo' }])
            .select('id').single();
        if (errEmp) throw errEmp;

        const cfg = CONFIG_ROL_FACE[rolFaceSeleccionado];
        if (cfg && cfg.tabla) {
            const valorExtra = document.getElementById('faceExtraValor').value.trim();
            if (!valorExtra) throw new Error(`El campo "${cfg.label}" es obligatorio.`);
            const fila = { empleado_id: emp.id, estado: 'Activo' };
            fila[cfg.campoExtra] = valorExtra;
            const { error: errSub } = await supabase.from(cfg.tabla).insert([fila]);
            if (errSub) throw errSub;
        }
    }

    return personaId;
}

// ─── INICIAR REGISTRO FACIAL ──────────────────────────
async function iniciarRegistroFace() {
    let personaId;

    try {
        if (modoFaceActual === 'existente') {
            personaId = document.getElementById('selectUsuarioFaceID').value;
            if (!personaId) return alert("Selecciona una persona primero.");
        } else {
            personaId = await crearPersonaNuevaFace();
        }
    } catch (err) {
        alert("Error: " + err.message);
        return;
    }

    // Mostrar paso de captura
    document.getElementById('pasoSeleccionFace').style.display  = 'none';
    document.getElementById('pasoCapturandoFace').style.display = 'block';
    document.getElementById('estadoCaptura').innerText = 'Enviando señal al sistema...';

    // Insertar en registro_tarjeta_pendiente reutilizando la misma tabla
    // con un campo tipo='face' para que Python lo distinga
    try {
        const { error } = await supabase
            .from('registro_tarjeta_pendiente')
            .insert([{ persona_id: parseInt(personaId), activo: true, tipo: 'face' }]);

        if (error) throw error;

        document.getElementById('estadoCaptura').innerText = '✅ Señal enviada — Colócate frente a la cámara';

        // Esperar confirmación: polling cada 2s por hasta 30s
        let intentos = 0;
        const intervalo = setInterval(async () => {
            intentos++;

            const { data } = await supabase
                .from('face_embeddings')
                .select('id')
                .eq('persona_id', parseInt(personaId))
                .order('fecha_registro', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                clearInterval(intervalo);
                mostrarExitoFace(personaId);
            }

            if (intentos >= 15) {
                clearInterval(intervalo);
                document.getElementById('estadoCaptura').innerText = '⚠️ Tiempo agotado. Intenta de nuevo.';
            }
        }, 2000);

    } catch (err) {
        console.error("Error iniciando registro facial:", err.message);
        document.getElementById('estadoCaptura').innerText = '❌ Error: ' + err.message;
    }
}

function mostrarExitoFace(personaId) {
    document.getElementById('pasoCapturandoFace').style.display = 'none';
    document.getElementById('pasoExitoFace').style.display      = 'block';
    document.getElementById('msgExitoFace').innerText = `Rostro registrado para persona ID: ${personaId}`;

    cargarEstadisticasFace();
    cargarTablaFaceID();

    setTimeout(() => {
        modalFaceInstance.hide();
    }, 2500);
}

// ─── ESTADÍSTICAS ─────────────────────────────────────
async function cargarEstadisticasFace() {
    try {
        const { data: total } = await supabase
            .from('face_embeddings')
            .select('id', { count: 'exact' });

        const { data: exitosos } = await supabase
            .from('accesos_faceid')
            .select('id', { count: 'exact' })
            .eq('resultado', true);

        const { data: denegados } = await supabase
            .from('accesos_faceid')
            .select('id', { count: 'exact' })
            .eq('resultado', false);

        document.getElementById('totalFace').innerText    = total?.length    ?? 0;
        document.getElementById('faceExitosos').innerText = exitosos?.length  ?? 0;
        document.getElementById('faceDenegados').innerText = denegados?.length ?? 0;
    } catch (err) {
        console.error("Error estadísticas face:", err.message);
    }
}

// ─── TABLA HISTORIAL ──────────────────────────────────
async function cargarTablaFaceID() {
    try {
        const { data, error } = await supabase
            .from('accesos_faceid')
            .select(`
                id, confianza, camara, resultado, fecha,
                personas ( nombre, apellido )
            `)
            .order('fecha', { ascending: false })
            .limit(50);

        if (error) throw error;

        const tbody = document.getElementById('tablaFaceID');
        tbody.innerHTML = '';

        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin registros aún</td></tr>';
            return;
        }

        data.forEach(a => {
            const nombre = a.personas
                ? `${a.personas.nombre} ${a.personas.apellido}`
                : 'Desconocido';
            const conf = a.confianza ? (a.confianza * 100).toFixed(1) + '%' : '—';
            const resultado = a.resultado
                ? `<span class="badge-tipo badge-ok">Acceso OK</span>`
                : `<span class="badge-tipo badge-deny">Denegado</span>`;
            const fecha = a.fecha ? new Date(a.fecha).toLocaleString() : '—';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${nombre}</strong></td>
                <td class="mono-text">${conf}</td>
                <td class="mono-text">${a.camara ?? '—'}</td>
                <td>${resultado}</td>
                <td class="mono-text">${fecha}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Error tabla face:", err.message);
    }
}
