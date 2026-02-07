import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { menuClanes } from "./ui_clanes.js";
import { menuTierras } from "./ui_tierras.js";
import { obtenerZonaActual } from "./ui_zonas.js";
import { getSaldo, buscarJugador, setSaldo, getWaypoints, addWaypoint, deleteWaypoint, obtenerInventario, VENTAS_PENDIENTES, 
    getDatosMundo, setDatosMundo, setConfigVar, getConfigVar, calcularCostoNivel } from "./utils.js";

// =============================================================================
// 🧠 HERRAMIENTA DE "INSISTENCIA" (Anti-Cierre de Chat)
// =============================================================================
// Esta función intenta abrir el menú. Si fallas porque tienes el chat abierto,
// espera y vuelve a intentar automáticamente hasta 10 veces.
function forzarApertura(player, menu, callback) {
    const loop = (intentos) => {
        menu.show(player).then(response => {
            // Si el menú se canceló porque el jugador estaba "Ocupado" (Chat abierto)
            if (response.canceled && response.cancelationReason === "UserBusy") {

                // Si es el primer intento fallido (0), le avisamos que cierre el chat
                if (intentos === 0) {
                    player.sendMessage("§7» §oCierra el chat para ver el menú...");
                }

                //  AQUÍ SE EDITA EL TIEMPO LÍMITE
                // 4 intentos = 1 segundo
                if (intentos < 36) { // Intentará durante unos 5 segundos
                    // Espera 5 ticks (0.25 seg) y vuelve a intentar
                    system.runTimeout(() => loop(intentos + 1), 5); 
                } else {
                    player.sendMessage("§c[SE ACABO EL TIEMPO] Despues de escribir @menu debes de Cerrar el chat.");
                }
            } else {
                // Si se abrió correctamente o se cerró por otra razón, ejecutamos la lógica
                callback(response);
            }
        });
    };
    // Iniciamos el primer intento
    loop(0);
}

// =============================================================================
// 📱 MENÚ PRINCIPAL (CORREGIDO: ADMIN IGNORA CANDADOS)
// =============================================================================
export function mostrarMenuPrincipal(player) {
    // 1. Detectar si es ADMIN (Dios)
    const esAdmin = player.hasTag(CONFIG.TAG_ADMIN);
    const zonaActual = obtenerZonaActual(player);
    
    // 2. Lógica de Candados (Bloqueos):
    // Solo bloqueamos SI TIENE EL TAG... Y NO ES ADMIN.
    // Si eres Admin, 'enMinijuego' y 'enZonaAdmin' siempre serán FALSE para que no te bloquee nada.
    const enMinijuego = !esAdmin && player.hasTag("minijuego"); 
    const enZonaAdmin = !esAdmin && (zonaActual !== undefined);

    const menu = new ActionFormData()
        .title("Menú RikoCraft")
        .body("§7Selecciona una categoría:");

    // 1. BANCO (Siempre visible)
    menu.button("§l§7>>  §2Banco  §7<<", "textures/botones/banco"); 

    // 2. VIAJAR (Bloqueado si estás Jugando Y NO ERES ADMIN)
    if (enMinijuego) {
        menu.button("§l§8Viajar\n[BLOQUEADO]", "textures/botones/bloqueado");
    } else {
        menu.button("§l§7>>  §1Viajes  §7<<", "textures/botones/viajes");
    }

    // 3. TIERRAS (Bloqueado si estás en Lobby Y NO ERES ADMIN)
    if (enZonaAdmin) {
        menu.button(`§l§8Terrenos\n[BLOQUEADO]`, "textures/botones/bloqueado");
    } else {
        menu.button("§l§7>>  §4Terrenos  §7<<", "textures/botones/terrenos");
    }

    // 4. CLANES
    menu.button("§l§7>>§v  Clanes  §7<<", "textures/botones/clanes");

    // ADMIN (Solo visible para Dios)
    if (esAdmin) {
        menu.button("§l§7>>  §5Administracion  §7<<", "textures/botones/administracion"); 
        menu.button("§l§7>>  §6Gamemode  §7<<", "textures/items/diamond_pickaxe");
    }

    // Usamos la herramienta de insistencia para abrirlo
    forzarApertura(player, menu, (response) => {
        if (response.canceled) return;

        switch (response.selection) {
            case 0: // Banco
                mostrarMenuBanco(player); break;
            
            case 1: // Viajar
                if (enMinijuego) return player.sendMessage("§c¡Termina la partida primero!");
                mostrarMenuViajes(player); break;
            
            case 2: // Tierras
                if (enZonaAdmin) return player.sendMessage(`§cNo puedes DECLARAR ESTE Terreno como tuyo. Es Zona del Realm: ${zonaActual.nombre}.`);
                menuTierras(player); break;
            
            case 3: // Clanes
                menuClanes(player); break;
            
            case 4: // Administracion
                if (esAdmin) menuPanelAdmin(player); break;

            case 5: // Gamemode
                if (esAdmin) menuGamemode(player); break;
        }
    });
}

// =============================================================================
// 🏦 SUB-MENÚ: BANCO
// =============================================================================
function mostrarMenuBanco(player) {
    const saldo = getSaldo(player);

    const banco = new ActionFormData()
        .title("§l§k5§r §l§0BANCO §r§l§k5§r")
        .body(`Cuenta: §l${player.name}§r\nDinero: §l§e${CONFIG.SIMBOLO} ${saldo} ${CONFIG.MONEDA}`)
        .button("§l§7>>  §2Transferir  §7<<", "textures/botones/transferir") 
        .button("§l§7>>  §6Vender  §7<<", "textures/botones/vender")
        .button("§l§7>>  §0Configurar HUD  §7<<", "textures/botones/configurar_hud") 
        .button("§l§7>>  §4Regresar  §7<<", "textures/botones/regresar");

    forzarApertura(player, banco, (res) => {
        if (res.canceled) return;

        if (res.selection === 0) {
            // AQUÍ PONDREMOS EL DROPDOWN DE TRANSFERIR (PRÓXIMO CÓDIGO)
            mostrarMenuTransferencia(player); 
        }
        else if (res.selection === 1) {
            mostrarMenuVender(player);
        }
        else if (res.selection === 2) {
            menuConfigHUD(player); 
        }
        else if (res.selection === 3) {
            mostrarMenuPrincipal(player);
        }
    });
}

// =============================================================================
// 💸 LÓGICA DE TRANSFERENCIA 
// =============================================================================

function mostrarMenuTransferencia(player) {
    const jugadores = world.getPlayers();
    // Creamos una lista solo con los nombres de OTROS jugadores (no tú mismo)
    const listaNombres = jugadores.filter(p => p.name !== player.name).map(p => p.name);

    if (listaNombres.length === 0) {
        player.sendMessage("§cNo hay nadie más en línea para transferir.");
        // OPCIONAL: Si quieres que regrese al banco si no hay nadie, cambia el return por:
        // return mostrarMenuBanco(player);
        return;
    }

    const saldoOrigen = getSaldo(player);
    const form = new ModalFormData()
        .title("Transferencia")
        .dropdown(`\nTienes: §f${CONFIG.SIMBOLO} ${saldoOrigen} ${CONFIG.MONEDA}\nSelecciona al beneficiario:`, listaNombres)
        .textField("Cantidad a enviar:", "Ej: 100");

    system.runTimeout(() => {
        form.show(player).then(res => {
            // --- AQUÍ ESTÁ EL CAMBIO ---
            // Si le das al tache, regresamos al Banco en lugar de cerrar
            if (res.canceled) return mostrarMenuBanco(player);

            const [indiceJugador, montoTexto] = res.formValues;
            const nombreDestino = listaNombres[indiceJugador];
            const cantidad = parseInt(montoTexto);

            // VALIDACIONES (Si falla, regresamos al menú de transferencia o banco para que no se cierre feo)
            if (isNaN(cantidad) || cantidad <= 0) {
                player.sendMessage("§cNúmero inválido, ingrese una cantidad correcta e intente de nuevo.");
                // Opcional: regresar al menú para reintentar
                return; 
            }

            const objetivo = buscarJugador(nombreDestino);
            if (!objetivo) {
                player.sendMessage("§cEl jugador se desconectó, transferencia cancelada.");
                return;
            }

            const saldoOrigen = getSaldo(player);
            if (saldoOrigen < cantidad) {
                player.sendMessage(`§cNo tienes dinero suficiente.\nSolo Tienes: §f${CONFIG.SIMBOLO} ${saldoOrigen} ${CONFIG.MONEDA}`);
                return;
            }

            // EJECUTAR TRANSACCIÓN
            setSaldo(player, saldoOrigen - cantidad);
            setSaldo(objetivo, getSaldo(objetivo) + cantidad);

            // AVISOS
            player.sendMessage(`§aEnviaste ${CONFIG.SIMBOLO} ${cantidad} ${CONFIG.MONEDA} a ${objetivo.name}`);
            objetivo.sendMessage(`§aRecibiste ${CONFIG.SIMBOLO} ${cantidad} ${CONFIG.MONEDA} de ${player.name}`);
            
            // SONIDOS
            try { player.playSound("random.levelup", { pitch: 2.0 }); } catch(e){}
            try { objetivo.playSound("random.orb"); } catch(e){}

            // FINAL: Regresar al banco para ver tu nuevo saldo
            ;
        });
    }, 10);
}

