//HOLA 

import { world, system } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { iniciarCinematica } from "./cinematica.js";
import { mostrarMenuPrincipal } from "./ui_menus.js"; 
import { menuClanes, getClanDeJugador } from "./ui_clanes.js";
import { crearTumbaJugador } from "./tumba.js";
import { menuTierras, puedeInteractuar, iniciarVigilancia, obtenerTierraEnPos } from "./ui_tierras.js";
import { crearZonaProtegida, obtenerZonaActual, menuBorrarZona, iniciarCicloLimpiezaZonas, menuEditarZona } from "./ui_zonas.js";
import { getSaldo, setSaldo, getCacheDinero, buscarJugador, VENTAS_PENDIENTES, formatoDorado, getDatosMundo, getConfigVar, setDatosMundo, 
    obtenerConfigEfectos, calcularCostoNivel } from "./utils.js";

// =============================================================================
// 🧠 CEREBRO PRINCIPAL (Eventos)
// =============================================================================

// --- 1. ACTION BAR (CONFIGURABLE) ---
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        
        // --- FIX DE CONFLICTO: PAUSA INTELIGENTE ---
        // Si el jugador recibió un mensaje importante (XP, Alerta),
        // el HUD se detiene unos segundos para dejar leerlo.
        const pausaHasta = player.getDynamicProperty("hud_pausa") || 0;
        if (Date.now() < pausaHasta) continue; // Si está en pausa, saltamos y no mostramos el HUD
        
        // Leemos la preferencia (0=Off, 1=Dinero, 2=Clan, 3=Ambos)
        // Si no tiene pref, usamos 1 (Dinero) por defecto
        const pref = player.getDynamicProperty("hud_mode") ?? 1;

        if (pref === 0) continue; // Apagado

        let texto = "";
        const saldo = getSaldo(player);
        const clan = getClanDeJugador(player.name);

        // OPCIÓN 1: SOLO DINERO
        if (pref === 1) { 
            texto = `§6${CONFIG.SIMBOLO} ${saldo} ${CONFIG.MONEDA}`;
        } 
        // OPCIÓN 2: SOLO CLAN
        else if (pref === 2) { 
            if (clan) texto = `§b${clan.tag} Nvl ${clan.nivel} | XP ${clan.xp}`;
            else texto = `§7[Sin Clan]`;
        } 
        // OPCIÓN 3: AMBOS (Uno encima del otro)
        else if (pref === 3) { 
            // Parte de arriba: Clan o "Sin Clan"
            const infoClan = clan ? `§b${clan.tag} Nvl ${clan.nivel} | XP ${clan.xp}` : `§7[Sin Clan]`;
            // Parte de abajo: Dinero
            const infoDinero = `§6${CONFIG.SIMBOLO} ${saldo} ${CONFIG.MONEDA}`;
            
            // Unimos con salto de linea
            texto = `${infoClan}\n${infoDinero}`;
        }

        player.onScreenDisplay.setActionBar(texto);
    }
}, 15); // 20 ticks = 1 segundo


// --- 2. BIENVENIDA ---
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;
    if (event.initialSpawn) {
        if (!player.hasTag(CONFIG.TAG_VETERANO)) {
            world.sendMessage(`§b¡Bienvenido ${player.name} a RikoCraft Temp 9!`);
            player.addTag(CONFIG.TAG_VETERANO);
        } else {
            player.sendMessage(`§aBienvenido de nuevo, ${player.name}`);
        }
    }
});

// --- 3. DETECTOR DE CINEMÁTICA ---
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        if (player.hasTag("inicia_intro")) {
            player.removeTag("inicia_intro");
            // Verificamos si la API de cámara está disponible
            if (player.camera) {
                iniciarCinematica(player); 
            } else {
                player.sendMessage("§c[ERROR] No se detecta la cámara. Activa 'Experimentos de Cámara'.");
            }
        }
    }
}, 5);

