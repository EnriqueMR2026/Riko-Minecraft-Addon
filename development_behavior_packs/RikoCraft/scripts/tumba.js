import { world, system } from "@minecraft/server";

// =============================================================================
// SISTEMA DE TUMBAS: CREACION Y RESCATE DE ITEMS
// =============================================================================
export function crearTumbaJugador(player) {
    const dimension = player.dimension;
    const pos = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
    };

    // 1. ANTISATURACION
    const tumbaViejaId = player.getDynamicProperty("id_tumba_activa");
    if (tumbaViejaId) {
        try {
            const vieja = dimension.getEntity(tumbaViejaId);
            if (vieja) vieja.remove(); 
        } catch(e) {} 
    }

    // 2. CREACION
    const tumba = dimension.spawnEntity("rikocraft:tumba", pos);
    tumba.nameTag = `§cTUMBA de ${player.name}`;
    
    player.setDynamicProperty("id_tumba_activa", tumba.id);
    player.setDynamicProperty("tumba_timestamp", Date.now()); 
    player.setDynamicProperty("tumba_pos", JSON.stringify(pos)); 
    player.setDynamicProperty("hud_tumba", true);

    // 3. MUDANZA DE ITEMS
    const invJugador = player.getComponent("inventory").container;
    const equipJugador = player.getComponent("equippable");
    const invTumba = tumba.getComponent("inventory").container;

    let slotTumba = 0;
    for (let i = 0; i < invJugador.size; i++) {
        const item = invJugador.getItem(i);
        if (item) {
            invTumba.setItem(slotTumba, item);
            slotTumba++;
        }
    }
    invJugador.clearAll(); 

    const partesArmadura = ["Head", "Chest", "Legs", "Feet", "Offhand"];
    for (const parte of partesArmadura) {
        const equipo = equipJugador.getEquipment(parte);
        if (equipo) {
            invTumba.setItem(slotTumba, equipo);
            slotTumba++;
        }
        equipJugador.setEquipment(parte, undefined); 
    }

    // --- GESTION DE EXPERIENCIA (MARCA DE SEGURIDAD) ---
    const nivelActual = player.level || 0;
    const xpGuardada = Math.floor(nivelActual / 2);
    tumba.setDynamicProperty("xp_guardada", xpGuardada);

    // NUEVO: Usamos un TAG en lugar de propiedad dinámica para máxima estabilidad
    player.addTag("rikocraft:borrar_xp");
    // ---------------------------------------------------

    player.sendMessage(`§c[!] Has muerto. Tus cosas estan a salvo en X: ${pos.x}, Y: ${pos.y}, Z: ${pos.z}`);
    player.sendMessage(`§7Tienes exactamente §e24 horas reales §7para recuperarlas.`);
    player.playSound("random.toast");
}

// =============================================================================
// ⏱️ RADAR DE TUMBA Y CRONÓMETRO
// =============================================================================
export function obtenerTextoRadarTumba(player) {
    const hudTumba = player.getDynamicProperty("hud_tumba");
    if (!hudTumba) return null; // Si está en OFF, regresamos null (no hace nada)

    const posStr = player.getDynamicProperty("tumba_pos");
    const timestamp = player.getDynamicProperty("tumba_timestamp");
    if (!posStr || !timestamp) return null;

    const posTumba = JSON.parse(posStr);
    const tiempoPasado = Date.now() - timestamp;
    const limiteTiempo = 24 * 60 * 60 * 1000; // 24 horas en milisegundos

    // 1. VERIFICACIÓN DE CADUCIDAD (Si pasaron las 24 horas)
    if (tiempoPasado > limiteTiempo) {
        player.setDynamicProperty("hud_tumba", false); // Apagamos el radar
        player.sendMessage("§c[!] Tu tumba ha expirado después de 24 horas. Tus objetos se han perdido en el vacío.");
        
        // Buscamos la entidad vieja y la borramos por si sigue en el mundo
        const tumbaViejaId = player.getDynamicProperty("id_tumba_activa");
        if (tumbaViejaId) {
            try {
                const vieja = player.dimension.getEntity(tumbaViejaId);
                if (vieja) vieja.remove();
            } catch(e) {}
        }
        return null;
    }

    // 2. CALCULAR DISTANCIA EN BLOQUES
    let distancia = "???";
    // Calculamos solo si está en la misma dimensión (Overworld, Nether, etc.)
    const dx = player.location.x - posTumba.x;
    const dy = player.location.y - posTumba.y;
    const dz = player.location.z - posTumba.z;
    distancia = Math.floor(Math.sqrt(dx*dx + dy*dy + dz*dz));

    // 3. CALCULAR TIEMPO RESTANTE (Formato Horas:Minutos)
    const tiempoRestanteMs = limiteTiempo - tiempoPasado;
    const horas = Math.floor(tiempoRestanteMs / (1000 * 60 * 60));
    const minutos = Math.floor((tiempoRestanteMs % (1000 * 60 * 60)) / (1000 * 60));

    // DIBUJAMOS EL TEXTO FINAL DEL RADAR
    return `§cTUMBA A: §f${distancia}m §8- §e${horas}h ${minutos}m\n§cX: §f${posTumba.x} §cY: §f${posTumba.y} §cZ: §f${posTumba.z}`;
}

