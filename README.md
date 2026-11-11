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
Juego interactivo para grupos de WhatsApp donde cada participante pronostica el **Top 5 de la carrera del domingo**, **1 piloto que sufrirá DNF (abandono/caída)** y el **3º puesto (P3) de la sesión de Clasificación**, disponible tanto para **F1** como para **MotoGP**.

- 🎯 **Objetivo:** Acertar el Top 5 de carrera, 1 piloto DNF y el 3º clasificado (P3) de la Qualy.
- 📋 **Composición del pronóstico (7 elecciones):**
  1. **Top 5 de Carrera (1º, 2º, 3º, 4º, 5º):** 5 pilotos diferentes.
  2. **1 DNF de Carrera (Abandono / Caída):** 1 piloto que no finalizará la carrera (no puede estar en tu Top 5).
  3. **1 P3 de Clasificación (`QP3`):** Piloto que terminará 3º en la sesión de clasificación oficial del sábado.
  - _Ejemplo F1:_ `!porra ver nor lec pia rus dnf: ham qp3: alo` (o directo: `!porra ver nor lec pia rus ham alo`)
  - _Ejemplo MotoGP:_ `!porra moto marquez martin bagnaia acosta bastianini dnf: binder qp3: quartararo` (o `!porramoto ...`)
- 🏆 **Sistema de Puntuación Escalonado (Hasta 21 pts por GP):**
  - **Carrera Top 5:**
    - **+3 puntos:** Posición exacta acertada en el Top 5 (1º, 2º, 3º, 4º o 5º).
    - **+2 puntos:** Si el piloto finaliza en el Top 5 a **solo 1 puesto de distancia** de tu predicción (casi exacto).
    - **+1 punto:** Si el piloto finaliza en el Top 5 a **2 o más puestos de distancia** de tu predicción.
  - **Carrera DNF:**
    - **+3 puntos:** Si aciertas el piloto que sufre DNF (abandono / retirada / caída).
  - **Clasificación P3 (`QP3`):**
    - **+3 puntos:** Acertar exactamente el 3º de la Qualy.
    - **+2 puntos:** Si tu piloto termina 2º o 4º en la Qualy (a 1 puesto de distancia).
    - **+1 punto:** Si tu piloto termina en el Top 5 de la Qualy (1º o 5º).
  - _Máximo posible por fin de semana: 21 puntos._
- 📈 **Clasificación General:** Se determina por la **suma total de todos los puntos conseguidos en cada GP** de la temporada (en caso de empate en un GP, desempata la fecha de última modificación `updatedAt` de la apuesta).
- ⏳ **Límite de apuestas:** Se cierran automáticamente al comenzar la **Clasificación (Q1)** del sábado.
- ⏰ **Aviso automático de cierre:** El bot avisa 2 horas antes de la Qualy (tanto en F1 como en MotoGP) para que nadie se quede sin enviar su porra.
- 🤖 **Competidores IA (Jarvis AI & Pitwall AI):** Dos inteligencias artificiales que juegan en la porra del grupo formulando estrategias con **Google Gemini AI**:
  - **🤖 Jarvis AI:** Estratega analítico de telemetría (probabilidades y ritmo de tandas).
  - **🤖 Pitwall AI:** Jefe de muro audaz (apuestas arriesgadas, sorpresas en el Top 5 y DNF).
- 🖼️ **Tarjeta gráfica del Podio:** Al publicarse los resultados de la carrera, el bot genera y envía una **imagen digital del podio** con los 3 mejores jugadores y sus puntuaciones (distinguiendo F1 y MotoGP con estilos propios).
- 📢 **Publicación automática de resultados:** Nada más finalizar la carrera el domingo, el bot calcula los puntos y publica automáticamente el podio y desglose en cada grupo.
- 🏎️ / 🏍️ **Feedback visual:** El bot reacciona con el emoji 🏎️ (F1) o 🏍️ (MotoGP) al mensaje de WhatsApp cuando registras un pronóstico válido.
- 🚫 **Reglas Anti-Copia (solo aplican a Carrera: Top 5 + DNF):**
  1. **Máximo 3 coincidencias exactas en el Top 5:** No puedes coincidir en más de 3 posiciones exactas del Top 5 de carrera con otro jugador humano. Si coincide en 4 o 5 posiciones del Top 5, la apuesta es rechazada.
  2. **Prohibido coincidir en la predicción DNF:** Ningún jugador puede repetir el piloto DNF que ya haya elegido otro participante del grupo.
  - _Nota:_ En la predicción de **P3 de Clasificación (`QP3`)** no se aplica regla anti-copia, y las IAs nunca bloquean las apuestas de los usuarios humanos.