// --- 4. CHAT, CLANES Y COMANDOS ---
world.beforeEvents.chatSend.subscribe((event) => {
    const player = event.sender;
    const message = event.message.trim();

    // ---> COMANDOS DE ADMIN PARA CREAR ZONAS (x.pos1, x.pos2, x.proteger) <---
    if (player.hasTag(CONFIG.TAG_ADMIN)) {
        if (message === "x.pos1") {
            event.cancel = true;
            const pos = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
            player.setDynamicProperty("temp_pos1", JSON.stringify(pos));
            system.run(() => player.sendMessage(`§a[1/3] Esquina A guardada: ${pos.x}, ${pos.y}, ${pos.z}. Ve a la opuesta y escribe x.pos2`));
            return;
        }

        if (message === "x.pos2") {
            event.cancel = true;
            const pos = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
            player.setDynamicProperty("temp_pos2", JSON.stringify(pos));
            system.run(() => player.sendMessage(`§a[2/3] Esquina B guardada: ${pos.x}, ${pos.y}, ${pos.z}. Ahora escribe x.proteger`));
            return;
        }

        if (message === "x.proteger") {
        event.cancel = true;
        
        const p1Str = player.getDynamicProperty("temp_pos1");
        const p2Str = player.getDynamicProperty("temp_pos2");

        if (!p1Str || !p2Str) return player.sendMessage("§cFalta definir x.pos1 o x.pos2.");

        player.sendMessage("§e[!] Cierra el chat para configurar la Zona...");

        let intentos = 0;
        let procesando = false;

        const runner = system.runInterval(() => {
            intentos++;
            if (intentos > 200) {
                system.clearRun(runner);
                player.sendMessage("§c[!] Tiempo agotado.");
                return;
            }
            if (procesando) return;

            // --- FORMULARIO CON BORDES AGREGADO ---
            const form = new ModalFormData()
                .title("Configurar Zona 3D")
                .textField("Nombre de la Zona:", "Ej: Lobby PvP")
                .toggle("Ver Bordes (Admin)", { defaultValue: true }) // [1] NUEVO
                .toggle("PVP Activado", { defaultValue: false })      // [2]
                .toggle("Abrir Cofres", { defaultValue: false })      // [3]
                .toggle("Usar Puertas", { defaultValue: true })       // [4]
                .toggle("Efectos de Clan", { defaultValue: true })    // [5]
                .toggle("Mobs Hostiles", { defaultValue: false })     // [6]
                .toggle("Mobs Pasivos", { defaultValue: false });     // [7]

            procesando = true;

            form.show(player).then(r => {
                if (r.canceled && r.cancelationReason === "UserBusy") {
                    procesando = false; 
                    return; 
                }
                system.clearRun(runner);
                if (r.canceled) return;

                const nombre = r.formValues[0] || "Zona Sin Nombre";
                
                // Empaquetamos las opciones (OJO AL ORDEN DE LOS NUMEROS)
                const opciones = {
                    bordes: r.formValues[1],   // Nuevo valor
                    pvp: r.formValues[2],
                    cofres: r.formValues[3],
                    puertas: r.formValues[4],
                    efectos: r.formValues[5],
                    hostiles: r.formValues[6],
                    pasivos: r.formValues[7]
                };

                // Enviamos todo a ui_zonas.js
                crearZonaProtegida(player, nombre, JSON.parse(p1Str), JSON.parse(p2Str), opciones);
                
                player.sendMessage(`§e[OK] Zona "${nombre}" creada.`);
                player.sendMessage(`§7Bordes:${opciones.bordes ? "§aON" : "§cOFF"} | PvP:${opciones.pvp ? "§aON" : "§cOFF"} | Mobs:${opciones.hostiles ? "§aON" : "§cOFF"}`);
                player.playSound("random.levelup");
            });

        }, 5);
        return;
    }
        if (message === "x.borrar") {
            event.cancel = true;
            player.sendMessage("§e[!] Cierra el chat para eliminar zonas...");
            // Llamamos directo, la función ya tiene su propio loop ninja
            menuBorrarZona(player);
            return;
        }

        if (message === "x.editar") {
            event.cancel = true;
            player.sendMessage("§e[!] Cierra el chat para editar zonas...");
            menuEditarZona(player);
            return;
        }
    }

    // ⛔ A. SISTEMA DE MUTE INTELIGENTE (Tiempo y Permanente)
    
    // 1. Verificar Mute Temporal
    const muteHasta = player.getDynamicProperty("mute_expiracion");
    if (muteHasta && Date.now() < muteHasta) {
        const segundosRestantes = Math.ceil((muteHasta - Date.now()) / 1000);
        const minutos = Math.floor(segundosRestantes / 60);
        event.cancel = true;
        player.sendMessage(`§cEstás silenciado temporalmente. Tiempo restante: ${minutos}m ${segundosRestantes % 60}s.`);
        return;
    } else if (muteHasta && Date.now() >= muteHasta) {
        // El tiempo ya pasó, limpiamos la marca automáticamente
        player.setDynamicProperty("mute_expiracion", undefined);
    }

    // 2. Verificar Mute Permanente (Tag)
    if (player.hasTag("silenciado")) {
        event.cancel = true;
        player.sendMessage("§cEstás silenciado indefinidamente por un administrador.");
        return;
    }

    // 3. Verificar Mute Global
    const chatMuteado = world.getDynamicProperty("chat_muteado");
    if (chatMuteado && !player.hasTag(CONFIG.TAG_ADMIN)) {
        event.cancel = true;
        player.sendMessage("§cEl chat está desactivado globalmente.");
        return;
    }
    
    // 🕵️ B. CHAT DE CLAN PRIVADO (Comienza con punto)
    if (message.startsWith(".")) {
        event.cancel = true;
        const contenido = message.substring(1).trim();
        if (contenido.length === 0) return;

        const clan = getClanDeJugador(player.name);
        if (!clan) {
            system.run(() => player.sendMessage("§cNo tienes clan para usar el chat privado (.)"));
            return;
        }

        system.run(() => {
            // Obtenemos a TODOS los jugadores
            const todos = world.getPlayers();
            
            for (const p of todos) {
                const esMiembro = clan.miembros.includes(p.name);
                const esAdmin = p.hasTag(CONFIG.TAG_ADMIN);

                // ENVIAR SI: Es miembro del clan O es Admin (Modo Espía)
                if (esMiembro || esAdmin) {
                    
                    // --- CAMBIO 1: NOMBRE DEL CLAN EN LUGAR DE [CLAN] ---
                    // Usamos el nombre real del clan en mayúsculas
                    let prefijo = `§b[${clan.nombre.toUpperCase()} PRIVADO]`;
                    
                    // Si soy Admin y no soy del clan, me avisa que es mensaje espía
                    if (esAdmin && !esMiembro) prefijo = `§7[ESPÍA-${clan.tag}]`;

                    p.sendMessage(`${prefijo} §b${player.name}: §f${contenido}`);
                }
            }
        });
        return;
    }

    // C. CHAT PÚBLICO
    if (!message.startsWith(CONFIG.PREFIJO) && !event.cancel) {
        const clan = getClanDeJugador(player.name);
        if (clan) {
            event.cancel = true;
            
            // --- CAMBIO 2: SIEMPRE COLOR ORIGINAL (ADIÓS DORADO NIVEL 10) ---
            let tagDisplay = `${clan.color}${clan.tag}§r`;
            
            // Eliminamos la línea que forzaba el formatoDorado para nivel 10+
            // if (clan.nivel >= 10) tagDisplay = formatoDorado(clan.tag); <--- BORRADO
            
            system.run(() => world.sendMessage(`${tagDisplay} §7${player.name}: §f${message}`));
            return;
        }
    }

    // ---> CASO A: DETECTOR DEL MENÚ PRINCIPAL (@menu) <---
    if (message.toLowerCase() === `${CONFIG.PREFIJO}menu`) {
        event.cancel = true; // Evita que salga "@menu" en el chat público
        
        // Usamos system.run para poder abrir la ventana (UI)
        system.run(() => {
             mostrarMenuPrincipal(player);
        });
        return;
    }

    // ---> CASO B: COMANDO VER SALDO (@saldo) <---
    if (message === `${CONFIG.PREFIJO}saldo`) {
        event.cancel = true;
        system.run(() => {
            const saldo = getSaldo(player);
            player.sendMessage(`§e${CONFIG.HEADER} Banco RikoCraft ${CONFIG.HEADER}\n§fTu saldo: §6${CONFIG.SIMBOLO} ${saldo} ${CONFIG.MONEDA}`);
        });
        return;
    }

    // ---> CASO D: COMANDOS DE ADMIN (@addRP, @delRP, @setRP) <---
    if (message.startsWith(`${CONFIG.PREFIJO}addRP`) || message.startsWith(`${CONFIG.PREFIJO}delRP`) || message.startsWith(`${CONFIG.PREFIJO}setRP`)) {
        
        if (!player.hasTag(CONFIG.TAG_ADMIN)) {
            player.sendMessage("§cNo tienes permisos de Administrador.");
            return; 
        }

        event.cancel = true;
        const args = message.split(" ");
        const comando = args[0];
        
        if (args.length < 3) {
            player.sendMessage(`§eUso: ${comando} <jugador> <cantidad>`);
            return;
        }

        system.run(() => {
            const objetivo = buscarJugador(args[1]);
            const cantidad = parseInt(args[2]);

            if (!objetivo) return player.sendMessage(`§cJugador no encontrado.`);
            if (isNaN(cantidad)) return player.sendMessage("§cNúmero inválido.");

            const saldoActual = getSaldo(objetivo);
            let nuevoSaldo = 0;

            if (comando === `${CONFIG.PREFIJO}addRP`) {
                nuevoSaldo = saldoActual + cantidad;
                player.sendMessage(`§aAñadido: ${cantidad} a ${objetivo.name}.`);
                objetivo.sendMessage(`§a¡Recibiste un bono de admin: ${CONFIG.SIMBOLO} ${cantidad}!`);
            } 
            else if (comando === `${CONFIG.PREFIJO}delRP`) {
                nuevoSaldo = saldoActual - cantidad;
                player.sendMessage(`§cQuitado: ${cantidad} a ${objetivo.name}.`);
                objetivo.sendMessage(`§cAdmin retiró ${CONFIG.SIMBOLO} ${cantidad} de tu cuenta.`);
            } 
            else if (comando === `${CONFIG.PREFIJO}setRP`) {
                nuevoSaldo = cantidad;
                player.sendMessage(`§eFijado: Saldo de ${objetivo.name} es ahora ${cantidad}.`);
                objetivo.sendMessage(`§eTu saldo se actualizó a ${CONFIG.SIMBOLO} ${cantidad}.`);
            }

            setSaldo(objetivo, nuevoSaldo);
        });
    }

    // ---> ACEPTAR VENTA (@aceptar) <---
    if (message.toLowerCase() === `${CONFIG.PREFIJO}aceptar`) {
        event.cancel = true;
        
        system.run(() => {
            // A. Verificar si tiene una oferta esperando
            if (!VENTAS_PENDIENTES.has(player.name)) {
                player.sendMessage("§c[!] No tienes ninguna oferta de compra pendiente.");
                return;
            }

            const venta = VENTAS_PENDIENTES.get(player.name);
            const vendedor = buscarJugador(venta.vendedor);

            // B. Verificar si el vendedor sigue conectado
            // (Necesario para darle el dinero)
            if (!vendedor) {
                player.sendMessage("§c[!] El vendedor se desconectó. La oferta ha sido cancelada.");
                // Nota: El item volverá al vendedor cuando se reconecte o expire el timer, 
                // pero por seguridad cancelamos la compra ahora.
                VENTAS_PENDIENTES.delete(player.name); 
                return;
            }

            // C. Verificar Dinero
            const saldoComprador = getSaldo(player);
            if (saldoComprador < venta.precio) {
                player.sendMessage(`§c[!] No tienes suficiente dinero. Costo: ${CONFIG.SIMBOLO} ${venta.precio} ${CONFIG.MONEDA}`);
                return;
            }

            // --- EJECUTAR TRANSACCIÓN ---

            // 1. Mover Dinero
            setSaldo(player, saldoComprador - venta.precio);
            setSaldo(vendedor, getSaldo(vendedor) + venta.precio);

            // 2. Entregar Item al Comprador
            const inventario = player.getComponent("inventory").container;
            // Intentamos meter el item al inventario
            const sobrante = inventario.addItem(venta.itemStack);
            
            // Si el inventario estaba lleno (sobrante no es undefined), lo tiramos al suelo
            if (sobrante) {
                player.dimension.spawnItem(venta.itemStack, player.location);
                player.sendMessage("§e[!] Tu inventario estaba lleno. Los objetos cayeron en tus pies.");
            }

            // 3. Borrar la venta pendiente (para que el timer no devuelva el item)
            VENTAS_PENDIENTES.delete(player.name);

            // 4. Notificaciones y Sonidos
            player.sendMessage(`§k5§r §l§a[COMPRADO] §r§a¡Compra exitosa! Has recibido tus objetos.`);
            player.playSound("random.levelup");

            vendedor.sendMessage(`§k5§r §l§a[VENDIDO] §r§a¡${player.name} aceptó tu oferta!`);
            vendedor.sendMessage(`§fHas recibido: §e${CONFIG.SIMBOLO} ${venta.precio} ${CONFIG.MONEDA}`);
            vendedor.playSound("random.orb");
        });
        return;
    }

    // ---> 3. RECHAZAR VENTA (@rechazar) OPCIONAL <---
    if (message.toLowerCase() === `${CONFIG.PREFIJO}rechazar`) {
        event.cancel = true;
        system.run(() => {
             if (VENTAS_PENDIENTES.has(player.name)) {
                 const venta = VENTAS_PENDIENTES.get(player.name);
                 const vendedor = buscarJugador(venta.vendedor);
                 
                 // Devolvemos el item al vendedor inmediatamente
                 if (vendedor) {
                     const inv = vendedor.getComponent("inventory").container;
                     inv.addItem(venta.itemStack);
                     vendedor.sendMessage(`§c[!] ${player.name} rechazó la oferta. Los objetos se te han devuelto.`);
                 }
                 
                 VENTAS_PENDIENTES.delete(player.name);
                 player.sendMessage("§c[!] Has rechazado la oferta.");
             } else {
                 player.sendMessage("§cNo tienes ofertas.");
             }
        });
        return;
    }
});