// =============================================================================
// ⚖️ SISTEMA DE VENTAS (Con Lógica de Cantidad)
// =============================================================================
function mostrarMenuVender(player) {
    // 1. Buscamos compradores
    const jugadores = world.getPlayers();
    // Filtramos para que no te salgas tu mismo en la lista
    const listaCompradores = jugadores.filter(p => p.name !== player.name).map(p => p.name);

    if (listaCompradores.length === 0) {
        player.sendMessage("§c[!] No hay nadie conectado a quien venderle.");
        return;
    }

    // 2. Leemos el inventario (Usando el traductor de utils.js)
    const misItems = obtenerInventario(player);
    if (misItems.length === 0) {
        player.sendMessage("§c[!] Tu inventario esta vacio.");
        return;
    }

    // Creamos la lista de textos para el menu (Ej: "Diamante (x64)")
    const nombresItems = misItems.map(i => i.texto);

    // 3. Formulario con CAMPO DE CANTIDAD
    const form = new ModalFormData()
        .title("Crear Oferta")
        .dropdown("\n1. ¿A quien le quieres vender?", listaCompradores)
        .dropdown("2. ¿Que quieres venderle?", nombresItems)
        .textField("3. ¿Cuantos le quieres vender?:", "Ej: 1, 32, 64") // <--- AQUI PEDIMOS CUANTOS
        .textField("4. Precio de venta:", `Ej: ${CONFIG.SIMBOLO} 500`);

    system.runTimeout(() => {
        form.show(player).then(res => {
            if (res.canceled) return;

            // Obtenemos los datos del formulario
            const [idxJugador, idxItem, cantidadTxt, precioTxt] = res.formValues;
            
            const nombreComprador = listaCompradores[idxJugador];
            const itemInfo = misItems[idxItem];
            
            // --- 🛡️ FIX DE SEGURIDAD: EVITAR SOBREESCRITURA ---
            if (VENTAS_PENDIENTES.has(nombreComprador)) {
                player.sendMessage(`§c[!] ${nombreComprador} ya tiene una oferta pendiente. Espera a que responda o expire.`);
                player.playSound("mob.villager.no");
                return;
            }
            // ----------------------------------------------------
            
            // Convertimos los textos a numeros enteros
            let cantidadVenta = parseInt(cantidadTxt);
            const precio = parseInt(precioTxt);

            // --- VALIDACIONES DE SEGURIDAD ---
            if (isNaN(precio) || precio < 0) {
                player.sendMessage("§c[!] Precio invalido."); return;
            }
            if (isNaN(cantidadVenta) || cantidadVenta <= 0) {
                player.sendMessage("§c[!] La cantidad debe ser mayor a 0."); return;
            }
            // Revisamos si tienes suficientes items en ese slot
            if (cantidadVenta > itemInfo.amount) {
                player.sendMessage(`§c[!] No tienes tantos. Solo tienes ${itemInfo.amount} en ese slot.`);
                return;
            }

            // --- LÓGICA MATEMÁTICA (SEPARAR STACKS) ---
            const comprador = buscarJugador(nombreComprador);
            if (!comprador) {
                player.sendMessage("§c[!] El comprador se desconecto."); return;
            }

            const inventory = player.getComponent("inventory").container;
            const itemOriginal = inventory.getItem(itemInfo.slot);

            // Verificacion extra: ¿El item sigue ahi o lo moviste mientras escribias?
            if (!itemOriginal || itemOriginal.typeId !== itemInfo.typeId) {
                player.sendMessage("§c[!] Error: El item se movio de lugar."); return;
            }

            // PASO A: Clonamos el item original para crear el paquete de venta
            const itemVenta = itemOriginal.clone();
            itemVenta.amount = cantidadVenta; // Le ponemos SOLO la cantidad que quieres vender

            // PASO B: Restamos del inventario fisico
            if (cantidadVenta === itemOriginal.amount) {
                // CASO 1: Vendes todo el stack -> Borramos el item del inventario
                inventory.setItem(itemInfo.slot, undefined);
            } else {
                // CASO 2: Vendes solo una parte -> Restamos la cantidad al original
                itemOriginal.amount = itemOriginal.amount - cantidadVenta;
                inventory.setItem(itemInfo.slot, itemOriginal); // Guardamos el cambio
            }

            // 4. Guardar oferta en memoria (Nube)
            const idVenta = Date.now();
            VENTAS_PENDIENTES.set(nombreComprador, {
                id: idVenta,
                vendedor: player.name,
                comprador: nombreComprador,
                itemStack: itemVenta, // Guardamos el clon con la cantidad exacta
                precio: precio,
                timestamp: Date.now()
            });

            // FEEDBACK (Mensajes)
            // Obtenemos el nombre traducido directamente de utils.js
            // Si tiene etiqueta (Yunque) usa esa, si no, usa la traducción al español
            let nombreLimpio = itemInfo.nameTag || itemInfo.nombreTraducido;
            
            player.sendMessage(`§e------------------------------`);
            player.sendMessage(`§a[!] Oferta enviada a ${nombreComprador}.`);
            player.sendMessage(`§g>> Vendes: §7[§g${cantidadVenta}§7] §g${nombreLimpio}`);
            player.sendMessage(`§g>> Precio: ${CONFIG.SIMBOLO} ${precio} ${CONFIG.MONEDA}`);
            player.sendMessage(`§7§oEspera a que Acepte o Caduque la oferta en 5 minutos...`);
            player.sendMessage(`§e------------------------------`);
            player.playSound("random.pop");

            // AVISO AL COMPRADOR
            comprador.sendMessage(`§e------------------------------`);
            comprador.sendMessage(`§l§a[!] NUEVA OFERTA DE COMERCIO`);
            comprador.sendMessage(`§f${player.name} §7te quiere vender:`);
            comprador.sendMessage(`§7[ §b${cantidadVenta} §7] §b${nombreLimpio} §fPor §e${CONFIG.SIMBOLO} ${precio} ${CONFIG.MONEDA}`);
            comprador.sendMessage(`§7Escribe §a@aceptar §7o §a@rechazar`);
            comprador.sendMessage(`§7La oferta caduca en 5 minutos...`);
            comprador.sendMessage(`§e------------------------------`);
            comprador.playSound("random.levelup");

            // Iniciamos el reloj para devolver el item si no aceptan
            iniciarTimerVenta(player, nombreComprador, idVenta);
        });
    }, 10);
}

