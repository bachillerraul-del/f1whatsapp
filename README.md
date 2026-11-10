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

### 🏆 Juego: La Porra (Fórmula 1 y MotoGP)
Juego interactivo para grupos de WhatsApp donde cada participante pronostica el **Top 5 de la carrera del domingo** y **1 piloto que sufrirá DNF (abandono/caída)**, disponible tanto para **F1** como para **MotoGP**.

- 🎯 **Objetivo:** Acertar los 5 primeros clasificados de la carrera del domingo (1º al 5º) y un piloto que abandone la carrera.
- 📋 **Composición del pronóstico:**
  1. **Top 5 (1º, 2º, 3º, 4º, 5º):** 5 pilotos diferentes.
  2. **1 DNF (Abandono / Caída):** 1 piloto que no finalizará la carrera (no puede estar en tu Top 5).
  - _Ejemplo F1:_ `!porra ver nor lec pia rus dnf: ham` o `!porra verstappen norris leclerc piastri russell hamilton`
  - _Ejemplo MotoGP:_ `!porra moto marquez martin bagnaia acosta bastianini dnf: binder` (o `!porramoto ...`)
- 🏆 **Sistema de Puntuación Escalonado (Hasta 18 pts por GP):**
  - **+3 puntos:** Por cada posición exacta acertada en el Top 5 (1º, 2º, 3º, 4º o 5º).
  - **+2 puntos:** Si el piloto finaliza en el Top 5 a **solo 1 puesto de distancia** de tu predicción (casi exacto).
  - **+1 punto:** Si el piloto finaliza en el Top 5 a **2 o más puestos de distancia** de tu predicción.
  - **+3 puntos:** Si aciertas el piloto que sufre DNF (abandono / retirada / caída).
  - _Máximo posible por fin de semana: 18 puntos._
- 📈 **Clasificación General:** Se determina por la **suma total de todos los puntos conseguidos en cada GP** de la temporada (en caso de empate en un GP, desempata la fecha de última modificación `updatedAt` de la apuesta).
- ⏳ **Límite de apuestas:** Se cierran automáticamente al comenzar la **Clasificación (Q1)** del sábado.
- ⏰ **Aviso automático de cierre:** El bot avisa 2 horas antes de la Qualy (tanto en F1 como en MotoGP) para que nadie se quede sin enviar su porra.
- 🤖 **Competidores IA (Jarvis AI & Pitwall AI):** Dos inteligencias artificiales que juegan en la porra del grupo formulando estrategias con **Google Gemini AI**:
  - **🤖 Jarvis AI:** Estratega analítico de telemetría (probabilidades y ritmo de tandas).
  - **🤖 Pitwall AI:** Jefe de muro audaz (apuestas arriesgadas, sorpresas en el Top 5 y DNF).
- 🖼️ **Tarjeta gráfica del Podio:** Al publicarse los resultados de la carrera, el bot genera y envía una **imagen digital del podio** con los 3 mejores jugadores y sus puntuaciones (distinguiendo F1 y MotoGP con estilos propios).
- 📢 **Publicación automática de resultados:** Nada más finalizar la carrera el domingo, el bot calcula los puntos y publica automáticamente el podio y desglose en cada grupo.
- 🏎️ / 🏍️ **Feedback visual:** El bot reacciona con el emoji 🏎️ (F1) o 🏍️ (MotoGP) al mensaje de WhatsApp cuando registras un pronóstico válido.
- 🚫 **Regla anti-copia:**
  - Máximo 4 coincidencias exactas de las 6 predicciones con otro jugador humano del grupo. Si coincide en 5 o 6 posiciones exactas, la apuesta es rechazada indicando las coincidencias (se permite usar los mismos pilotos en distinto orden, y las IAs nunca bloquean apuestas humanas).
- 🎖️ **Palmarés y Cuadro de Honor (`!porra tabla` / `!porra moto tabla`):** La clasificación general por puntos totales incluye estadísticas avanzadas:
  - 🏆 **Victorias de GP:** Carreras ganadas por cada participante.
  - 🎯 **El Nostradamus:** Total de posiciones exactas acertadas (+3).
  - 💥 **Cazador de Abandonos:** Total de aciertos de DNF (+3).
  - 👑 **Cuadro de Honor:** Premios y títulos honoríficos para los mejores de la temporada.