// =============================================================================
// 🪄 ATAJO: ABRIR MENÚ CON STICK
// =============================================================================
world.beforeEvents.itemUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;

    // Solo si es un STICK (Palo)
    if (item.typeId === "minecraft:stick") {
        system.run(() => {
            player.playSound("random.pop");
            mostrarMenuPrincipal(player);
        });
    }
});

// =============================================================================
// 🛡️ SISTEMA DE PROTECCIÓN (Anti-Griefing)
// =============================================================================

// 1. BLOQUEAR ROMPER BLOQUES (JERARQUÍA: ZONA ADMIN > TIERRA JUGADOR)
world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const player = event.player;
    if (player.hasTag(CONFIG.TAG_ADMIN)) return; // Dios rompe todo

    // A. REVISIÓN SUPREMA: ¿ESTÁ EN ZONA ADMIN?
    const zonaAdmin = obtenerZonaActual(player);
    if (zonaAdmin) {
        const bloque = event.block.typeId;
        const flags = zonaAdmin.flags || {}; // Leemos las opciones

        // 1. ¿Es una PUERTA/BOTÓN/PALANCA?
        const esPuerta = bloque.includes("door") || bloque.includes("button") || bloque.includes("lever") || bloque.includes("pressure_plate") || bloque.includes("gate");
        
        if (esPuerta) {
            // Si la flag 'uso_puertas' es TRUE, dejamos pasar (return)
            // Si es FALSE, bloqueamos.
            if (flags.uso_puertas === true) return; 
        }

        // 2. ¿Es un COFRE/CONTENEDOR?
        const esCofre = bloque.includes("chest") || bloque.includes("shulker") || bloque.includes("barrel") || bloque.includes("hopper") || bloque.includes("dropper") || bloque.includes("dispenser");

        if (esCofre) {
            // Si la flag 'abrir_cofres' es TRUE, dejamos pasar
            if (flags.abrir_cofres === true) return;
        }

        // Si llegamos aquí, es que NO estaba permitido interactuar con ese bloque.
        event.cancel = true;
        system.run(() => {
            player.onScreenDisplay.setActionBar(`§cProtegido: ${zonaAdmin.nombre}`);
            player.setDynamicProperty("hud_pausa", Date.now() + 2500);
        });
        return;
    } // <--- ¡AQUÍ ESTÁ LA CORRECCIÓN! Faltaba cerrar el bloque if (zonaAdmin)

    // B. REVISIÓN SECUNDARIA: ¿ES PROPIEDAD DE OTRO JUGADOR?
    const x = Math.floor(event.block.location.x);
    const y = Math.floor(event.block.location.y); // <--- NUEVO: Obtenemos la Y
    const z = Math.floor(event.block.location.z);
    
    // Importamos puedeInteractuar de ui_tierras.js
    if (!puedeInteractuar(player, x, z, y)) { // <--- NUEVO: Enviamos la Y a la función
        event.cancel = true;
        
        // Obtenemos los datos de la tierra para saber quién es el dueño
        const tierra = obtenerTierraEnPos(x, z);
        const dueño = tierra ? tierra.owner : "Desconocido";

        system.run(() => {
            player.onScreenDisplay.setActionBar(`§c§lPROPIEDAD DE: §e${dueño.toUpperCase()}`);
            player.setDynamicProperty("hud_pausa", Date.now() + 2500); // 2.5 Segundos de pausa
        });
    }
});