// Timer para devolver el item si nadie acepta
function iniciarTimerVenta(vendedor, nombreComprador, idVenta) {
    system.runTimeout(() => {
        if (VENTAS_PENDIENTES.has(nombreComprador)) {
            const venta = VENTAS_PENDIENTES.get(nombreComprador);
            
            if (venta.id === idVenta) {
                VENTAS_PENDIENTES.delete(nombreComprador); 
                
                // 1. Devolver al VENDEDOR
                const vendedorActual = buscarJugador(venta.vendedor);
                if (vendedorActual) {
                    const inv = vendedorActual.getComponent("inventory").container;
                    const sobrante = inv.addItem(venta.itemStack);
                    
                    if (sobrante) {
                        vendedorActual.dimension.spawnItem(venta.itemStack, vendedorActual.location);
                    }
                    
                    vendedorActual.sendMessage("§c[!] La oferta caduco. Los objetos se te han devuelto.");
                    vendedorActual.playSound("mob.villager.no");
                }

                // 2. Avisar al COMPRADOR
                // Lo buscamos de nuevo por si se reconectó o cambió algo
                const compradorActual = buscarJugador(nombreComprador);
                if (compradorActual) {
                    compradorActual.sendMessage(`§c[!] La oferta de venta de ${venta.vendedor} ha caducado.`);
                    // Sonido de "click" o cancelación suave
                    compradorActual.playSound("random.click"); 
                }
            }
        }
    }, 100); // Tiempo que dura la oferta (20 ticks = 1 segundo)
}

// --- SUB-MENÚ: CONFIGURACIÓN HUD ---
function menuConfigHUD(player) {
    const form = new ActionFormData()
        .title("Configuración de Pantalla")
        .body("Selecciona qué información quieres ver arriba de la barra de experiencia.")
        .button("§l§7>>  §4APAGADO  §7<<\n§r(No Mostrar Informacion)", "textures/botones/apagado")
        .button(`§l§7>>  §2DINERO  §7<<\n§r(Mostrar tus ${CONFIG.MONEDA})`, "textures/botones/dinero")
        .button("§l§7>>  §6CLAN  §7<<\n§r(Nivel y Experiencia)", "textures/botones/clanes")
        .button("§l§7>>  §0AMBOS  §7<<\n§r(DINERO Y CLAN)", "textures/botones/dinero_y_clanes");

    form.show(player).then(r => {
        if (r.canceled) return mostrarMenuBanco(player);

        // Guardamos la selección en la propiedad del jugador
        player.setDynamicProperty("hud_mode", r.selection);
        
        let mensajePersonalizado = "";

        // Aquí controlas cada mensaje por separado
        switch (r.selection) {
            case 0:
                mensajePersonalizado = "Configuración actualizada: §6Se ha ocultado toda la información.";
                break;
            case 1:
                mensajePersonalizado = `Configuración actualizada: §6Se mostrará tus ${CONFIG.MONEDA}.`;
                break;
            case 2:
                mensajePersonalizado = "Configuración actualizada: §6Se mostrará el nivel y experiencia de tu Clan.";
                break;
            case 3:
                mensajePersonalizado = "Configuración actualizada: §6Se mostrará tu Dinero y tu Clan.";
                break;
        }

        // Enviamos el mensaje final
        player.sendMessage(`§a[!] ${mensajePersonalizado}`);
        player.playSound("random.click");
        
        // mostrarMenuBanco(player);
    });
}

// =============================================================================
// 🚀 SUB-MENÚ: VIAJES (PÚBLICO/PRIVADO)
// =============================================================================

function mostrarMenuViajes(player) {
    const zonaActual = obtenerZonaActual(player);
    
    // 1. VERIFICAMOS SI ES DIOS (O ADMIN)
    // Si tiene la tag DIOS, esta variable será true
    const esDios = player.hasTag("DIOS"); 

    const menu = new ActionFormData()
        .title("§l§k5§r §l§0VIAJES §r§l§k5§r")
        .body("\nElige un destino para ir:\n ")
        .button("§l§7>> §3MIS UBICACIONES  §7<<\n§r(Privado)", "textures/botones/mapa") // Botón 0
        .button("§l§7>> §5LUGARES PUBLICOS  §7<<\n§r(Realm)", "textures/botones/mapa_publico"); // Botón 1

    // LÓGICA: Si NO hay zona o si eres DIOS -> Muestra el botón de guardar
    if (!zonaActual || esDios) {
        menu.button("§l§7>> §2GUARDAR UBICACION  §7<<", "textures/botones/mapa_vacio"); 
    } else {
        // Si hay zona Y eres mortal -> Muestra bloqueado
        menu.button("§l§8GUARDAR UBICACION\n[BLOQUEADO]", "textures/botones/bloqueado");
    }
    
    menu.button("§l§7>>  §4Regresar  §7<<", "textures/botones/regresar");

    forzarApertura(player, menu, (r) => {
        if (r.canceled) return;
        if (r.selection === 0) menuListaWaypoints(player, false);
        if (r.selection === 1) menuListaWaypoints(player, true);
        
        if (r.selection === 2) {
             // Si hay zona Y NO eres Dios -> Te bloquea.
             if (zonaActual && !esDios) {
                 return player.sendMessage("§cNo puedes guardar una ubicación en zonas protegidas.");
             }
             
             menuCrearWaypoint(player);
        }
        
        if (r.selection === 3) mostrarMenuPrincipal(player);
    });
}

function menuCrearWaypoint(player) {
    if (player.dimension.id !== "minecraft:overworld") {
        player.sendMessage("§cNo puedes guardar una ubicacion en esta dimension. Solo puedes guardar en el Overworld.");
        return; // También regresamos aquí si hay error
    }
    
    const esAdmin = player.hasTag(CONFIG.TAG_ADMIN);

    const form = new ModalFormData()
        .title("Guardar Ubicación")
        .textField("§6[!] Solo puedes guardar 4 ubicaciones\n\n§aNombre del Lugar:\n ", "Ej: Casa, Aldea, Mina");

    // FIX: Quitamos el "false" extra que causaba el error
    if (esAdmin) form.toggle("§a¿Quieres que esta ubicacion sea Publica?");

    form.show(player).then(r => {
        // Si cancelas, regresas al menú de viajes
        if (r.canceled) return mostrarMenuViajes(player);

        let nombre = r.formValues[0].trim() || "Sin Nombre";
        // Si no es admin, siempre es false. Si es admin, leemos el valor del toggle (index 1)
        const hacerPublico = esAdmin ? r.formValues[1] : false;

        if (hacerPublico) {
            const warps = getDatosMundo("db_warps_publicos") || [];
            warps.push({ name: `${nombre}`, x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z), dim: player.dimension.id });
            setDatosMundo("db_warps_publicos", warps);
            world.sendMessage(`§a[!] Nueva Ubicacion Publica establecida: §f${nombre}`);
        } else {
            const guardado = addWaypoint(player, nombre, player.location);
            if (guardado) player.sendMessage(`§aUbicación privada "§f${nombre}§a" guardada.`);
            else player.sendMessage("§cHas alcanzado el limite de Ubicaciones privadas  [ 4/4 ].");
        }
        
        // por si quieres que regrese al menu despues 
        // mostrarMenuViajes(player);
    });
}

function menuListaWaypoints(player, verPublicos) {
    // Decidimos qué lista cargar (Pública o Privada)
    const lista = verPublicos ? (getDatosMundo("db_warps_publicos") || []) : getWaypoints(player);

    if (lista.length === 0) {
        player.sendMessage(verPublicos ? "§eNo hay Warps Públicos por ahora." : "§eNo tienes ubicaciones guardadas, primero añade una.");
        // Regresa al menú anterior para que no se cierre feo
        return mostrarMenuViajes(player); 
    }

    const menu = new ActionFormData().title(verPublicos ? "Ubicaciones del Realm" : "Mis Ubicaciones");
    
    // Generamos los botones para cada warp
    lista.forEach(wp => menu.button(`§l${wp.name}\n§r§0${wp.x}, ${wp.y}, ${wp.z}`));

    // Botón de borrar (Solo si es mi lista privada o si soy Admin viendo públicos)
    const puedeBorrar = !verPublicos || player.hasTag(CONFIG.TAG_ADMIN);
    if (puedeBorrar) menu.button("§l§4[BORRAR UBICACIÓN]", "textures/botones/eliminar");

    menu.show(player).then(r => {
        // Si cancela (X), regresa al menú de viajes
        if (r.canceled) return mostrarMenuViajes(player); 
        
        // Si pulsó el botón de borrar (es el último botón de la lista)
        if (puedeBorrar && r.selection === lista.length) {
            menuBorrarWaypoint(player, verPublicos, lista); 
            return;
        }
        // Obtenemos el destino seleccionado
        const destino = lista[r.selection];
        
        // En lugar de TP directo, iniciamos la cinemática
        iniciarSecuenciaViaje(player, destino); 
    });
}