### 🔔 Sistema de Alertas Automáticas (3 Avisos Clave)
El bot envía **únicamente 3 alertas exclusivas** por cada fin de semana de Gran Premio:
1. ⏰ **24 horas antes de la Práctica 1 (FP1):** Notificación de bienvenida al Gran Premio con el circuito y la lista completa de horarios del fin de semana (hora peninsular española).
2. ⚡ **2 horas antes del Sprint:** Recordatorio de que la Carrera Sprint arranca en 2 horas (los fines de semana que haya sprint).
3. 🏁 **2 horas antes de la Carrera:** Recordatorio final de que la Carrera Principal arranca en 2 horas.

---

## 📋 Comandos Disponibles

| Comando | Deporte / Función | Descripción |
| :--- | :--- | :--- |
| `!ayuda` | Todos | Menú general con todos los comandos de F1 y MotoGP |
| `!f1 prox` | F1 | Horarios y circuito del próximo GP de Fórmula 1 |
| `!f1 pilotos` | F1 | Clasificación del Mundial de Pilotos de F1 |
| `!f1 constructores` | F1 | Clasificación de Escuderías de F1 |
| `!f1 ult` | F1 | Resultados del último GP de F1 |
| `!porra [1º] [2º] [3º] [4º] [5º] [DNF]` | Porra F1 | Envía o modifica tu pronóstico (ej. `!porra ver nor lec pia rus dnf: ham`) |
| `!porra analizar` | Porra F1 | Auditoría de tu apuesta con telemetría de Jarvis AI y Pitwall AI |
| `!porra ver` | Porra F1 | Ver los pronósticos de F1 del grupo (humanos e IAs) |
| `!porra ia` | Porra F1 | Estado/pronósticos de Jarvis AI y Pitwall AI con Gemini (2h antes de Qualy) |
| `!porra resultados` | Porra F1 | Calcula y muestra puntos, podio gráfico PNG y radio F1 |
| `!porra historial` | Porra F1 | Resumen de todos los GPs jugados en la temporada de F1 |
| `!porra tabla` | Porra F1 | Clasificación general de la temporada de F1 |
| `!porra reglas` | Porra F1 | Explica el sistema de puntuación y normas anti-copia |
| `!porra moto [1º]..[5º] [DNF]` | Porra MotoGP | Envía pronóstico de MotoGP (ej. `!porra moto marquez martin bagnaia acosta bastianini dnf: binder`) |
| `!porra moto ver` / `!porra moto tabla` | Porra MotoGP | Ver apuestas, clasificación general e historial de MotoGP (o `!porramoto ...`) |
| `!porra moto resultados` | Porra MotoGP | Calcula puntos, podio gráfico y radio tras la carrera de MotoGP |
| `!motogp prox` | MotoGP | Horarios y circuito del próximo GP de MotoGP |
| `!motogp pilotos` | MotoGP | Clasificación del Mundial de Pilotos de MotoGP |
| `!motogp constructores`| MotoGP | Clasificación de Constructores / Marcas de MotoGP |
| `!motogp ult` | MotoGP | Resultados de la última carrera de MotoGP |
| `!f1 suscribir` | Alertas | Activa las 3 alertas automáticas para tu número o grupo |
| `!f1 desuscribir` | Alertas | Cancela las alertas automáticas |
| `!f1 estado` | Alertas | Consulta si estás activo en la lista de alertas |

---

## 🛠️ Tecnologías Utilizadas

- **Runtime:** Node.js (TypeScript / ES Modules)
- **WhatsApp Engine:** `@whiskeysockets/baileys`
- **Base de Datos:** PostgreSQL en **Supabase** (IPv4 pooler)
- **ORM:** Prisma v6
- **APIs de Datos e Inteligencia Artificial:**
  - AI Engine: **Google Gemini AI** (`GEMINI_API_KEY`) para Jarvis AI y Pitwall AI
  - F1: Jolpica F1 API (sucesor oficial de Ergast)
  - MotoGP: Official MotoGP Pulselive API
- **Scheduler:** `node-cron`
