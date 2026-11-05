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

### 🏆 Juego: La Porra de F1 (P4, P5, P6, Alonso y Sainz)
Juego interactivo para grupos de WhatsApp donde cada participante pronostica el Top 4-5-6 y las posiciones de los pilotos españoles.
- 🎯 **Objetivo:** Acertar qué pilotos terminarán en **P4, P5 y P6**, y la posición final de **Fernando Alonso** y **Carlos Sainz**.
- 📋 **Composición del pronóstico:**
  1. **P4, P5, P6:** 3 pilotos distintos del resto de la parrilla (¡Alonso y Sainz también pueden incluirse aquí!).
  2. **Posición de Fernando Alonso:** Número entre 1 y 22, o **`DNF`** si crees que abandonará.
  3. **Posición de Carlos Sainz:** Número entre 1 y 22, o **`DNF`** si crees que abandonará.
  - _Ejemplos:_ `!porra norris leclerc piastri P8 P5` o `!porra russell hamilton bearman DNF P7`
- 🏆 **Sistema de Puntuación (Hasta 15 pts por GP):**
  - **P4, P5 y P6:** **+3 puntos** por cada acierto exacto de piloto en su posición.
  - **Fernando Alonso y Carlos Sainz:**
    - **+3 puntos:** Acierto exacto de la posición o acierto de **`DNF`** si el piloto no acaba la carrera.
    - **+2 puntos:** Si fallas por solo 1 puesto de diferencia (ej: predijiste P8 y acaba P7 o P9).
    - **+1 punto:** Si fallas por 2 puestos de diferencia (ej: predijiste P8 y acaba P6 o P10).
    - **0 puntos:** Si la diferencia es de 3 o más puestos (o si pusiste DNF y terminó).
- ⏳ **Límite de apuestas:** Se cierran automáticamente al comenzar la **Clasificación (Q1)** del sábado.
- ⏰ **Aviso automático de cierre:** El bot avisa 2 horas antes de la Qualy para que nadie se quede sin enviar su porra.
- 🤖 **Competidores IA (Jarvis AI & Pitwall AI):** Dos inteligencias artificiales que juegan en la porra del grupo formulando estrategias con **Google Gemini AI**:
  - **🤖 Jarvis AI:** Estratega analítico de telemetría (cálculo de probabilidades y ritmo constante).
  - **🤖 Pitwall AI:** Jefe de muro audaz (apuestas arriesgadas, sorpresas en el Top 6 y DNF).
- 🖼️ **Tarjeta gráfica del Podio:** Al publicarse los resultados de la carrera, el bot genera y envía una **imagen digital del podio** con los 3 mejores jugadores y sus puntuaciones.
- 📢 **Publicación automática de resultados:** Nada más finalizar la carrera el domingo, el bot calcula los puntos y publica automáticamente el podio y desglose en cada grupo.
- 🏎️ **Feedback visual:** El bot reacciona con el emoji 🏎️ al mensaje de WhatsApp cuando registras un pronóstico válido.
- 🚫 **Regla anti-copia:** Un participante no puede copiar más de 3 pronósticos de otro jugador dentro del mismo grupo (máximo 3 coincidencias de 5). Si coincide en 4 o 5, la apuesta es rechazada automáticamente indicando qué predicciones coinciden.
- 🎖️ **Palmarés y Cuadro de Honor (`!porra tabla`):** La clasificación general ahora incluye estadísticas avanzadas:
  - 🏆 **Victorias de GP:** Carreras ganadas por cada participante.
  - 🎯 **El Nostradamus:** Total de aciertos exactos (+3) a lo largo del año.
  - 🇪🇸 **Especialista Español:** Puntos totales sumados gracias a Alonso y Sainz.
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
| `!porra [P4] [P5] [P6] [Alo] [Sai]` | Porra F1 | Envía o modifica tu pronóstico (ej. `!porra norris leclerc piastri P8 P5`) |
| `!porra analizar` | Porra F1 | Auditoría de tu apuesta con telemetría de Jarvis AI y Pitwall AI |
| `!porra ver` | Porra F1 | Ver los pronósticos registrados en el grupo para el próximo GP |
| `!porra ia` | Porra F1 | Estado/pronósticos de Jarvis AI y Pitwall AI con Gemini (2h antes de Qualy) |
| `!porra resultados` | Porra F1 | Calcula y muestra los puntos, podio gráfico PNG y radio de equipo F1 |
| `!porra tabla` | Porra F1 | Clasificación general acumulada de la temporada en el grupo |
| `!porra reglas` | Porra F1 | Explica el sistema de puntuación y normas del juego |
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