// --- VENTANA 3: BORRAR ---
function menuBorrarWaypoint(player, esPublico, lista) {
    // Usamos la lista que nos llega (ya sea pública o privada)
    const nombres = lista.map(wp => wp.name); 

    const form = new ModalFormData()
        .title(esPublico ? "Borrar Ubicacion Pública" : "Eliminar Ubicación")
        .dropdown("\n§c¿Que ubicacion quieres borrar?\n ", nombres);

    system.runTimeout(() => {
        form.show(player).then(res => {
            if (res.canceled) return;
            
            const index = res.formValues[0];
            const nombreBorrado = nombres[index];
            
            if (esPublico) {
                // Quitamos el elemento de la lista global y guardamos
                const nuevosWarps = lista.filter((_, i) => i !== index);
                setDatosMundo("db_warps_publicos", nuevosWarps);
                
                player.sendMessage(`§a[!] Has eliminado la Ubicacion pública "§f${nombreBorrado}§a" correctamente.`);
            } else {
                // LÓGICA PARA WAYPOINTS PRIVADOS (Tu lógica original)
                deleteWaypoint(player, index);
                player.sendMessage(`§a[!] Has eliminado "§f${nombreBorrado}§a" correctamente.`);
            }
        });
    }, 10);
}

// =============================================================================
// SECUENCIA DE VIAJE CINEMATOGRAFICA (VERSION FINAL - CAMARA DRONE)
// =============================================================================
function iniciarSecuenciaViaje(player, destino) {
    // 1. Verificar Cooldown
    const cooldown = player.getDynamicProperty("warp_cd") || 0;
    const ahora = Date.now();
    
    if (ahora < cooldown) {
        const segundosFaltan = Math.ceil((cooldown - ahora) / 1000);
        player.sendMessage(`§cTu energia magica se esta recuperando. Espera ${segundosFaltan}s.`);
        player.playSound("random.fizz");
        return;
    }

    // 2. Establecer castigo
    player.setDynamicProperty("warp_cd", ahora + 30000); 

    // 3. Preparar variables seguras
    let posOrigen, hpComp, vidaAnterior, rotacionInicial;
    try {
        posOrigen = player.location;
        hpComp = player.getComponent("health");
        vidaAnterior = hpComp.currentValue;
        rotacionInicial = player.getRotation(); 
    } catch (e) { return; }
    
    // 4. AVISO
    player.sendMessage(`§eIniciando viaje a §f${destino.name}§e... No te muevas (7s).`);
    player.playSound("beacon.activate");

    // Variables de control
    let dimActual = player.dimension;
    let ticks = 0;
    
    // Configuración Visual
    // Convertimos rotacion a radianes para calculos
    const yawRad = (rotacionInicial.y + 90) * (Math.PI / 180);
    let anguloAcumulado = yawRad - (Math.PI / 2); // Empezar a los costados
    
    // Pilares de particulas
    const alturasPilar = [0.2, 0.7, 1.2, 1.7, 2.2, 2.7, 3.2, 3.7];

    // =================================================
    // ESCENA 1: EL DESPEGUE (CAMARA)
    // =================================================
    if (player.camera) {
        try {
            // Calculamos una posicion ATRAS y ARRIBA del jugador
            const distCam = 3.5;
            // Invertimos el angulo para ir hacia atras
            const camX = posOrigen.x - Math.cos(yawRad - Math.PI/2) * distCam; 
            const camZ = posOrigen.z - Math.sin(yawRad - Math.PI/2) * distCam;
            const camY = posOrigen.y + 3.0; // 3 bloques arriba para picado

            player.camera.setCamera("minecraft:free", {
                location: { x: camX, y: camY, z: camZ },
                facingEntity: player, // Mirar siempre al jugador
                easeOptions: {
                    time: 4.0, // Tarda 4s en llegar a esa posicion (suave)
                    easeType: "InOutSine"
                }
            });
        } catch(e) {}
    }

    // --- LOOP PRINCIPAL ---
    const runner = system.runInterval(() => {
        try { const _check = player.name; } catch (e) {
            system.clearRun(runner); return;
        }

        ticks++;
        const segundos = ticks / 20;

        // =================================================
        // FASE 1: VIGILANCIA (0 a 7s)
        // =================================================
        if (segundos < 7) {
            const dx = Math.abs(player.location.x - posOrigen.x);
            const dz = Math.abs(player.location.z - posOrigen.z);
            if (dx > 0.5 || dz > 0.5) {
                cancelarViaje(player, runner, "Te moviste! Concentracion rota."); return;
            }
            const vidaActual = hpComp.currentValue;
            if (vidaActual < vidaAnterior) {
                cancelarViaje(player, runner, "Te han herido! Viaje interrumpido."); return;
            }
            vidaAnterior = vidaActual; 
        }

        // =================================================
        // ESCENA 2: LA ORBITA (CAMARA 4s-7s)
        // =================================================
        // Solo activamos la orbita durante la fase de oscuridad
        if (player.camera && ticks >= 80 && ticks < 140) {
            // Hacemos que la camara gire siguiendo el angulo de las particulas
            // pero con un radio mayor para ver todo el espectaculo
            const radioCam = 4.0;
            const camOrbitX = posOrigen.x + Math.cos(anguloAcumulado) * radioCam;
            const camOrbitZ = posOrigen.z + Math.sin(anguloAcumulado) * radioCam;
            const camOrbitY = posOrigen.y + 2.5;

            // Actualizamos cada tick para efecto de giro fluido
            try {
                player.camera.setCamera("minecraft:free", {
                    location: { x: camOrbitX, y: camOrbitY, z: camOrbitZ },
                    facingLocation: { x: posOrigen.x, y: posOrigen.y + 1.5, z: posOrigen.z } // Mirar al pecho
                });
            } catch(e) {}
        }


        // =================================================
        // EVENTOS TEMPORALES
        // =================================================
        if (ticks === 80) { // 4s
            player.addEffect("darkness", 100, { amplifier: 255, showParticles: false });
            player.playSound("mob.warden.nearby_close");
        }

        // T=7s: EL TELETRANSPORTE Y ESCENA 3
        if (ticks === 140) { 
            try {
                const dimDestino = world.getDimension(destino.dim);
                player.teleport({ x: destino.x, y: destino.y, z: destino.z }, { dimension: dimDestino });
                dimActual = dimDestino; 
                player.sendMessage(`§aHas llegado a ${destino.name}.`);
                player.playSound("portal.travel");

                // --- ESCENA 3: EL IMPACTO (ZOOM IN) ---
                if (player.camera) {
                    // Paso 1: Colocar camara frente a la cara (SNAP instantaneo)
                    // Calculamos vector frente
                    const newYawRad = (player.getRotation().y + 90) * (Math.PI / 180);
                    const frontDist = 2.5; // Empezamos a 2.5 bloques de distancia
                    
                    const startX = destino.x + Math.cos(newYawRad) * frontDist;
                    const startZ = destino.z + Math.sin(newYawRad) * frontDist;
                    const eyeY = destino.y + 1.6;

                    // Posicion Final (Dentro de la cabeza / Ojos)
                    const endX = destino.x; // +0 distancia
                    const endZ = destino.z;

                    // Ejecutamos la transicion: De Frente -> A los Ojos
                    // Truco: Ponemos la camara en Start y le decimos que vaya a End
                    player.camera.setCamera("minecraft:free", {
                        location: { x: startX, y: eyeY, z: startZ },
                        facingLocation: { x: endX, y: eyeY, z: endZ } // Mirar a los ojos
                    });

                    // En el siguiente tick, iniciamos el viaje hacia adentro (Zoom)
                    system.runTimeout(() => {
                        try {
                            player.camera.setCamera("minecraft:free", {
                                location: { x: endX, y: eyeY, z: endZ }, // Destino: Ojos
                                facingLocation: { x: endX + Math.cos(newYawRad)*5, y: eyeY, z: endZ + Math.sin(newYawRad)*5 }, // Mirar al horizonte
                                easeOptions: {
                                    time: 1.8, // 1.8 segundos para entrar en tu cuerpo
                                    easeType: "Spring" // Efecto rebote suave al entrar
                                }
                            });
                        } catch(e){}
                    }, 1);
                }

            } catch (e) {
                cancelarViaje(player, runner, "Error: El destino no es valido."); return;
            }
        }

        if (ticks === 180) { // 9s
            player.removeEffect("darkness"); 
            player.playSound("random.levelup");
            
            // DEVUELVE LA CAMARA AL JUGADOR
            if (player.camera) player.camera.clear();
        }

        if (ticks >= 240) { // 12s
            system.clearRun(runner);
        }

        // =================================================
        // PARTICULAS (SIN CAMBIOS)
        // =================================================
        let velocidadGiro = 0;
        if (segundos < 7) velocidadGiro = 0.1 + Math.pow(segundos / 7, 2) * 0.5; 
        else {
            const progresoFinal = (segundos - 7) / 5; 
            velocidadGiro = 0.6 * (1 - Math.pow(progresoFinal, 0.5)); 
        }

        anguloAcumulado += velocidadGiro;

        if (velocidadGiro > 0.01) {
            const radio = 2.5; 
            const cosA = Math.cos(anguloAcumulado);
            const sinA = Math.sin(anguloAcumulado);
            const activarCuatro = segundos > 4.5;

            for (const alturaFija of alturasPilar) {
                const py = player.location.y + alturaFija;
                try {
                    dimActual.spawnParticle("minecraft:obsidian_glow_dust_particle", 
                        { x: player.location.x + (cosA * radio), y: py, z: player.location.z + (sinA * radio) });
                    dimActual.spawnParticle("minecraft:obsidian_glow_dust_particle", 
                        { x: player.location.x - (cosA * radio), y: py, z: player.location.z - (sinA * radio) });

                    if (activarCuatro) {
                        dimActual.spawnParticle("minecraft:obsidian_glow_dust_particle", 
                            { x: player.location.x + (sinA * radio), y: py, z: player.location.z - (cosA * radio) });
                        dimActual.spawnParticle("minecraft:obsidian_glow_dust_particle", 
                            { x: player.location.x - (sinA * radio), y: py, z: player.location.z + (cosA * radio) });
                    }
                } catch(e) {}
            }
        }

    }, 1);
}