// 2. BLOQUEAR PONER BLOQUES / ABRIR COFRES / PUERTAS
// INTENTO HÍBRIDO: Detectamos si tu versión usa 'itemUseOn' o 'playerInteractWithBlock'
const eventoInteraccion = world.beforeEvents.itemUseOn || world.beforeEvents.playerInteractWithBlock;

if (eventoInteraccion) {
    eventoInteraccion.subscribe((event) => {
        // Truco de compatibilidad: A veces se llama 'source', a veces 'player'
        const player = event.source || event.player;
        
        if (player.hasTag(CONFIG.TAG_ADMIN)) return;

        // A. REVISIÓN SUPREMA: ¿ESTÁ EN ZONA ADMIN? (Nuevo sistema 3D)
        const zonaAdmin = obtenerZonaActual(player);
        if (zonaAdmin) {
            event.cancel = true;
            system.run(() => {
                player.onScreenDisplay.setActionBar(`§cProtegido: ${zonaAdmin.nombre}`);
                player.setDynamicProperty("hud_pausa", Date.now() + 2500);
            });
            return; // ¡ALTO! Si está en zona admin, bloqueamos todo aquí.
        }

        // B. REVISIÓN SECUNDARIA: ¿ES PROPIEDAD DE OTRO JUGADOR? (Sistema Tierras)
        const x = Math.floor(event.block.location.x);
        const y = Math.floor(event.block.location.y); // <--- NUEVO: Obtenemos la Y
        const z = Math.floor(event.block.location.z);

        // Enviamos la X, Z y la nueva Y a nuestra función maestra
        if (!puedeInteractuar(player, x, z, y)) { 
            event.cancel = true;

            const tierra = obtenerTierraEnPos(x, z);
            const dueño = tierra ? tierra.owner : "Desconocido";

            system.run(() => {
                player.onScreenDisplay.setActionBar(`§c§lPROPIEDAD DE: §e${dueño.toUpperCase()}`);
                player.setDynamicProperty("hud_pausa", Date.now() + 2500);
            });
        }
    });
}