- 🎖️ **Palmarés y Cuadro de Honor (`!porra tabla` / `!porra moto tabla`):** La clasificación general por puntos totales incluye estadísticas avanzadas:
  - 🏆 **Victorias de GP:** Carreras ganadas por cada participante.
  - 🎯 **El Nostradamus:** Total de posiciones exactas acertadas (+3).
  - 💥 **Cazador de Abandonos:** Total de aciertos de DNF (+3).
  - ⏱️ **Pole Master:** Total de aciertos de P3 de Clasificación (+3).
  - 👑 **Cuadro de Honor:** Premios y títulos honoríficos para los mejores de la temporada.

### 🔔 Sistema de Alertas Automáticas (2 Avisos por GP)
El bot envía **únicamente 2 alertas automáticas** por cada fin de semana de Gran Premio (F1 y MotoGP):
1. ⏰ **24 horas antes de la 1ª sesión (FP1):** Aviso de inicio del Gran Premio con el circuito y los horarios completos de todas las sesiones del fin de semana (hora peninsular española).
2. 🚨 **2 horas antes del cierre de apuestas (Clasificación / Qualy):** Recordatorio final antes de que se cierren las apuestas de La Porra, incluyendo las predicciones oficiales de **Jarvis AI** y **Pitwall AI**.

---

## 📋 Comandos Disponibles (Simplificados)

| Comando | Función | Descripción |
| :--- | :--- | :--- |
| `!ayuda` | General | Muestra el menú resumido de todos los comandos |
| `!f1` *(o `!f1 prox`)* | Fórmula 1 | Próximo GP de F1 y horarios de sesiones |
| `!f1 pilotos` | Fórmula 1 | Clasificación del Mundial de Pilotos de F1 |
| `!f1 equipos` | Fórmula 1 | Clasificación del Mundial de Constructores de F1 |
| `!f1 ult` | Fórmula 1 | Resultados de la última carrera de F1 |
| `!moto` *(o `!moto prox`)* | MotoGP | Próximo GP de MotoGP y horarios de sesiones |
| `!moto pilotos` | MotoGP | Clasificación del Mundial de Pilotos de MotoGP |
| `!moto equipos` | MotoGP | Clasificación del Mundial de Constructores de MotoGP |
| `!moto ult` | MotoGP | Resultados de la última carrera de MotoGP |
| `!porra [1º..5º] [DNF] [QP3]` | Porra F1 | Enviar o modificar pronóstico (ej. `!porra ver nor lec pia rus dnf: col qp3: alo`) |
| `!porramoto [1º..5º] [DNF] [QP3]`| Porra MotoGP| Enviar o modificar pronóstico de MotoGP (ej. `!porramoto mar mar bag aco bas dnf: bin qp3: qua`) |
| `!porra ver` | Porra | Ver las apuestas registradas del grupo y de las IAs |
| `!porra puntos` | Porra | Calcula puntos del último GP, genera podio PNG y radio de equipo |
| `!porra tabla` | Porra | Clasificación general de la temporada (suma total de puntos) |
| `!porra historial` | Porra | Resumen de todos los GPs disputados en la temporada |
| `!porra ia` / `analizar` | Porra | Ver pronósticos de las IAs o auditar tu apuesta con telemetría |
| `!porra reglas` | Porra | Explica el sistema de puntuación (3-2-1) y normas |
| `!alertas on` / `off` | Alertas | Activa o desactiva las 2 alertas automáticas en el chat |
| `!bot on` / `off` | Control | Activa o silencia el bot en el chat actual |

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