// Función auxiliar
function cancelarViaje(player, runner, motivo) {
    system.clearRun(runner);
    try {
        player.removeEffect("darkness");
        if (player.camera) player.camera.clear(); // Importante: Devolver camara si falla
    } catch(e) {}
    player.sendMessage(`§c[!] ${motivo}`);
    player.playSound("mob.villager.no");
}

// =============================================================================
// 👑 PANEL DE ADMINISTRADOR (NAVEGACIÓN FLUIDA)
// =============================================================================

function menuPanelAdmin(player) {
    const form = new ActionFormData()
        .title("§l§k5§r §l§0ADMINISTRACION §r§l§k5§r")
        .body("§l§f\n  >>  Control total del Realm  <<\n ")
        .button("§l§7>>  §5HERRAMIENTAS  §7<<\n§r(Silenciar chat, Lag)", "textures/botones/herramientas")
        .button("§l§7>>  §5EDITAR REALM  §7<<\n§r(Precios, Límites)", "textures/botones/servidor")
        .button("§l§7>>  §5EXPERIENCIA DROP  §7<<\n§r(Mobs y Recompensas)", "textures/botones/drops") 
        .button("§l§7>>  §5EDITAR TERRENOS  §7<<\n§r(Editar Radios)", "textures/botones/editar_terrenos")
        .button("§l§7>>  §5EDITAR CLANES  §7<<\n§r(Gestionar/XP)", "textures/botones/editar_clanes") 
        .button("§l§7>>  §5ECONOMÍA  §7<<\n§r(Dar/Quitar Dinero)", "textures/botones/economia")
        .button("§l§7>>  §4Regresar  §7<<", "textures/botones/regresar");

    form.show(player).then(r => {
        if (r.canceled) return;
        switch(r.selection) {
            case 0: menuHerramientas(player); break;
            case 1: menuConfigServer(player); break;
            case 2: menuConfigMobsXP(player); break; 
            case 3: menuAdminZonas(player); break;
            case 4: menuAdminClanes(player); break;
            case 5: menuAdminEconomia(player); break;
            case 6: mostrarMenuPrincipal(player); break;
        }
    });
}

// --- 1. HERRAMIENTAS (FLUIDO + MUTE CON TIEMPO) ---
function menuHerramientas(player) {
    const form = new ActionFormData()
        .title("Herramientas")
        .button("LIMPIAR LAG\n(Eliminar items del piso)", "textures/botones/eliminar")
        .button("Silenciar Chat\n(Global o Jugador)", "textures/botones/silenciar_chat") 
        .button("§l§7>>  §4Regresar  §7<<", "textures/botones/regresar");

    form.show(player).then(r => {
        if (r.canceled) return;
        
        if (r.selection === 0) {
            // Clear Lag
            const items = player.dimension.getEntities({ type: "minecraft:item" });
            let count = 0;
            items.forEach(i => { try{ i.remove(); count++; }catch(e){} });
            player.sendMessage(`§e[!] Se eliminaron ${count} ítems del realm.`);
            //menuHerramientas(player); // 🔄 SE QUEDA AQUÍ
        }
        else if (r.selection === 1) menuGestionMute(player);
        else if (r.selection === 2) menuPanelAdmin(player); // REGRESA
    });
}

// --- GESTIÓN DE SILENCIO (SUB-MENÚ) ---
function menuGestionMute(player) {
    const estadoGlobal = world.getDynamicProperty("chat_muteado") ? "§l§4SILENCIADO" : "§l§2ACTIVO";
    
    const form = new ActionFormData()
        .title("Gestor de Silencio")
        .body(`\nSelecciona una opcion:\n `)
        .button(`CHAT GLOBAL\n${estadoGlobal}`, "textures/botones/chat")
        .button("SILENCIAR JUGADOR", "textures/botones/silenciar_chat")
        .button("DES-SILENCIAR JUGADOR", "textures/botones/des_silenciar_chat")
        .button("§l§7>>  §4Regresar  §7<<", "textures/botones/regresar");

    form.show(player).then(r => {
        if (r.canceled) return;
        
        if (r.selection === 0) {
            const nuevo = !world.getDynamicProperty("chat_muteado");
            world.setDynamicProperty("chat_muteado", nuevo);
            world.sendMessage(nuevo ? "§cCHAT GLOBAL SILENCIADO POR §eDIOS§c." : "§aCHAT GLOBAL ACTIVADO, YA PUEDES ESCRIBIR.");
            menuGestionMute(player); // Recarga para ver el cambio
        }
        else if (r.selection === 1) menuMutearJugadorOpciones(player);
        else if (r.selection === 2) menuDesmutearJugador(player);
        else if (r.selection === 3) menuHerramientas(player); // Regresa
    });
}

