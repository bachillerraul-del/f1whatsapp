# 🏎️ F1 & MotoGP WhatsApp Bot 🏁🏍️

Bot inteligente de WhatsApp para fanáticos del automovilismo y motociclismo. Proporciona en tiempo real los calendarios de Grandes Premios, horarios de sesiones con conversión a tu hora local (España peninsular), clasificación de pilotos y constructores, resultados de la última carrera y sistema de alertas automáticas antes de cada sesión conectado a **Supabase PostgreSQL**.

---

## 🚀 Características

### 🏎️ Fórmula 1
- 📅 **Próxima Carrera (`!f1 prox`):** Horarios de todas las sesiones (FP1, FP2, FP3, Sprint, Clasificación y Carrera).
- 🏆 **Mundial de Pilotos (`!f1 pilotos`):** Puntos, victorias y escuderías.
- 🏎️ **Mundial de Constructores (`!f1 constructores`):** Clasificación de equipos.
- 🏁 **Últimos Resultados (`!f1 ult`):** Top 10 del GP más reciente.

### 🏍️ MotoGP
- 📅 **Próximo Gran Premio (`!motogp prox`):** Fechas, circuito y horarios oficiales de FP1, Práctica (PR), FP2, Q1, Q2, Carrera Sprint, Warm Up y Carrera Principal en hora española.
- 🏆 **Mundial de Pilotos (`!motogp pilotos`):** Puntuación de pilotos, victorias en carrera y sprints.
- 🏍️ **Mundial de Constructores (`!motogp constructores`):** Puntos acumulados por marca (Ducati, Aprilia, KTM, Yamaha, Honda).
- 🏁 **Últimos Resultados (`!motogp ult`):** Top 10 del último Gran Premio disputado con tiempos y diferencias.

### 🔔 Sistema de Alertas Automáticas (3 Avisos Clave)
El bot envía **únicamente 3 alertas exclusivas** por cada fin de semana de Gran Premio:
1. ⏰ **24 horas antes de la Práctica 1 (FP1):** Notificación de bienvenida al Gran Premio con el circuito y la lista completa de horarios del fin de semana (hora peninsular española).
2. ⚡ **2 horas antes del Sprint:** Recordatorio de que la Carrera Sprint arranca en 2 horas (los fines de semana que haya sprint).
3. 🏁 **2 horas antes de la Carrera:** Recordatorio final de que la Carrera Principal arranca en 2 horas.

---

## 📋 Comandos Disponibles

| Comando | Deporte | Descripción |
| :--- | :--- | :--- |
| `!ayuda` | Todos | Menú general con todos los comandos de F1 y MotoGP |
| `!f1 prox` | F1 | Horarios y circuito del próximo GP de Fórmula 1 |
| `!f1 pilotos` | F1 | Clasificación del Mundial de Pilotos de F1 |
| `!f1 constructores` | F1 | Clasificación de Escuderías de F1 |
| `!f1 ult` | F1 | Resultados del último GP de F1 |
| `!motogp prox` | MotoGP | Horarios y circuito del próximo GP de MotoGP |
| `!motogp pilotos` | MotoGP | Clasificación del Mundial de Pilotos de MotoGP |
| `!motogp constructores`| MotoGP | Clasificación de Constructores / Marcas de MotoGP |
| `!motogp ult` | MotoGP | Resultados de la última carrera de MotoGP |
| `!f1 suscribir` | Ambos | Activa las alertas automáticas para tu número o grupo |
| `!f1 desuscribir` | Ambos | Cancela las alertas automáticas |
| `!f1 estado` | Ambos | Consulta si estás activo en la lista de alertas |

---

## 🛠️ Tecnologías Utilizadas

- **Runtime:** Node.js (TypeScript / ES Modules)
- **WhatsApp Engine:** `@whiskeysockets/baileys`
- **Base de Datos:** PostgreSQL en **Supabase** (IPv4 pooler)
- **ORM:** Prisma v6
- **APIs de Datos:**
  - F1: Jolpica F1 API (sucesor oficial de Ergast)
  - MotoGP: Official MotoGP Pulselive API
- **Scheduler:** `node-cron`
