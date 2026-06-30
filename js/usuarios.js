// js/usuarios.js

let listaEstudiantes = [];
let listaDocentes = [];
let listaAdministrativos = [];
let listaEmpleados = [];
let listaDirectivos = [];

let editandoId = null;
let editandoTipo = null; 

document.addEventListener("DOMContentLoaded", () => {
    initUsuarios();
});

/**
 * 1. LEER TODOS LOS REGISTROS DESDE SUPABASE
 */
async function initUsuarios() {
    try {
        setLoaders();

        const resEst = await supabase.from('estudiantes').select('matricula, carrera, semestre, estado, persona_id, personas(nombre, apellido)');
        const resEmp = await supabase.from('empleados').select('id, puesto, estado, persona_id, personas(nombre, apellido)');
        const resDoc = await supabase.from('docentes').select('*');
        const resAdm = await supabase.from('administrativos').select('*');
        const resDir = await supabase.from('directivos').select('*');
       console.log("ADMINISTRATIVOS:", resAdm);
       console.log("ADMINISTRATIVOS DATA:", resAdm.data);
       console.log("DIRECTIVOS:", resDir);

        if (resEst.error) throw resEst.error;
        if (resEmp.error) throw resEmp.error;
        if (resDoc.error) throw resDoc.error;
        if (resAdm.error) throw resAdm.error;
        if (resDir.error) throw resDir.error;

        listaEstudiantes = resEst.data || [];
        listaEmpleados = resEmp.data || [];
        listaDocentes = resDoc.data || [];
        listaAdministrativos = resAdm.data || [];
        listaDirectivos = resDir.data || [];
        console.log("ADMINISTRATIVOS", listaAdministrativos);

        actualizarContadores();
        filtrarTablas();

    } catch (err) {
        console.error("Error al inicializar usuarios:", err.message);
        alert("Error de sincronización con la base de datos: " + err.message);
    }
}

/**
 * 2. ESTADÍSTICAS EN TIEMPO REAL
 */
function actualizarContadores() {
    document.getElementById('statEstudiantes').innerText = listaEstudiantes.filter(e => e.estado === 'Activo').length;
    document.getElementById('statDocentes').innerText = listaDocentes.filter(d => d.estado === 'Activo').length;
    document.getElementById('statAdmin').innerText = listaAdministrativos.filter(a => a.estado === 'Activo').length;
    document.getElementById('statEmpleados').innerText = listaEmpleados.filter(em => em.estado === 'Activo').length;
    document.getElementById('statDirectivos').innerText = listaDirectivos.filter(d => d.estado === 'Activo').length;
}

/**
 * 3. RENDERIZAR Y FILTRAR TABLAS (BÚSQUEDA Y SELECT)
 */