// ACTIVAR SISTEMA DE SEGURIDAD
iniciarVigilancia();

// Activar el conserje de zonas (Mobs/Efectos)
iniciarCicloLimpiezaZonas();

// =============================================================================
// 🥊 SISTEMA DE ZONAS SEGURAS (MÉTODO DE EFECTOS - COMPATIBLE 100%)
// =============================================================================
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const zona = obtenerZonaActual(player);

        // CASO A: ESTÁ EN ZONA SEGURA (PVP OFF)
        if (zona && zona.flags && zona.flags.pvp === false) {
            
            // 1. RESISTENCIA 255 (Inmortalidad)
            // Ponemos 600 ticks (30 segundos) para que NO parpadee nunca
            try {
                player.addEffect("resistance", 600, { amplifier: 255, showParticles: false });
            } catch(e) {}

            // 2. DEBILIDAD 255 (Pacifismo)
            // (A los admins NO se lo ponemos)
            if (!player.hasTag(CONFIG.TAG_ADMIN)) {
                try {
                    player.addEffect("weakness", 600, { amplifier: 255, showParticles: false });
                } catch(e) {}
            }
        } 
        // CASO B: NO ESTÁ EN ZONA SEGURA (O LA ZONA ES DE PVP)
        else {
            // ---> LIMPIEZA DE SEGURIDAD <---
            // Si sale de la zona, le quitamos la inmortalidad INMEDIATAMENTE.
            // Si no pones esto, ¡se llevarán la inmortalidad afuera por 30 segundos!
            try {
                player.removeEffect("resistance");
                player.removeEffect("weakness");
            } catch(e) {}
        }
    }
}, 10); // Revisamos cada medio segundo

