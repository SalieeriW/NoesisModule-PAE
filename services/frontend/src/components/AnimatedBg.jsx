import { useEffect, useRef } from "react";

const NODE_COUNT = 68;
const CONNECT_DIST = 165;
const SPEED = 0.26;

export function AnimatedBg() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W, H, nodes, raf;

    function init() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      nodes = Array.from({ length: NODE_COUNT }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * SPEED,
        vy: (Math.random() - 0.5) * SPEED,
        r: Math.random() * 1.5 + 0.5,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    function tick(t) {
      ctx.clearRect(0, 0, W, H);

      for (const n of nodes) {
        n.x = ((n.x + n.vx) % W + W) % W;
        n.y = ((n.y + n.vy) % H + H) % H;
        n.phase += 0.008;
      }

      // connections
      ctx.lineWidth = 0.6;
      for (let i = 0; i < nodes.length - 1; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.hypot(dx, dy);
          if (d < CONNECT_DIST) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(196,92,38,${(1 - d / CONNECT_DIST) * 0.18})`;
            ctx.stroke();
          }
        }
      }

      // nodes with subtle pulse
      for (const n of nodes) {
        const glow = 0.28 + Math.sin(n.phase) * 0.1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(196,92,38,${glow})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    }

    const onResize = () => init();
    window.addEventListener("resize", onResize);
    init();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.72,
      }}
    />
  );
}
