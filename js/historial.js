// js/hitorial.js
let listaAccesos = [];

document.addEventListener("DOMContentLoaded", () => {
    // Inicializar input de fecha al día actual
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('filterDate').value = hoy;

    cargarHistorial();
});

async function cargarHistorial() {
    try {
        const historyBody = document.getElementById('historyBody');
        historyBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">🔄 Consultando tabla entradas_salidas...</td></tr>`;

        // Consulta usando la relación FK exacta que enviaste (persona_id)
        const { data, error } = await supabase
            .from('entradas_salidas')
            .select(`
                id,
                matricula,
                carrera,
                tipo,
                camara,
                fecha,
                hora,
                personas (
                    nombre,
                    apellido
                )
            `)
            .order('fecha', { ascending: false });

        if (error) throw error;

        // Estructuramos de acuerdo con tus columnas reales de Postgres
        listaAccesos = data.map(reg => {
            return {
                nombre: reg.personas ? `${reg.personas.nombre} ${reg.personas.apellido}` : 'Desconocido/Invitado',
                matricula: reg.matricula || '—',
                carrera: reg.carrera || 'General / Depto',
                tipo: reg.tipo || 'Entrada', // Respeta mayúsculas 'Entrada' / 'Salida' según tu CHECK CONSTRAINT
                fecha: reg.fecha, // YYYY-MM-DD nativo de Postgres
                hora: reg.hora    // TIME without time zone nativo
            };
        });

        applyFilters();

    } catch (err) {
        console.error("Error al obtener historial:", err.message);
        document.getElementById('historyBody').innerHTML = `
            <tr><td colspan="6" class="text-center text-danger py-4">❌ Error de Base de Datos: ${err.message}</td></tr>
        `;
    }
}

function applyFilters() {
    const filterDate = document.getElementById('filterDate').value;
    const filterType = document.getElementById('filterType').value;
    const filterCareer = document.getElementById('filterCareer').value.toLowerCase().trim();
    const historyBody = document.getElementById('historyBody');

    const filtrados = listaAccesos.filter(item => {
        const coincideFecha = !filterDate || item.fecha === filterDate;
        // Comparamos sin importar mayúsculas/minúsculas
        const coincideTipo = !filterType || item.tipo.toLowerCase() === filterType.toLowerCase();
        const coincideCarrera = !filterCareer || item.carrera.toLowerCase().includes(filterCareer);
        
        return coincideFecha && coincideTipo && coincideCarrera;
    });

    historyBody.innerHTML = "";

    if (filtrados.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">⚠️ Sin registros con los filtros aplicados.</td></tr>`;
        return;
    }

    filtrados.forEach(item => {
        const tr = document.createElement('tr');
        
        // Estilizado según el CHECK constraint ('Entrada' / 'Salida')
        const esEntrada = item.tipo.toLowerCase() === 'entrada';
        const badgeClass = esEntrada ? 'bg-success-subtle text-success' : 'bg-primary-subtle text-primary';
        const tipoBadge = `<span class="badge ${badgeClass} text-uppercase px-2.5 py-1" style="font-size: 0.75rem; font-weight: 600;">${item.tipo}</span>`;

        tr.innerHTML = `
            <td>${item.nombre}</td>
            <td class="font-monospace text-muted" style="font-size: 0.85rem;">${item.matricula}</td>
            <td>${item.carrera}</td>
            <td>${tipoBadge}</td>
            <td>${item.fecha}</td>
            <td class="font-monospace">${item.hora}</td>
        `;
        historyBody.appendChild(tr);
    });
}

function downloadExcel() {
    const filterDate = document.getElementById('filterDate').value;
    const filterType = document.getElementById('filterType').value;
    const filterCareer = document.getElementById('filterCareer').value.toLowerCase().trim();

    const datosAExportar = listaAccesos.filter(item => {
        const coincideFecha = !filterDate || item.fecha === filterDate;
        const coincideTipo = !filterType || item.tipo.toLowerCase() === filterType.toLowerCase();
        const coincideCarrera = !filterCareer || item.carrera.toLowerCase().includes(filterCareer);
        return coincideFecha && coincideTipo && coincideCarrera;
    });

    if (datosAExportar.length === 0) return alert("No hay datos para exportar.");

    const filasExcel = datosAExportar.map(item => ({
        'Nombre Completo': item.nombre,
        'Matrícula': item.matricula,
        'Carrera': item.carrera,
        'Movimiento': item.tipo.toUpperCase(),
        'Fecha': item.fecha,
        'Hora Registro': item.hora
    }));

    const hoja = XLSX.utils.json_to_sheet(filasExcel);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Logs");

    const anchos = Object.keys(filasExcel[0]).map(key => ({ wch: Math.max(key.length + 4, 15) }));
    hoja['!cols'] = anchos;

    XLSX.writeFile(libro, `Reporte_Accesos_${filterDate || 'Historico'}.xlsx`);
}