function filtrarTablas() {
    const busqueda = document.getElementById('busqueda').value.toLowerCase().trim();
    const filtroPor = document.getElementById('filtroPor').value;

    document.getElementById('seccionEstudiantes').style.display = (!filtroPor || filtroPor === 'estudiantes') ? 'block' : 'none';
    document.getElementById('seccionDocentes').style.display = (!filtroPor || filtroPor === 'docentes') ? 'block' : 'none';
    document.getElementById('seccionAdministrativos').style.display = (!filtroPor || filtroPor === 'administrativos') ? 'block' : 'none';
    document.getElementById('seccionEmpleados').style.display = (!filtroPor || filtroPor === 'empleados') ? 'block' : 'none';
    document.getElementById('seccionDirectivos').style.display = (!filtroPor || filtroPor === 'directivos') ? 'block' : 'none';

    // RENDER ESTUDIANTES
    const tEst = document.getElementById('tablaEstudiantes');
    tEst.innerHTML = "";
    listaEstudiantes.forEach(e => {
        const nombreCompleto = `${e.personas?.nombre || ''} ${e.personas?.apellido || ''}`;
        if (!nombreCompleto.toLowerCase().includes(busqueda) && !e.matricula.toLowerCase().includes(busqueda)) return;

        const badgeClass = e.estado === 'Activo' ? 'bg-success' : (e.estado === 'Egresado' ? 'bg-info' : 'bg-danger');
        tEst.innerHTML += `
            <tr>
                <td class="font-monospace">${e.matricula}</td>
                <td><strong>${nombreCompleto}</strong></td>
                <td>${e.carrera}</td>
                <td>${e.semestre}°</td>
                <td><span class="badge ${badgeClass}">${e.estado}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning text-dark me-1" onclick="prepararEdicionEstudiante('${e.matricula}', '${e.personas?.nombre}', '${e.personas?.apellido}', '${e.carrera}', ${e.semestre})">✏️ Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarRegistro('estudiantes', 'matricula', '${e.matricula}')">🗑️ Eliminar</button>
                </td>
            </tr>`;
    });

    // RENDER DOCENTES
    const tDoc = document.getElementById('tablaDocentes');
    tDoc.innerHTML = "";
    listaDocentes.forEach(d => {
        const nombreCompleto = d.empleado_id || '';
        if (!nombreCompleto.toLowerCase().includes(busqueda)) return;

        const badgeClass = d.estado === 'Activo' ? 'bg-success' : 'bg-danger';
        tDoc.innerHTML += `
            <tr>
                <td class="font-monospace text-muted" style="font-size:0.75rem;">${d.id.substring(0,8)}...</td>
                <td><strong>${nombreCompleto}</strong></td>
                <td>${d.departamento}</td>
                <td><span class="badge ${badgeClass}">${d.estado}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning text-dark me-1" onclick="prepararEdicionDocente('${d.id}', '${d.nombre}', '', '${d.departamento}')"
                    <button class="btn btn-sm btn-danger" onclick="eliminarRegistro('docentes', 'id', '${d.id}')">🗑️ Eliminar</button>
                </td>
            </tr>`;
    });

    // RENDER ADMINISTRATIVOS
    const tAdm = document.getElementById('tablaAdministrativos');
    tAdm.innerHTML = "";
    listaAdministrativos.forEach(a => {
        const nombreCompleto = a.nombre || '';
        if (!nombreCompleto.toLowerCase().includes(busqueda)) return;

        const badgeClass = a.estado === 'Activo' ? 'bg-success' : 'bg-danger';
        tAdm.innerHTML += `
            <tr>
                <td class="font-monospace text-muted" style="font-size:0.75rem;">${a.id.substring(0,8)}...</td>
                <td><strong>${nombreCompleto}</strong></td>
                <td>${a.area}</td>
                <td><span class="badge ${badgeClass}">${a.estado}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning text-dark me-1"
                    onclick="prepararEdicionAdmin('${a.id}', '${a.nombre}', '', '${a.area}')">✏️ Editar</button>
                </td>
            </tr>`;
    });

    // RENDER EMPLEADOS
    const textEmp = document.getElementById('tablaEmpleados');
    textEmp.innerHTML = "";
    listaEmpleados.forEach(em => {
        const nombreCompleto = `${em.personas?.nombre || ''} ${em.personas?.apellido || ''}`;
        if (!nombreCompleto.toLowerCase().includes(busqueda)) return;

        const badgeClass = em.estado === 'Activo' ? 'bg-success' : 'bg-danger';
        textEmp.innerHTML += `
            <tr>
                <td class="font-monospace text-muted" style="font-size:0.75rem;">${em.id.substring(0,8)}...</td>
                <td><strong>${nombreCompleto}</strong></td>
                <td>${em.puesto}</td>
                <td><span class="badge ${badgeClass}">${em.estado}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning text-dark me-1" onclick="prepararEdicionEmpleado('${em.id}', '${em.personas?.nombre}', '${em.personas?.apellido}', '${em.puesto}')">✏️ Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarRegistro('empleados', 'id', '${em.id}')">🗑️ Eliminar</button>
                </td>
            </tr>`;
    });

    // RENDER DIRECTIVOS
const tDir = document.getElementById('tablaDirectivos');
tDir.innerHTML = "";
listaDirectivos.forEach(d => {
    const nombreCompleto = `${d.nombre || ''} ${d.apellido || ''}`;
    if (!nombreCompleto.toLowerCase().includes(busqueda) && !(d.correo_institucional || '').toLowerCase().includes(busqueda)) return;

    const badgeClass = d.estado === 'Activo' ? 'bg-success' : 'bg-danger';
    tDir.innerHTML += `
        <tr>
            <td class="font-monospace text-muted" style="font-size:0.75rem;">${d.id.substring(0,8)}...</td>
            <td><strong>${nombreCompleto}</strong></td>
            <td>${d.correo_institucional || ''}</td>
            <td>${d.puesto || ''}</td>
            <td><span class="badge ${badgeClass}">${d.estado}</span></td>
            <td>
                <button class="btn btn-sm btn-warning text-dark me-1" onclick="prepararEdicionDirectivo('${d.id}', '${d.nombre}', '${d.apellido}', '${d.correo_institucional}', '${d.puesto}')">✏️ Editar</button>
                <button class="btn btn-sm btn-danger" onclick="eliminarRegistro('directivos', 'id', '${d.id}')">🗑️ Eliminar</button>
            </td>
        </tr>`;
});

   verificarTablasVacias(tEst, tDoc, tAdm, textEmp, tDir);
}

