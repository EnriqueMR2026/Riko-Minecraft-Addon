import { world, system, BlockPermutation } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { mostrarMenuPrincipal } from "./ui_menus.js";
import { getClanDeJugador } from "./ui_clanes.js";
import { obtenerZonaActual } from "./ui_zonas.js";
import { getSaldo, setSaldo, getDatosMundo, setDatosMundo, obtenerDistancia, getConfigVar, 
    calcularDescuentoTierras } from "./utils.js"; 


// =============================================================================
// 🏠 GESTOR DE DATOS DE TIERRAS
// =============================================================================

// Estructura de una Propiedad
/* id: string (timestamp)
   owner: string (nombre del dueño)
   center: {x, y, z}
   radio: 15 (fijo o expandible)
   expiracion: number (timestamp fecha limite de renta)
   whitelist: [] (lista de amigos permitidos)
*/

// Cargar todas las tierras
export function getTierras() {
    return getDatosMundo(CONFIG.DB_TIERRAS) || [];
}

function saveTierras(tierras) {
    setDatosMundo(CONFIG.DB_TIERRAS, tierras);
}

// Buscar tierra por dueño
export function obtenerTierraJugador(player) {
    const tierras = getTierras();
    return tierras.find(t => t.owner === player.name);
}

// Buscar tierra en una coordenada específica (Para saber si estoy parado en una casa)
export function obtenerTierraEnPos(x, z) {
    const tierras = getTierras();
    return tierras.find(t => {
        // CORRECCIÓN: Usamos lógica CUADRADA para coincidir con las partículas y el vigilante
        const distX = Math.abs(t.center.x - x);
        const distZ = Math.abs(t.center.z - z);
        
        // Si ambas distancias son menores al radio, estás dentro del cuadrado
        return distX <= t.radio && distZ <= t.radio;
    });
}

// =============================================================================
// 🛡️ LÓGICA DE PROTECCIÓN (API EXTERNA)
// =============================================================================

// Función Maestra: ¿Puede este jugador interactuar aquí?
// Se usará en main.js para bloquear romper/poner bloques
export function puedeInteractuar(player, x, z, y) { 
    // 1. Si es Admin (DIOS), hace lo que quiera
    if (player.hasTag(CONFIG.TAG_ADMIN)) return true;

    const tierra = obtenerTierraEnPos(x, z);

    // 2. Si es tierra de nadie, se puede (o puedes bloquearlo si quieres que sea solo wilderness)
    if (!tierra) return true;

    // ---> NUEVA LÓGICA DE RENTA: Si está vencida, es territorio público temporalmente <---
    if (Date.now() > tierra.expiracion) return true;

    // 3. Si es el dueño, se puede
    if (tierra.owner === player.name) return true;

    // 4. Si está en la whitelist, se puede
    if (tierra.whitelist.includes(player.name)) return true;

    // --- NUEVA LÓGICA: PASE VIP DE BÚNKER PARA EL CLAN (INTERACCIÓN) ---
    // Si llegó hasta aquí, significa que NO es dueño ni invitado.
    // Verificamos si al menos tienen el mismo clan y si el bloque está en la profundidad correcta.
    if (y !== undefined) { // Nos aseguramos de que 'y' se esté enviando desde main.js
        const miClan = getClanDeJugador(player.name);
        const dueñoClan = getClanDeJugador(tierra.owner);

        // ¿Tienen el mismo clan?
        if (miClan && dueñoClan && miClan.id === dueñoClan.id) {
            
            const cx = tierra.center.x;
            const cz = tierra.center.z;
            const distX = Math.abs(x - cx);
            const distZ = Math.abs(z - cz);

            const RADIO_BUNKER = 7; 
            const Y_TECHO_BUNKER = -52; 
            
            // Si el bloque interactuado está dentro de la caja de bedrock del búnker, concedemos permiso
            if (y <= Y_TECHO_BUNKER && distX <= RADIO_BUNKER && distZ <= RADIO_BUNKER) {
                return true; 
            }
        }
    }
    // -------------------------------------------------------------------

    // ❌ Bloqueado
    return false;
}
// =============================================================================
// 🖥️ MENÚS DE INTERFAZ (UI)
// =============================================================================

export function menuTierras(player) {
    const tierra = obtenerTierraJugador(player);

    if (!tierra) {
        menuReclamarTierra(player);
    } else {
        menuGestionarCasa(player, tierra);
    }
}

