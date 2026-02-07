// =============================================================================
// 🛠️ CONFIGURACIÓN GENERAL (Aquí editas los nombres y reglas)
// =============================================================================

export const CONFIG = {
    MONEDA: "RikoPesos",       // Nombre de tu moneda
    SIMBOLO: "",              // Ícono de la moneda (Minecoin)
    HEADER: "",               // Ícono decorativo (Estrella)
    DINERO_INICIAL: 0,         // Cuanto dinero reciben los nuevos
    PREFIJO: "@",              // Símbolo para comandos
    TAG_ADMIN: "DIOS",         // Tag para ver opciones de admin
    TAG_VETERANO: "veterano_s9", // Tag para saber si ya entró antes
    
    // Configuración de Viajes (Waypoints)
    MAX_WAYPOINTS: 4,          // Cuantas casas pueden tener
    COOLDOWN_VIAJE: 300,        // Segundos de espera entre viajes 

    // --- CONFIGURACIÓN DE CLANES Y TIERRAS ---
    
    COSTO_CREAR_CLAN: 5000, // Precios Base (Se pueden modificar luego desde el Panel Admin)
    COSTO_NIVEL_BASE: 500, // XP necesaria para nivel 2 (luego se multiplica)
    MAX_MIEMBROS_GLOBAL: 5,
    
    // Tiempos y Costos de Renta
    DIAS_RENTA_MAX: 7,
    COSTO_RENTA_SEMANAL: 1000,
    
    // Configuración Visual
    COLOR_NIVEL_MAX: "§6", // Dorado para Nivel 10
    
    // Identificadores de Base de Datos (No tocar)
    DB_CLANES: "db_clanes_v1",
    DB_TIERRAS: "db_tierras_v1",
    DB_HUD_PREF: "db_hud_pref",
    DB_ZONAS: "db_zonas_protegidas_v1",

    // Identificadores de Bases de datos para Efectos y Kits (No tocar)
    DB_CONFIG_EFECTOS: "db_conf_efectos_v1", 
    DB_CONFIG_KITS: "db_conf_kits_v1"
};