/**
 * 4. MAPEO DE DATOS HACIA LOS MODALES (PREPARAR EDICIÓN)
 */
function prepararEdicionEstudiante(matricula, nom, ape, carr, sem) {
    editandoId = matricula; editandoTipo = 'estudiante';
    const arrApe = ape.split(' ');
    document.getElementById('nombre').value = nom;
    document.getElementById('apellido_p').value = arrApe[0] || '';
    document.getElementById('apellido_m').value = arrApe[1] || '';
    document.getElementById('control').value = matricula;
    document.getElementById('control').disabled = true; // La matrícula es PK, no se debe alterar
    document.getElementById('carrera').value = carr;
    document.getElementById('semestre').value = sem;
    abrirModalManual('#modalRegistrar');
}

function prepararEdicionDocente(id, nom, ape, depto) {
    editandoId = id; editandoTipo = 'docente';
    const arrApe = ape.split(' ');
    document.getElementById('doc_nombre').value = nom;
    document.getElementById('doc_apellido_p').value = arrApe[0] || '';
    document.getElementById('doc_apellido_m').value = arrApe[1] || '';
    document.getElementById('doc_area').value = depto;
    abrirModalManual('#modalDocente');
}

function prepararEdicionAdmin(id, nom, ape, area) {
    editandoId = id; editandoTipo = 'administrativo';
    const arrApe = ape.split(' ');
    document.getElementById('adm_nombre').value = nom;
    document.getElementById('adm_apellido_p').value = arrApe[0] || '';
    document.getElementById('adm_apellido_m').value = arrApe[1] || '';
    document.getElementById('adm_area').value = area;
    abrirModalManual('#modalAdmin');
}

function prepararEdicionEmpleado(id, nom, ape, puesto) {
    editandoId = id; editandoTipo = 'empleado';
    const arrApe = ape.split(' ');
    document.getElementById('emp_nombre').value = nom;
    document.getElementById('emp_apellido_p').value = arrApe[0] || '';
    document.getElementById('emp_apellido_m').value = arrApe[1] || '';
    document.getElementById('emp_puesto').value = puesto;
    abrirModalManual('#modalEmpleado');
}

function prepararEdicionDirectivo(id, nom, ape, correo, puesto) {
    editandoId = id; editandoTipo = 'directivo';
    document.getElementById('dir_nombre').value = nom;
    document.getElementById('dir_apellido').value = ape;
    document.getElementById('dir_correo').value = correo;
    document.getElementById('dir_puesto').value = puesto;
    abrirModalManual('#modalDirectivo');
}

/**
 * 5. PROCESAR ACTUALIZACIONES EN LA BASE DE DATOS (UPDATE)
 */
async function actualizarEstudiante() {
    const nombre = document.getElementById('nombre').value.trim();
    const apP = document.getElementById('apellido_p').value.trim();
    const apM = document.getElementById('apellido_m').value.trim();
    const carrera = document.getElementById('carrera').value;
    const semestre = document.getElementById('semestre').value;

    if (!nombre || !apP || !carrera || !semestre) return alert("Rellena todos los campos.");

    try {
        const pId = listaEstudiantes.find(e => e.matricula === editandoId)?.persona_id;
        await supabase.from('personas').update({ nombre: nombre, apellido: `${apP} ${apM}`.trim() }).eq('id', pId);
        await supabase.from('estudiantes').update({ carrera: carrera, semestre: parseInt(semestre) }).eq('matricula', editandoId);
        finalizarFlujoModal('#modalRegistrar');
    } catch (err) { alert("Error al actualizar estudiante: " + err.message); }
}

async function actualizarDocente() {
    const nombre = document.getElementById('doc_nombre').value.trim();
    const apP = document.getElementById('doc_apellido_p').value.trim();
    const apM = document.getElementById('doc_apellido_m').value.trim();
    const depto = document.getElementById('doc_area').value.trim();

    if (!nombre || !apP || !depto) return alert("Campos incompletos.");

    try {
        const doc = listaDocentes.find(d => d.id === editandoId);
        const pId = doc.empleados?.persona_id;
        await supabase.from('personas').update({ nombre: nombre, apellido: `${apP} ${apM}`.trim() }).eq('id', pId);
        await supabase.from('docentes').update({ departamento: depto }).eq('id', editandoId);
        finalizarFlujoModal('#modalDocente');
    } catch (err) { alert("Error al actualizar docente: " + err.message); }
}

