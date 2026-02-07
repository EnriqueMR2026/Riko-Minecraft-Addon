import { world, system, BlockPermutation, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { obtenerTierraJugador } from "./ui_tierras.js";
import { mostrarMenuPrincipal } from "./ui_menus.js";
import { obtenerZonaActual } from "./ui_zonas.js";
import { getSaldo, setSaldo, getDatosMundo, setDatosMundo, obtenerDistancia, getConfigVar, obtenerNombreRango, obtenerKitPorNivel, 
    obtenerConfigEfectos, calcularCostoNivel } from "./utils.js";

// =============================================================================
// 🧠 GESTOR DE DATOS DE CLANES (Lógica Interna)
// =============================================================================

// Estructura de un Clan Nuevo (ACTUALIZADA V2.0 - CLANES 100 NIVELES)
const CLAN_TEMPLATE = {
    id: "", 
    nombre: "",
    tag: "", 
    color: "§f", 
    lider: "", 
    miembros: [], 
    nivel: 1,
    xp: 0,
    saldo: 0,
    creado: 0,
    base: null, 
    // --- NUEVO SISTEMA DE EFECTOS (CLANES 2.0) ---
    // En lugar de guardar fechas individuales, guardamos IDs desbloqueados y UNA fecha global
    efectos_desbloqueados: [], // Lista de IDs ["speed", "haste"] que YA compraron (Unlock permanente)
    renta_efectos_expira: 0,   // Timestamp: Cuándo vence la renta global de efectos
    // --- NUEVO SISTEMA DE KITS ---
    kits_reclamados: {} // Reservado para logs o límites futuros
};

// Cargar todos los clanes
function getClanes() {
    return getDatosMundo(CONFIG.DB_CLANES) || [];
}

// Guardar lista
function saveClanes(clanes) {
    setDatosMundo(CONFIG.DB_CLANES, clanes);
}

// Buscar el clan de un jugador
export function getClanDeJugador(nombreJugador) {
    const clanes = getClanes();
    return clanes.find(c => c.miembros.includes(nombreJugador));
}

// =============================================================================
// 🏗️ CONSTRUCTOR DE BUNKERS (Versión Nativa - A prueba de fallos)
// =============================================================================

function construirBunker(dimension, x, z) {
    // Definimos la profundidad (Capa -60 para Bedrock)
    const yFondo = -60;
    
    // Bloques
    const bedrock = BlockPermutation.resolve("minecraft:bedrock");
    const madera = BlockPermutation.resolve("minecraft:planks");
    const aire = BlockPermutation.resolve("minecraft:air");
    const luz = BlockPermutation.resolve("minecraft:sea_lantern");

    // Función auxiliar para rellenar áreas (Reemplazo de /fill)
    const llenarArea = (perm, x1, y1, z1, x2, y2, z2) => {
        for (let ix = x1; ix <= x2; ix++) {
            for (let iy = y1; iy <= y2; iy++) {
                for (let iz = z1; iz <= z2; iz++) {
                    try {
                        // Verificamos si el bloque está cargado antes de ponerlo
                        dimension.getBlock({ x: ix, y: iy, z: iz })?.setPermutation(perm);
                    } catch (e) { }
                }
            }
        }
    };

    // 1. EL CUBO EXTERIOR (BEDROCK) - 15x15x8
    // Rango: x-7 a x+7
    llenarArea(bedrock, x - 7, yFondo, z - 7, x + 7, yFondo + 8, z + 7);

    // 2. EL INTERIOR (MADERA)
    // Rango: x-6 a x+6
    llenarArea(madera, x - 6, yFondo + 1, z - 6, x + 6, yFondo + 7, z + 6);

    // 3. EL ESPACIO VACÍO (AIRE)
    // Rango: x-5 a x+5
    llenarArea(aire, x - 5, yFondo + 2, z - 5, x + 5, yFondo + 6, z + 5);

    // 4. ILUMINACIÓN (Centro Techo)
    try {
        dimension.getBlock({ x: x, y: yFondo + 6, z: z })?.setPermutation(luz);
    } catch (e) { }

    return { x: x, y: yFondo + 2, z: z }; // Retornamos la coordenada del suelo interior
}

// =============================================================================
// 🖥️ MENÚS DE INTERFAZ (UI)
// =============================================================================

export function menuClanes(player) {
    const clan = getClanDeJugador(player.name);

    if (!clan) {
        menuNoTieneClan(player);
    } else {
        menuGestionarClan(player, clan);
    }
}

// --- A. JUGADOR SIN CLAN ---
function menuNoTieneClan(player) {
    const form = new ActionFormData()
        .title("Sistema de Clanes")
        // Usamos getConfigVar para ver el precio actual
        .body(`§7No perteneces a ningún clan.\n\nCosto de fundación: §2$${getConfigVar("COSTO_CREAR_CLAN")}`)
        .button("FUNDAR NUEVO CLAN", "textures/ui/color_plus")
        .button("Regresar");

    form.show(player).then(r => {
        if (r.canceled) return;
        if (r.selection === 0) formCrearClan(player);
        // Volver (Manejado por main.js)
    });
}

function formCrearClan(player) {
    // 1. Verificación de Dinero
    const costo = getConfigVar("COSTO_CREAR_CLAN"); 
    
    if (getSaldo(player) < costo) {
        player.sendMessage(`§c[!] Necesitas $${costo} para fundar un clan.`);
        player.playSound("random.break");
        return;
    }

    // 2. Verificación de Casa
    const tierra = obtenerTierraJugador(player);
    if (!tierra) {
        player.sendMessage("§c[!] Debes tener una CASA propia para crear un clan.");
        player.playSound("mob.villager.no");
        return;
    }

    // Verificar si está en el centro exacto (Radio 2 bloques para dar margen)
    const dist = obtenerDistancia(player.location, tierra.center);
    if (dist > 2) {
        player.sendMessage("§c[!] Debes pararte en el CENTRO EXACTO de tu casa para fundar el clan.");
        // --- CAMBIO APLICADO AQUÍ: Muestra las coordenadas exactas ---
        player.sendMessage(`§eVe a la coordenada: §b${tierra.center.x}, ${tierra.center.y}, ${tierra.center.z}`);
        player.playSound("mob.villager.no");
        return;
    }


    const form = new ModalFormData()
        .title("Fundar Clan")
        .textField("Nombre del Clan (Máx 10 letras)", "Ej: Espartanos")
        .dropdown("Color del Tag", ["§4Rojo", "§1Azul", "§2Verde", "§eAmarillo", "§5Morado", "§bAqua", "§7Gris"]);

    form.show(player).then(r => {
        if (r.canceled) return menuNoTieneClan(player); // 🔙 Si cancela, vuelve atrás
        
        const nombreRaw = r.formValues[0].trim();
        const colorIdx = r.formValues[1];
        const codigosColores = ["§4", "§1", "§2", "§e", "§5", "§b", "§7"];
        const color = codigosColores[colorIdx];

        // Validaciones
        if (nombreRaw.length < 3 || nombreRaw.length > 10) {
            player.sendMessage("§c[!] El nombre debe tener entre 3 y 10 letras.");
            return;
        }

        const clanes = getClanes();
        if (clanes.some(c => c.nombre.toLowerCase() === nombreRaw.toLowerCase())) {
            player.sendMessage("§c[!] Ese nombre de clan ya existe.");
            return;
        }

        // --- CREACIÓN DEL CLAN ---
        
        // 1. Cobrar
        setSaldo(player, getSaldo(player) - costo);

        // 2. Construir Bunker (Alineado con el jugador)
        player.sendMessage("§eConstruyendo base secreta subterránea...\nBunker Creado Correctamente!");
        const coordsBunker = construirBunker(player.dimension, Math.floor(player.location.x), Math.floor(player.location.z));

        // 3. Crear Objeto Clan (USANDO TEMPLATE V2 ACTUALIZADO)
        const nuevoClan = {
            ...CLAN_TEMPLATE, 
            id: Date.now().toString(),
            nombre: nombreRaw,
            tag: `[${nombreRaw.toUpperCase()}]`,
            color: color,
            lider: player.name,
            miembros: [player.name],
            base: coordsBunker,
            creado: Date.now()
        };

        clanes.push(nuevoClan);
        saveClanes(clanes);

        player.sendMessage(`§a[!] ¡Clan ${color}${nombreRaw}§a fundado con éxito!`);
        player.playSound("random.levelup");
        player.playSound("beacon.activate");
    });
}

// --- B. GESTION DEL CLAN ---
function menuGestionarClan(player, clan) {
    const esLider = clan.lider === player.name;
    const costoNivel = calcularCostoNivel(clan.nivel);
    
    // --- CORRECCION 1: LIMITE GLOBAL DEL ADMIN PANEL ---
    const maxMiembros = getConfigVar("MAX_MIEMBROS_GLOBAL"); 

    // Estado de la Renta de Efectos
    let estadoRenta = "§cInactiva";
    if (clan.renta_efectos_expira > Date.now()) {
        const dias = Math.ceil((clan.renta_efectos_expira - Date.now()) / (1000 * 60 * 60 * 24));
        estadoRenta = `§aActiva (${dias}d)`;
    }

    let tituloClan = `${clan.color}${clan.tag}`;
    if (clan.nivel >= 10) tituloClan = `§6§k||§r §6${clan.tag} §6§k||§r`;

    // DETECTAR BLOQUEO (Solo Minijuego)
    const enMinijuego = player.hasTag("minijuego");
    // Nota: Ya no bloqueamos por zonaActual para el bunker, el lobby es seguro para viajar.

    const form = new ActionFormData()
        .title(`Clan: ${tituloClan}`)
        .body(
            `§fNivel: §e${clan.nivel} §7(${obtenerNombreRango(clan.nivel)})\n` +
            `§fXP: §b${clan.xp}/${costoNivel}\n` +
            `§fBanco Clan: §2$${clan.saldo}\n` +
            `§fMiembros: §7${clan.miembros.length}/${maxMiembros}\n` +
            `§fLider: §c${clan.lider}\n` +
            `§fRenta Efectos: ${estadoRenta}`
        );

    // --- CORRECCION 2: TEXTURAS VALIDAS (ITEMS) ---
    // Usamos texturas de items vanilla para evitar cuadros morados
    
    // 0. Kit (Usamos un cofre o bundle)
    form.button("KIT DIARIO\nReclamar Suministros", "textures/items/minecart_chest"); 
    
    // 1. Tienda (Poción)
    form.button("TIENDA DE EFECTOS\nDesbloquear Poderes", "textures/items/potion_bottle_empty"); 
    
    // 2. Switch (Redstone)
    form.button("MIS EFECTOS (ON/OFF)\nInterruptor Personal", "textures/items/redstone_dust"); 
    
    // 3. Pagar Renta (Esmeralda)
    form.button("PAGAR RENTA EFECTOS\nActivar para todos", "textures/items/emerald"); 

    // 4. Base (Puerta o Ender Pearl) --- LOGICA CORREGIDA ---
    // Solo bloqueamos visualmente si está jugando. Si está en Lobby, puede viajar.
    if (enMinijuego) {
        form.button("§cIR A BASE (BUNKER)\n[BLOQUEADO]", "textures/ui/lock");
    } else {
        form.button("IR A BASE (BUNKER)", "textures/items/ender_pearl"); 
    }
    
    // 5. Depositar (Lingote de Oro)
    form.button("DEPOSITAR DINERO", "textures/items/gold_ingot"); 

    // 6. Líder o Salir
    if (esLider) {
        form.button("GESTION DE LIDER", "textures/items/gold_helmet"); 
    } else {
        form.button("SALIRSE DEL CLAN", "textures/items/door_wood"); 
    }
    
    // 7. Regresar
    form.button("Regresar", "textures/ui/cancel"); 

    form.show(player).then(r => {
        if (r.canceled || r.selection === 7) return mostrarMenuPrincipal(player); 

        switch(r.selection) {
            case 0: menuKitDiario(player, clan); break;
            case 1: menuTiendaEfectos(player, clan); break;
            case 2: menuSwitchEfectos(player, clan); break;
            case 3: menuPagarRentaEfectos(player, clan); break;
            case 4: 
                // Solo chequeamos minijuego. Permitimos viajar desde Zonas Protegidas.
                if (enMinijuego) return player.sendMessage("§c[!] No puedes ir al bunker mientras juegas.");
                irABaseClan(player, clan); 
                break;
            case 5: menuDepositarClan(player, clan); break;
            case 6: esLider ? menuGestionLider(player, clan) : salirDelClan(player, clan); break;
        }
    });
}

// =============================================================================
// SISTEMA DE KITS DIARIOS (ACUMULATIVO)
// =============================================================================

function menuKitDiario(player, clan) {
    // 1. Verificar Tiempo (Cooldown en Jugador)
    const ultimaVez = player.getDynamicProperty("last_daily_kit") || 0;
    const ahora = Date.now();
    const cooldown = 24 * 60 * 60 * 1000; // 24 Horas

    if (ahora - ultimaVez < cooldown) {
        const faltante = cooldown - (ahora - ultimaVez);
        const horas = Math.floor(faltante / (1000 * 60 * 60));
        const mins = Math.floor((faltante % (1000 * 60 * 60)) / (1000 * 60));
        return player.sendMessage(`§c[!] Ya reclamaste tu kit hoy. Vuelve en ${horas}h ${mins}m.`);
    }

    // 2. Obtener Loot acumulativo
    const loot = obtenerKitPorNivel(clan.nivel);
    const rangoNombre = obtenerNombreRango(clan.nivel);

    // 3. Generar Texto de Lista (Sin emojis)
    let textoLoot = "";
    loot.forEach(item => {
        // Formato: - x16 Bread
        textoLoot += `§7- x${item.amount} ${item.id.replace("minecraft:", "")}\n`;
    });

    const form = new ActionFormData()
        .title(`Kit Diario: ${rangoNombre}`)
        .body(
            `§eNivel Clan: ${clan.nivel}\n\n` +
            `§fContenido de hoy (Acumulado):\n${textoLoot}\n` +
            `§7Subir de nivel mejora tus recompensas futuras.`
        )
        .button("RECLAMAR AHORA", "textures/ui/check")
        .button("Cancelar");

    form.show(player).then(r => {
        if (r.canceled || r.selection === 1) return menuGestionarClan(player, clan);

        // ENTREGAR ITEMS
        const inventory = player.getComponent("inventory").container;
        let lleno = false;

        loot.forEach(itemData => {
            const itemStack = new ItemStack(itemData.id, itemData.amount);
            const sobrante = inventory.addItem(itemStack);
            if (sobrante) lleno = true;
        });

        // Marcar Cooldown
        player.setDynamicProperty("last_daily_kit", Date.now());
        player.playSound("random.levelup");
        player.sendMessage("§a[!] Has recibido tus suministros del clan.");

        if (lleno) player.sendMessage("§e[!] Tu inventario estaba lleno. Algunos items cayeron al suelo.");
    });
}

// =============================================================================
// TIENDA DE EFECTOS (SISTEMA DINAMICO V2)
// =============================================================================

function menuTiendaEfectos(player, clan) {
    const configEfectos = obtenerConfigEfectos(); // Lee la DB de precios
    const form = new ActionFormData()
        .title("Desbloqueo de Poderes")
        .body(`§7Desbloquea habilidades permanentes para el clan.\nUna vez desbloqueado, solo pagas renta semanal.`);

    // LISTAR EFECTOS
    configEfectos.forEach(ef => {
        const desbloqueado = (clan.efectos_desbloqueados || []).includes(ef.id);
        const puedeComprar = clan.nivel >= ef.lvl;
        
        // --- CORRECCIÓN DE TEXTURAS (ITEMS SEGUROS) ---
        let icono = "textures/items/potion_bottle_empty"; // Default: Botella vacía (Disponible)
        let texto = "";

        if (desbloqueado) {
            texto = `§a${ef.name}\n§2[YA ADQUIRIDO]`;
            icono = "textures/items/emerald"; // Esmeralda = Confirmado/Comprado
        } else if (puedeComprar) {
            texto = `§0${ef.name}\n§2[COMPRAR] $${ef.buy}`;
            // Se queda con la botella vacía
        } else {
            texto = `§0${ef.name}\n§4Req: Nivel ${ef.lvl}`;
            icono = "textures/items/barrier"; // Barrera Roja = Bloqueado
        }

        form.button(texto, icono);
    });

    form.button("Regresar", "textures/ui/cancel");

    form.show(player).then(r => {
        if (r.canceled || r.selection === configEfectos.length) return menuGestionarClan(player, clan);

        // Intentar comprar desbloqueo
        const efectoSeleccionado = configEfectos[r.selection];
        const yaTiene = (clan.efectos_desbloqueados || []).includes(efectoSeleccionado.id);
        
        if (yaTiene) {
            player.sendMessage("§a[!] Este efecto ya esta desbloqueado.");
            return;
        }

        if (clan.nivel < efectoSeleccionado.lvl) {
            player.sendMessage(`§c[!] Necesitas Clan Nivel ${efectoSeleccionado.lvl} para desbloquear esto.`);
            return;
        }

        confirmarCompraEfecto(player, clan, efectoSeleccionado);
    });
}

function confirmarCompraEfecto(player, clan, efecto) {
    const form = new ActionFormData()
        .title(`Desbloquear: ${efecto.name}`)
        .body(`¿Pagar §2$${efecto.buy}§f del banco del clan para desbloquear permanentemente este efecto?`)
        .button("CONFIRMAR PAGO", "textures/ui/check")
        .button("Cancelar");

    form.show(player).then(r => {
        if (r.canceled || r.selection === 1) return menuTiendaEfectos(player, clan);

        const clanes = getClanes();
        const cIndex = clanes.findIndex(c => c.id === clan.id);

        if (clanes[cIndex].saldo >= efecto.buy) {
            // Cobrar y Guardar
            clanes[cIndex].saldo -= efecto.buy;
            if (!clanes[cIndex].efectos_desbloqueados) clanes[cIndex].efectos_desbloqueados = [];
            clanes[cIndex].efectos_desbloqueados.push(efecto.id);
            
            saveClanes(clanes);
            
            world.sendMessage(`§e[CLAN] §b${clan.nombre}§f ha desbloqueado: §6${efecto.name}§f!`);
            player.playSound("random.levelup");
            menuTiendaEfectos(player, clanes[cIndex]);
        } else {
            player.sendMessage("§c[!] Fondos insuficientes en el clan.");
        }
    });
}

// =============================================================================
// RENTA Y CONFIGURACION DE EFECTOS
// =============================================================================

function menuPagarRentaEfectos(player, clan) {
    const config = obtenerConfigEfectos();
    const desbloqueadosIDs = clan.efectos_desbloqueados || [];
    
    // Calcular costo total semanal (Solo de lo que ya desbloquearon)
    let costoSemanal = 0;
    let listaEfectos = "";
    
    config.forEach(ef => {
        if (desbloqueadosIDs.includes(ef.id)) {
            costoSemanal += ef.rent;
            listaEfectos += `§7- ${ef.name} ($${ef.rent})\n`;
        }
    });

    if (costoSemanal === 0) {
        player.sendMessage("§c[!] No tienes efectos desbloqueados para rentar.");
        return menuGestionarClan(player, clan);
    }

    const form = new ActionFormData()
        .title("Renta de Efectos")
        .body(
            `Manten los efectos activos para TODOS los miembros.\n\n` +
            `§fEfectos Activos:\n${listaEfectos}\n` +
            `§eTotal Semanal: §2$${costoSemanal}`
        )
        .button(" PAGAR 1 SEMANA ", "textures/items/emerald")
        .button("Cancelar");

    form.show(player).then(r => {
        if (r.canceled || r.selection === 1) return menuGestionarClan(player, clan);

        const clanes = getClanes();
        const cIndex = clanes.findIndex(c => c.id === clan.id);

        if (clanes[cIndex].saldo >= costoSemanal) {
            clanes[cIndex].saldo -= costoSemanal;
            
            // Sumar 7 días (604800000 ms)
            // Si ya tenia tiempo, sumamos. Si estaba vencido, empieza desde ahora.
            const ahora = Date.now();
            let baseTiempo = clanes[cIndex].renta_efectos_expira > ahora ? clanes[cIndex].renta_efectos_expira : ahora;
            
            clanes[cIndex].renta_efectos_expira = baseTiempo + (7 * 24 * 60 * 60 * 1000);
            saveClanes(clanes);

            player.sendMessage("§a[!] Renta pagada exitosamente por 7 dias.");
            player.playSound("random.orb");
            menuGestionarClan(player, clanes[cIndex]);
        } else {
            player.sendMessage("§c[!] Fondos insuficientes en el banco del clan.");
        }
    });
}

function menuSwitchEfectos(player, clan) {
    const config = obtenerConfigEfectos();
    const desbloqueadosIDs = clan.efectos_desbloqueados || [];

    // Filtramos solo los efectos que el clan tiene comprados
    const efectosDisponibles = config.filter(ef => desbloqueadosIDs.includes(ef.id));

    if (efectosDisponibles.length === 0) {
        player.sendMessage("§c[!] Tu clan no ha desbloqueado ningun efecto aun.");
        return menuGestionarClan(player, clan);
    }

    // Cargar preferencias actuales
    let prefs = {};
    try {
        const data = player.getDynamicProperty("mis_efectos_pref");
        if (data) prefs = JSON.parse(data);
    } catch (e) {}

    const form = new ModalFormData()
        .title("Interruptor Personal")
        // Título Dummy (Indice 0)
        .dropdown("§lCONFIGURACIÓN MAESTRA", ["Gestiona tus efectos individuales:"]); 

    // CAPTURAMOS EL ESTADO INICIAL PARA SABER QUE MOSTRAR
    // (True = Encendido, False = Apagado)
    // Usamos map para guardar el estado de cada uno en orden estricto
    const estadosIniciales = efectosDisponibles.map(ef => prefs[ef.id] !== false);

    // Agregar Dropdowns Dinámicos (SOLO 2 ARGUMENTOS PARA EVITAR CRASH)
    efectosDisponibles.forEach((ef, index) => {
        const isON = estadosIniciales[index];
        
        // TRUCO ANTI-CRASH:
        // Ponemos la opción actual en el índice 0 (Default)
        // Así no necesitamos pasar el 3er argumento que rompe tu versión.
        let opciones = [];
        if (isON) {
            opciones = ["§aENCENDIDO (Actual)", "§cAPAGAR"];
        } else {
            opciones = ["§cAPAGADO (Actual)", "§aENCENDER"];
        }
        
        form.dropdown(`Estado de ${ef.name}:`, opciones);
    });

    form.show(player).then(r => {
        if (r.canceled) return menuGestionarClan(player, clan);

        // Procesamos los resultados
        efectosDisponibles.forEach((ef, index) => {
            // +1 porque el índice 0 es el título dummy
            const seleccion = r.formValues[index + 1]; 
            const estabaEncendido = estadosIniciales[index];
            
            // Lógica: 
            // Si seleccionó 0 -> No cambió nada (Mantenemos estado actual)
            // Si seleccionó 1 -> Quiso cambiar (Invertimos estado)
            
            let nuevoEstado = estabaEncendido;
            if (seleccion === 1) {
                nuevoEstado = !estabaEncendido;
            }
            
            prefs[ef.id] = nuevoEstado;
        });

        player.setDynamicProperty("mis_efectos_pref", JSON.stringify(prefs));
        player.sendMessage("§a[!] Preferencias de efectos actualizadas.");
        player.playSound("random.click");
    });
}

// =============================================================================
// FUNCIONES DE LIDER Y UTILIDADES
// =============================================================================

function menuGestionLider(player, clan) {
    const costoNivel = clan.nivel * getConfigVar("COSTO_NIVEL_BASE");

    const form = new ActionFormData()
        .title("Gestion de Lider")
        .body(`Opciones exclusivas para ${player.name}`)
        .button(`SUBIR NIVEL\nCost: ${costoNivel} XP`, "textures/items/experience_bottle") // 0
        .button("INVITAR JUGADOR", "textures/ui/accessibility_glyph_color")            // 1
        .button("EXPULSAR MIEMBRO", "textures/ui/cancel")                              // 2
        .button("EDITAR DETALLES", "textures/items/dye_powder_red")                    // 3
        .button("§cDISOLVER CLAN\n(Borrar para siempre)", "textures/ui/trash")         // 4
        .button("Regresar", "textures/ui/cancel");                                     // 5

    form.show(player).then(r => {
        // Si cancela o da click en Regresar (índice 5)
        if (r.canceled || r.selection === 5) { menuClanes(player); return; } 
        
        switch(r.selection) {
            case 0: subirNivelClan(player, clan); break;
            case 1: menuInvitarClan(player, clan); break;
            case 2: menuExpulsarClan(player, clan); break;
            case 3: menuEditarClan(player, clan); break;
            case 4: menuDisolverClan(player, clan); break;
        }
    });
}

function menuEditarClan(player, clan) {
    const codigos = ["§4", "§1", "§2", "§e", "§5", "§b", "§7", "§f"];
    const nombresCol = ["Rojo", "Azul", "Verde", "Amarillo", "Morado", "Aqua", "Gris", "Blanco"];
    
    // 1. Encontrar indice actual
    let indexActual = codigos.indexOf(clan.color);
    if (indexActual === -1) indexActual = 7; // Default Blanco/Gris

    // --- TRUCO ANTI-CRASH PARA DROPDOWN ---
    // Reordenamos las listas para que el color actual quede en la posición 0.
    // Así no necesitamos pasar el 3er argumento que rompe tu versión.
    
    // A. Sacamos el color actual
    const colorActualName = nombresCol[indexActual];
    const colorActualCode = codigos[indexActual];
    
    // B. Creamos listas sin el color actual
    const otrosNombres = nombresCol.filter((_, i) => i !== indexActual);
    const otrosCodigos = codigos.filter((_, i) => i !== indexActual);
    
    // C. Creamos las listas finales (Actual va primero)
    const listaNombresFinal = [`${colorActualName} (Actual)`, ...otrosNombres];
    const listaCodigosFinal = [colorActualCode, ...otrosCodigos];

    const form = new ModalFormData()
        .title("Editar Detalles")
        // FIX CRASH 1 (TEXTFIELD): Quitamos el 3er argumento.
        // Mostramos el nombre actual en el texto de arriba.
        .textField(`Nuevo Nombre (Actual: ${clan.nombre})`, "Escribe el nuevo nombre...")
        
        // FIX CRASH 2 (DROPDOWN): Quitamos el 3er argumento.
        // Usamos la lista reordenada.
        .dropdown("Nuevo Color de Tag:", listaNombresFinal);

    form.show(player).then(r => {
        if (r.canceled) return menuGestionLider(player, clan); // 🔙 Vuelve a Lider
        
        // Procesamos el nombre
        let nuevoNombre = r.formValues[0].trim();
        
        // Si lo dejó vacío, significa que no quiere cambiarlo -> Mantenemos el anterior
        if (nuevoNombre === "") nuevoNombre = clan.nombre;

        // Procesamos el color
        // El índice seleccionado corresponde a nuestra lista 'listaCodigosFinal'
        const indexSeleccionado = r.formValues[1];
        const nuevoColor = listaCodigosFinal[indexSeleccionado];

        // Validaciones (COHERENCIA: Mismo límite que al crear clan)
        if (nuevoNombre.length < 3 || nuevoNombre.length > 10) {
            player.sendMessage("§c[!] Nombre invalido (3-10 letras).");
            return menuEditarClan(player, clan); // Reabrimos si falla
        }

        const clanes = getClanes();
        const cIndex = clanes.findIndex(c => c.id === clan.id);
        
        if (cIndex !== -1) {
            clanes[cIndex].nombre = nuevoNombre;
            
            // Regeneramos el TAG con el límite correcto de 10 caracteres
            clanes[cIndex].tag = `[${nuevoNombre.toUpperCase().substring(0, 10)}]`; 
            
            clanes[cIndex].color = nuevoColor;
            
            saveClanes(clanes);
            player.sendMessage("§a[!] Datos del clan actualizados correctamente.");
            player.playSound("random.levelup");
            
            // Regresamos al menu principal para ver los cambios
            menuClanes(player);
        }
    });
}

function menuDisolverClan(player, clan) {
    // Advertencia de seguridad
    const form = new ActionFormData()
        .title("§cPELIGRO: DISOLVER CLAN")
        .body(
            `§c¿Estás seguro de que quieres eliminar el clan "${clan.nombre}"?\n\n` +
            `§lESTA ACCIÓN NO SE PUEDE DESHACER.\n` +
            `§r- Se perderá todo el dinero del banco.\n` +
            `- Se perderá el nivel y la XP.\n` +
            `- Se perderá el acceso al bunker.\n` +
            `- Todos los miembros serán expulsados.`
        )
        .button("§cSI, BORRAR TODO", "textures/ui/trash")
        .button("CANCELAR", "textures/ui/cancel");

    form.show(player).then(r => {
        if (r.canceled || r.selection === 1) return menuGestionLider(player, clan); // 🔙 Se arrepintió

        if (r.selection === 0) {
            const clanes = getClanes();
            // Filtramos para quitar ESTE clan de la lista
            const nuevosClanes = clanes.filter(c => c.id !== clan.id);
            
            saveClanes(nuevosClanes);
            
            // Efectos y mensajes dramáticos
            player.sendMessage(`§c[!] Has disuelto el clan ${clan.nombre}.`);
            player.playSound("random.break");
            player.playSound("mob.enderdragon.growl"); // Sonido épico de destrucción
            
            // Regresamos al menú principal (ya no tienes clan)
            mostrarMenuPrincipal(player);
        }
    });
}

// --- FUNCIONES DE LOGICA RAPIDA ---

function irABaseClan(player, clan) {
    // 1. Candado de Minijuego (Tag)
    if (player.hasTag("minijuego")) {
        return player.sendMessage("§c[!] No puedes ir al bunker durante un minijuego.");
    }

    // [ELIMINADO] Candado de Zona Protegida 
    // Permitimos viajar desde el Lobby o Zonas Admin hacia el Bunker.

    // 2. Verificación de Base
    if (!clan.base) return player.sendMessage("§cError: Este clan no tiene base registrada.");
    
    // Guardar posicion anterior (Sistema de Retorno)
    const posActual = player.location;
    player.addTag(`return_x:${Math.floor(posActual.x)}`);
    player.addTag(`return_y:${Math.floor(posActual.y)}`);
    player.addTag(`return_z:${Math.floor(posActual.z)}`);
    player.addTag("en_bunker");

    // Teleport
    player.teleport({ x: clan.base.x, y: clan.base.y, z: clan.base.z });
    player.playSound("mob.shulker.teleport");
    player.sendMessage("§aTeletransportado al Bunker del Clan.");
}

function menuDepositarClan(player, clan) { // v1.3
    // 1. Forzamos a que sea NUMERO entero
    const saldoJugador = parseInt(getSaldo(player)) || 0; 
    const minDonacion = 100;

    if (saldoJugador < minDonacion) {
        player.playSound("mob.villager.no");
        player.sendMessage(`§c[!] Minimo para donar: $${minDonacion}.`);
        return menuClanes(player); 
    }

    const valMin = Number(minDonacion);
    const valMax = Number(saldoJugador);
    // Nota: Eliminamos valStep para evitar conflictos con la API

    // DETECTOR DE CASO BORDE: ¿Tiene mas de $100 o justo $100?
    // Si valMax > valMin, usamos Slider. Si son iguales, usamos Dropdown.
    const usarSlider = valMax > valMin;

    const form = new ModalFormData().title("Donar al Clan");

    if (usarSlider) {
        // FIX CRITICO: Quitamos el 4to argumento (step). 
        // Solo pasamos Texto, Min y Max. Argumento [3] eliminado.
        form.slider(`Cantidad (Tienes: $${saldoJugador})`, valMin, valMax); 
    } else {
        // CASO EXACTO: Tienes justo 100 -> Dropdown unico
        form.dropdown(`Cantidad (Tienes: $${saldoJugador})`, [`$${valMin}`]);
    }
    
    form.show(player).then(r => {
        if(r.canceled) return menuClanes(player); 

        // Recuperamos el monto dependiendo de que control usamos
        let monto = 0;
        
        if (usarSlider) {
            // Si usamos Slider, el valor es el numero directo
            monto = Math.floor(r.formValues[0]);
        } else {
            // Si usamos Dropdown, sabemos que es el minimo obligatoriamente
            monto = valMin;
        }
        
        // Verificamos de nuevo el saldo real
        const saldoActual = parseInt(getSaldo(player));

        if (saldoActual >= monto) {
            setSaldo(player, saldoActual - monto);
            
            // Actualizar saldo clan
            const clanes = getClanes();
            const cIndex = clanes.findIndex(c => c.id === clan.id);
            if (cIndex !== -1) {
                clanes[cIndex].saldo += monto;
                saveClanes(clanes);
                player.sendMessage(`§aHas donado $${monto} al clan.`);
                player.playSound("random.orb");
            }
        } else {
            player.sendMessage("§cError: Fondos insuficientes.");
        }
        // RECARGAMOS EL MENU
        menuClanes(player);
    });
}

function subirNivelClan(player, clan) {
    const costoXP = calcularCostoNivel(clan.nivel);
    
    // CASO 1: YA ES NIVEL MAXIMO (100)
    if (clan.nivel >= 100) {
        player.sendMessage("§6¡El clan ya es Nivel Maximo (Emperador)!");
        return menuGestionLider(player, clan); // 🔙 Regresa al menu
    }

    // CASO 2: TIENE XP SUFICIENTE
    if (clan.xp >= costoXP) {
        const clanes = getClanes();
        const cIndex = clanes.findIndex(c => c.id === clan.id);
        
        if (cIndex !== -1) {
            // Aplicar cambios
            clanes[cIndex].xp -= costoXP;
            clanes[cIndex].nivel += 1;
            saveClanes(clanes);
            
            world.sendMessage(`§6§l¡EL CLAN ${clan.color}${clan.nombre}§6 HA SUBIDO A NIVEL ${clanes[cIndex].nivel}!`);
            player.playSound("random.totem");

            // RECARGAR MENU (Importante: pasamos el clan actualizado)
            menuGestionLider(player, clanes[cIndex]);
        }
    } 
    // CASO 3: NO TIENE XP
    else {
        player.sendMessage(`§cInsuficiente XP. Necesitas ${costoXP} XP.`);
        player.playSound("mob.villager.no");
        
        // 🔙 Regresa al menu para que veas tu XP actual
        menuGestionLider(player, clan);
    }
}

// =============================================================================
// GESTION DE MIEMBROS (Invitar / Expulsar / Salir)
// =============================================================================

function menuInvitarClan(player, clan) {
    // 1. Verificar Cupo Maximo (AHORA USA EL LIMITE GLOBAL DEL ADMIN)
    // Antes era: 5 + (clan.nivel - 1)
    const maxMiembros = getConfigVar("MAX_MIEMBROS_GLOBAL"); 

    if (clan.miembros.length >= maxMiembros) {
        player.sendMessage(`§c[!] El clan ha alcanzado el cupo maximo de ${maxMiembros} miembros.`);
        return menuGestionarClan(player, clan); // 🔙 Regresa
    }

    // 2. Obtener jugadores ONLINE que NO tengan clan
    const todosJugadores = world.getPlayers();
    const candidatos = [];
    const clanes = getClanes();

    for (const p of todosJugadores) {
        if (p.name === player.name) continue; 
        
        const tieneClan = clanes.some(c => c.miembros.includes(p.name));
        if (!tieneClan) {
            candidatos.push(p);
        }
    }

    if (candidatos.length === 0) {
        player.sendMessage("§c[!] No hay jugadores disponibles sin clan para invitar.");
        return menuGestionarClan(player, clan); // 🔙 Regresa
    }

    // 3. Mostrar Menu
    const form = new ModalFormData()
        .title("Invitar Jugador")
        .dropdown("Selecciona al jugador:", candidatos.map(p => p.name));

    form.show(player).then(r => {
        if (r.canceled) return menuGestionarClan(player, clan); // 🔙 Regresa
        
        const index = r.formValues[0];
        const invitado = candidatos[index];

        if (!invitado) {
            player.sendMessage("§c[!] El jugador se desconecto.");
            return menuGestionarClan(player, clan); // 🔙 Regresa
        }

        player.sendMessage(`§eSolicitud enviada a ${invitado.name}.`);
        menuConfirmarIngreso(invitado, clan, player.name);
        
        // Volvemos al menu para seguir gestionando
        menuGestionarClan(player, clan);
    });
}

function menuConfirmarIngreso(invitado, clan, nombreLider) {
    const form = new ActionFormData()
        .title(`Invitacion de Clan`)
        .body(`§fEl lider §b${nombreLider}§f te invita a unirte al clan:\n\n§l${clan.color}${clan.nombre}§r\n\n¿Aceptas unirte?`)
        .button("ACEPTAR", "textures/ui/check")
        .button("RECHAZAR", "textures/ui/cancel");

    form.show(invitado).then(r => {
        if (r.canceled || r.selection === 1) {
            const lider = world.getPlayers().find(p => p.name === nombreLider);
            if (lider) lider.sendMessage(`§c${invitado.name} rechazo la invitacion.`);
            return;
        }

        if (r.selection === 0) {
            // Logica de union
            const clanes = getClanes();
            const cIndex = clanes.findIndex(c => c.id === clan.id);
            
            if (cIndex !== -1) {
                // Doble chequeo de cupo por si tardo en responder (Con el LIMITE GLOBAL)
                const maxMiembros = getConfigVar("MAX_MIEMBROS_GLOBAL");
                
                if (clanes[cIndex].miembros.length >= maxMiembros) {
                    return invitado.sendMessage("§c[!] El clan se lleno mientras decidias.");
                }

                clanes[cIndex].miembros.push(invitado.name);
                saveClanes(clanes);
                
                invitado.sendMessage(`§aAhora eres miembro de ${clan.color}${clan.nombre}§a!`);
                invitado.playSound("random.levelup");
                
                const lider = world.getPlayers().find(p => p.name === nombreLider);
                if (lider) lider.sendMessage(`§a${invitado.name} se unio al clan.`);
            }
        }
    });
}

function menuExpulsarClan(player, clan) {
    // Filtrar: No mostrar al lider
    const miembrosExpulsables = clan.miembros.filter(m => m !== clan.lider);

    if (miembrosExpulsables.length === 0) {
        player.sendMessage("§c[!] No tienes miembros para expulsar.");
        return menuGestionarClan(player, clan); // 🔙 Regresa
    }

    const form = new ModalFormData()
        .title("Expulsar Miembro")
        .dropdown("Selecciona al miembro:", miembrosExpulsables);

    form.show(player).then(r => {
        if (r.canceled) return menuGestionarClan(player, clan); // 🔙 Regresa
        
        const nombreExpulsado = miembrosExpulsables[r.formValues[0]];
        const clanes = getClanes();
        const cIndex = clanes.findIndex(c => c.id === clan.id);

        if (cIndex !== -1) {
            // Borrar del array
            clanes[cIndex].miembros = clanes[cIndex].miembros.filter(m => m !== nombreExpulsado);
            saveClanes(clanes);

            player.sendMessage(`§eHas expulsado a ${nombreExpulsado} del clan.`);
            
            const expulsado = world.getPlayers().find(p => p.name === nombreExpulsado);
            if (expulsado) {
                expulsado.sendMessage(`§cHas sido expulsado del clan ${clan.nombre}.`);
                expulsado.playSound("random.break");
            }
            
            // 🔄 Recargamos el menu con el clan actualizado
            menuGestionarClan(player, clanes[cIndex]);
        }
    });
}

function salirDelClan(player, clan) {
    const form = new ActionFormData()
        .title("Abandonar Clan")
        .body("¿Estas seguro de que quieres salirte del clan?\nPerderas acceso al bunker y beneficios.")
        .button("SI, SALIR", "textures/ui/check")
        .button("CANCELAR", "textures/ui/cancel");

    form.show(player).then(r => {
        if (r.canceled || r.selection === 1) return;

        const clanes = getClanes();
        const cIndex = clanes.findIndex(c => c.id === clan.id);

        if (cIndex !== -1) {
            // Borrar jugador
            clanes[cIndex].miembros = clanes[cIndex].miembros.filter(m => m !== player.name);
            
            // Si el clan se queda vacio, ¿se borra?
            // Opcional: Si quieres que el clan muera si no hay nadie:
            if (clanes[cIndex].miembros.length === 0) {
                clanes.splice(cIndex, 1); // Borrar clan entero
            }
            
            saveClanes(clanes);
            player.sendMessage("§eHas abandonado el clan.");
            player.playSound("random.break");
        }
    });
}