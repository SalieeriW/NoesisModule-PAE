import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";
import { fetchPublicStats } from "../lib/api";

/* ─── IntersectionObserver hook ─────────────────────────────────── */
function useInView(threshold = 0.14) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function Reveal({ children, as: Tag = "div", className = "", delay = 0, dir = "up" }) {
  const [ref, visible] = useInView();
  return (
    <Tag
      ref={ref}
      className={`reveal reveal--${dir} ${visible ? "reveal--in" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/* ─── Animated counter ───────────────────────────────────────────── */
function StatItem({ label, value }) {
  const ref = useRef(null);
  const raf = useRef(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !value) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        const duration = 1600;
        const start = performance.now();
        const step = (now) => {
          const t = Math.min((now - start) / duration, 1);
          setCount(Math.round((1 - Math.pow(1 - t, 3)) * value));
          if (t < 1) raf.current = requestAnimationFrame(step);
        };
        raf.current = requestAnimationFrame(step);
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(raf.current); };
  }, [value]);

  return (
    <div ref={ref} className="lp-stat">
      <span className="lp-stat__num">{count.toLocaleString()}</span>
      <span className="lp-stat__label">{label}</span>
    </div>
  );
}

/* ─── Mock-UI visuals ────────────────────────────────────────────── */
function DetectionVisual() {
  return (
    <div className="lp-visual">
      <div className="lp-visual__titlebar">
        <span className="lp-visual__dot lp-visual__dot--ok" />
        <span className="lp-visual__dot lp-visual__dot--warn" />
        <span className="lp-visual__dot" />
        <span className="lp-visual__file">viewport · YOLOv8 · 23 ms</span>
      </div>
      <div className="lp-visual__cam">
        <div className="lp-visual__grid-overlay" />
        <div className="lp-visual__bbox lp-visual__bbox--hi"
          style={{ top: "12%", left: "14%", width: "44%", height: "32%" }}>
          <span className="lp-visual__tag">hood · 94%</span>
        </div>
        <div className="lp-visual__bbox"
          style={{ top: "58%", left: "8%", width: "30%", height: "26%" }}>
          <span className="lp-visual__tag">front_bumper · 87%</span>
        </div>
        <div className="lp-visual__bbox"
          style={{ top: "58%", left: "62%", width: "30%", height: "26%" }}>
          <span className="lp-visual__tag">back_bumper · 81%</span>
        </div>
      </div>
      <div className="lp-visual__footer">
        <span className="lp-visual__chip lp-visual__chip--ok">3 parts detected</span>
        <span className="lp-visual__chip">session #14</span>
      </div>
    </div>
  );
}

function MaskVisual() {
  return (
    <div className="lp-visual">
      <div className="lp-visual__titlebar">
        <span className="lp-visual__dot" />
        <span className="lp-visual__dot lp-visual__dot--warn" />
        <span className="lp-visual__dot lp-visual__dot--ok" />
        <span className="lp-visual__file">mask editor · hood · rev 3</span>
      </div>
      <div className="lp-visual__mask-area">
        {[90, 82, 95, 88, 76, 91, 84, 79].map((w, i) => (
          <div key={i} className="lp-visual__mask-row" style={{ width: `${w}%` }} />
        ))}
        <div className="lp-visual__mask-cursor" />
      </div>
      <div className="lp-visual__footer">
        <span className="lp-visual__chip lp-visual__chip--ok">✓ Revision approved</span>
        <span className="lp-visual__chip">author: op-42</span>
      </div>
    </div>
  );
}

function PaintVisual() {
  return (
    <div className="lp-visual">
      <div className="lp-visual__titlebar">
        <span className="lp-visual__dot lp-visual__dot--paint" />
        <span className="lp-visual__dot" />
        <span className="lp-visual__dot" />
        <span className="lp-visual__file">paint job #18 · running</span>
      </div>
      <div className="lp-visual__paint-body">
        <div className="lp-visual__progress-track">
          <div className="lp-visual__progress-fill" style={{ width: "68%" }} />
        </div>
        <span className="lp-visual__pct">68%</span>
        <ul className="lp-visual__log">
          <li><span className="lp-visual__ok">✓</span> Session open</li>
          <li><span className="lp-visual__ok">✓</span> Detection locked · hood</li>
          <li><span className="lp-visual__ok">✓</span> Mask revision #3 approved</li>
          <li className="lp-visual__active-line">⟳ Spraying hood…</li>
        </ul>
      </div>
    </div>
  );
}

function SimVisual() {
  return (
    <div className="lp-visual">
      <div className="lp-visual__titlebar">
        <span className="lp-visual__dot lp-visual__dot--ok" />
        <span className="lp-visual__dot" />
        <span className="lp-visual__dot" />
        <span className="lp-visual__file">workcell-1 · viewport · live</span>
      </div>
      <div className="lp-visual__cam lp-visual__cam--sim">
        <div className="lp-visual__scanlines" />
        <div className="lp-visual__sim-hud">
          <span className="lp-visual__chip lp-visual__chip--ok">● Live</span>
          <span className="lp-visual__chip">Δt 0.08 s</span>
          <span className="lp-visual__chip">12 fps</span>
        </div>
        <div className="lp-visual__sim-grid" />
      </div>
      <div className="lp-visual__footer">
        <span className="lp-visual__chip">Runtime running</span>
        <span className="lp-visual__chip lp-visual__chip--ok">Webots · Play</span>
      </div>
    </div>
  );
}

/* ─── Feature row ────────────────────────────────────────────────── */
const FEATURES = [
  {
    num: "01", title: "AI-powered detection",
    body: "YOLOv8 identifies parts in real time from the Webots viewport. Confidence scores and segmentation masks are generated per frame and stored with full provenance.",
    visual: <DetectionVisual />,
  },
  {
    num: "02", title: "Mask approval workflow",
    body: "Operators review every YOLO-generated mask on the original capture frame. Edit with brush tools, upload the revised PNG, and lock the revision before any paint command is issued.",
    visual: <MaskVisual />, rev: true,
  },
  {
    num: "03", title: "Autonomous paint dispatch",
    body: "Approved jobs are dispatched to the Webots controller with live WebSocket progress. Cancel at any point. Every run — status, timing, error — is logged for audit.",
    visual: <PaintVisual />,
  },
  {
    num: "04", title: "Live simulation stream",
    body: "Stream the workcell camera at ~12 FPS directly in the browser. Start and stop the runtime without touching the Webots GUI. RGB age indicator tells you if the feed is fresh.",
    visual: <SimVisual />, rev: true,
  },
];

function FeatureRow({ num, title, body, visual, rev }) {
  const [ref, visible] = useInView(0.1);
  return (
    <div
      ref={ref}
      className={`lp-feat ${rev ? "lp-feat--rev" : ""} ${visible ? "lp-feat--in" : ""}`}
    >
      <div className="lp-feat__text">
        <span className="lp-feat__num">{num}</span>
        <h3 className="lp-feat__title">{title}</h3>
        <p className="lp-feat__body">{body}</p>
      </div>
      <div className="lp-feat__visual">{visual}</div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export function Landing() {
  const { isAuthenticated } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => { fetchPublicStats().then(setStats).catch(() => {}); }, []);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="lp">

      {/* ── nav ── */}
      <nav className="lp__nav">
        <div className="lp__nav-brand">
          <Logo size={28} />
          <span className="lp__nav-name">NoeModule</span>
        </div>
        <div className="lp__nav-links">
          <Link to="/login" className="btn btn--ghost btn--sm">Sign in</Link>
          <Link to="/register" className="btn btn--sm">Get started</Link>
        </div>
      </nav>

      {/* ── hero ── */}
      <section className="lp__hero">
        <Reveal className="lp__eyebrow" delay={0}>Robotic workcell control</Reveal>
        <Reveal delay={120}>
          <h1 className="lp__headline">
            Precision painting,<br />
            <em>every shift.</em>
          </h1>
        </Reveal>
        <Reveal delay={260}>
          <p className="lp__subline">
            End-to-end operator workbench for YOLO-assisted part detection,
            mask approval, and autonomous paint dispatch — all in one auditable flow.
          </p>
        </Reveal>
        <Reveal delay={380} className="lp__cta">
          <Link to="/register" className="btn lp__cta-primary">Get started free</Link>
          <Link to="/login" className="btn btn--ghost">Sign in →</Link>
        </Reveal>

        <div className="lp__scroll-hint" aria-hidden>
          <span className="lp__scroll-line" />
          <span className="lp__scroll-label">Scroll</span>
        </div>
      </section>

      {/* ── stats ── */}
      {stats && (
        <div className="lp__stats">
          <StatItem label="Sessions run" value={stats.sessions} />
          <StatItem label="Paint jobs" value={stats.paint_jobs} />
          <StatItem label="Mask revisions" value={stats.mask_revisions} />
          <StatItem label="Detections" value={stats.detections} />
        </div>
      )}

      {/* ── divider ── */}
      <div className="lp__section-intro">
        <Reveal>
          <p className="lp__section-eyebrow">How it works</p>
          <h2 className="lp__section-title">Four steps. Zero guesswork.</h2>
        </Reveal>
      </div>

      {/* ── features ── */}
      <section className="lp__features">
        {FEATURES.map(f => <FeatureRow key={f.num} {...f} />)}
      </section>

      {/* ── final cta ── */}
      <section className="lp__final">
        <Reveal>
          <p className="lp__eyebrow">Start today</p>
          <h2 className="lp__final-title">Ready for your first shift?</h2>
          <Link to="/register" className="btn lp__cta-primary">
            Create operator account →
          </Link>
        </Reveal>
      </section>

      <footer className="lp__footer">
        <p>NoeModule · Workcell Control · © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
