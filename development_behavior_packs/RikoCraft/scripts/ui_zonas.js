import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui"; 
import { CONFIG } from "./config.js";
import { getDatosMundo, setDatosMundo } from "./utils.js";

// =============================================================================
// GESTOR DE ZONAS (VERSION EXACTA 3D - SIN EMOJIS)
// =============================================================================

// --- FUNCIONES DE BASE DE DATOS ---

// Obtiene la lista actual de zonas guardadas
export function getZonas() {
    return getDatosMundo(CONFIG.DB_ZONAS) || [];
}

// Guarda la lista actualizada de zonas
export function saveZonas(zonas) {
    setDatosMundo(CONFIG.DB_ZONAS, zonas);
}

// --- FUNCIONES DE CREACIÓN Y GESTIÓN ---

// --- CREAR ZONA (ACTUALIZADO: ACEPTA BORDES) ---
export function crearZonaProtegida(player, nombre, pos1, pos2, opciones) {
    const x1 = Math.floor(pos1.x); const x2 = Math.floor(pos2.x);
    const y1 = Math.floor(pos1.y); const y2 = Math.floor(pos2.y);
    const z1 = Math.floor(pos1.z); const z2 = Math.floor(pos2.z);

    const min = { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) };
    const max = { x: Math.max(x1, x2), y: Math.max(y1, y2), z: Math.max(z1, z2) };

    const nuevaZona = {
        id: Date.now().toString(), nombre: nombre, min: min, max: max,
        flags: {
            pvp: opciones.pvp, 
            abrir_cofres: opciones.cofres, 
            uso_puertas: opciones.puertas, 
            efectos_clan: opciones.efectos, 
            mobs_hostiles: opciones.hostiles, 
            mobs_pasivos: opciones.pasivos,
            mostrar_bordes: opciones.bordes ?? true // <--- AHORA SÍ HACE CASO AL MENÚ
        }
    };
    const zonas = getZonas(); zonas.push(nuevaZona); saveZonas(zonas);
    return nuevaZona;
}

// Busca si el jugador esta dentro de una zona
export function obtenerZonaActual(player) {
    const zonas = getZonas(); 
    const pos = player.location; 
    
    // Redondeamos la posicion del jugador para comparar con la zona
    const x = Math.floor(pos.x); 
    const y = Math.floor(pos.y); 
    const z = Math.floor(pos.z);
    
    return zonas.find(zona => { 
        return (x >= zona.min.x && x <= zona.max.x && 
                y >= zona.min.y && y <= zona.max.y && 
                z >= zona.min.z && z <= zona.max.z); 
    });
}

// Borra una zona de la base de datos
export function borrarZona(id) { 
    let zonas = getZonas(); 
    zonas = zonas.filter(z => z.id !== id); 
    saveZonas(zonas); 
}

// --- FUNCIONES VISUALES Y DE LIMPIEZA ---

// Dibuja las particulas que marcan los limites de la zona
function dibujarBordes(dimension, min, max) {
    try {
        const particle = "minecraft:villager_happy"; 
        
        // Sumamos 1 al maximo visualmente para que la particula abrace el bloque completo
        const minX = min.x; const maxX = max.x + 1.0; 
        const minY = min.y; const maxY = max.y + 1.0;
        const minZ = min.z; const maxZ = max.z + 1.0;

        // Dibujamos el "Piso" (Base)
        for (let x = minX; x <= maxX; x+=2) {
            dimension.spawnParticle(particle, { x: x, y: minY, z: minZ });
            dimension.spawnParticle(particle, { x: x, y: minY, z: maxZ });
        }
        for (let z = minZ; z <= maxZ; z+=2) {
            dimension.spawnParticle(particle, { x: minX, y: minY, z: z });
            dimension.spawnParticle(particle, { x: maxX, y: minY, z: z });
        }

        // Dibujamos el "Techo" (Tope)
        for (let x = minX; x <= maxX; x+=2) {
            dimension.spawnParticle(particle, { x: x, y: maxY, z: minZ });
            dimension.spawnParticle(particle, { x: x, y: maxY, z: maxZ });
        }
        for (let z = minZ; z <= maxZ; z+=2) {
            dimension.spawnParticle(particle, { x: minX, y: maxY, z: z });
            dimension.spawnParticle(particle, { x: maxX, y: maxY, z: z });
        }

        // Dibujamos las 4 columnas de las esquinas
        for (let y = minY; y <= maxY; y+=2) {
            dimension.spawnParticle(particle, { x: minX, y: y, z: minZ });
            dimension.spawnParticle(particle, { x: maxX, y: y, z: minZ });
            dimension.spawnParticle(particle, { x: minX, y: y, z: maxZ });
            dimension.spawnParticle(particle, { x: maxX, y: y, z: maxZ });
        }
    } catch(e) {}
}