// --- A. RECLAMAR TERRENO ---
function menuReclamarTierra(player) {
    const tierras = getTierras();
    const px = Math.floor(player.location.x);
    const pz = Math.floor(player.location.z);
    
    // Verificar si hay vecinos cerca (Lógica de Cuadrados Anti-Colisión)
    const RADIO_NUEVO = 25; // El mismo radio inicial que asignas en crearTierra
    
    const conflicto = tierras.some(t => {
        const distX = Math.abs(t.center.x - px);
        const distZ = Math.abs(t.center.z - pz);
        
        // Para que dos cuadrados NO choquen, la distancia entre sus centros 
        // debe ser estrictamente mayor a la suma de sus radios.
        // Sumamos +1 como "margen de seguridad" para que ni siquiera compartan la pared.
        const limiteChoque = t.radio + RADIO_NUEVO + 1;
        
        // Si ambas distancias (X y Z) son menores al límite, significa que los terrenos se enciman o invaden.
        return (distX < limiteChoque) && (distZ < limiteChoque);
    });

    const costoSemanal = getConfigVar("COSTO_RENTA_SEMANAL");
    
    // NUEVO: Leemos el costo inicial desde la base de datos dinámica
    let costoInicial = getConfigVar("COSTO_RECLAMAR_TERRENO");
    
    // Si nunca han guardado la configuración en el admin, usamos por defecto 1/7 de la renta
    if (costoInicial === undefined) {
        costoInicial = Math.floor(costoSemanal / 7);
    }

    const form = new ActionFormData()
        .title("Gestión de Vivienda")
        .body(
            "§k5§r §cNo tienes un Terreno registrado.\n\n§f§oPuedes reclamar este terreno para que sea tuyo y puedas construir seguro. Nadie sin invitacion puedra entrar, construir, destruir y abrir tus cofres.§r\n\n" +
            `§fCosto del Terreno: ${CONFIG.SIMBOLO} §2${costoInicial}§r\n` +
            `§fRenta de Proteccion Semanal: ${CONFIG.SIMBOLO} §2${costoSemanal}`
        );

    if (conflicto) {
        form.body("§cNO PUEDES CONSTRUIR AQUÍ.\nHay un vecino demasiado cerca.\nAléjate unos bloques.");
        form.button("Zona Ocupada", "textures/botones/bloqueado");
    } else {
        form.button("RECLAMAR TERRENO AQUI", "textures/ui/color_plus");
    }
    
    form.button("Regresar", "textures/ui/cancel");

    form.show(player).then(r => {
        if (r.canceled) return mostrarMenuPrincipal(player); // 🔙 Regresa al Principal
        
        // Si hay conflicto, el botón 0 no hace nada o regresa
        if (conflicto && r.selection === 0) return menuReclamarTierra(player);

        if (r.selection === 0) crearTierra(player, costoInicial); // Pasamos el costo
        if (r.selection === 1) mostrarMenuPrincipal(player); // 🔙 Regresa
    });
}

function crearTierra(player, costo) {
    // 1. COBRAR EL COSTO (NUEVO)
    // Restamos el dinero del jugador antes de darle la tierra
    setSaldo(player, getSaldo(player) - costo);

    const tierras = getTierras();
    const centro = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
    };

    // Generamos un ID único desde aquí para usarlo tanto en el guardado como en el texto flotante
    const idTierra = Date.now().toString();

    // Crear bloque central (Obsiniana Llorosa) para marcar el punto exacto
    // Usamos try/catch por si intentas reclamar en el vacío o bedrock
    try {
        const dim = player.dimension;
        const bloqueSuelo = dim.getBlock({ x: centro.x, y: centro.y - 1, z: centro.z });
        if (bloqueSuelo) bloqueSuelo.setPermutation(BlockPermutation.resolve("minecraft:crying_obsidian"));
        
        // ---> NUEVO: TEXTO FLOTANTE DE LA CASA <---
        // Le sumamos 0.5 a X y Z para que quede centrado en el bloque. (y+1.8 es la altura de los ojos)
        const entity = dim.spawnEntity("rikocraft:texto_flotante", { x: centro.x + 0.5, y: centro.y + 0.8, z: centro.z + 0.5 });
        entity.nameTag = `§eTerreno de:\n§b${player.name}`;
        entity.addTag(`tierra_${idTierra}`); // Etiqueta para poder identificarlo y borrarlo si abandona el terreno
    } catch (e) {}

    // Calcular expiración (7 días exactos desde hoy)
    const unaSemana = 1000 * 60 * 60 * 24 * 7;
    
    const nuevaTierra = {
        id: idTierra,
        owner: player.name,
        center: centro,
        radio: 25, // Radio inicial de 15 bloques
        expiracion: Date.now() + unaSemana,
        whitelist: []
    };

    tierras.push(nuevaTierra);
    saveTierras(tierras);

    player.setDynamicProperty("ver_limites", true);
    // Mensaje que sale al reclamar un Terreno.
    player.sendMessage(`§r=========================§r\n§a[!] ¡FELICIDADES, Has reclamado este terreno!\n§e>> Se ha colocado un bloque de Obsidiana Llorosa bajo tus pies como el CENTRO.\n>> §oEn el Menu "Tierras" puedes desactivar la opcion de ver las particulas del Borde/Limite de tu Terreno.\n§r=========================§r`);
    player.playSound("random.levelup");
    mostrarParticulasBorde(player, nuevaTierra);
}