// =============================================================================
// ⚔️ SISTEMA DE XP POR KILLS (PVE Y PVP) + AUTO LEVEL UP
// =============================================================================
world.afterEvents.entityDie.subscribe((event) => {
    const victim = event.deadEntity;
    const killer = event.damageSource.damagingEntity;

    if (!killer || killer.typeId !== "minecraft:player") return;

    // 1. Validar Clan del Asesino (Si el asesino no tiene clan, no gana nada)
    const clan = getClanDeJugador(killer.name);
    if (!clan) return;

    // --- LÓGICA PVP AVANZADA (ANTI-GRANJA) ---
    if (victim.typeId === "minecraft:player") {
        const clanVictima = getClanDeJugador(victim.name);
        
        // REGLA A: FUEGO AMIGO
        // Si la víctima es de tu mismo clan -> No XP
        if (clanVictima && clanVictima.id === clan.id) {
            system.run(() => killer.sendMessage("§c[!] Fuego amigo: No ganas XP."));
            return; 
        }

        // REGLA B: VÍCTIMA SIN CLAN (NUEVO)
        // Si matas a un jugador que NO tiene clan -> No XP
        if (!clanVictima) {
            system.run(() => {
                killer.onScreenDisplay.setActionBar("§7Jugador sin clan = Sin Recompensa");
                killer.setDynamicProperty("hud_pausa", Date.now() + 2500);
            });
            return; // Cortamos aquí.
        }
    }
    // ------------------------------------------------------

    // 2. Calcular XP
    let xpReward = 0;

    if (victim.typeId === "minecraft:player") {
        // Buscamos si el Admin configuró un valor específico (Ej: 10)
        const xpConfigurada = getConfigVar(`XP_MOB_${victim.typeId}`);
        
        // Si existe un valor configurado (y es mayor a 0), lo usamos.
        // Si NO existe (es null/undefined), usamos 1 por defecto.
        if (xpConfigurada && xpConfigurada > 0) {
            xpReward = xpConfigurada;
        } else {
            xpReward = 1; // <--- VALOR PREDETERMINADO SI NO HAY CONFIG
        }
    } else {
        // Para Mobs (Zombies, Creepers, etc) sigue la lógica normal (0 por defecto)
        xpReward = getConfigVar(`XP_MOB_${victim.typeId}`) || 0;
    }

    if (xpReward > 0) {
        const clanes = getDatosMundo(CONFIG.DB_CLANES);
        const cIndex = clanes.findIndex(c => c.id === clan.id);

        if (cIndex !== -1) {
            // A. Sumar XP
            clanes[cIndex].xp += xpReward;

            // B. LÓGICA DE LEVEL UP AUTOMÁTICO
            const costoNivel = calcularCostoNivel(clanes[cIndex].nivel);
            
            // Si tiene suficiente XP y no es nivel máximo (100)
            if (clanes[cIndex].xp >= costoNivel && clanes[cIndex].nivel < 100) { 
                clanes[cIndex].xp -= costoNivel; // Restamos la XP usada
                clanes[cIndex].nivel += 1;      // Subimos nivel
                
                // Anuncio Global Épico
                world.sendMessage(`§6§l¡EL CLAN ${clanes[cIndex].tag} ALCANZÓ EL NIVEL ${clanes[cIndex].nivel}!`);
                
                // Sonidos para todos
                world.getPlayers().forEach(p => p.playSound("ambient.weather.thunder"));
            } else {
                // Si no subió de nivel, solo sonido de XP normal
                system.run(() => {
                    killer.onScreenDisplay.setActionBar(`§a+${xpReward} XP Clan`);
                    killer.playSound("random.orb", { pitch: 1.5, volume: 1 });
                    
                    // --- FIX: PAUSAR EL HUD PRINCIPAL 2 SEGUNDOS ---
                    killer.setDynamicProperty("hud_pausa", Date.now() + 2000);
                });
            }

            // Guardamos todo
            setDatosMundo(CONFIG.DB_CLANES, clanes);
        }
    }
});

// =============================================================================
// 🧪 MOTOR DE EFECTOS DEL CLAN (Bucle Infinito)
// =============================================================================
// Se ejecuta cada 4 segundos (80 ticks) para no laggear.
// Da efectos por 30 segundos, así nunca se acaban visualmente.