// Sistema automatico que elimina mobs prohibidos dentro de las zonas
export function iniciarCicloLimpiezaZonas() {
    system.runInterval(() => {
        const zonas = getZonas();
        if (zonas.length === 0) return;

        let dimension = world.getDimension("minecraft:overworld");
        if (!dimension) dimension = world.getDimension("overworld");
        if (!dimension) return;

        // 1. DIBUJAR BORDES
        zonas.forEach(zona => {
            if (zona.flags && zona.flags.mostrar_bordes === true) {
                try { dibujarBordes(dimension, zona.min, zona.max); } catch(e){}
            }
        });

        // 2. LIMPIEZA DE MOBS
        const entidades = dimension.getEntities();
        
        for (const ent of entidades) {
            if (ent.typeId === "minecraft:player") continue;

            try {
                // IMPORTANTE: Redondeamos coordenadas del mob para coincidir con la zona
                const x = Math.floor(ent.location.x);
                const y = Math.floor(ent.location.y);
                const z = Math.floor(ent.location.z);

                const zona = zonas.find(zone => 
                    x >= zone.min.x && x <= zone.max.x &&
                    y >= zone.min.y && y <= zone.max.y && // Verificacion de Altura Exacta
                    z >= zone.min.z && z <= zone.max.z
                );

                if (zona && zona.flags) {
                    
                    // A. MOBS HOSTILES
                    if (zona.flags.mobs_hostiles === false) {
                        // Lista completa de mobs peligrosos
                        const esHostil = 
                            ent.typeId.includes("zombie") || ent.typeId.includes("skeleton") || 
                            ent.typeId.includes("creeper") || ent.typeId.includes("spider") || 
                            ent.typeId.includes("phantom") || ent.typeId.includes("blaze") || 
                            ent.typeId.includes("slime") || ent.typeId.includes("witch") ||
                            ent.typeId.includes("drowned") || ent.typeId.includes("husk") || 
                            ent.typeId.includes("pillager") || ent.typeId.includes("ravager") || 
                            ent.typeId.includes("hoglin") || ent.typeId.includes("zoglin") || 
                            ent.typeId.includes("piglin") || ent.typeId.includes("ghast") || 
                            ent.typeId.includes("magma") || ent.typeId.includes("enderman") ||
                            ent.typeId.includes("vex") || ent.typeId.includes("vindicator") || 
                            ent.typeId.includes("evoker") || ent.typeId.includes("shulker") ||
                            ent.typeId.includes("wither") || ent.typeId.includes("warden");
                        
                        if (esHostil && !ent.nameTag) {
                            try {
                                dimension.spawnParticle("minecraft:lava_particle", ent.location);
                                ent.remove();
                            } catch(e) {}
                        }
                    }

                    // B. MOBS PASIVOS
                    if (zona.flags.mobs_pasivos === false) {
                         const esPasivo = 
                            ent.typeId.includes("cow") || ent.typeId.includes("pig") || 
                            ent.typeId.includes("sheep") || ent.typeId.includes("chicken") ||
                            ent.typeId.includes("horse") || ent.typeId.includes("donkey") ||
                            ent.typeId.includes("mule") || ent.typeId.includes("llama") || 
                            ent.typeId.includes("goat") || ent.typeId.includes("rabbit") || 
                            ent.typeId.includes("fox") || ent.typeId.includes("panda");
                         
                         if (esPasivo && !ent.nameTag) {
                            try {
                                dimension.spawnParticle("minecraft:smoke_particle", ent.location);
                                ent.remove();
                            } catch(e) {}
                        }
                    }
                }
            } catch (error) { continue; }
        }
    }, 20); // Ejecutar cada segundo (20 ticks)
}

// --- MENUS DE INTERFAZ (UI) ---

