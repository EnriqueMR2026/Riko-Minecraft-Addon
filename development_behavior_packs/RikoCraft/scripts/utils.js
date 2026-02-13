import { world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { DICCIONARIO_ITEMS, DICCIONARIO_EFECTOS } from "./traducciones.js";

// =============================================================================
// 🧮 HERRAMIENTAS DEL SISTEMA (Lógica interna)
// =============================================================================

// --- VALORES POR DEFECTO (PERSISTENTES) ---
// Estos valores se usan si no has configurado nada en el Admin Panel.
// Útil para que funcione en mapas nuevos sin tener que configurar todo de cero.
const DEFAULTS_XP = {
    // 1. MUNDO NORMAL
    "XP_MOB_minecraft:zombie": 20,
    "XP_MOB_minecraft:skeleton": 20,
    "XP_MOB_minecraft:creeper": 35,
    "XP_MOB_minecraft:spider": 25,
    "XP_MOB_minecraft:enderman": 100,
    "XP_MOB_minecraft:witch": 40,
    "XP_MOB_minecraft:slime": 15,
    "XP_MOB_minecraft:phantom": 30,
    "XP_MOB_minecraft:silverfish": 10,
    "XP_MOB_minecraft:cave_spider": 30,

    // 2. VARIANTES
    "XP_MOB_minecraft:drowned": 30,
    "XP_MOB_minecraft:husk": 25,
    "XP_MOB_minecraft:stray": 25,
    "XP_MOB_minecraft:bogged": 30,

    // 3. INVASIONES (Raids)
    "XP_MOB_minecraft:pillager": 40,
    "XP_MOB_minecraft:vindicator": 60,
    "XP_MOB_minecraft:evoker": 150,
    "XP_MOB_minecraft:ravager": 300,
    "XP_MOB_minecraft:vex": 20,

    // 4. NETHER
    "XP_MOB_minecraft:blaze": 50,
    "XP_MOB_minecraft:ghast": 80,
    "XP_MOB_minecraft:magma_cube": 20,
    "XP_MOB_minecraft:wither_skeleton": 70,
    "XP_MOB_minecraft:hoglin": 60,
    "XP_MOB_minecraft:piglin_brute": 120,
    "XP_MOB_minecraft:zoglin": 50,

    // 5. ACUÁTICOS Y OTROS
    "XP_MOB_minecraft:guardian": 60,
    "XP_MOB_minecraft:elder_guardian": 1000,
    "XP_MOB_minecraft:shulker": 80,

    // 6. JEFES
    "XP_MOB_minecraft:warden": 2000,
    "XP_MOB_minecraft:wither": 5000,
    "XP_MOB_minecraft:ender_dragon": 10000,
    "XP_MOB_minecraft:breeze": 100,

    // 7. PVP
    "XP_MOB_minecraft:player": 300
};

// --- CACHÉ GLOBAL DE DINERO (NUEVO PARA EL TOP) ---
// Obtiene el registro contable de todos los jugadores (incluso los desconectados)
export function getCacheDinero() {
    // Usamos la función getDatosMundo que ya existe en este mismo archivo
    let cache = getDatosMundo("CACHE_DINERO_GLOBAL");
    if (!cache) {
        cache = {}; // Objeto vacío si es la primera vez que se crea
        setDatosMundo("CACHE_DINERO_GLOBAL", cache);
    }
    return cache;
}

// --- OBTENER DINERO ---
export function getSaldo(player) {
    let saldo = player.getDynamicProperty("dinero");
    // Si no tiene dinero asignado, le damos el inicial de la CONFIG
    if (saldo === undefined) saldo = CONFIG.DINERO_INICIAL;

    // ---> NUEVO: SINCRONIZACIÓN SILENCIOSA <---
    // Cada vez que el juego revisa el dinero de un jugador activo, 
    // nos aseguramos de que su saldo esté actualizado en el Caché Global.
    const cache = getCacheDinero();
    if (cache[player.name] !== saldo) {
        cache[player.name] = saldo;
        setDatosMundo("CACHE_DINERO_GLOBAL", cache);
    }

    return saldo;
}

// --- GUARDAR DINERO ---
export function setSaldo(player, cantidad) {
    // Evitamos saldos negativos
    if (cantidad < 0) cantidad = 0;
    
    // 1. Guardamos directamente en el jugador (Como siempre)
    player.setDynamicProperty("dinero", cantidad);

    // ---> NUEVO: GUARDAR EN EL CACHÉ GLOBAL <---
    // Guardamos la copia de seguridad en el mundo para que el Top 
    // pueda leerlo aunque el jugador se haya ido a dormir.
    const cache = getCacheDinero();
    cache[player.name] = cantidad;
    setDatosMundo("CACHE_DINERO_GLOBAL", cache);
}
// --- BUSCAR JUGADOR ---
export function buscarJugador(nombreParcial) {
    const nombreLimpio = nombreParcial.replace(/"/g, "").toLowerCase();
    return world.getPlayers().find(p => p.name.toLowerCase() === nombreLimpio);
}

// --- VERIFICAR SI ESTÁ VIVO (VERSIÓN CORREGIDA) ---
export function jugadorSigueVivo(player) {
    try {
        // Intento 1: Forma moderna (Función - API 1.x.x)
        return player.isValid();
    } catch (e) {
        try {
            // Intento 2: Forma antigua/Beta (Propiedad)
            return player.isValid;
        } catch (e2) {
            // Si todo falla, asumimos que no es válido
            return false;
        }
    }
}

// =============================================================================
// 🧭 SISTEMA DE WAYPOINTS (Guardado de datos)
// =============================================================================

// Obtener la lista de casas del jugador
export function getWaypoints(player) {
    const data = player.getDynamicProperty("mis_waypoints");
    if (!data) return []; // Si no tiene nada, devuelve lista vacía
    return JSON.parse(data); // Convierte el texto guardado en una lista real
}

// Guardar una nueva ubicacion
export function addWaypoint(player, nombre, ubicacion) {
    const lista = getWaypoints(player);
    
    // Si NO tiene tag de DIOS y ya llego al limite (4), lo bloqueamos. Si es DIOS no tiene limites
    if (!player.hasTag(CONFIG.TAG_ADMIN) && lista.length >= CONFIG.MAX_WAYPOINTS) {
        return false; 
    }
    
    lista.push({
        name: nombre,
        x: Math.floor(ubicacion.x),
        y: Math.floor(ubicacion.y),
        z: Math.floor(ubicacion.z),
        dim: player.dimension.id 
    });

    player.setDynamicProperty("mis_waypoints", JSON.stringify(lista));
    return true; 
}

// Borrar una casa
export function deleteWaypoint(player, index) {
    const lista = getWaypoints(player);
    if (index >= 0 && index < lista.length) {
        lista.splice(index, 1); // Borra el elemento en esa posición
        player.setDynamicProperty("mis_waypoints", JSON.stringify(lista));
        return true;
    }
    return false;
}

// =============================================================================
// 📦 SISTEMA DE COMERCIO (Inventario Inteligente)
// =============================================================================

export const VENTAS_PENDIENTES = new Map();

function obtenerNombreBonito(item) {
    // 1. Prioridad: Nombre personalizado (yunque)
    if (item.nameTag) return `§e${item.nameTag}§r`;

    // 2. DETECTOR DE POCIONES (Nueva Lógica)
    // Verificamos si el item tiene el componente de poción
    const componentePocion = item.getComponent("minecraft:potion");
    if (componentePocion) {
        try {
            // Obtenemos el ID del efecto (ej: "night_vision")
            const tipoEfecto = componentePocion.type.id;
            // Lo buscamos en nuestro nuevo diccionario
            const nombreEfecto = DICCIONARIO_EFECTOS[tipoEfecto] || "Desconocida";
            
            // Creamos el nombre completo según el tipo de botella
            if (item.typeId.includes("splash")) return `Poción Arrojadiza de ${nombreEfecto}`;
            if (item.typeId.includes("lingering")) return `Poción Persistente de ${nombreEfecto}`;
            return `Poción de ${nombreEfecto}`;
        } catch (e) {
            return "Poción Rara"; // Por si falla algo interno
        }
    }

    // 3. Prioridad: Diccionario normal
    if (DICCIONARIO_ITEMS[item.typeId]) return DICCIONARIO_ITEMS[item.typeId];

    // 4. Respaldo: Limpiar el ID en inglés
    let nombreLimpio = item.typeId.replace("minecraft:", "").replace(/_/g, " ");
    return nombreLimpio.charAt(0).toUpperCase() + nombreLimpio.slice(1);
}

export function obtenerInventario(player) {
    const inventory = player.getComponent("inventory").container;
    const items = [];

    for (let i = 0; i < inventory.size; i++) {
        const item = inventory.getItem(i);
        if (item) {
            let nombreDisplay = obtenerNombreBonito(item); // Esto ya lo traduce
            
            items.push({
                texto: `${nombreDisplay} (x${item.amount})`, // Para el Menú
                nombreTraducido: nombreDisplay, // <--- Guardamos el nombre limpio aquí
                slot: i,
                typeId: item.typeId,
                amount: item.amount,
                nameTag: item.nameTag
            });
        }
    }
    return items;
}

// =============================================================================
// 🛠️  CLANES Y TIERRAS
// =============================================================================

// --- GESTIÓN DE DATOS GLOBALES (Propiedades Dinámicas del Mundo) ---
// Usaremos esto para guardar la lista de todos los clanes y tierras
export function getDatosMundo(id) {
    const data = world.getDynamicProperty(id);
    return data ? JSON.parse(data) : null;
}

export function setDatosMundo(id, datos) {
    // Convertimos el objeto a texto para guardarlo
    world.setDynamicProperty(id, JSON.stringify(datos));
}

// --- HERRAMIENTA MATEMÁTICA: DISTANCIA 3D ---
export function obtenerDistancia(pos1, pos2) {
    return Math.sqrt(
        Math.pow(pos1.x - pos2.x, 2) + 
        Math.pow(pos1.y - pos2.y, 2) + 
        Math.pow(pos1.z - pos2.z, 2)
    );
}

// --- FORMATEADOR DE CHAT (Para el Tag Dorado) ---
// Convierte el texto "[TAG]" en formato exclusivo Nivel 10
export function formatoDorado(nombreClan) {
    return `§6 ${nombreClan}§r`; 
}

// =============================================================================
// ⚙️ SISTEMA DE CONFIGURACIÓN DINÁMICA
// =============================================================================

export function getConfigVar(clave) {
    const guardado = world.getDynamicProperty(`conf_${clave}`);
    
    // 1. Si el admin lo configuró en el juego, usamos eso.
    if (guardado !== undefined) return guardado;

    // 2. Si no, buscamos en nuestros DEFAULTS de XP (Hardcodeados arriba)
    if (DEFAULTS_XP[clave] !== undefined) return DEFAULTS_XP[clave];

    // 3. Si no es XP, usamos la config general
    return CONFIG[clave];
}

export function setConfigVar(clave, valor) {
    world.setDynamicProperty(`conf_${clave}`, valor);
}

// =============================================================================
// 🧪 SISTEMA DE CLANES 2.0 (Efectos, Kits y Descuentos)
// =============================================================================

// --- 1. CONFIGURACIÓN DE EFECTOS (Base de Datos Dinámica) ---
export function obtenerConfigEfectos() {
    let config = getDatosMundo(CONFIG.DB_CONFIG_EFECTOS);
    
    // Si no existe (primera vez), creamos la DEFAULT (Modo Hardcore - Opción C)
    if (!config) {
        config = [
            // ID, Nombre, Amplificador (0=I, 1=II), Nivel Desbloqueo, Precio Compra, Precio Renta
            { id: "night_vision", name: "Visión Nocturna", amp: 0, lvl: 10, buy: 10000, rent: 1000 },
            { id: "water_breathing", name: "Resp. Acuática", amp: 0, lvl: 25, buy: 15000, rent: 1500 },
            { id: "jump_boost", name: "Súper Salto II", amp: 1, lvl: 40, buy: 25000, rent: 2500 },
            { id: "speed", name: "Velocidad I", amp: 0, lvl: 55, buy: 40000, rent: 4000 },
            { id: "haste", name: "Prisa Minera II", amp: 1, lvl: 70, buy: 70000, rent: 7000 },
            { id: "resistance", name: "Resistencia I", amp: 0, lvl: 85, buy: 100000, rent: 10000 },
            { id: "strength", name: "Fuerza I", amp: 0, lvl: 100, buy: 250000, rent: 25000 }
        ];
        setDatosMundo(CONFIG.DB_CONFIG_EFECTOS, config);
    }
    return config;
}

// --- 2. CALCULADORA DE DESCUENTOS (Renta de Tierras) ---
export function calcularDescuentoTierras(nivelClan) {
    // Fórmula: Nivel * 0.7
    let porcentaje = nivelClan * 0.7;
    
    // Tope máximo por si acaso (aunque nivel 100 da 70%)
    if (porcentaje > 70) porcentaje = 70;
    
    return {
        texto: `${porcentaje.toFixed(1)}%`, // Para mostrar en el menú
        multiplicador: 1 - (porcentaje / 100) // Para multiplicar el precio (ej: 0.3)
    };
}

// --- 3. CONTENIDO DE KITS (Acumulativo) ---
// Retorna la lista de items exacta según el nivel del clan
export function obtenerKitPorNivel(nivel) {
    let items = [];

    // Rango 1: VAGABUNDO (1 - 9)
    if (nivel >= 1) items.push(
        { id: "minecraft:bread", amount: 16 },
        { id: "minecraft:coal", amount: 8 }
    );

    // Rango 2: ESCUDERO (10 - 24)
    if (nivel >= 10) items.push(
        { id: "minecraft:cooked_porkchop", amount: 16 },
        { id: "minecraft:iron_ingot", amount: 4 }
    );

    // Rango 3: GUERRERO (25 - 39)
    if (nivel >= 25) items.push(
        { id: "minecraft:gold_ingot", amount: 4 }
    );

    // Rango 4: CABALLERO (40 - 54)
    if (nivel >= 40) items.push(
        { id: "minecraft:golden_carrot", amount: 16 },
        { id: "minecraft:diamond", amount: 1 }
    );

    // Rango 5: PALADÍN (55 - 69)
    if (nivel >= 55) items.push(
        { id: "minecraft:diamond", amount: 2 } // Suma 3 diamantes total
    );

    // Rango 6: CAUDILLO (70 - 84)
    if (nivel >= 70) items.push(
        { id: "minecraft:emerald", amount: 4 }
    );

    // Rango 7: CONQUISTADOR (85 - 99)
    if (nivel >= 85) items.push(
        { id: "minecraft:netherite_scrap", amount: 1 }
    );

    // Rango 8: EMPERADOR (100)
    if (nivel >= 100) items.push(
        { id: "minecraft:golden_apple", amount: 1 }
    );

    return items;
}

// Función auxiliar para obtener el NOMBRE del rango
export function obtenerNombreRango(nivel) {
    if (nivel >= 100) return "Emperador";
    if (nivel >= 85) return "Conquistador";
    if (nivel >= 70) return "Caudillo";
    if (nivel >= 55) return "Paladín";
    if (nivel >= 40) return "Caballero";
    if (nivel >= 25) return "Guerrero";
    if (nivel >= 10) return "Escudero";
    return "Vagabundo";
}

// =============================================================================
// 📈 CALCULADORA DE COSTO DE NIVEL (CURVA PROGRESIVA)
// =============================================================================
export function calcularCostoNivel(nivelActual) {
    // Obtenemos el costo base (ej: 1000). Si no hay config, usa 1000.
    const base = getConfigVar("COSTO_NIVEL_BASE") || 1000;

    // DEFINIMOS LOS MULTIPLICADORES DE DIFICULTAD
    let multiplicador = 1;

    if (nivelActual < 10) {
        multiplicador = 1;      // VELOCIDAD: RÁPIDA (1x)
    } 
    else if (nivelActual < 40) {
        multiplicador = 2.5;    // VELOCIDAD: MEDIA (Cuesta x2.5)
    } 
    else if (nivelActual < 70) {
        multiplicador = 5;      // VELOCIDAD: LENTA (Cuesta x5)
    } 
    else {
        multiplicador = 10;     // VELOCIDAD: HARDCORE (Cuesta x10)
    }

    // Fórmula: Base * Nivel * Dificultad
    return Math.floor(base * nivelActual * multiplicador);
}