system.runInterval(() => {
    const configEfectos = obtenerConfigEfectos(); // Traemos la DB de efectos
    const todosClanes = getDatosMundo(CONFIG.DB_CLANES) || [];

    for (const player of world.getPlayers()) {
        const clan = getClanDeJugador(player.name);
        if (!clan) continue; // Si no tiene clan, next.

        // ---> CHEQUEO DE ZONA (MINIJUEGOS) <---
        const zona = obtenerZonaActual(player);
        // Si hay zona, Y tiene flags, Y la flag efectos_clan es FALSE...
        if (zona && zona.flags && zona.flags.efectos_clan === false) {
            continue; // Saltamos a este jugador, NO le damos efectos.
        }

        // Checar si el clan pagó la renta (usamos una propiedad nueva "renta_efectos_expira")
        // Si no existe la propiedad o la fecha ya pasó, no damos nada.
        const fechaVencimiento = clan.renta_efectos_expira || 0;
        if (Date.now() > fechaVencimiento) continue; 

        // Checar preferencias personales del jugador (Switch ON/OFF)
        // Guardamos esto en el jugador: { "speed": true, "jump_boost": false }
        let prefs = {};
        try {
            const data = player.getDynamicProperty("mis_efectos_pref");
            if (data) prefs = JSON.parse(data);
        } catch (e) {}

        // REVISAR CADA EFECTO DE LA LISTA
        configEfectos.forEach(efecto => {
            // 1. ¿El clan desbloqueó este efecto? (Tiene que estar en su lista de 'efectos_desbloqueados')
            const desbloqueados = clan.efectos_desbloqueados || [];
            if (!desbloqueados.includes(efecto.id)) return;

            // 2. ¿El jugador tiene activado el switch personal? (Default: TRUE si no existe)
            const switchPersonal = prefs[efecto.id] !== false; // Solo es false si explícitamente lo apagó

            if (switchPersonal) {
                try {
                    // Dar el efecto (6 segundos, amplificador configurado, sin partículas)
                    player.addEffect(efecto.id, 600, { 
                        amplifier: efecto.amp, 
                        showParticles: false 
                    });
                } catch (error) {
                    // Ignoramos errores por si el ID del efecto cambió en Minecraft
                }
            }
        });
    }
}, 80); // Cada 4 segundos

// =============================================================================
// ★ SÚPER MOTOR DEL LEADERBOARD (MULTIUSO)
// =============================================================================
// Se ejecuta cada 100 ticks (5 segundos aprox)
system.runInterval(() => {
    // --- 1. PRE-CALCULAR LOS TOPS FIJOS ---
    
    // A. TOP DINERO GLOBAL
    const cacheGlobal = getCacheDinero();
    const listaGlobal = Object.entries(cacheGlobal)
        .sort((a, b) => b[1] - a[1]) // Mayor a menor
        .slice(0, 10);
        
    let textoGlobal = "§l§e  TOP MILLONARIOS  §r\n";
    if (listaGlobal.length === 0) textoGlobal += "§7No hay jugadores registrados.";
    else listaGlobal.forEach((j, i) => textoGlobal += `${i === 0 ? "§l§g[1]" : (i === 1 ? "§l§f[2]" : (i === 2 ? "§l§6[3]" : `§8${i + 1}.`))} §b${j[0]} §f- §a$${j[1]}\n`);

    // B. TOP DINERO ONLINE
    const jugadoresOnline = world.getAllPlayers();
    const listaOnline = jugadoresOnline
        .map(p => { return { nombre: p.name, saldo: getSaldo(p) } })
        .sort((a, b) => b.saldo - a.saldo)
        .slice(0, 10);

    let textoOnline = "§l§e  TOP MILLONARIOS  §r\n";
    if (listaOnline.length === 0) textoOnline += "§7Nadie conectado.";
    else listaOnline.forEach((j, i) => textoOnline += `${i === 0 ? "§l§g[1]" : (i === 1 ? "§l§f[2]" : (i === 2 ? "§l§6[3]" : `§8${i + 1}.`))} §b${j.nombre} §f- §a$${j.saldo}\n`);

    // C. TOP CLANES
    // FIX: Leemos los clanes directamente de la base de datos para que no marque vacío
    const clanes = getDatosMundo(CONFIG.DB_CLANES) || []; 
    const listaClanes = clanes
        .sort((a, b) => (b.nivel || 1) - (a.nivel || 1)) 
        .slice(0, 10);
        
    let textoClanes = "§l§e  MEJORES CLANES  §r\n";
    if (listaClanes.length === 0) {
        textoClanes += "§7No hay clanes fundados.";
    } else {
        listaClanes.forEach((c, i) => textoClanes += `${i === 0 ? "§l§g[1]" : (i === 1 ? "§l§f[2]" : (i === 2 ? "§l§6[3]" : `§8${i + 1}.`))} ${c.color}${c.nombre} §f- §dNvl ${c.nivel || 1}\n`);
    }

    // --- 2. BUSCAR ENTIDADES Y ACTUALIZARLAS ---
    const dimensiones = ["overworld", "nether", "the_end"];
    for (const d of dimensiones) {
        try {
            const dim = world.getDimension(d);
            const entidadesTop = dim.getEntities({ type: "rikocraft:texto_flotante" });

            for (const ent of entidadesTop) {
                const tags = ent.getTags();
                
                if (tags.includes("top_dinero_global")) {
                    ent.nameTag = textoGlobal;
                } 
                else if (tags.includes("top_dinero_online")) {
                    ent.nameTag = textoOnline;
                }
                else if (tags.includes("top_clanes")) {
                    ent.nameTag = textoClanes;
                }
                else {
                    const tagScore = tags.find(t => t.startsWith("top_score_"));
                    if (tagScore) {
                        const objName = tagScore.replace("top_score_", ""); 
                        const objective = world.scoreboard.getObjective(objName);
                        
                        let textoScore = `§l§e  TOP: ${objName.toUpperCase()}  §r\n`;
                        
                        if (!objective) {
                            textoScore += "§cScoreboard no encontrado o no existe.";
                        } else {
                            const participantes = objective.getParticipants();
                            const listaScore = [];
                            
                            for (const part of participantes) {
                                try {
                                    const score = objective.getScore(part);
                                    const nombre = part.displayName || "Desconocido";
                                    listaScore.push({ nombre: nombre, score: score });
                                } catch(e){}
                            }
                            
                            const topScore = listaScore.sort((a, b) => b.score - a.score).slice(0, 10);
                            
                            if (topScore.length === 0) {
                                textoScore += "§7No hay registros.";
                            } else {
                                topScore.forEach((s, i) => textoScore += `${i === 0 ? "§6[1]" : (i === 1 ? "§7[2]" : (i === 2 ? "§c[3]" : `§8${i + 1}.`))} §b${s.nombre} §f- §a${s.score}\n`);
                            }
                        }
                        ent.nameTag = textoScore;
                    }
                }
            }
        } catch (e) {}
    }
}, 200);

