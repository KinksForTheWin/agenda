import os

def crear_copia_archivos():
    """
    Crea un archivo de texto con el contenido de archivos específicos
    (.py, .bat, .js, .jsx, .html, .json)
    en el directorio actual y sus subcarpetas, excluyendo __pycache__ y venv.
    """
    
    # Directorio raíz donde se ejecuta el script
    directorio_raiz = os.getcwd()

    # Tipos de archivo a incluir
    extensiones_incluidas = [".py", ".bat", ".js", ".jsx", ".html", ".css", ".json"]

    # Carpetas a excluir
    carpetas_excluidas = ["__pycache__", "venv"]

    # Nombre del archivo de salida
    nombre_archivo_salida = "codigo_copilado.txt"
    ruta_archivo_salida = os.path.join(directorio_raiz, nombre_archivo_salida)

    print(f"🚀 Iniciando la copia de archivos en: {directorio_raiz}")
    print(f"🔍 Buscando extensiones: {', '.join(extensiones_incluidas)}")
    print(f"🚫 Excluyendo carpetas: {', '.join(carpetas_excluidas)}")
    print(f"💾 El contenido se guardará en: {ruta_archivo_salida}\n")

    archivos_procesados_count = 0

    try:
        with open(ruta_archivo_salida, "w", encoding="utf-8") as archivo_salida:
            for carpeta_actual, subdirectorios, archivos in os.walk(directorio_raiz):
                # Modificamos subdirectorios in-place para que os.walk no entre en las carpetas excluidas
                subdirectorios[:] = [d for d in subdirectorios if d not in carpetas_excluidas]

                # Obtener la ruta relativa para una mejor visualización en la salida
                ruta_relativa_carpeta = os.path.relpath(carpeta_actual, directorio_raiz)
                if ruta_relativa_carpeta == ".":
                    ruta_para_mostrar = "Directorio actual"
                else:
                    ruta_para_mostrar = ruta_relativa_carpeta

                for archivo in archivos:
                    nombre_base, extension = os.path.splitext(archivo)
                    if extension.lower() in extensiones_incluidas:
                        ruta_completa_archivo = os.path.join(carpeta_actual, archivo)
                        try:
                            with open(ruta_completa_archivo, "r", encoding="utf-8") as f:
                                contenido = f.read()
                                
                                # Escribir el encabezado del archivo en el archivo de salida
                                archivo_salida.write(f"\n\n--- Archivo: {os.path.join(ruta_para_mostrar, archivo)} ---\n\n")
                                archivo_salida.write(contenido)
                                archivo_salida.write("\n" + "=" * 80 + "\n") # Separador visual
                                archivos_procesados_count += 1
                                print(f"  ✅ Copiado: {os.path.join(ruta_para_mostrar, archivo)}")
                        except Exception as e:
                            print(f"  ❌ Error al leer '{os.path.join(ruta_para_mostrar, archivo)}': {e}")
            
        if archivos_procesados_count > 0:
            print(f"\n🎉 ¡Éxito! Se copiaron {archivos_procesados_count} archivos a '{nombre_archivo_salida}'.")
        else:
            print(f"\n⚠️ No se encontraron archivos que coincidan con los criterios en el directorio y subcarpetas. Se creó '{nombre_archivo_salida}' pero está vacío.")

    except Exception as e:
        print(f"\n🚨 ¡ERROR FATAL! No se pudo crear o escribir en '{nombre_archivo_salida}': {e}")
        print("Por favor, verifica los permisos de escritura en el directorio donde estás ejecutando el script.")

    # Pausa para que el usuario pueda leer los mensajes
    input("\nPresiona Enter para cerrar la ventana...")

if __name__ == "__main__":
    crear_copia_archivos()