// --- SELECCIÓN DE TIEMPO ---
function menuMutearJugadorOpciones(player) {
    const jugadores = world.getPlayers();
    const nombres = jugadores.map(p => p.name);
    const tiempos = ["10 Minutos", "30 Minutos", "1 Hora", "6 Horas", "24 Horas", "PERMANENTE"];
    const valores = [600000, 1800000, 3600000, 21600000, 86400000, -1];

    const form = new ModalFormData()
        .title("Silenciar Jugador")
        .dropdown("Selecciona un jugador:", nombres)
        .dropdown("Duración del castigo:", tiempos);

    form.show(player).then(r => {
        if (r.canceled) return menuGestionMute(player); // Si cancela, regresa
        
        const target = jugadores[r.formValues[0]];
        const idxTiempo = r.formValues[1];
        const duracionMs = valores[idxTiempo];

        if (!target) {
            player.sendMessage("§cEl Jugador se desconecto.");
            return menuGestionMute(player);
        }

        if (duracionMs === -1) {
            // Permanente
            target.addTag("silenciado");
            target.setDynamicProperty("mute_expiracion", undefined); // Borra timer si tenía
            player.sendMessage(`§a[!] Has silenciado permanentemente el chat de ${target.name}.`);
            target.sendMessage("§cHas sido silenciado indefinidamente.");
        } else {
            // Temporal
            target.removeTag("silenciado"); // Quita permanente si tenía
            const expiracion = Date.now() + duracionMs;
            target.setDynamicProperty("mute_expiracion", expiracion);
            
            player.sendMessage(`§a[!] Has silenciado a ${target.name} por ${tiempos[idxTiempo]}.`);
            target.sendMessage(`§cHas sido silenciado en el chat por ${tiempos[idxTiempo]}.`);
        }
        
        //menuGestionMute(player); // Regresa al menú de mute
    });
}

function menuDesmutearJugador(player) {
    const jugadores = world.getPlayers();
    const form = new ModalFormData()
        .title("Des-Silenciar Jugador")
        .dropdown("Selecciona un Jugador:", jugadores.map(p => p.name));

    form.show(player).then(r => {
        if (r.canceled) return menuGestionMute(player); // Regresa

        const target = jugadores[r.formValues[0]];
        if (target) {
            target.removeTag("silenciado");
            target.setDynamicProperty("mute_expiracion", undefined);
            player.sendMessage(`§a[!] Has Des-Silenciado a ${target.name}.`);
            target.sendMessage("§aYa puedes usar el chat, Has sido Des-Silenciado.");
        }
        //menuGestionMute(player); // Regresa
    });
}

// --- 2. CONFIG SERVER ---
function menuConfigServer(player) {
    const max = String(getConfigVar("MAX_MIEMBROS_GLOBAL"));
    const cClan = String(getConfigVar("COSTO_CREAR_CLAN"));
    const cRenta = String(getConfigVar("COSTO_RENTA_SEMANAL"));
    const cNivel = String(getConfigVar("COSTO_NIVEL_BASE"));

    const form = new ModalFormData()
        .title("Configuración Maestra")
        .textField("Miembros Máximos de un Clan:", max)
        .textField("Costo para Crear un Clan:", cClan)
        .textField("Renta del Clan Semanal:", cRenta)
        .textField("Costo Base de Nivel del Clan:", cNivel);

    form.show(player).then(r => {
        if (r.canceled) return menuPanelAdmin(player); // 🔙 SI CANCELA, REGRESA

        const v1 = parseInt(r.formValues[0]);
        const v2 = parseInt(r.formValues[1]);
        const v3 = parseInt(r.formValues[2]);
        const v4 = parseInt(r.formValues[3]);

        if (!isNaN(v1)) setConfigVar("MAX_MIEMBROS_GLOBAL", v1);
        if (!isNaN(v2)) setConfigVar("COSTO_CREAR_CLAN", v2);
        if (!isNaN(v3)) setConfigVar("COSTO_RENTA_SEMANAL", v3);
        if (!isNaN(v4)) setConfigVar("COSTO_NIVEL_BASE", v4);

        player.sendMessage("§a[!] Configuración actualizada.");
        //menuPanelAdmin(player); // 🔄 REABRE EL PANEL ADMIN
    });
}