// --- B. GESTIONAR CASA ---
function menuGestionarCasa(player, tierra) {
    // 1. Calcular tiempo restante
    const ahora = Date.now();
    const tiempoRestanteMs = tierra.expiracion - ahora;
    
    // Formatear tiempo bonito
    let textoRenta = "§c¡VENCIDA!";
    
    if (tiempoRestanteMs > 0) {
        const dias = Math.floor(tiempoRestanteMs / (1000 * 60 * 60 * 24));
        const horas = Math.floor((tiempoRestanteMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        textoRenta = `§aPagado (${dias}d ${horas}h)`;
    } else {
        textoRenta = `§cVENCIDA (Hace ${Math.floor(Math.abs(tiempoRestanteMs) / (1000 * 60 * 60 * 24))} dias)`;
    }

    // Usamos getConfigVar para que obedezca al Panel de Admin
    const costoBase = getConfigVar("COSTO_RENTA_SEMANAL");

    // --- CALCULO DE DESCUENTO DE CLAN ---
    let costoFinal = costoBase;
    let textoBoton = `$${costoBase}`;
    
    const clan = getClanDeJugador(player.name);
    if (clan) {
        const descuento = calcularDescuentoTierras(clan.nivel);
        costoFinal = Math.floor(costoBase * descuento.multiplicador);
        
        if (descuento.multiplicador < 1) {
            textoBoton = `§2$${costoFinal} §7(-${descuento.texto})`;
        }
    }

    // --- LÓGICA DEL VISOR DE LÍMITES (ON/OFF) ---
    // Leemos la preferencia guardada (Por defecto OFF/undefined)
    const verLimites = player.getDynamicProperty("ver_limites") ?? true;
    const iconoOjo = verLimites ? "textures/ui/visible_b" : "textures/ui/invisible_b"; // Icono abierto/cerrado (o particles)
    const textoOjo = verLimites ? "VISOR LIMITES: §2§lON§r" : "VISOR LIMITES: §4§lOFF§r";

    const form = new ActionFormData()
        .title("§l§k5§r §l§0Mi Casa §k5§r")
        .body(
            `§f§lDueño: §r§b${tierra.owner}§r\n` +
            `§f§lEstado Renta: §r§2${textoRenta}§r\n` +
            `§f§lInvitados: §r§7${tierra.whitelist.length}\n `
        );

    // BOTON 0: RENTA
    form.button(`RENOVAR 7 DIAS\n${textoBoton}`, "textures/items/emerald"); 
    
    // BOTON 1: INVITADOS
    form.button("GESTIONAR INVITADOS", "textures/ui/accessibility_glyph_color"); 
    
    // BOTON 2: INTERRUPTOR VISUAL (Ahora es un Toggle)
    form.button(`${textoOjo}\n(Ver borde al acercarse)`, "textures/ui/particles"); 
    
    // BOTON 3: ABANDONAR
    form.button("ABANDONAR CASA", "textures/ui/trash"); 
    // BOTON 4: SALIR
    form.button("Regresar", "textures/ui/cancel"); 

    form.show(player).then(r => {
        if (r.canceled) return mostrarMenuPrincipal(player); 
        
        if (r.selection === 0) pagarRenta(player, tierra);
        if (r.selection === 1) menuInvitados(player, tierra);
        
        if (r.selection === 2) {
            // TOGGLE: Invertimos el valor actual
            const nuevoEstado = !verLimites;
            player.setDynamicProperty("ver_limites", nuevoEstado);
            player.playSound("random.click");
            
            // Recargamos el menú para ver el cambio
            //menuGestionarCasa(player, tierra);
        }
        
        if (r.selection === 3) confirmarAbandono(player, tierra);
        if (r.selection === 4) mostrarMenuPrincipal(player);
    });
}
// --- SUB-MENÚ: INVITADOS ---
function menuInvitados(player, tierra) {
    const form = new ActionFormData()
        .title("Gestionar Invitados")
        .body("\nControla quien puede entrar, romper y abrir cofres en tu casa.\n ")
        .button("AGREGAR INVITADO\n(En Linea)", "textures/ui/plus")
        .button("ELIMINAR INVITADO\n(Lista)", "textures/ui/minus")
        .button("Regresar", "textures/ui/cancel");

    form.show(player).then(r => {
        if (r.canceled) return menuGestionarCasa(player, tierra); // 🔙 Regresa a Casa
        
        if (r.selection === 0) agregarInvitado(player, tierra);
        if (r.selection === 1) eliminarInvitado(player, tierra);
        if (r.selection === 2) menuGestionarCasa(player, tierra); // 🔙 Regresa
    });
}

function agregarInvitado(player, tierra) {
    const jugadores = world.getPlayers();
    
    // Filtro inteligente: 
    // 1. No soy yo
    // 2. No está ya en la whitelist
    // 3. No es ADMIN (Tiene tag DIOS) -> No hace falta agregarlo porque ya tiene permiso
    const candidatos = jugadores.filter(p => 
        p.name !== player.name && 
        !tierra.whitelist.includes(p.name) &&
        !p.hasTag(CONFIG.TAG_ADMIN)
    );

    // Si no hay nadie a quien invitar, regresamos al menú anterior
    if (candidatos.length === 0) {
        player.sendMessage("§c[!] No hay jugadores disponibles para agregar.");
        return menuInvitados(player, tierra); // 🔙 Regresa
    }

    const form = new ModalFormData()
        .title("Agregar Amigo")
        .dropdown("Selecciona jugador conectado:", candidatos.map(p => p.name));

    form.show(player).then(r => {
        // Si cancela, vuelve al menú de invitados
        if (r.canceled) return menuInvitados(player, tierra); // 🔙 Regresa
        
        const nuevoAmigo = candidatos[r.formValues[0]].name;
        
        const tierras = getTierras();
        const tIndex = tierras.findIndex(t => t.id === tierra.id);
        
        if (tIndex !== -1) {
            // Agregamos a la lista
            tierras[tIndex].whitelist.push(nuevoAmigo);
            saveTierras(tierras);
            
            player.sendMessage(`§a[!] ${nuevoAmigo} agregado a tu casa.`);
            player.playSound("random.orb");
            
            // 🔄 Recargamos el menú de invitados para ver la lista actualizada
            menuInvitados(player, tierras[tIndex]);
        }
    });
}

function eliminarInvitado(player, tierra) {
    // 1. Si no hay nadie, regresamos
    if (tierra.whitelist.length === 0) {
        player.sendMessage("§c[!] Tu lista de invitados esta vacia.");
        return menuInvitados(player, tierra); // 🔙 Regresa
    }

    const form = new ModalFormData()
        .title("Eliminar Invitado")
        .dropdown("Selecciona nombre a borrar:", tierra.whitelist);

    form.show(player).then(r => {
        // 2. Si cancela, regresamos
        if (r.canceled) return menuInvitados(player, tierra); // 🔙 Regresa
        
        const borrado = tierra.whitelist[r.formValues[0]];
        
        const tierras = getTierras();
        const tIndex = tierras.findIndex(t => t.id === tierra.id);
        
        if (tIndex !== -1) {
            // Filtramos la lista para quitar al seleccionado
            tierras[tIndex].whitelist = tierras[tIndex].whitelist.filter(name => name !== borrado);
            saveTierras(tierras);
            
            player.sendMessage(`§e[!] ${borrado} eliminado de tu casa.`);
            player.playSound("random.break");
            
            // 🔄 Recargamos el menú de invitados
            menuInvitados(player, tierras[tIndex]);
        }
    });
}

// --- PAGOS Y ABANDONO ---
function pagarRenta(player, tierra) {
    // Usamos getConfigVar para obedecer al Panel de Admin
    const costoBase = getConfigVar("COSTO_RENTA_SEMANAL");

    // --- LOGICA DE DESCUENTO (NUEVO) ---
    let costoFinal = costoBase;
    let infoDescuento = "0%";
    
    const clan = getClanDeJugador(player.name);
    if (clan) {
        const descuento = calcularDescuentoTierras(clan.nivel);
        costoFinal = Math.floor(costoBase * descuento.multiplicador);
        infoDescuento = descuento.texto;
    }

    // 1. Verificar si tiene dinero (Usamos el precio con descuento)
    if (getSaldo(player) < costoFinal) {
        return player.sendMessage(`§c[!] No tienes dinero. Renta: $${costoFinal}`);
    }

    // 2. Verificar si ya esta lleno (Opcional: evita que paguen doble por error)
    // Si le quedan mas de 6 dias y 23 horas, no le dejamos pagar para que no gaste dinero a lo tonto
    const unDiaMs = 1000 * 60 * 60 * 24;
    const tiempoRestante = tierra.expiracion - Date.now();
    
    if (tiempoRestante > (unDiaMs * 6.9)) {
        player.sendMessage("§e[!] Ya tienes la renta completa (7 dias). Vuelve mañana.");
        return menuGestionarCasa(player, tierra); // Regresa al menu
    }

    // 3. Menu de Confirmacion
    const form = new ActionFormData()
        .title("Pagar Renta")
        .body(
            `§7Al pagar, tu tiempo de proteccion se reiniciara a §b7 dias exactos§7 a partir de ahora.\n\n` +
            `§fPrecio Base: §7$${costoBase}\n` +
            `§fDescuento Clan: §a${infoDescuento}\n` + 
            `§eTOTAL A PAGAR: §2$${costoFinal}`
        )
        .button("CONFIRMAR Y PAGAR", "textures/ui/check");

    form.show(player).then(r => {
        if (r.canceled) return menuGestionarCasa(player, tierra); // Si cancela, regresa
        
        const tierras = getTierras();
        const tIndex = tierras.findIndex(t => t.id === tierra.id);
        
        if (tIndex !== -1) {
            // A. Cobrar precio final (barato)
            setSaldo(player, getSaldo(player) - costoFinal);
            
            // B. Logica de NO ACUMULACION (Reset)
            // Fecha actual + 7 dias exactos. Lo que sobraba se pierde.
            const sieteDiasMs = 1000 * 60 * 60 * 24 * 7;
            tierras[tIndex].expiracion = Date.now() + sieteDiasMs;
            
            saveTierras(tierras);
            
            player.sendMessage(`§a[!] Renta pagada ($${costoFinal}). Tu proteccion vence en 7 dias.`);
            player.playSound("random.orb");
            
            // C. Regresar al menu para ver la fecha actualizada
            menuGestionarCasa(player, tierras[tIndex]);
        }
    });
}

function confirmarAbandono(player, tierra) {
    const form = new ActionFormData()
        .title("ABANDONAR CASA")
        .body("¿Estas seguro? Cualquiera podra reclamar este terreno.")
        .button("SI, ABANDONAR", "textures/ui/check")
        .button("§l§7>>  §4Regresar  §7<<", "textures/botones/regresar");

    form.show(player).then(r => {
        if (r.canceled || r.selection === 1) return menuGestionarCasa(player, tierra); // 🔙 Regresa

        if (r.selection === 0) {
            const tierras = getTierras();
            const nuevasTierras = tierras.filter(t => t.id !== tierra.id);
            saveTierras(nuevasTierras);
            
            // ---> NUEVO: ELIMINAR TEXTO FLOTANTE DE LA CASA <---
            try {
                // Buscamos a la entidad por la etiqueta oculta que le pusimos al crearla
                const entidades = player.dimension.getEntities({ type: "rikocraft:texto_flotante", tags: [`tierra_${tierra.id}`] });
                entidades.forEach(e => e.remove());
            } catch(e) {}

            player.sendMessage("§c[!] Has abandonado tu casa.");
            player.playSound("random.break");
            mostrarMenuPrincipal(player); // Volver al menú principal
        }
    });
}

// =============================================================================
// ✨ EFECTOS VISUALES
// =============================================================================

function mostrarParticulasBorde(player, tierra) {
    
    // Ejecutar un bucle temporal (20 ticks = 1 seg, x 10 = 200 ticks)
    let ticks = 0;
    const runner = system.runInterval(() => {
        if (ticks > 200) {
            system.clearRun(runner);
            return;
        }

        // Dibujar un cuadrado de partículas
        const r = tierra.radio;
        const c = tierra.center;
        const y = Math.floor(player.location.y) + 1; // A la altura de los ojos aprox

        // Dibujamos solo las esquinas y puntos medios para no laggear tanto
        // O usamos un bucle simple para el perímetro
        for (let i = -r; i <= r; i+=2) {
            // Lados X
            try {
                // Pared Sur (Positiva): Agregamos +1 para cubrir el bloque completo
                player.dimension.spawnParticle("minecraft:villager_happy", { x: c.x + i, y: y, z: c.z + r + 1 });
                // Pared Norte (Negativa): Se queda igual
                player.dimension.spawnParticle("minecraft:villager_happy", { x: c.x + i, y: y, z: c.z - r });

                // Lados Z
                // Pared Este (Positiva): Agregamos +1 para cubrir el bloque completo
                player.dimension.spawnParticle("minecraft:villager_happy", { x: c.x + r + 1, y: y, z: c.z + i });
                // Pared Oeste (Negativa): Se queda igual
                player.dimension.spawnParticle("minecraft:villager_happy", { x: c.x - r, y: y, z: c.z + i });
            } catch(e) {}
        }
        
        ticks += 10; // Saltamos ticks para no saturar
    }, 10);
}

// =============================================================================
// 👮 SISTEMA DE VIGILANCIA (Campo de Fuerza + Partículas 3x9)
// =============================================================================

export function iniciarVigilancia() {
    // Corremos esto cada 5 ticks (4 veces por segundo) para que sea suave
    system.runInterval(() => {
        const jugadores = world.getPlayers();
        const tierras = getTierras();

        for (const player of jugadores) {
            // --- CAMBIO 1: YA NO IGNORAMOS A LOS ADMINS AQUÍ ---
            // Antes estaba: if (player.hasTag(CONFIG.TAG_ADMIN)) continue;
            // Ahora solo guardamos si es admin o no para usarlo abajo
            const esAdmin = player.hasTag(CONFIG.TAG_ADMIN);

            // ---> NUEVO FIX: PASE VIP DE ZONA PROTEGIDA <---
            // Si el jugador está dentro de un Lobby o Zona Admin (Cuboide 3D),
            // la tierra de abajo (Cilindro Infinito) NO debe molestarlo ni expulsarlo.
            if (obtenerZonaActual(player)) continue;

            const pos = player.location;
            const px = Math.floor(pos.x);
            const pz = Math.floor(pos.z);
            const py = Math.floor(pos.y);

            // Leemos si el jugador quiere ver los límites (Switch ON)
            const quiereVer = player.getDynamicProperty("ver_limites") ?? true;

            for (const tierra of tierras) {
                const esDueño = tierra.owner === player.name;
                const esInvitado = tierra.whitelist.includes(player.name);
                let esAliado = esDueño || esInvitado; // Usamos 'let' para poder modificarlo

                // DATOS DE LA TIERRA
                const cx = tierra.center.x;
                const cz = tierra.center.z;
                const r = tierra.radio;
                
                const distX = Math.abs(px - cx);
                const distZ = Math.abs(pz - cz);

                // --- NUEVA LÓGICA: PASE VIP DE BÚNKER PARA EL CLAN ---
                if (!esAliado) {
                    // Importamos el clan del jugador actual y del dueño de la tierra
                    const miClan = getClanDeJugador(player.name);
                    const dueñoClan = getClanDeJugador(tierra.owner);

                    // ¿Ambos tienen clan y es exactamente el mismo?
                    if (miClan && dueñoClan && miClan.id === dueñoClan.id) {
                        
                        // CONFIGURACIÓN EXACTA DEL BÚNKER (Basado en ui_clanes.js)
                        const RADIO_BUNKER = 7; // El cubo de bedrock va de -7 a +7
                        const Y_TECHO_BUNKER = -52; // El techo de bedrock está en yFondo(-60) + 8 = -52
                        
                        // Si el jugador está por debajo del techo del búnker Y dentro del cubo de 15x15...
                        if (py <= Y_TECHO_BUNKER && distX <= RADIO_BUNKER && distZ <= RADIO_BUNKER) {
                            esAliado = true; // Inmunidad temporal concedida, ¡es compa del clan!
                        }
                    }
                }
                // -----------------------------------------------------

                // --- A. CAMPO DE FUERZA (EMPUJE) ---
                // Solo empujamos si:
                // 1. NO es aliado
                // 2. Y TAMPOCO es Admin (Los admins son inmunes al empuje)
                if (!esAliado && !esAdmin) {
                    if (distX <= r && distZ <= r) {
                        let knockX = 0;
                        let knockZ = 0;
                        const fuerza = 0.8;

                        if (distX > distZ) {
                            knockX = (px > cx) ? fuerza : -fuerza;
                        } else {
                            knockZ = (pz > cz) ? fuerza : -fuerza;
                        }

                        player.applyImpulse({ x: knockX * 1, y: 0.5, z: knockZ * 1 });
                        player.playSound("mob.shulker.bullet.hit");
                        // Mostramos el nombre del dueño y le damos 3 segundos (3000 ms) de pausa al HUD principal
                        player.onScreenDisplay.setActionBar(`§c§lPROPIEDAD DE: §e${tierra.owner.toUpperCase()}`);
                        player.setDynamicProperty("hud_pausa", Date.now() + 3000);
                        
                        // Si lo empujamos, le mostramos el borde para que entienda por qué
                        mostrarMuroParticulas(player, px, pz, py, cx, cz, r);
                        continue; 
                    }
                }

                // --- B. VISOR DE LÍMITES (PARTÍCULAS) ---
                // Mostramos partículas SI:
                // 1. Es un Intruso mortal (No Admin) acercándose (Advertencia automática)
                // 2. O SI tiene el VISOR PRENDIDO (Ya sea Dueño o Admin chismoso)
                
                const esIntrusoMortal = (!esAliado && !esAdmin && distX <= r + 6 && distZ <= r + 6);
                
                // Aquí está la magia: Si quieres ver y eres (Aliado O Admin), se muestra.
                const modoInspector = quiereVer && (esAliado || esAdmin);

                if (esIntrusoMortal || modoInspector) {
                      mostrarMuroParticulas(player, px, pz, py, cx, cz, r);
                }
            }
        }
    }, 5); 
}

// =============================================================================
// 🧱 HERRAMIENTA DE DIBUJO DE MUROS (AUXILIAR)
// =============================================================================

function mostrarMuroParticulas(player, px, pz, py, cx, cz, r) {
    const dimension = player.dimension;
    const distX = Math.abs(px - cx);
    const distZ = Math.abs(pz - cz);

    // RANGO DE VISIÓN:
    // Define qué tan lejos del borde puedes estar y seguir viendo las partículas.
    const rangoVision = 10; 

    // BUCLE DE ALTURA (3 BLOQUES: Pies-1, Pies, Cabeza)
    for (let k = -0.5; k <= 1.5; k++) {
        const yVis = py + k;

        // Paredes X (Norte/Sur visualmente)
        if (Math.abs(distX - r) < rangoVision) { 
            const paredX = (px > cx) ? cx + r + 1 : cx - r; 
            
            // Bucle ANCHO (9 Bloques: 4 izq + 1 centro + 4 der)
            for (let z = pz - 4; z <= pz + 4; z++) {
                if (z >= cz - r && z <= cz + r + 1) {
                    try { dimension.spawnParticle("minecraft:villager_happy", { x: paredX, y: yVis, z: z }); } catch(e){}
                }
            }
        }

        // Paredes Z (Este/Oeste visualmente)
        if (Math.abs(distZ - r) < rangoVision) { 
            const paredZ = (pz > cz) ? cz + r + 1 : cz - r;
            
            for (let x = px - 4; x <= px + 4; x++) {
                if (x >= cx - r && x <= cx + r + 1) {
                    try { dimension.spawnParticle("minecraft:villager_happy", { x: x, y: yVis, z: paredZ }); } catch(e){}
                }
            }
        }
    } 
}