// =============================================================================
// ⛏️ RECUPERACIÓN DE TUMBA (Romper la lápida)
// =============================================================================
// =============================================================================
// RECUPERACION DE TUMBA (Romper la lapida)
// =============================================================================
export function intentarRomperTumba(player, tumba) {
    // 1. Verificamos si la tumba realmente le pertenece al jugador
    const miTumbaId = player.getDynamicProperty("id_tumba_activa");
    
    if (tumba.id !== miTumbaId) {
        // Si no es suya (y no es Admin), lo bloqueamos
        if (!player.hasTag("DIOS") && !player.hasTag("ADMIN")) {
            player.sendMessage("§c[!] Magia oscura te rechaza. Solo el dueño puede romper esta tumba.");
            player.playSound("mob.villager.no");
            return;
        }
    }

    // 2. RECUPERAR EXPERIENCIA (El 50% que guardamos al morir)
    const xpGuardada = tumba.getDynamicProperty("xp_guardada");
    if (xpGuardada && xpGuardada > 0) {
        player.addLevels(xpGuardada);
        player.sendMessage(`§a[!] Has recuperado ${xpGuardada} niveles de experiencia.`);
    }

    // 3. RECUPERAR ITEMS (Los escupimos al piso de forma segura)
    const invTumba = tumba.getComponent("inventory").container;
    const pos = tumba.location;
    const dim = tumba.dimension;
    
    for (let i = 0; i < invTumba.size; i++) {
        const item = invTumba.getItem(i);
        if (item) {
            // Hacemos que los ítems salgan exactamente encima de la lapida
            dim.spawnItem(item, { x: pos.x, y: pos.y + 0.5, z: pos.z });
        }
    }
    
    // 4. LIMPIEZA DEL SISTEMA
    tumba.remove(); // Desaparece la lapida 3D
    player.setDynamicProperty("hud_tumba", false); // Apagamos su radar
    player.setDynamicProperty("id_tumba_activa", undefined); // Borramos la memoria
    player.setDynamicProperty("tumba_pos", undefined);
    player.setDynamicProperty("tumba_timestamp", undefined);
    
    // Limpiamos cualquier rastro de la marca de borrado de XP por seguridad
    player.setDynamicProperty("xp_pendiente_borrar", undefined);
    
    // Efectos visuales y sonoros
    player.playSound("random.break");
    player.sendMessage("§a[!] Has recuperado tus cosas. La tumba se ha desvanecido.");
}

// =============================================================================
// FUNCIÓN DE ADMINISTRACIÓN: LIMPIEZA MANUAL
// =============================================================================
export function adminLimpiarTumbasCercanas(player) {
    // Solo permitimos que los administradores ejecuten esto
    if (!player.hasTag("DIOS") && !player.hasTag("ADMIN")) {
        player.sendMessage("§c[!] No tienes permiso para usar herramientas de limpieza.");
        return;
    }

    const entities = player.dimension.getEntities({
        type: "rikocraft:tumba",
        location: player.location,
        maxDistance: 10
    });

    if (entities.length === 0) {
        player.sendMessage("§e[!] No se encontraron tumbas en un radio de 10 bloques.");
        return;
    }

    for (const tumba of entities) {
        tumba.remove();
    }

    player.sendMessage(`§a[!] Se han eliminado ${entities.length} tumba(s) del area.`);
    player.playSound("random.explode");
}