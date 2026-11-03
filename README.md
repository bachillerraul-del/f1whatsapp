# 🏎️ F1 WhatsApp Bot 🏁

Bot inteligente de WhatsApp para fanáticos de la Fórmula 1. Proporciona en tiempo real el calendario de Grandes Premios, horarios de sesiones con conversión a tu hora local, clasificación de pilotos y constructores, resultados de la última carrera y sistema de alertas automáticas antes de cada sesión conectado a **Supabase PostgreSQL**.

---

## 🚀 Características

- 📅 **Próxima Carrera (`!f1 prox`):** Nombre del GP, circuito, ciudad y horarios de todas las sesiones (Prácticas Libres 1, 2 y 3, Sprint Shootout, Carrera Sprint, Clasificación y Carrera Principal).
- 🏆 **Mundial de Pilotos (`!f1 pilotos`):** Clasificación actualizada con puntos y victorias de cada piloto.
- 🏎️ **Mundial de Constructores (`!f1 constructores`):** Puntuación y posiciones de todas las escuderías.
- 🏁 **Últimos Resultados (`!f1 ult`):** Top 10 del GP más reciente con tiempos y puntos obtenidos.
- 🔔 **Sistema de Alertas Automáticas (`!f1 suscribir` / `!f1 desuscribir`):** Avisos automáticos a los usuarios registrados 30-60 minutos antes del inicio de cada sesión mediante tareas programadas (cron).
- 📊 **Panel de Base de Datos (`npm run prisma:studio`):** Administrador visual en el navegador para ver todos los suscriptores y alertas enviadas.

---

## 🛠️ Tecnologías Utilizadas

- **Runtime:** Node.js (TypeScript / ES Modules)
- **WhatsApp Engine:** `@whiskeysockets/baileys` (conexión multi-dispositivo por código QR)
- **Base de Datos:** PostgreSQL en **Supabase** (conectado mediante pooler IPv4)
- **ORM:** Prisma v6
- **F1 Data API:** Jolpica F1 API (sucesor oficial y estable de Ergast)
- **Scheduler:** `node-cron`

---

## 📋 Comandos Disponibles en WhatsApp

| Comando | Descripción |
| :--- | :--- |
| `!f1` o `!f1 ayuda` | Muestra el menú con todos los comandos disponibles |
| `!f1 prox` | Horarios y circuito del próximo Gran Premio |
| `!f1 pilotos` | Tabla del Campeonato Mundial de Pilotos |
| `!f1 constructores` | Tabla del Campeonato Mundial de Constructores |
| `!f1 ult` | Resultados del último Gran Premio disputado |
| `!f1 suscribir` | Activa las alertas automáticas para tu número o grupo |
| `!f1 desuscribir` | Cancela las alertas automáticas |
| `!f1 estado` | Consulta si tu número está registrado y activo |

---

## 🏁 Cómo Iniciar el Bot

### 1. Iniciar en modo desarrollo:
```bash
npm run dev
```

### 2. Vincular con WhatsApp:
1. Al ejecutar el comando, aparecerá un **Código QR** en la consola de la terminal.
2. Abre WhatsApp en tu teléfono móvil.
3. Ve a **Ajustes** (o menú de 3 puntos) > **Dispositivos vinculados** > **Vincular un dispositivo**.
4. Escanea el código QR que se muestra en tu terminal.
5. ¡Listo! Verás el mensaje: `🟢 ¡BOT DE F1 CONECTADO EXITOSAMENTE A WHATSAPP!`.

---

## 🗄️ Ver Suscriptores en Supabase

Puedes abrir la interfaz visual de Prisma Studio para ver los números suscritos en cualquier momento:
```bash
npm run prisma:studio
```
Se abrirá automáticamente en tu navegador en `http://localhost:5555`.
