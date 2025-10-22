# Configuración de Mirror Automático entre Repositorios

**Objetivo:** Copiar automáticamente el código de `leo-neutrondigital/europaBot` a `europaneutron/europaBot` cada vez que hagas push a main.

---

## 📋 ¿Qué hace el workflow?

Cada vez que hagas `git push` a la rama `main` del repositorio **leo-neutrondigital/europaBot**, GitHub Actions automáticamente:

1. ✅ Detecta el cambio
2. ✅ Clona el repositorio fuente
3. ✅ Se conecta al repositorio destino (europaneutron/europaBot)
4. ✅ Hace push de todos los cambios (mirror completo)

---

## 🔑 Paso 1: Generar SSH Key Pair

Abre tu terminal y ejecuta:

```bash
# Generar nueva SSH key específica para el mirror
ssh-keygen -t ed25519 -C "mirror-bot@europabot.com" -f ~/.ssh/europabot_mirror

# NO pongas passphrase (solo presiona Enter cuando te pregunte)
```

Esto generará 2 archivos:
- `~/.ssh/europabot_mirror` (clave **PRIVADA** - para GitHub Actions)
- `~/.ssh/europabot_mirror.pub` (clave **PÚBLICA** - para el repo destino)

---

## 🔐 Paso 2: Obtener las Claves

### Copiar la clave PRIVADA (para GitHub Secrets):

```bash
cat ~/.ssh/europabot_mirror
```

**COPIA TODO** el contenido que empiece con:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

### Copiar la clave PÚBLICA (para Deploy Key):

```bash
cat ~/.ssh/europabot_mirror.pub
```

Copia la línea completa que empieza con `ssh-ed25519 ...`

---

## 🎯 Paso 3: Configurar el Repositorio DESTINO (europaneutron/europaBot)

1. Ve a: `https://github.com/europaneutron/europaBot/settings/keys`
2. Click en **"Add deploy key"**
3. Configurar:
   - **Title:** `Mirror from leo-neutrondigital`
   - **Key:** Pega la clave **PÚBLICA** (`.pub`)
   - ✅ **Allow write access** (MUY IMPORTANTE - debe estar activado)
4. Click en **"Add key"**

---

## 🔒 Paso 4: Configurar el Repositorio FUENTE (leo-neutrondigital/europaBot)

1. Ve a: `https://github.com/leo-neutrondigital/europaBot/settings/secrets/actions`
2. Click en **"New repository secret"**
3. Configurar:
   - **Name:** `MIRROR_SSH_KEY` (exactamente así, en mayúsculas)
   - **Secret:** Pega la clave **PRIVADA** (completa, con BEGIN y END)
4. Click en **"Add secret"**

---

## ✅ Paso 5: Verificar el Workflow

El archivo ya está en tu proyecto:
```
.github/workflows/mirror.yml
```

Ahora solo necesitas subirlo:

```bash
cd /Users/leonardocgordillo/Proyectosnext/europabot

# Agregar el workflow
git add .github/workflows/mirror.yml

# Commit
git commit -m "Add mirror workflow to europaneutron/europaBot"

# Push (esto activará el workflow por primera vez)
git push origin main
```

---

## 🧪 Paso 6: Probar que Funciona

1. Ve a: `https://github.com/leo-neutrondigital/europaBot/actions`
2. Deberías ver el workflow **"Mirror to europaneutron/europaBot"** ejecutándose
3. Si está en verde ✅ - funcionó
4. Si está en rojo ❌ - revisa los logs y verifica las claves

Para confirmar que el mirror funcionó:
```bash
# Ver que el código se copió
open https://github.com/europaneutron/europaBot
```

---

## 🔄 Uso Diario

Una vez configurado, **no necesitas hacer nada más**. 

Simplemente trabaja normalmente:

```bash
# Hacer cambios en tu código
git add .
git commit -m "Nueva funcionalidad"
git push origin main

# ✅ Automáticamente se copiará a europaneutron/europaBot
```

---

## 🛠️ Troubleshooting

### Error: "Permission denied (publickey)"
- ✅ Verifica que agregaste la clave PÚBLICA al repo destino
- ✅ Verifica que activaste "Allow write access"

### Error: "Invalid format"
- ✅ Asegúrate de copiar la clave PRIVADA completa (con BEGIN y END)
- ✅ No debe tener espacios extras al inicio/final

### El workflow no se ejecuta
- ✅ Verifica que el archivo esté en `.github/workflows/mirror.yml`
- ✅ Verifica que el secret se llame exactamente `MIRROR_SSH_KEY`

### El workflow falla con "refusing to fetch"
- ✅ Asegúrate de que ambos repositorios existan
- ✅ Verifica que el repo destino esté vacío o tenga contenido compatible

---

## 📊 Diagrama del Flujo

```
┌─────────────────────────────────────┐
│  leo-neutrondigital/europaBot       │
│  (Repositorio Principal)            │
└─────────────┬───────────────────────┘
              │
              │ git push origin main
              ▼
┌─────────────────────────────────────┐
│  GitHub Actions                     │
│  - Detecta push                     │
│  - Usa MIRROR_SSH_KEY               │
│  - Clona repo fuente                │
└─────────────┬───────────────────────┘
              │
              │ git push mirror main --force
              ▼
┌─────────────────────────────────────┐
│  europaneutron/europaBot            │
│  (Copia Exacta - Mirror)            │
└─────────────────────────────────────┘
```

---

## 🎯 Resumen de Claves

| Clave | Dónde va | Tipo | Permisos |
|-------|----------|------|----------|
| **Privada** (`europabot_mirror`) | `leo-neutrondigital/europaBot` → Secrets → `MIRROR_SSH_KEY` | Secret | Read (automático) |
| **Pública** (`europabot_mirror.pub`) | `europaneutron/europaBot` → Deploy Keys | Deploy Key | ✅ Write Access |

---

## ⚠️ Importante

1. **NUNCA** compartas la clave privada
2. **NUNCA** subas la clave privada al repositorio
3. El mirror es **unidireccional** (solo de leo-neutrondigital → europaneutron)
4. Los cambios en `europaneutron/europaBot` se **sobrescribirán** en el próximo push
5. Si necesitas hacer cambios, hazlos en `leo-neutrondigital/europaBot`

---

## 🚀 Próximos Pasos

Una vez que el mirror esté funcionando:

1. ✅ Verificar que el primer push funcionó
2. ✅ Hacer un cambio pequeño y verificar que se copia automáticamente
3. ✅ Configurar protección de rama en `europaneutron/europaBot` (opcional)

---

**Última actualización:** 22 de octubre de 2025