// --- CONFIGURACIÓN DE XP POR MOB ---
function menuConfigMobsXP(player) {
    // 1. Cargamos los valores actuales. Si no existen, usamos los predeterminados.
    // --- 1. MUNDO NORMAL (Básicos) ---
    const curZ      = getConfigVar("XP_MOB_minecraft:zombie") ?? 20;          // Zombie
    const curS      = getConfigVar("XP_MOB_minecraft:skeleton") ?? 20;        // Esqueleto
    const curC      = getConfigVar("XP_MOB_minecraft:creeper") ?? 35;         // Creeper
    const curSp     = getConfigVar("XP_MOB_minecraft:spider") ?? 25;          // Araña
    const curE      = getConfigVar("XP_MOB_minecraft:enderman") ?? 100;       // Enderman
    const curW      = getConfigVar("XP_MOB_minecraft:witch") ?? 40;           // Bruja
    const curSlime  = getConfigVar("XP_MOB_minecraft:slime") ?? 15;           // Slime
    const curPhan   = getConfigVar("XP_MOB_minecraft:phantom") ?? 30;         // Phantom (Fantasma)
    const curSilv   = getConfigVar("XP_MOB_minecraft:silverfish") ?? 10;      // Lepisma (Silverfish)
    const curCaveSp = getConfigVar("XP_MOB_minecraft:cave_spider") ?? 30;     // Araña de Cueva

    // --- 2. VARIANTES (Biomas) ---
    const curDrown  = getConfigVar("XP_MOB_minecraft:drowned") ?? 30;         // Ahogado (Drowned)
    const curHusk   = getConfigVar("XP_MOB_minecraft:husk") ?? 25;            // Momia (Husk)
    const curStray  = getConfigVar("XP_MOB_minecraft:stray") ?? 25;           // Vagabundo (Stray)
    const curBog    = getConfigVar("XP_MOB_minecraft:bogged") ?? 30;          // Esqueleto del Pantano

    // --- 3. INVASIONES (Raids) ---
    const curPill   = getConfigVar("XP_MOB_minecraft:pillager") ?? 40;        // Saqueador (Pillager)
    const curVind   = getConfigVar("XP_MOB_minecraft:vindicator") ?? 60;      // Vindicator (Hacha)
    const curEvok   = getConfigVar("XP_MOB_minecraft:evoker") ?? 150;         // Evocador (Magia)
    const curRav    = getConfigVar("XP_MOB_minecraft:ravager") ?? 300;        // Devastador (Bestia)
    const curVex    = getConfigVar("XP_MOB_minecraft:vex") ?? 20;             // Vex (Hada malvada)

    // --- 4. NETHER (Inframundo) ---
    const curBlaze  = getConfigVar("XP_MOB_minecraft:blaze") ?? 50;           // Blaze
    const curGhast  = getConfigVar("XP_MOB_minecraft:ghast") ?? 80;           // Ghast
    const curMagma  = getConfigVar("XP_MOB_minecraft:magma_cube") ?? 20;      // Cubo de Magma
    const curWitSk  = getConfigVar("XP_MOB_minecraft:wither_skeleton") ?? 70; // Esqueleto Wither
    const curHog    = getConfigVar("XP_MOB_minecraft:hoglin") ?? 60;          // Hoglin
    const curPigBru = getConfigVar("XP_MOB_minecraft:piglin_brute") ?? 120;   // Piglin Bruto
    const curZog    = getConfigVar("XP_MOB_minecraft:zoglin") ?? 50;          // Zoglin

    // --- 5. ACUÁTICOS Y OTROS ---
    const curGuard  = getConfigVar("XP_MOB_minecraft:guardian") ?? 60;        // Guardián
    const curEGuard = getConfigVar("XP_MOB_minecraft:elder_guardian") ?? 1000;// Guardián Anciano (Jefe Templo)
    const curShulk  = getConfigVar("XP_MOB_minecraft:shulker") ?? 80;         // Shulker (End City)

    // --- 6. JEFES SUPREMOS (Bosses) ---
    const curWard   = getConfigVar("XP_MOB_minecraft:warden") ?? 2000;        // Warden
    const curWith   = getConfigVar("XP_MOB_minecraft:wither") ?? 5000;        // Wither Boss
    const curDrag   = getConfigVar("XP_MOB_minecraft:ender_dragon") ?? 10000; // Ender Dragon
    const curBreeze = getConfigVar("XP_MOB_minecraft:breeze") ?? 100;         // Breeze (Nuevo Trial Chamber)

    // --- 7. JUGADORES (PvP) ---
    const curP      = getConfigVar("XP_MOB_minecraft:player") ?? 300;         // Jugador


    const form = new ModalFormData()
        .title("Configuración XP Mobs")
        // TRUCO: Mostramos el valor actual en el TITULO del campo.
        // --- 1. MUNDO NORMAL ---
        .textField(`Zombie XP (Actual: ${curZ})`, "Nuevo valor...")          // 0
        .textField(`Esqueleto XP (Actual: ${curS})`, "Nuevo valor...")       // 1
        .textField(`Creeper XP (Actual: ${curC})`, "Nuevo valor...")         // 2
        .textField(`Araña XP (Actual: ${curSp})`, "Nuevo valor...")          // 3
        .textField(`Enderman XP (Actual: ${curE})`, "Nuevo valor...")        // 4
        .textField(`Bruja XP (Actual: ${curW})`, "Nuevo valor...")           // 5
        .textField(`Slime XP (Actual: ${curSlime})`, "Nuevo valor...")       // 6
        .textField(`Phantom XP (Actual: ${curPhan})`, "Nuevo valor...")      // 7
        .textField(`Silverfish XP (Actual: ${curSilv})`, "Nuevo valor...")    // 8
        .textField(`Araña Cueva XP (Actual: ${curCaveSp})`, "Nuevo valor...") // 9

        // --- 2. VARIANTES ---
        .textField(`Ahogado XP (Actual: ${curDrown})`, "Nuevo valor...")      // 10
        .textField(`Husk/Momia XP (Actual: ${curHusk})`, "Nuevo valor...")    // 11
        .textField(`Stray XP (Actual: ${curStray})`, "Nuevo valor...")        // 12
        .textField(`Bogged XP (Actual: ${curBog})`, "Nuevo valor...")         // 13

        // --- 3. INVASIONES (Raids) ---
        .textField(`Pillager XP (Actual: ${curPill})`, "Nuevo valor...")      // 14
        .textField(`Vindicator XP (Actual: ${curVind})`, "Nuevo valor...")    // 15
        .textField(`Evocador XP (Actual: ${curEvok})`, "Nuevo valor...")      // 16
        .textField(`Devastador XP (Actual: ${curRav})`, "Nuevo valor...")     // 17
        .textField(`Vex XP (Actual: ${curVex})`, "Nuevo valor...")            // 18

        // --- 4. NETHER ---
        .textField(`Blaze XP (Actual: ${curBlaze})`, "Nuevo valor...")        // 19
        .textField(`Ghast XP (Actual: ${curGhast})`, "Nuevo valor...")        // 20
        .textField(`Magma Cube XP (Actual: ${curMagma})`, "Nuevo valor...")   // 21
        .textField(`Wither Skeleton XP (Actual: ${curWitSk})`, "Nuevo valor...") // 22
        .textField(`Hoglin XP (Actual: ${curHog})`, "Nuevo valor...")         // 23
        .textField(`Piglin Bruto XP (Actual: ${curPigBru})`, "Nuevo valor...") // 24
        .textField(`Zoglin XP (Actual: ${curZog})`, "Nuevo valor...")         // 25

        // --- 5. ACUÁTICOS ---
        .textField(`Guardian XP (Actual: ${curGuard})`, "Nuevo valor...")      // 26
        .textField(`Elder Guardian XP (Actual: ${curEGuard})`, "Nuevo valor...") // 27
        .textField(`Shulker XP (Actual: ${curShulk})`, "Nuevo valor...")      // 28

        // --- 6. JEFES ---
        .textField(`Warden XP (Actual: ${curWard})`, "Nuevo valor...")        // 29
        .textField(`Wither Boss XP (Actual: ${curWith})`, "Nuevo valor...")   // 30
        .textField(`Dragón XP (Actual: ${curDrag})`, "Nuevo valor...")        // 31
        .textField(`Breeze XP (Actual: ${curBreeze})`, "Nuevo valor...")      // 32

        // --- 7. PVP ---
        .textField(`Jugador PvP (Actual: ${curP})`, "Nuevo valor...");        // 33

    form.show(player).then(r => {
        if (r.canceled) return menuPanelAdmin(player);

        // FUNCIÓN AUXILIAR:
        // Si el usuario escribió algo, lo usamos. Si lo dejó vacío, mantenemos el actual.
        const procesar = (input, actual) => {
            if (!input || input.trim() === "") return actual;
            const num = parseInt(input);
            return isNaN(num) ? actual : num;
        };

        // Guardamos los valores (Nuevos o Viejos)
        // --- 1. MUNDO NORMAL ---
        setConfigVar("XP_MOB_minecraft:zombie", procesar(r.formValues[0], curZ));
        setConfigVar("XP_MOB_minecraft:skeleton", procesar(r.formValues[1], curS));
        setConfigVar("XP_MOB_minecraft:creeper", procesar(r.formValues[2], curC));
        setConfigVar("XP_MOB_minecraft:spider", procesar(r.formValues[3], curSp));
        setConfigVar("XP_MOB_minecraft:enderman", procesar(r.formValues[4], curE));
        setConfigVar("XP_MOB_minecraft:witch", procesar(r.formValues[5], curW));
        setConfigVar("XP_MOB_minecraft:slime", procesar(r.formValues[6], curSlime));
        setConfigVar("XP_MOB_minecraft:phantom", procesar(r.formValues[7], curPhan));
        setConfigVar("XP_MOB_minecraft:silverfish", procesar(r.formValues[8], curSilv));
        setConfigVar("XP_MOB_minecraft:cave_spider", procesar(r.formValues[9], curCaveSp));

        // --- 2. VARIANTES ---
        setConfigVar("XP_MOB_minecraft:drowned", procesar(r.formValues[10], curDrown));
        setConfigVar("XP_MOB_minecraft:husk", procesar(r.formValues[11], curHusk));
        setConfigVar("XP_MOB_minecraft:stray", procesar(r.formValues[12], curStray));
        setConfigVar("XP_MOB_minecraft:bogged", procesar(r.formValues[13], curBog));

        // --- 3. INVASIONES ---
        setConfigVar("XP_MOB_minecraft:pillager", procesar(r.formValues[14], curPill));
        setConfigVar("XP_MOB_minecraft:vindicator", procesar(r.formValues[15], curVind));
        setConfigVar("XP_MOB_minecraft:evoker", procesar(r.formValues[16], curEvok));
        setConfigVar("XP_MOB_minecraft:ravager", procesar(r.formValues[17], curRav));
        setConfigVar("XP_MOB_minecraft:vex", procesar(r.formValues[18], curVex));

        // --- 4. NETHER ---
        setConfigVar("XP_MOB_minecraft:blaze", procesar(r.formValues[19], curBlaze));
        setConfigVar("XP_MOB_minecraft:ghast", procesar(r.formValues[20], curGhast));
        setConfigVar("XP_MOB_minecraft:magma_cube", procesar(r.formValues[21], curMagma));
        setConfigVar("XP_MOB_minecraft:wither_skeleton", procesar(r.formValues[22], curWitSk));
        setConfigVar("XP_MOB_minecraft:hoglin", procesar(r.formValues[23], curHog));
        setConfigVar("XP_MOB_minecraft:piglin_brute", procesar(r.formValues[24], curPigBru));
        setConfigVar("XP_MOB_minecraft:zoglin", procesar(r.formValues[25], curZog));

        // --- 5. ACUÁTICOS ---
        setConfigVar("XP_MOB_minecraft:guardian", procesar(r.formValues[26], curGuard));
        setConfigVar("XP_MOB_minecraft:elder_guardian", procesar(r.formValues[27], curEGuard));
        setConfigVar("XP_MOB_minecraft:shulker", procesar(r.formValues[28], curShulk));

        // --- 6. JEFES ---
        setConfigVar("XP_MOB_minecraft:warden", procesar(r.formValues[29], curWard));
        setConfigVar("XP_MOB_minecraft:wither", procesar(r.formValues[30], curWith));
        setConfigVar("XP_MOB_minecraft:ender_dragon", procesar(r.formValues[31], curDrag));
        setConfigVar("XP_MOB_minecraft:breeze", procesar(r.formValues[32], curBreeze));

        // --- 7. PVP ---
        setConfigVar("XP_MOB_minecraft:player", procesar(r.formValues[33], curP));

        player.sendMessage("§a[!] Valores de XP actualizados correctamente.");
        menuPanelAdmin(player); 
    });
}

