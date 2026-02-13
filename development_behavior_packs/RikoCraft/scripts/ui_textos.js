import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// ID de nuestra entidad invisible
const ENTITY_ID = "rikocraft:texto_flotante";

// =============================================================================
// MENÚ PRINCIPAL DE TEXTOS FLOTANTES
// =============================================================================
export function menuTextos(player) {
    const menu = new ActionFormData()
        .title("§l§k5§r §l§0TEXTOS FLOTANTES §r§l§k5§r")
        .body("§7Gestor de Hologramas del Realm.")
        .button("§l§2CREAR TEXTO AQUI", "textures/botones/mapa_vacio")
        .button("§l§2CREAR TOP AQUI", "textures/botones/mapa")
        .button("§l§6EDITAR TEXTOS", "textures/botones/editar_terrenos")
        .button("§l§4ELIMINAR TEXTOS", "textures/botones/eliminar")
        .button("§l§7>>  §4Regresar  §7<<", "textures/botones/regresar");

    menu.show(player).then(r => {
        if (r.canceled) return;
        if (r.selection === 0) crearTexto(player);
        if (r.selection === 1) crearTopMultiuso(player);
        if (r.selection === 2) menuListaTextos(player, "editar");
        if (r.selection === 3) menuListaTextos(player, "borrar");
    });
}

// =============================================================================
// 1. CREAR TEXTO
// =============================================================================
function crearTexto(player) {
    const form = new ModalFormData()
        .title("Crear Nuevo Texto")
        .textField("Escribe el texto que quieres que flote:\n§e(Usa \\n para saltos de linea y § para colores)", "Ej: §aBienvenido al Spawn\\n§7No rompas nada.");

    form.show(player).then(r => {
        if (r.canceled) return menuTextos(player);
        
        // Reemplazamos los "\n" literales por verdaderos saltos de linea
        const textoOriginal = r.formValues[0];
        if (!textoOriginal || textoOriginal.trim() === "") return player.sendMessage("§cEl texto no puede estar vacio.");
        
        const textoProcesado = textoOriginal.replace(/\\n/g, '\n');

        try {
            // Invocamos la entidad en la posicion exacta del jugador
            const dim = player.dimension;
            // Lo subimos un poco para que no quede enterrado en los pies
            const spawnPos = { x: player.location.x, y: player.location.y + 1.0, z: player.location.z };
            
            const entity = dim.spawnEntity(ENTITY_ID, spawnPos);
            entity.nameTag = textoProcesado;
            
            player.sendMessage(`§a[!] Texto flotante creado exitosamente.`);
            player.playSound("random.levelup");
        } catch (error) {
            player.sendMessage("§cError al crear la entidad. ¿Creaste el archivo JSON rikocraft:texto_flotante?");
        }
    });
}

// =============================================================================
// 🏆 CREAR LEADERBOARD MULTIUSO (DINERO, CLANES, SCOREBOARDS)
// =============================================================================
export function crearTopMultiuso(player) {
    const form = new ModalFormData()
        .title("Crear Leaderboard")
        // dropdown: Pregunta, [Opciones] (Sin el '0' al final, ¡bien hecho!)
        .dropdown("¿Qué tipo de Top quieres crear?", [
            "Dinero (Solo Conectados)", 
            "Dinero (Todos / Global)", 
            "Clanes (Mejores Niveles)", 
            "Scoreboard de Minecraft"
        ])
        .textField("Si elegiste Scoreboard, escribe su nombre interno\n(Ej: kills, muertes, nivel):", "Nombre del objetivo");

    form.show(player).then(r => {
        if (r.canceled) return menuTextos(player); // 🔙 Regresa con tu botón personalizado

        const tipoElegido = r.formValues[0]; 
        const objScoreboard = r.formValues[1].trim(); // Le quitamos espacios extra

        try {
            const dim = player.dimension;
            const spawnPos = { x: player.location.x + 0.5, y: player.location.y + 1.5, z: player.location.z + 0.5 };
            const entity = dim.spawnEntity("rikocraft:texto_flotante", spawnPos);
            
            // Asignamos la etiqueta secreta según lo que el usuario eligió
            if (tipoElegido === 0) {
                entity.nameTag = "§eCargando Top Online...";
                entity.addTag("top_dinero_online"); 
            } else if (tipoElegido === 1) {
                entity.nameTag = "§eCargando Top Global...";
                entity.addTag("top_dinero_global"); 
            } else if (tipoElegido === 2) {
                entity.nameTag = "§eCargando Top Clanes...";
                entity.addTag("top_clanes"); 
            } else if (tipoElegido === 3) {
                if (objScoreboard === "") {
                    player.sendMessage("§c[!] Error: Debes escribir el nombre de un Scoreboard.");
                    entity.remove(); // Borramos la entidad fallida
                    return;
                }
                entity.nameTag = "§eCargando Scoreboard...";
                // Magia: Guardamos el nombre que escribiste dentro de la etiqueta
                // Ej: Quedará como "top_score_kills"
                entity.addTag(`top_score_${objScoreboard}`);
            }
            
            player.sendMessage(`§a[!] Leaderboard creado exitosamente.`);
            player.playSound("random.levelup");
        } catch (error) {
            player.sendMessage("§c[!] Error al crear la entidad del Top.");
        }
    });
}