async function actualizarAdmin() {
    const nombre = document.getElementById('adm_nombre').value.trim();
    const apP = document.getElementById('adm_apellido_p').value.trim();
    const apM = document.getElementById('adm_apellido_m').value.trim();
    const area = document.getElementById('adm_area').value.trim();

    if (!nombre || !apP || !area) return alert("Campos incompletos.");

    try {
        const adm = listaAdministrativos.find(a => a.id === editandoId);
        const pId = adm.empleados?.persona_id;
        await supabase.from('personas').update({ nombre: nombre, apellido: `${apP} ${apM}`.trim() }).eq('id', pId);
        await supabase.from('administrativos').update({ area: area }).eq('id', editandoId);
        finalizarFlujoModal('#modalAdmin');
    } catch (err) { alert("Error al actualizar administrativo: " + err.message); }
}

async function actualizarEmpleado() {
    const nombre = document.getElementById('emp_nombre').value.trim();
    const apP = document.getElementById('emp_apellido_p').value.trim();
    const apM = document.getElementById('emp_apellido_m').value.trim();
    const puesto = document.getElementById('emp_puesto').value.trim();

    if (!nombre || !apP || !puesto) return alert("Campos incompletos.");

    try {
        const em = listaEmpleados.find(e => e.id === editandoId);
        await supabase.from('personas').update({ nombre: nombre, apellido: `${apP} ${apM}`.trim() }).eq('id', em.persona_id);
        await supabase.from('empleados').update({ puesto: puesto }).eq('id', editandoId);
        finalizarFlujoModal('#modalEmpleado');
    } catch (err) { alert("Error al actualizar empleado: " + err.message); }
}

async function actualizarDirectivo() {
    const nombre = document.getElementById('dir_nombre').value.trim();
    const apellido = document.getElementById('dir_apellido').value.trim();
    const correo = document.getElementById('dir_correo').value.trim();
    const puesto = document.getElementById('dir_puesto').value.trim();

    if (!nombre || !apellido || !correo || !puesto) return alert("Rellena todos los campos.");

    try {
        const { error } = await supabase.from('directivos')
            .update({ nombre: nombre, apellido: apellido, correo_institucional: correo, puesto: puesto })
            .eq('id', editandoId);
        if (error) throw error;
        finalizarFlujoModal('#modalDirectivo');
    } catch (err) { alert("Error al actualizar directivo: " + err.message); }
}

/**
 * 6. ELIMINACIÓN CON CASCADE ACTIVO (DELETE)
 */
async function eliminarRegistro(tabla, campoLlave, id) {
    if (!confirm(`¿Estás seguro de eliminar este registro de la tabla ${tabla}? Al tener CASCADE en la base de datos, se limpiarán de forma segura los accesos asociados.`)) return;
    try {
        const { error } = await supabase.from(tabla).delete().eq(campoLlave, id);
        if (error) throw error;
        initUsuarios();
    } catch (err) { alert("No se pudo eliminar: " + err.message); }
}

/**
 * UTILERÍAS VISUALES   
 */
function abrirModalManual(selector) {
    const modalEl = document.querySelector(selector);
    const instance = bootstrap.Modal.getOrCreateInstance(modalEl);
    instance.show();
}

function finalizarFlujoModal(selector) {
    const modalEl = document.querySelector(selector);
    const instance = bootstrap.Modal.getInstance(modalEl);
    if (instance) instance.hide();
    modalEl.querySelectorAll('input, select').forEach(i => { i.value = ""; i.disabled = false; });
    editandoId = null; editandoTipo = null;
    initUsuarios();
}

function setLoaders() {
    const loader = `<tr><td colspan="6" class="text-center text-muted py-3">🔄 Sincronizando vistas de control...</td></tr>`;
    document.getElementById('tablaEstudiantes').innerHTML = loader;
    document.getElementById('tablaDocentes').innerHTML = loader;
    document.getElementById('tablaAdministrativos').innerHTML = loader;
    document.getElementById('tablaEmpleados').innerHTML = loader;
}

function verificarTablasVacias(...tablas) {
    tablas.forEach(t => { if (t.innerHTML === "") t.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No hay registros en esta categoría.</td></tr>`; });
}