import { useEffect, useRef, useState } from 'react';

// ── MoveNet ───────────────────────────────────────────────────────────────────
async function loadDetector() {
  const tf = await import('@tensorflow/tfjs');
  await import('@tensorflow/tfjs-backend-webgl');
  await tf.ready();
  const pd = await import('@tensorflow-models/pose-detection');
  return pd.createDetector(pd.SupportedModels.MoveNet, {
    modelType: pd.movenet.modelType.SINGLEPOSE_LIGHTNING,
  });
}

// Conexiones del esqueleto para dibujar
const CONNECTIONS = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12],
  [11, 13], [13, 15], [12, 14], [14, 16],
];

// ── Lógica de burpee ──────────────────────────────────────────────────────────
// Un burpee = persona de PIE → SUELO → PIE
// Métrica: posición Y normalizada de la nariz (0=arriba, 1=abajo del frame)
// + altura de las caderas para mayor robustez
const THRESHOLD_DOWN = 0.52; // nose_y > este valor → consideramos que está abajo
const THRESHOLD_UP   = 0.38; // nose_y < este valor → consideramos que está arriba

function estimatePhase(kp, frameH) {
  const nose = kp[0];
  const lhip = kp[11], rhip = kp[12];
  if (!nose || nose.score < 0.3) return null;

  const noseNorm = nose.y / frameH;

  // Refuerzo: si las caderas también están bajas, más seguridad en DOWN
  let hipNorm = null;
  if (lhip?.score > 0.2 && rhip?.score > 0.2) {
    hipNorm = ((lhip.y + rhip.y) / 2) / frameH;
  }

  if (noseNorm > THRESHOLD_DOWN && (hipNorm === null || hipNorm > 0.55)) {
    return 'down';
  }
  if (noseNorm < THRESHOLD_UP) {
    return 'up';
  }
  return null; // zona intermedia, mantener fase actual
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function App() {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const detectorRef = useRef(null);
  const animRef    = useRef(null);
  const phaseRef   = useRef('up'); // fase actual del movimiento

  const [status, setStatus]   = useState('idle');
  const [reps, setReps]       = useState(0);
  const [phase, setPhase]     = useState('up');
  const [error, setError]     = useState('');
  const [feedback, setFeedback] = useState('');

  async function start() {
    setStatus('loading');
    setReps(0);
    phaseRef.current = 'up';
    setPhase('up');
    setFeedback('');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      videoRef.current.srcObject = stream;
      await new Promise(res => { videoRef.current.onloadedmetadata = res; });
      videoRef.current.play();
      if (!detectorRef.current) detectorRef.current = await loadDetector();
      setStatus('running');
      loop();
    } catch (e) {
      setStatus('error');
      setError(e.message || 'No se pudo acceder a la cámara.');
      stream?.getTracks().forEach(t => t.stop());
    }
  }

  function stop() {
    cancelAnimationFrame(animRef.current);
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    setStatus('idle');
  }

  function loop() {
    animRef.current = requestAnimationFrame(async () => {
      if (!videoRef.current || !detectorRef.current || !canvasRef.current) return;
      try {
        const poses = await detectorRef.current.estimatePoses(videoRef.current);
        if (poses[0]) {
          processKeypoints(poses[0].keypoints);
          drawPose(poses[0].keypoints);
        }
      } catch { /* skip frame */ }
      loop();
    });
  }

  function processKeypoints(kp) {
    const h = videoRef.current?.videoHeight || 480;
    const detectedPhase = estimatePhase(kp, h);
    if (!detectedPhase) return; // zona intermedia

    if (detectedPhase === 'down' && phaseRef.current === 'up') {
      phaseRef.current = 'down';
      setPhase('down');
      setFeedback('¡Al suelo!');
    } else if (detectedPhase === 'up' && phaseRef.current === 'down') {
      phaseRef.current = 'up';
      setPhase('up');
      setReps(prev => prev + 1);
      setFeedback('¡Burpee!');
      setTimeout(() => setFeedback(''), 800);
    }
  }

  function drawPose(kp) {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;

    // Vídeo espejado
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0);
    ctx.restore();

    // Overlay oscuro
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const mirrorX = x => canvas.width - x;

    // Línea de umbral DOWN (referencia visual)
    const downLineY = THRESHOLD_DOWN * canvas.height;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(255,80,80,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, downLineY);
    ctx.lineTo(canvas.width, downLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Línea de umbral UP
    const upLineY = THRESHOLD_UP * canvas.height;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(80,255,160,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, upLineY);
    ctx.lineTo(canvas.width, upLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Color del esqueleto según fase
    const color = phaseRef.current === 'down' ? '#ff5555' : '#00ff99';

    // Huesos
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    for (const [i, j] of CONNECTIONS) {
      const a = kp[i], b = kp[j];
      if (a?.score > 0.3 && b?.score > 0.3) {
        ctx.beginPath();
        ctx.moveTo(mirrorX(a.x), a.y);
        ctx.lineTo(mirrorX(b.x), b.y);
        ctx.stroke();
      }
    }

    // Articulaciones
    ctx.fillStyle = '#fff';
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    for (const p of kp) {
      if (p.score < 0.3) continue;
      ctx.beginPath();
      ctx.arc(mirrorX(p.x), p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  useEffect(() => () => stop(), []);

  const phaseLabel = phase === 'down' ? '⬇ AL SUELO' : '⬆ DE PIE';
  const phaseColor = phase === 'down' ? '#ff5555' : '#00ff99';

  return (
    <div style={s.root}>
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />

      {/* ── IDLE ── */}
      {status === 'idle' && (
        <div style={s.center}>
          <div style={{ fontSize: 80 }}>🏋️</div>
          <h1 style={s.title}>Contador de Burpees</h1>
          <p style={s.sub}>Colócate de <strong>frente</strong> a la cámara, cuerpo entero visible</p>
          <p style={s.sub}>De pie → al suelo → de pie = <strong>1 burpee</strong></p>
          <button style={s.btn} onClick={start}>Iniciar</button>
        </div>
      )}

      {/* ── LOADING ── */}
      {status === 'loading' && (
        <div style={s.center}>
          <div style={s.spinner} />
          <p style={{ color: '#888', marginTop: 20 }}>Cargando modelo de poses…</p>
        </div>
      )}

      {/* ── ERROR ── */}
      {status === 'error' && (
        <div style={s.center}>
          <div style={{ fontSize: 56 }}>⚠️</div>
          <p style={{ color: '#ff5555', margin: '12px 0' }}>{error}</p>
          <button style={s.btn} onClick={() => setStatus('idle')}>Volver</button>
        </div>
      )}

      {/* ── RUNNING ── */}
      {status === 'running' && (
        <div style={s.gameLayout}>
          <div style={s.canvasWrapper}>
            <canvas ref={canvasRef} style={{ borderRadius: 12, maxWidth: '100%' }} />
            {feedback && (
              <div style={s.feedbackBadge}>{feedback}</div>
            )}
          </div>

          <div style={s.panel}>
            <div style={s.repBox}>
              <span style={s.repNumber}>{reps}</span>
              <span style={s.repLabel}>burpees</span>
            </div>

            <div style={{ ...s.phaseBadge, borderColor: phaseColor, color: phaseColor }}>
              {phaseLabel}
            </div>

            <div style={s.legend}>
              <span style={{ color: '#00ff99' }}>— de pie</span>
              <span style={{ color: '#ff5555' }}>— al suelo</span>
            </div>

            <div style={s.controls}>
              <button style={s.btnSecondary} onClick={() => { setReps(0); phaseRef.current = 'up'; setPhase('up'); }}>
                Reiniciar
              </button>
              <button style={s.btnDanger} onClick={stop}>
                Parar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #08001a 0%, #120028 50%, #08001a 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Segoe UI', sans-serif",
    color: '#fff',
    padding: 16,
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
  title: {
    fontSize: 40, margin: '8px 0 4px', fontWeight: 900,
    background: 'linear-gradient(135deg, #00ff99, #00ccff)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  sub: { color: '#999', fontSize: 16, margin: '2px 0', textAlign: 'center' },
  btn: {
    marginTop: 20, padding: '13px 52px', fontSize: 20, fontWeight: 700,
    background: 'linear-gradient(135deg, #00cc77, #00aacc)',
    color: '#fff', border: 'none', borderRadius: 50, cursor: 'pointer',
    boxShadow: '0 6px 28px rgba(0,200,150,0.4)',
  },
  spinner: {
    width: 46, height: 46,
    border: '4px solid rgba(255,255,255,0.1)',
    borderTop: '4px solid #00ff99',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  gameLayout: {
    display: 'flex', flexWrap: 'wrap', gap: 24,
    alignItems: 'flex-start', justifyContent: 'center', width: '100%',
  },
  canvasWrapper: { position: 'relative' },
  feedbackBadge: {
    position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,255,153,0.15)', border: '1px solid #00ff99',
    color: '#00ff99', fontWeight: 800, fontSize: 22, padding: '6px 24px',
    borderRadius: 50, backdropFilter: 'blur(6px)',
    animation: 'fadeIn 0.15s ease',
  },
  panel: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 20, minWidth: 180,
  },
  repBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20, padding: '28px 48px',
  },
  repNumber: { fontSize: 88, fontWeight: 900, lineHeight: 1, color: '#fff' },
  repLabel:  { fontSize: 18, color: '#888', marginTop: 4 },
  phaseBadge: {
    border: '2px solid', borderRadius: 50,
    padding: '8px 28px', fontWeight: 700, fontSize: 16, letterSpacing: 1,
    transition: 'color 0.2s, border-color 0.2s',
  },
  legend: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    fontSize: 13, color: '#666',
  },
  controls: { display: 'flex', gap: 12, marginTop: 8 },
  btnSecondary: {
    padding: '10px 22px', fontSize: 15, fontWeight: 600,
    background: 'rgba(255,255,255,0.08)', color: '#ccc',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, cursor: 'pointer',
  },
  btnDanger: {
    padding: '10px 22px', fontSize: 15, fontWeight: 600,
    background: 'rgba(220,50,50,0.15)', color: '#ff6666',
    border: '1px solid rgba(220,50,50,0.3)', borderRadius: 10, cursor: 'pointer',
  },
};
