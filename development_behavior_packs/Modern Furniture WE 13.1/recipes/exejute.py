import os
import re
from datetime import datetime

EXCLUIDOS = {'package.json', 'package-lock.json'}

# Cambia esta ruta a la carpeta donde están tus archivos JSON
CARPETA_JSON = r"C:\Users\Marcos y Ezequiel\AppData\Local\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\development_behavior_packs\Modern Furniture BP\recipes - copia"

def extraer_nombre_identifier(texto):
    patron = r'"identifier"\s*:\s*"f:([^"]+)"'
    match = re.search(patron, texto)
    if match:
        return match.group(1)
    return None

def renombrar_json_por_identifier():
    log_lines = []
    errores = []

    try:
        os.chdir(CARPETA_JSON)
    except Exception as e:
        print(f"No se pudo cambiar al directorio {CARPETA_JSON}: {e}")
        return

    print("Iniciando proceso en carpeta:", os.getcwd())
    archivos = [f for f in os.listdir() if f.endswith('.json')]
    print(f"Archivos JSON encontrados: {archivos}")

    for filename in archivos:
        if filename in EXCLUIDOS:
            print(f"Omitido archivo excluido: {filename}")
            continue

        print(f"Procesando archivo: {filename}")
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                texto = f.read()
        except UnicodeDecodeError:
            try:
                with open(filename, 'r', encoding='utf-8-sig') as f:
                    texto = f.read()
            except Exception as e:
                error_msg = f"[{filename}] ERROR al leer archivo: {e}"
                print(error_msg)
                errores.append(error_msg)
                log_lines.append(error_msg)
                continue
        except Exception as e:
            error_msg = f"[{filename}] ERROR al leer archivo: {e}"
            print(error_msg)
            errores.append(error_msg)
            log_lines.append(error_msg)
            continue

        nombre = extraer_nombre_identifier(texto)
        if nombre:
            nuevo_nombre = nombre + '.json'
            if nuevo_nombre != filename:
                if os.path.exists(nuevo_nombre):
                    error_msg = f"[{filename}] ERROR: El archivo destino '{nuevo_nombre}' ya existe, no se renombró."
                    print(error_msg)
                    errores.append(error_msg)
                    log_lines.append(error_msg)
                else:
                    try:
                        os.rename(filename, nuevo_nombre)
                        msg = f"Renombrado: {filename} -> {nuevo_nombre}"
                        print(msg)
                        log_lines.append(msg)
                    except Exception as e:
                        error_msg = f"[{filename}] ERROR al renombrar archivo a '{nuevo_nombre}': {e}"
                        print(error_msg)
                        errores.append(error_msg)
                        log_lines.append(error_msg)
            else:
                msg = f'Se mantiene: {filename}'
                print(msg)
                log_lines.append(msg)
        else:
            error_msg = f"[{filename}] ERROR: No se encontró un 'identifier' válido con formato 'f:<nombre>'"
            print(error_msg)
            errores.append(error_msg)
            log_lines.append(error_msg)

    if errores:
        resumen = "\nResumen de problemas encontrados:\n" + "\n".join("- " + e for e in errores)
        print(resumen)
        log_lines.append(resumen)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_header = f"Log de ejecución - {timestamp}\n{'='*40}\n"
    with open("renombrar_json_log.txt", "a", encoding="utf-8") as log_file:
        log_file.write(log_header)
        for line in log_lines:
            log_file.write(line + "\n")
        log_file.write("\n")

if __name__ == '__main__':
    renombrar_json_por_identifier()