// =============================================================================
// 2. LISTAR TEXTOS (PARA EDITAR O BORRAR)
// =============================================================================
function menuListaTextos(player, accion) {
    // Buscamos todas las entidades del tipo texto en la dimension actual del jugador
    const dim = player.dimension;
    const entidades = dim.getEntities({ type: ENTITY_ID });

    if (entidades.length === 0) {
        player.sendMessage("§cNo hay textos flotantes en esta dimension.");
        return menuTextos(player);
    }

    // Ordenamos por cercania al jugador
    const pLoc = player.location;
    const listaOrdenada = entidades.sort((a, b) => {
        const distA = Math.sqrt(Math.pow(a.location.x - pLoc.x, 2) + Math.pow(a.location.y - pLoc.y, 2) + Math.pow(a.location.z - pLoc.z, 2));
        const distB = Math.sqrt(Math.pow(b.location.x - pLoc.x, 2) + Math.pow(b.location.y - pLoc.y, 2) + Math.pow(b.location.z - pLoc.z, 2));
        return distA - distB;
    });

    const form = new ModalFormData()
        .title(accion === "editar" ? "Editar Textos" : "Borrar Textos")
        // Mostramos una previsualizacion de la primera linea del texto + Coordenadas
        .dropdown(`Selecciona el texto a ${accion} (Ordenados por cercania):`, listaOrdenada.map(e => {
            // Limpiamos los saltos de línea y códigos de color "§" para que la lista se vea limpia
            let preview = e.nameTag.replace(/\n/g, ' - ').replace(/§./g, '');
            preview = preview.substring(0, 22); // Solo los primeros 22 caracteres
            
            // ---> NUEVO FORMATO: Nombre primero, Coordenadas después <---
            return `${preview}... [X:${Math.floor(e.location.x)} Y:${Math.floor(e.location.y)} Z:${Math.floor(e.location.z)}]`;
        }));

    form.show(player).then(r => {
        if (r.canceled) return menuTextos(player);
        
        const entidadSeleccionada = listaOrdenada[r.formValues[0]];

        if (accion === "editar") {
            editarTextoFlotante(player, entidadSeleccionada);
        } else {
            // Borrar
            try {
                entidadSeleccionada.remove();
                player.sendMessage("§a[!] Texto eliminado.");
                player.playSound("random.break");
            } catch(e) {
                player.sendMessage("§cError al eliminar la entidad.");
            }
        }
    });
}

// =============================================================================
// 3. EDITAR TEXTO Y POSICION (CON PRE-LLENADO PERFECTO)
// =============================================================================
function editarTextoFlotante(player, entidad) {
    // Convertimos los saltos de línea para que se vean como \n en la caja de texto
    const textoParaEditar = entidad.nameTag.replace(/\n/g, '\\n');
    const loc = entidad.location;

    // AQUI ESTA LA MAGIA: usamos { defaultValue: valor } para evitar el error de la versión alpha
    const form = new ModalFormData()
        .title("Editar Texto Flotante")
        .textField("Texto Flotante:", "Escribe aqui el texto...", { defaultValue: textoParaEditar })
        .textField("Coordenada X:", "", { defaultValue: loc.x.toFixed(2) })
        .textField("Coordenada Y:", "", { defaultValue: loc.y.toFixed(2) })
        .textField("Coordenada Z:", "", { defaultValue: loc.z.toFixed(2) });

    form.show(player).then(r => {
        if (r.canceled) return menuTextos(player);

        const nuevoTexto = r.formValues[0];
        const nxTxt = r.formValues[1];
        const nyTxt = r.formValues[2];
        const nzTxt = r.formValues[3];

        try {
            // 1. Actualizamos el texto
            if (nuevoTexto && nuevoTexto.trim() !== "") {
                entidad.nameTag = nuevoTexto.replace(/\\n/g, '\n');
            }

            // 2. Actualizamos las coordenadas (ya pre-llenadas)
            const finalX = parseFloat(nxTxt);
            const finalY = parseFloat(nyTxt);
            const finalZ = parseFloat(nzTxt);

            // Si por alguna razon borraron el numero y no es valido, no lo movemos
            if (!isNaN(finalX) && !isNaN(finalY) && !isNaN(finalZ)) {
                entidad.teleport({ x: finalX, y: finalY, z: finalZ }, { dimension: entidad.dimension });
            }
            
            player.sendMessage("§a[!] Texto actualizado correctamente.");
            player.playSound("random.levelup");
        } catch(e) {
            player.sendMessage("§cError al actualizar la entidad.");
        }
    });
}