// =============================================================================
// ★ MOTOR DE BÚNKERES (CUBO EXACTO Y VISIÓN NOCTURNA INTELIGENTE)
// =============================================================================
system.runInterval(() => {
    // Obtenemos los clanes directamente (Si importaste getClanes úsalo, si no, usa el caché)
    const clanes = typeof getClanes === "function" ? getClanes() : (getDatosMundo("db_clanes") || []);
    if (clanes.length === 0) return;

    for (const player of world.getAllPlayers()) {
        const clan = clanes.find(c => c.miembros.includes(player.name));
        if (!clan || !clan.base) continue;

        const pLoc = player.location;
        const bLoc = clan.base;
        
        // Bordes del Cubo de Bedrock del Bunker
        const minX = bLoc.x - 7;
        const maxX = bLoc.x + 7;
        const minY = bLoc.y - 2; 
        const maxY = bLoc.y + 6; 
        const minZ = bLoc.z - 7;
        const maxZ = bLoc.z + 7;

        // Comprobación de Colisión 3D (Si está adentro del cubo)
        const enBunker = (pLoc.x >= minX && pLoc.x <= maxX && 
                          pLoc.y >= minY && pLoc.y <= maxY && 
                          pLoc.z >= minZ && pLoc.z <= maxZ);
        
        if (enBunker) {
            // 1. Está dentro de la base
            player.addTag("adentro_del_bunker_nv");
            
            // Le damos 30 segundos exactos (600 ticks). 
            // Como este loop corre cada 5 segundos, cuando el efecto llegue a 25s, se volverá a subir a 30s.
            player.addEffect("night_vision", 600, { amplifier: 0, showParticles: false });
        } else {
            // 2. Acaba de salir del cubo
            if (player.hasTag("adentro_del_bunker_nv")) {
                player.removeTag("adentro_del_bunker_nv");
                
                // MAGIA ANTI-CHOQUE: ¿Su clan ya le estaba dando Visión Nocturna por la tienda?
                let tieneNvPorClan = false;
                if (clan.renta_efectos_expira > Date.now() && (clan.efectos_desbloqueados || []).includes("night_vision")) {
                    try {
                        // Verificamos si en su interruptor personal no la apagó
                        const prefsRaw = player.getDynamicProperty("mis_efectos_pref");
                        const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
                        if (prefs["night_vision"] !== false) tieneNvPorClan = true;
                    } catch(e) {}
                }
                
                // Si NO la tiene rentada por el clan, se la quitamos para que quede a oscuras.
                if (!tieneNvPorClan) {
                    player.removeEffect("night_vision");
                }
            }
        }
    }
}, 100);

// =============================================================================
// 🪦 EVENTO: DETECTAR LA MUERTE DEL JUGADOR
// =============================================================================
world.afterEvents.entityDie.subscribe((event) => {
    const jugadorMuerto = event.deadEntity;
    
    // Verificamos que la entidad que murió sea un jugador (y no una vaca o un zombi)
    if (jugadorMuerto.typeId === "minecraft:player") {
        // Ejecutamos la magia de la tumba
        crearTumbaJugador(jugadorMuerto);
    }
});

//MUNDO