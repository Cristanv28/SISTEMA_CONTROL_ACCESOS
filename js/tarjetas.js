// js/tarjetas.js
let modalRegistroInstance;

document.addEventListener("DOMContentLoaded", () => {
    const modalEl = document.getElementById('modalRegistro');
    if (modalEl) modalRegistroInstance = new bootstrap.Modal(modalEl);
    
    cargarEstadisticas();
    cargarTablaTarjetas();
    cargarUsuariosSelect();
});

// 0. ABRIR EL MODAL DE REGISTRO (faltaba esta funcion, por eso el error en consola)
function abrirModalRegistro() {
    // Resetea el modal al paso inicial por si quedo en otro estado de una vez anterior
    document.getElementById('pasoSeleccion').style.display = 'block';
    document.getElementById('pasoEsperando').style.display = 'none';
    document.getElementById('pasoExito').style.display = 'none';
    document.getElementById('bannerRegistro').style.display = 'none';

    // Refresca la lista de usuarios cada vez que se abre, por si hubo cambios
    cargarUsuariosSelect();

    if (modalRegistroInstance) {
        modalRegistroInstance.show();
    } else {
        console.error("El modal de registro no se inicializo correctamente.");
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
        document.getElementById('tarjetasActivas').innerText = activos; // Personas activas en sistema
        document.getElementById('tarjetasInactivas').innerText = inactivos;
    } catch (err) {
        console.error("Error en estadísticas:", err.message);
    }
}

// 2. MUESTRA LAS PERSONAS REGISTRADAS
async function cargarTablaTarjetas() {
    try {
        const { data, error } = await supabase
            .from('personas')
            .select('id, nombre, apellido, activo, created_at')
            .order('nombre', { ascending: true });

        if (error) throw error;

        const tbody = document.getElementById('tablaTarjetas');
        if (!tbody) return;
        tbody.innerHTML = "";

        data.forEach(p => {
            let badgeEstado = p.activo 
                ? `<span class="badge-tipo badge-ok">Activo</span>` 
                : `<span class="badge-tipo badge-deny">Inactivo</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="mono-text">${p.id}</td>
                <td>${p.nombre} ${p.apellido}</td>
                <td><span class="badge-tipo badge-salida">Usuario</span></td>
                <td>—</td>
                <td class="mono-text">—</td>
                <td>${badgeEstado}</td>
                <td class="mono-text">${p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                <td>
                    <button class="btn-danger-custom py-1 px-2" onclick="desactivarPersona(${p.id})">Desactivar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Error al cargar tabla:", err.message);
    }
}

// 3. LLENAR EL SELECT DEL MODAL
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
            opt.value = p.id; // Almacena el ID numérico (serial)
            opt.text = `${p.nombre} ${p.apellido}`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error("Error al cargar select:", err.message);
    }
}

// 4. MODO REGISTRO USANDO TU TABLA 'registro_tarjeta_pendiente'
async function iniciarModoRegistro() {
    const personaId = document.getElementById('selectUsuarioRegistro').value;
    if (!personaId) return alert("Por favor, selecciona una persona primero.");

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

async function desactivarPersona(id) {
    if(confirm("¿Seguro que deseas desactivar a esta persona?")) {
        const { error } = await supabase
            .from('personas')
            .update({ activo: false })
            .eq('id', id);
        if(!error) { cargarEstadisticas(); cargarTablaTarjetas(); }
    }
}
