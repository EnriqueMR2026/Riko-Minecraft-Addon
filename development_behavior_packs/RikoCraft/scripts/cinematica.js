import { system } from "@minecraft/server";
import { jugadorSigueVivo } from "./utils.js"; 

// =============================================================================
// 🎬 LÓGICA DE LA CINEMÁTICA (JACKPOT V8) 
// =============================================================================

export function iniciarCinematica(player) {
    system.run(() => {
        // --- PREPARACIÓN ---
        try { player.playSound("rikocraft.intro", { volume: 1.0, pitch: 1.0 }); } catch(e) {}
        try { player.runCommandAsync(`hud @s hide`); } catch(e) {}
        try { player.runCommandAsync(`inputpermission set @s movement disabled`); } catch(e) {}
        try { player.runCommandAsync(`inputpermission set @s camera disabled`); } catch(e) {}

        // VARIABLES DE TIEMPO
        const T_DROP = 190;
        const T_BAJADA = 820;
        const T_ATERRIZAJE = 920;
        const T_FIN = 940;

        // COORDENADAS
        const alturaOrbita = 252; 
        const centroMirada = { x: 0, y: 225, z: 0 };
        const puntoVentana = { x: 1, y: 252.5, z: 8 }; 
        const inicioOrbita = { x: 0, y: alturaOrbita, z: 53 }; 
        const spawnJugador = { x: 0, y: 211, z: 0 }; 
        const camaraOjos = { x: 0, y: 212.6, z: 0 }; 
        const vistaFinal = { x: 0, y: 212.6, z: -35 };

        let tick = 0;

        // --- BUCLE DE ANIMACIÓN ---
        const cinematica = system.runInterval(() => {
            // Verificamos si el jugador sigue conectado
            if (!jugadorSigueVivo(player)) { 
                system.clearRun(cinematica); 
                return; 
            }
            
            tick++;

            try {
                // FASE 1: SALIDA
                if (tick === 40) player.onScreenDisplay.setTitle("§fBienvenido a...", { fadeInDuration: 10, stayDuration: 60, fadeOutDuration: 10 });

                if (tick === 1) {
                    player.camera.setCamera("minecraft:free", {
                        location: puntoVentana,
                        facingLocation: inicioOrbita, 
                        easeOptions: { easeTime: 4.0, easeType: "InOutSine" }
                    });
                }
                if (tick === 80) { 
                    player.camera.setCamera("minecraft:free", {
                        location: inicioOrbita, 
                        facingLocation: centroMirada, 
                        easeOptions: { easeTime: 5.5, easeType: "InOutSine" } 
                    });
                }

                // FASE 2: ÓRBITA (Con todos los textos originales)
                if (tick >= T_DROP && tick < T_BAJADA) {
                        
                        // --- AQUÍ ESTÁN TUS TEXTOS COMPLETOS ---
                        if (tick === T_DROP) {
                            player.onScreenDisplay.setTitle("§bRikoCraft", { subtitle: "§eTemporada 9", fadeInDuration: 5, stayDuration: 80, fadeOutDuration: 10 });
                        }
                        if (tick === T_DROP + 110) {
                            player.onScreenDisplay.setTitle("§aEconomía Real", { subtitle: "§fTrabajos & Comercio", fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 10 });
                        }
                        if (tick === T_DROP + 220) {
                            player.onScreenDisplay.setTitle("§bClanes y Guerras", { subtitle: "§fDomina el servidor", fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 10 });
                        }
                        if (tick === T_DROP + 330) {
                            player.onScreenDisplay.setTitle("§cMisiones Épicas", { subtitle: "§fSecretos por descubrir", fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 10 });
                        }
                        if (tick === T_DROP + 440) {
                            player.onScreenDisplay.setTitle("§dEventos Diarios", { subtitle: "§fRecompensas únicas", fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 10 });
                        }
                        if (tick === T_DROP + 550) {
                            player.onScreenDisplay.setTitle("§6¿Podrás sobrevivir?", { subtitle: "§fEl capítulo final...", fadeInDuration: 10, stayDuration: 60, fadeOutDuration: 20 });
                        }
                        // ---------------------------------------

                        // CÁLCULO DE ÓRBITA
                        const ticksDeOrbita = tick - T_DROP;
                        const duracionOrbita = T_BAJADA - T_DROP;
                        const progreso = ticksDeOrbita / duracionOrbita;
                        const angulo = progreso * (Math.PI * 2);
                        
                        const radio = 53;
                        const camX = Math.sin(angulo) * radio; 
                        const camZ = Math.cos(angulo) * radio;

                        player.camera.setCamera("minecraft:free", {
                            location: { x: camX, y: alturaOrbita, z: camZ }, 
                            facingLocation: centroMirada, 
                            easeOptions: { easeTime: 0.1, easeType: "Linear" }
                        });
                    }

                // FASE 3: DESCENSO
                else if (tick === T_BAJADA) {
                    player.camera.setCamera("minecraft:free", {
                        location: camaraOjos, 
                        facingLocation: vistaFinal, 
                        easeOptions: { easeTime: 5.0, easeType: "InOutSine" } 
                    });
                }

                // FASE 4: ATERRIZAJE
                else if (tick === T_ATERRIZAJE) {
                    player.teleport(spawnJugador, { facingLocation: vistaFinal });
                }

                // FIN
                else if (tick >= T_FIN) {
                    player.camera.setCamera("minecraft:first_person");
                    
                    try { 
                        player.runCommandAsync(`stopsound @s`);
                        player.runCommandAsync(`hud @s reset`);
                        player.runCommandAsync(`inputpermission set @s movement enabled`);
                        player.runCommandAsync(`inputpermission set @s camera enabled`);
                    } catch(e) {}
                    system.clearRun(cinematica);
                }

            } catch (errorLoop) {
                try { player.camera.setCamera("minecraft:first_person"); } catch(e){}
                system.clearRun(cinematica);
            }

        }, 1);
    });
}