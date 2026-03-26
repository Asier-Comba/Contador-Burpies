<div align="center">

# 🏋️ Contador de Burpees

**Cuenta tus burpees con la cámara — y que Llados te corrija si saltas.**

Detección de poses en tiempo real, 100% en el navegador, sin servidores.

[![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)](https://vitejs.dev)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-MoveNet-ff6f00?logo=tensorflow&logoColor=white)](https://www.tensorflow.org/js)

</div>

---

## ¿Cómo funciona?

La cámara detecta tu cuerpo en tiempo real con **MoveNet Lightning**, un modelo de Google que identifica 17 puntos clave del cuerpo. A partir de la posición de la nariz y las caderas se determina si estás de pie o en el suelo, contando un burpee completo por cada ciclo.

```
Cámara → MoveNet (17 keypoints) → posición nariz + caderas → estado → contador
```

Y si intentas saltar al final del burpee... **Llados te lo hará saber.**

---

## La regla de Llados

> *El burpee no lleva salto. El salto en el burpee es de mileurista.*

Si la aplicación detecta que tu nariz sube por encima del umbral de salto durante la fase de pie, se activa la **alarma Llados**:

- Aparece un banner dorado en pantalla con una frase
- El navegador la lee en voz alta en español con Web Speech API

Algunas de las frases:

| Frase |
|-------|
| *"¡El burpee no lleva salto, mileurista!"* |
| *"¡Para, para, para! ¡El burpee no se salta!"* |
| *"¡Nadie que gane dinero de verdad salta en el burpee!"* |
| *"¡El burpee sin salto, así se hace la pasta!"* |

---

## Detección

El contador usa una máquina de estados sencilla:

```
DE PIE ──→ AL SUELO ──→ DE PIE  =  +1 burpee
```

| Estado | Condición |
|--------|-----------|
| **De pie** | Nariz por encima del 38% del frame |
| **Al suelo** | Nariz por debajo del 52% + caderas bajas |
| **Salto** | Nariz por encima del 28% durante fase de pie |

El esqueleto cambia de color según la fase: **verde** de pie, **rojo** al suelo. Dos líneas punteadas marcan los umbrales en el canvas para que puedas calibrarte.

---

## Instalación

```bash
git clone https://github.com/Asier-Comba/Contador-Burpies.git
cd Contador-Burpies
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173), acepta el permiso de cámara y colócate **de frente**, con el cuerpo entero visible.

> El audio necesita que hayas interactuado con la página antes del primer salto (pulsar "Iniciar" ya cuenta). Si no hay voces en español instaladas en tu sistema, el texto se leerá con la voz por defecto.

---

## Arquitectura

```
App.jsx
 ├── loadDetector()       carga MoveNet lazy (solo la primera vez)
 ├── estimatePhase()      nariz + caderas → 'up' | 'down' | null
 ├── processKeypoints()
 │    ├── detección de fase     máquina de estados pie/suelo
 │    └── detección de salto    nariz < 28% → activa alarma Llados
 ├── sayMileurista()      Web Speech API con carga async de voces
 └── drawPose()           canvas espejado + esqueleto + umbrales visuales
```

El estado del juego vive en `ref`s para evitar re-renders en cada frame. `setState` solo se llama al cambiar el contador, la fase o activar el banner.

---

## Posibles mejoras

- [ ] Tempo entre reps (velocidad de ejecución)
- [ ] Historial de sesiones con localStorage
- [ ] Modo estricto: no cuenta el burpee si detecta salto
- [ ] Más frases y voces personalizadas
- [ ] Calibración manual de umbrales desde la UI