// --- 3. ADMIN ZONAS ---
function menuAdminZonas(player) {
    const pos = player.location;
    const tierras = getDatosMundo(CONFIG.DB_TIERRAS) || [];
    const tierra = tierras.find(t => Math.abs(t.center.x - Math.floor(pos.x)) < 20 && Math.abs(t.center.z - Math.floor(pos.z)) < 20);

    if (!tierra) {
        player.sendMessage("§cNo hay tierras cerca.");
        return menuPanelAdmin(player); // 🔙 Regresa
    }

    const form = new ModalFormData()
        .title(`Administrar Terreno`)
        .textField(`\nPropiedad de: §b${tierra.owner}§r\n\nNuevo Radio:`, String(tierra.radio))
        .toggle("¿Quieres eliminar esta Propiedad?");

    form.show(player).then(r => {
        if (r.canceled) return menuPanelAdmin(player); // 🔙 Regresa

        const nuevoRadio = parseInt(r.formValues[0]);
        const borrar = r.formValues[1];

        if (borrar) {
            const nuevas = tierras.filter(t => t.id !== tierra.id);
            setDatosMundo(CONFIG.DB_TIERRAS, nuevas);
            player.sendMessage(`§aPropiedad de §f${tierra.owner} §cborrada correctamente.`);
        } else {
            if (!isNaN(nuevoRadio)) {
                const idx = tierras.findIndex(t => t.id === tierra.id);
                if (idx !== -1) {
                    tierras[idx].radio = nuevoRadio;
                    setDatosMundo(CONFIG.DB_TIERRAS, tierras);
                    player.sendMessage(`§aEl Radio del terreno de ${tierra.owner} se a actualizado correctamente.`);
                }
            }
        }
        menuPanelAdmin(player); // 🔄 Regresa
    });
}

// --- 4. ADMIN CLANES CON XP ---
function menuAdminClanes(player) {
    const clanes = getDatosMundo(CONFIG.DB_CLANES) || [];
    if (clanes.length === 0) {
        player.sendMessage("§cNo hay clanes registrados.");
        return menuPanelAdmin(player);
    }

    const nombres = clanes.map(c => `${c.nombre}`);
    
    const form = new ModalFormData()
        .title("Administrar Clan")
        .dropdown("\nSelecciona un Clan:", nombres)
        .dropdown("\nAcción:", ["NADA", "BORRAR CLAN", "CAMBIAR LIDER", "GESTIONAR XP"]);

    form.show(player).then(r => {
        if (r.canceled) return menuPanelAdmin(player);

        const [idxClan, idxAccion] = r.formValues;
        const clan = clanes[idxClan];

        if (idxAccion === 1) { // Borrar
            const nuevos = clanes.filter(c => c.id !== clan.id);
            setDatosMundo(CONFIG.DB_CLANES, nuevos);
            player.sendMessage(`§a[!] El Clan §f${clan.nombre} §aha sido eliminado.`);
        }
        else if (idxAccion === 2) { // Cambiar Líder
             menuForzarLider(player, clan);
        }
        else if (idxAccion === 3) { // Gestionar XP
             menuAdminXPClan(player, clan);
        } else {
            menuPanelAdmin(player);
        }
    });
}

// SUB-MENÚ PARA DAR/QUITAR XP (CON AUTO LEVEL)
function menuAdminXPClan(player, clan) {
    const form = new ModalFormData()
        .title(`GESTIONAR XP`)
        .dropdown(`\n§r>> §bClan: ${clan.nombre} §r<<\n\n Acción:`, ["Añadir (+)", "Quitar (-)", "Establecer (=)"])
        .textField(`Cantidad (Actual: ${clan.xp})`, "Ej: 1000");

    form.show(player).then(r => {
        if (r.canceled) return menuAdminClanes(player);

        const accion = r.formValues[0];
        const cantidad = parseInt(r.formValues[1]);

        if (isNaN(cantidad)) return player.sendMessage("§cNúmero inválido.");

        const clanes = getDatosMundo(CONFIG.DB_CLANES);
        const idx = clanes.findIndex(c => c.id === clan.id);

        if (idx !== -1) {
            let nuevaXP = clanes[idx].xp;

            if (accion === 0) nuevaXP += cantidad;
            if (accion === 1) nuevaXP = Math.max(0, nuevaXP - cantidad);
            if (accion === 2) nuevaXP = cantidad;

            clanes[idx].xp = nuevaXP;

            // --- AUTO LEVEL CHECK ---
            // Revisamos si con la nueva XP suben de nivel
            const costoNivel = calcularCostoNivel(clanes[idx].nivel);
            
            if (clanes[idx].xp >= costoNivel && clanes[idx].nivel < 10) {
                clanes[idx].xp -= costoNivel;
                clanes[idx].nivel += 1;
                world.sendMessage(`§a§l¡EL CLAN §f${clanes[idx].tag} §aHA SIDO ASCENDIDO A NIVEL ${clanes[idx].nivel}!`);
                player.playSound("random.totem");
            }
            // ------------------------

            setDatosMundo(CONFIG.DB_CLANES, clanes);
            player.sendMessage(`§a[!] Datos actualizados correctamente.`);
        }
        menuAdminClanes(player);
    });
}

function menuForzarLider(player, clan) {
    const form = new ModalFormData()
        .title(`Nuevo Líder para ${clan.nombre}`)
        .dropdown("\nSelecciona al nuevo rey:", clan.miembros);

    form.show(player).then(r => {
        if (r.canceled) return menuAdminClanes(player); // 🔙 Regresa al menú de clanes

        const nuevoLider = clan.miembros[r.formValues[0]];
        const clanes = getDatosMundo(CONFIG.DB_CLANES);
        const idx = clanes.findIndex(c => c.id === clan.id);
        if (idx !== -1) {
            clanes[idx].lider = nuevoLider;
            setDatosMundo(CONFIG.DB_CLANES, clanes);
            player.sendMessage(`§a[!] §f${nuevoLider} §aes el nuevo líder del Clan §f${clan.nombre}§a.`);
        }
        menuPanelAdmin(player); // 🔄 Regresa al inicio
    });
}

// --- 5. ECONOMÍA (FLUIDO) ---
function menuAdminEconomia(player) {
    const jugadores = world.getPlayers().map(p => p.name);
    const acciones = ["Añadir (+)", "Quitar (-)", "Fijar (=)"];

    const form = new ModalFormData()
        .title("Gestión Económica")
        .dropdown("\nJugador:", jugadores)
        .dropdown("Acción:", acciones)
        .textField("Cantidad:", "Ej: 1000");

    form.show(player).then(r => {
        if (r.canceled) return menuPanelAdmin(player); // 🔙 Regresa

        const [idxJugador, idxAccion, montoTxt] = r.formValues;
        const objetivo = buscarJugador(jugadores[idxJugador]);
        const monto = parseInt(montoTxt);

        if (objetivo && !isNaN(monto)) {
            const saldoActual = getSaldo(objetivo);
            let nuevoSaldo = saldoActual;

            if (idxAccion === 0) nuevoSaldo += monto;
            if (idxAccion === 1) nuevoSaldo -= monto;
            if (idxAccion === 2) nuevoSaldo = monto;

            setSaldo(objetivo, nuevoSaldo);
            player.sendMessage(`§a[!] Saldo de §f${objetivo.name} §aactualizado.`);
        } else {
             player.sendMessage("§cError: Datos inválidos.");
        }
        //menuPanelAdmin(player); // 🔄 Regresa
    });
}
