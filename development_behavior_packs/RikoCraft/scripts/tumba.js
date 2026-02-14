import { world, system } from "@minecraft/server";

// =============================================================================
// 🪦 SISTEMA DE TUMBAS: CREACIÓN Y RESCATE DE ÍTEMS
// =============================================================================
export function crearTumbaJugador(player) {
    const dimension = player.dimension;
    // Guardamos las coordenadas exactas redondeadas
    const pos = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
    };

    // 1. ANTISATURACIÓN: Buscar y eliminar tumba vieja (si existe)
    const tumbaViejaId = player.getDynamicProperty("id_tumba_activa");
    if (tumbaViejaId) {
        try {
            const vieja = dimension.getEntity(tumbaViejaId);
            if (vieja) vieja.remove(); // ¡Puf! Borrada de la existencia
        } catch(e) {} // Si no la encuentra o ya no existe, no hace nada
    }

    // 2. CREACIÓN: Generar la nueva tumba 3D en el lugar de la muerte
    const tumba = dimension.spawnEntity("rikocraft:tumba", pos);
    tumba.nameTag = `§c☠ Tumba de ${player.name} ☠`;
    
    // Guardamos los datos vitales en el jugador
    player.setDynamicProperty("id_tumba_activa", tumba.id);
    player.setDynamicProperty("tumba_timestamp", Date.now()); // Reloj de 24 horas
    player.setDynamicProperty("tumba_pos", JSON.stringify(pos)); // Para el radar
    
    // 3. SECUESTRO DE HUD: Encendemos el radar
    player.setDynamicProperty("hud_tumba", true);

    // 4. MUDANZA DE ÍTEMS: Pasar todo a la tumba y vaciar al jugador
    const invJugador = player.getComponent("inventory").container;
    const equipJugador = player.getComponent("equippable");
    const invTumba = tumba.getComponent("inventory").container;

    let slotTumba = 0;

    // A) Pasamos el inventario normal
    for (let i = 0; i < invJugador.size; i++) {
        const item = invJugador.getItem(i);
        if (item) {
            invTumba.setItem(slotTumba, item);
            slotTumba++;
        }
    }
    invJugador.clearAll(); // Vaciamos el inventario normal del jugador

    // B) Pasamos la armadura y la mano izquierda (escudo/totem)
    const partesArmadura = ["Head", "Chest", "Legs", "Feet", "Offhand"];
    for (const parte of partesArmadura) {
        const equipo = equipJugador.getEquipment(parte);
        if (equipo) {
            invTumba.setItem(slotTumba, equipo);
            slotTumba++;
        }
        // Dejamos al jugador "desnudo"
        equipJugador.setEquipment(parte, undefined); 
    }

    // --- NUEVO: CASTIGO DE EXPERIENCIA (50%) ---
    const nivelActual = player.level || 0;
    const xpGuardada = Math.floor(nivelActual / 2); // Calculamos la mitad
    tumba.setDynamicProperty("xp_guardada", xpGuardada); // Guardamos la mitad en la lápida

    // Le borramos la experiencia al jugador de forma segura para que despierte en 0
    system.run(() => {
        try {
            player.runCommandAsync("xp -20000L @s"); // Borra todos los niveles
            player.runCommandAsync("xp -200000 @s"); // Borra los puntitos verdes sueltos
        } catch(e) {}
    });
    // -------------------------------------------

    // 5. NOTIFICACIÓN: Mensaje de chat frío y directo
    player.sendMessage(`§c☠ Has muerto. Tus cosas están a salvo en X: ${pos.x}, Y: ${pos.y}, Z: ${pos.z}`);
    player.sendMessage(`§7Tienes exactamente §e24 horas reales §7para recuperarlas o desaparecerán para siempre.`);
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
    return `§c☠ TUMBA A ${distancia}m ☠\n§7X: ${posTumba.x} Y: ${posTumba.y} Z: ${posTumba.z} §8| §e⏳ ${horas}h ${minutos}m`;
}