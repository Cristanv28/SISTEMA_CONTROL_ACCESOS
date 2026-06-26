const totalPasos = 5;
const completados = new Set();

function toggleStep(id) {
    const body = document.getElementById('body-' + id);
    const icon = document.getElementById('icon-' + id);
    const open = body.classList.toggle('open');
    icon.className = open ? 'bi bi-chevron-up ms-2' : 'bi bi-chevron-down ms-2';
}

function setStatus(id, tipo, texto) {
    const el = document.getElementById('status-' + id);
    el.className = 'step-status ' + tipo;
    el.textContent = texto;
}

function log(id, msg, tipo = 'info') {
    const box = document.getElementById('log-' + id);
    box.classList.add('visible');
    box.innerHTML += `<span class="log-${tipo}">[${new Date().toLocaleTimeString()}] ${msg}</span>\n`;
}

function ejecutarPaso(id) {
    const logBox = document.getElementById('log-' + id);
    logBox.innerHTML = '';
    setStatus(id, 'running', 'Ejecutando...');
    log(id, 'Iniciando ejecución del paso...', 'info');

    setTimeout(() => {
        setStatus(id, 'ok', '✓ Completado');
        log(id, 'SQL marcado como ejecutado correctamente.', 'ok');
        log(id, 'Copia el bloque SQL y ejecútalo en el SQL Editor de Supabase correspondiente.', 'info');
        completados.add(id);
        actualizarProgreso();
    }, 800);
}

function copiarSQL(preId) {
    const text = document.getElementById(preId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target.closest('button');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check2"></i> Copiado';
        setTimeout(() => btn.innerHTML = orig, 1500);
    });
}

function actualizarProgreso() {
    const n = completados.size;
    const pct = Math.round((n / totalPasos) * 100);
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressLabel').textContent = `${n} de ${totalPasos} pasos completados`;
}

function actualizarSQL() {
    const host = document.getElementById('input-host').value || 'db.XXXXXXXXXXXX.supabase.co';
    const pass = document.getElementById('input-pass').value || 'TU_CONTRASEÑA';
    document.getElementById('sql-s2').textContent =
`-- 1. Habilitar extensión FDW
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- 2. Registrar servidor foráneo (Nodo Remoto)
DROP SERVER IF EXISTS servidor_sucursal CASCADE;
CREATE SERVER servidor_sucursal
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host '${host}', dbname 'postgres', port '6543');

-- 3. Mapeo de credenciales
CREATE USER MAPPING FOR postgres
  SERVER servidor_sucursal
  OPTIONS (user 'postgres', password '${pass}');`;
}

// Abrir el primer paso por defecto
toggleStep('s1');
