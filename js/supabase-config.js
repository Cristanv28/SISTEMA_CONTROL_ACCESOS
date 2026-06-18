// js/supabase-config.js
const SUPABASE_URL = "https://sjvrxqbgaybjmcwcnsle.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqdnJ4cWJnYXliam1jd2Nuc2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NzE5MjEsImV4cCI6MjA5NjQ0NzkyMX0.dS7qkI5ZGSSz6qsKrVtkX-mldgrMuyv5SZmSB_dHms8";

// 1. Guardamos la librería cruda temporalmente para no perderla
const clienteInstancia = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. Poblamos la ventana global con ambas firmas para que NINGÚN script falle
window.db = clienteInstancia;
window.supabase = clienteInstancia;