// Menu para borrar zonas con confirmacion de seguridad
export function menuBorrarZona(player) {
    let intentos = 0; 
    let procesando = false; 
    
    const runner = system.runInterval(() => {
        intentos++; 
        // Si tarda mucho (200 ticks), cancelamos para no saturar memoria
        if (intentos > 200) { system.clearRun(runner); return; } 
        if (procesando) return;

        const zonas = getZonas(); 
        if (zonas.length === 0) { 
            system.clearRun(runner); 
            player.sendMessage("§c[!] No hay zonas protegidas para borrar."); 
            return; 
        }

        const form = new ActionFormData()
            .title("Eliminar Zona")
            .body("Selecciona la zona que deseas eliminar permanentemente:\n(Esta accion no se puede deshacer)");

        zonas.forEach(z => {
            // Boton: Nombre en negrita + Coordenadas en color negro (visible)
            // Icono: Basura
            form.button(`§l${z.nombre}\n§r§0[ ${z.min.x}, ${z.min.y}, ${z.min.z} ]`, "textures/ui/trash");
        });

        procesando = true;

        form.show(player).then(r => {
            if (r.canceled && r.cancelationReason === "UserBusy") { 
                procesando = false; 
                return; 
            }
            system.clearRun(runner); 
            if (r.canceled) return;

            const zonaSeleccionada = zonas[r.selection];

            // Ventana de Confirmacion
            const confirm = new ActionFormData()
                .title(`Borrar ${zonaSeleccionada.nombre}?`)
                .body(`CUIDADO!\nEstas a punto de eliminar la proteccion en:\nX: ${zonaSeleccionada.min.x}, Y: ${zonaSeleccionada.min.y}, Z: ${zonaSeleccionada.min.z}\n\nEstas seguro?`)
                .button("SI, ELIMINAR", "textures/ui/check") 
                .button("CANCELAR", "textures/ui/cancel");

            system.run(() => {
                confirm.show(player).then(res => {
                    if (res.selection === 0) {
                        borrarZona(zonaSeleccionada.id);
                        player.sendMessage(`§a[OK] Zona "${zonaSeleccionada.nombre}" eliminada correctamente.`);
                        player.playSound("random.break");
                    } else {
                        player.sendMessage("§e[!] Operacion cancelada.");
                    }
                });
            });
        });
    }, 5); 
}

// --- MENÚ EDITAR ZONA (VERSIÓN: STRICT OPTIONS) ---
export function menuEditarZona(player) {
    let intentos = 0; let procesando = false; 
    
    const runner = system.runInterval(() => {
        intentos++; 
        if (intentos > 200) { system.clearRun(runner); return; } 
        if (procesando) return;

        const zonas = getZonas(); 
        if (zonas.length === 0) { 
            system.clearRun(runner); 
            player.sendMessage("§cNo hay zonas."); 
            return; 
        }
        
        const form = new ActionFormData().title("Editar Zona").body("Selecciona una Zona protegida que desees editar su configuracion y permisos:");
        zonas.forEach(z => {
            form.button(`§l${z.nombre}\n§r§0[ Configurar ]`, "textures/ui/settings_glyph_color_2x");
        });
        
        procesando = true;
        
        form.show(player).then(r => {
            if (r.canceled && r.cancelationReason === "UserBusy") { 
                procesando = false; 
                return; 
            }
            system.clearRun(runner); 
            if (r.canceled) return;

            const i = r.selection; 
            const z = zonas[i]; 
            const f = z.flags || {};
            
            const nombreActual = z.nombre ? String(z.nombre) : "";

            // AQUI EL CAMBIO: Usamos { defaultValue: valor } en TODO
            const edit = new ModalFormData()
                .title(`Config: ${z.nombre}`)
                // TextField: Label, Placeholder, Opciones
                .textField("Nombre:", "Ej: Lobby", { defaultValue: nombreActual }) 
                // Toggles: Label, Opciones
                .toggle("Ver Bordes (Admin)", { defaultValue: f.mostrar_bordes ?? false }) 
                .toggle("PvP", { defaultValue: f.pvp ?? false })
                .toggle("Cofres", { defaultValue: f.abrir_cofres ?? false })
                .toggle("Puertas", { defaultValue: f.uso_puertas ?? true })
                .toggle("Efectos", { defaultValue: f.efectos_clan ?? true })
                .toggle("Mobs Hostiles", { defaultValue: f.mobs_hostiles ?? false })
                .toggle("Mobs Pasivos", { defaultValue: f.mobs_pasivos ?? false });
                
            system.run(() => {
                edit.show(player).then(res => {
                    if (res.canceled) return;
                    
                    zonas[i].nombre = res.formValues[0];
                    zonas[i].flags = { 
                        mostrar_bordes: res.formValues[1],
                        pvp: res.formValues[2], 
                        abrir_cofres: res.formValues[3], 
                        uso_puertas: res.formValues[4], 
                        efectos_clan: res.formValues[5], 
                        mobs_hostiles: res.formValues[6], 
                        mobs_pasivos: res.formValues[7] 
                    };
                    saveZonas(zonas); 
                    player.sendMessage("§aConfiguración Actualizada.");
                    player.playSound("random.levelup");
                });
            });
        });
    }, 5); 
}