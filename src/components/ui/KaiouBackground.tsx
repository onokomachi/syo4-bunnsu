/**
 * 海皇神（かいおうしん）テーマ専用の背景：海底神殿の海皇神の動画を「引きの画角」で見せ、
 * まわりを canvas の深い海の演出でうめる。theme === 'tenkuu' のときだけ描画する。
 * （内部IDは保存データとの互換のため 'tenkuu' のまま）
 *
 * 画角: 動画は画面の約8割の大きさにして、ふちを楕円のぼかしで海の水にとかす。
 *       動画のまわりは、動画のふちの色（上＝明るい青緑、下＝暗い群青）に合わせた水のグラデ。
 * 重ねる演出（約30fps）:
 * - 水面のゆらぎと、水面から差しこむ光の柱
 * - コースティクス（水面の光が海底にゆれる網目模様）。低解像度で計算して引きのばす
 * - 光るクラゲ（傘が脈打ち、触手がゆれる）
 * - 魚の群れ（ときどき横ぎる）
 * - 海藻（左右の下でゆれる）
 * - 泡の柱（底の数か所から立ちのぼる）／マリンスノー／金の光の粒
 * - 水中の雷（淡く、数秒に1度）
 * 「動きを減らす」設定では、1コマだけ描いて止める。
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { ThemeVideo } from './ThemeVideo';

/** 動画の高さが画面の高さに占める割合の上限（小さいほど引きの画角） */
const VIDEO_SCALE = 0.8;

interface Bubble {
  x: number; y: number; r: number; vy: number; wob: number; wobSpeed: number; gold: boolean;
  burst?: boolean; // 泡の柱の泡。上まで行ったら消える（ふつうの泡は下から出なおす）
}
interface Mote { x: number; y: number; r: number; vx: number; vy: number; tw: number }
interface Arc { pts: { x: number; y: number }[]; age: number; life: number }
interface Jelly { x: number; y: number; s: number; vy: number; ph: number; hue: number; tent: number }
interface FishSchool {
  x: number; y: number; dir: 1 | -1; speed: number; depth: number;
  fish: { ox: number; oy: number; ph: number; size: number }[];
}
interface Kelp { x: number; h: number; ph: number; w: number; blades: number }

/** 始点から終点へ、ランダムに折れ曲がる稲妻の経路（中点変位法）。 */
function arcPath(x0: number, y0: number, x1: number, y1: number, depth: number): { x: number; y: number }[] {
  if (depth <= 0) return [{ x: x0, y: y0 }, { x: x1, y: y1 }];
  const len = Math.hypot(x1 - x0, y1 - y0);
  const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * len * 0.35;
  const my = (y0 + y1) / 2 + (Math.random() - 0.5) * len * 0.35;
  return [...arcPath(x0, y0, mx, my, depth - 1), ...arcPath(mx, my, x1, y1, depth - 1).slice(1)];
}

const CAUSTIC_DIV = 8; // コースティクスは 1/8 解像度で計算して引きのばす

export const KaiouBackground: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (theme !== 'tenkuu') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let W = 0;
    let H = 0;
    let bubbles: Bubble[] = [];
    let motes: Mote[] = [];
    let arcs: Arc[] = [];
    let jellies: Jelly[] = [];
    let schools: FishSchool[] = [];
    let kelps: Kelp[] = [];
    let vents: number[] = [];
    let nextArc = 2500;
    let nextSchool = 3000;
    let nextBurst = 1500;

    // コースティクス用の小さい canvas
    const cau = document.createElement('canvas');
    const cauCtx = cau.getContext('2d');
    let cauImg: ImageData | null = null;
    let cauFrame = 0;

    const spawnBubble = (anywhere: boolean, x?: number): Bubble => {
      const gold = x === undefined && Math.random() < 0.1;
      return {
        x: x ?? Math.random() * W,
        y: anywhere ? Math.random() * H : H + 10 + Math.random() * 40,
        r: gold ? 1.2 + Math.random() * 1.8 : 1.5 + Math.random() * 6,
        vy: gold ? 0.35 + Math.random() * 0.5 : 0.5 + Math.random() * 1.3,
        wob: Math.random() * Math.PI * 2,
        wobSpeed: 0.03 + Math.random() * 0.04,
        gold,
      };
    };
    const spawnMote = (): Mote => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 0.5 + Math.random() * 1.3,
      vx: (Math.random() - 0.5) * 0.15, vy: 0.05 + Math.random() * 0.15,
      tw: Math.random() * Math.PI * 2,
    });
    const spawnJelly = (anywhere: boolean): Jelly => ({
      x: Math.random() * W,
      y: anywhere ? H * (0.15 + Math.random() * 0.7) : H + 60,
      s: 12 + Math.random() * 20,
      vy: 0.12 + Math.random() * 0.22,
      ph: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.6 ? 190 : 265, // 水色が多め、ときどき青むらさき
      tent: 5 + Math.floor(Math.random() * 3),
    });
    const spawnSchool = (): FishSchool => {
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const n = 10 + Math.floor(Math.random() * 12);
      const depth = 0.5 + Math.random() * 0.5; // 小さいほど遠い（小さく・うすく）
      return {
        x: dir === 1 ? -80 : W + 80,
        y: H * (0.2 + Math.random() * 0.55),
        dir,
        speed: (0.6 + Math.random() * 0.9) * (0.6 + depth * 0.6),
        depth,
        fish: Array.from({ length: n }, () => ({
          ox: (Math.random() - 0.5) * 120 * depth,
          oy: (Math.random() - 0.5) * 70 * depth,
          ph: Math.random() * Math.PI * 2,
          size: (5 + Math.random() * 4) * depth,
        })),
      };
    };

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      const scale = Math.min(1, (W * H) / (1280 * 800));
      bubbles = Array.from({ length: Math.min(60, Math.floor((W * H) / 24000)) }, () => spawnBubble(true));
      motes = Array.from({ length: Math.min(110, Math.floor((W * H) / 12000)) }, spawnMote);
      jellies = Array.from({ length: Math.max(3, Math.round(6 * scale)) }, () => spawnJelly(true));
      schools = [];
      vents = [0.1, 0.27, 0.74, 0.9].map((f) => W * f);
      const kb = [0.02, 0.06, 0.1, 0.88, 0.93, 0.98];
      kelps = kb.map((f, i) => ({
        x: W * f, h: H * (0.2 + (i % 3) * 0.07), ph: i * 1.3, w: 5 + (i % 3) * 2, blades: 3,
      }));
      cau.width = Math.ceil(W / CAUSTIC_DIV);
      cau.height = Math.ceil(H / CAUSTIC_DIV);
      cauImg = cauCtx ? cauCtx.createImageData(cau.width, cau.height) : null;
    };
    resize();
    window.addEventListener('resize', resize);

    const makeArc = (): Arc => {
      const left = Math.random() < 0.5;
      const x0 = left ? Math.random() * W * 0.18 : W - Math.random() * W * 0.18;
      const y0 = Math.random() * H * 0.5;
      const x1 = x0 + (left ? 1 : -1) * (40 + Math.random() * W * 0.12);
      const y1 = y0 + H * (0.2 + Math.random() * 0.3);
      return { pts: arcPath(x0, y0, x1, y1, 5), age: 0, life: 520 };
    };

    /* ---------- 描画部品 ---------- */

    /** 水面のゆらぎ（上のふち）。 */
    const drawSurface = (t: number) => {
      const base = H * 0.05;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, 0);
      for (let x = W; x >= 0; x -= 24) {
        ctx.lineTo(x, base + Math.sin(x * 0.011 + t / 900) * 6 + Math.sin(x * 0.027 - t / 650) * 3.5);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, base + 14);
      g.addColorStop(0, 'rgba(215, 250, 255, 0.34)');
      g.addColorStop(1, 'rgba(120, 220, 255, 0)');
      ctx.fillStyle = g;
      ctx.fill();
    };

    /** 水面から差しこむ光の柱。 */
    const drawRays = (t: number) => {
      for (let i = 0; i < 7; i++) {
        const sway = reduced ? 0 : Math.sin(t / 3200 + i * 1.7) * W * 0.04;
        const x = W * (0.04 + i * 0.15) + sway;
        const w = W * (0.035 + 0.025 * Math.sin(i * 2.3 + 1));
        const tilt = W * 0.1;
        const g = ctx.createLinearGradient(0, 0, 0, H * 0.9);
        const a = 0.085 + 0.04 * Math.sin(t / 2100 + i);
        g.addColorStop(0, `rgba(205, 247, 255, ${a})`);
        g.addColorStop(1, 'rgba(120, 210, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, 0);
        ctx.lineTo(x + w * 0.5, 0);
        ctx.lineTo(x + w * 1.8 + tilt, H * 0.9);
        ctx.lineTo(x - w * 0.3 + tilt, H * 0.9);
        ctx.closePath();
        ctx.fill();
      }
    };

    /** コースティクス：水面の光が作る、ゆれる網目模様。 */
    const drawCaustics = (t: number) => {
      if (!cauCtx || !cauImg) return;
      if (cauFrame++ % 2 === 0) {
        const { width: cw, height: ch, data } = cauImg;
        const tt = t / 1000;
        for (let y = 0; y < ch; y++) {
          const fy = y / ch;
          const fade = Math.max(0, 1 - fy * 0.9); // 上ほど強く、下へ消える
          for (let x = 0; x < cw; x++) {
            const u = (x / cw) * 9;
            const v = fy * 5.5;
            const s =
              Math.sin(u * 1.3 + tt * 0.9 + Math.sin(v * 1.7 + tt * 0.6)) +
              Math.sin(v * 2.1 - tt * 0.7 + Math.sin(u * 1.1 - tt * 0.5)) +
              Math.sin((u + v) * 1.4 + tt * 0.5);
            // 山のふち（|s| が 0 に近い所）を明るくすると、網目の線になる
            const ridge = Math.max(0, 1 - Math.abs(s) * 0.95);
            const a = ridge * ridge * ridge * fade;
            const i = (y * cw + x) * 4;
            data[i] = 190; data[i + 1] = 245; data[i + 2] = 255;
            data[i + 3] = Math.min(255, a * 150);
          }
        }
        cauCtx.putImageData(cauImg, 0, 0);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(cau, 0, 0, W, H);
      ctx.globalAlpha = 1;
    };

    /** 海藻（下の左右）。 */
    const drawKelp = (t: number) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const k of kelps) {
        for (let b = 0; b < k.blades; b++) {
          const bx = k.x + (b - 1) * k.w * 2.4;
          const hh = k.h * (0.75 + 0.25 * Math.sin(b * 2.1 + k.ph));
          const seg = 7;
          ctx.beginPath();
          for (let i = 0; i <= seg; i++) {
            const f = i / seg;
            const sway = reduced ? 0 : Math.sin(t / 1500 + k.ph + b * 0.9 + f * 2.2) * f * f * 26;
            const x = bx + sway;
            const y = H + 4 - f * hh;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = 'rgba(4, 52, 62, 0.82)';
          ctx.lineWidth = k.w;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(70, 200, 190, 0.22)';
          ctx.lineWidth = Math.max(1, k.w * 0.28);
          ctx.stroke();
        }
      }
    };

    /** 光るクラゲ。 */
    const drawJelly = (j: Jelly, t: number) => {
      const pulse = reduced ? 0 : Math.sin(t / 650 + j.ph);
      const s = j.s;
      ctx.save();
      ctx.translate(j.x + (reduced ? 0 : Math.sin(t / 2400 + j.ph) * 14), j.y);
      // 触手
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `hsla(${j.hue}, 100%, 78%, 0.3)`;
      for (let k = 0; k < j.tent; k++) {
        const x0 = (k / (j.tent - 1) - 0.5) * s * 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 7; i++) {
          const f = i / 7;
          const x = x0 + (reduced ? 0 : Math.sin(t / 520 + k + f * 3.2 + j.ph) * s * 0.16 * f);
          const y = s * 0.2 + f * s * (1.5 + 0.2 * pulse);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // 傘（半球）
      const rx = s * (1 + 0.1 * pulse);
      const ry = s * (0.78 - 0.1 * pulse);
      const g = ctx.createRadialGradient(0, -ry * 0.2, 0, 0, 0, rx * 1.3);
      g.addColorStop(0, `hsla(${j.hue}, 100%, 88%, 0.5)`);
      g.addColorStop(0.6, `hsla(${j.hue}, 100%, 70%, 0.2)`);
      g.addColorStop(1, `hsla(${j.hue}, 100%, 60%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, Math.PI, 0);
      ctx.quadraticCurveTo(0, ry * 0.5, -rx, 0);
      ctx.fill();
      ctx.strokeStyle = `hsla(${j.hue}, 100%, 85%, 0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, Math.PI, 0);
      ctx.stroke();
      // まわりのにじみ
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 3);
      halo.addColorStop(0, `hsla(${j.hue}, 100%, 70%, 0.12)`);
      halo.addColorStop(1, `hsla(${j.hue}, 100%, 60%, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(-s * 3, -s * 3, s * 6, s * 6);
      ctx.restore();
    };

    /** 魚の群れ（シルエット）。 */
    const drawSchool = (sc: FishSchool, t: number) => {
      for (const f of sc.fish) {
        const x = sc.x + f.ox + (reduced ? 0 : Math.sin(t / 700 + f.ph) * 7 * sc.depth);
        const y = sc.y + f.oy + (reduced ? 0 : Math.cos(t / 900 + f.ph * 1.3) * 5 * sc.depth);
        const wag = reduced ? 0 : Math.sin(t / 110 + f.ph) * 0.4;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(sc.dir, 1);
        ctx.fillStyle = `rgba(6, 40, 72, ${0.35 + sc.depth * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, f.size * 1.7, f.size * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath(); // 尾びれ
        ctx.moveTo(-f.size * 1.4, 0);
        ctx.lineTo(-f.size * 2.5, -f.size * (0.7 + wag));
        ctx.lineTo(-f.size * 2.5, f.size * (0.7 - wag));
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `rgba(190, 240, 255, ${0.18 * sc.depth})`; // 背のハイライト
        ctx.beginPath();
        ctx.ellipse(f.size * 0.2, -f.size * 0.3, f.size * 1.1, f.size * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    let last = 0;
    const interval = 33; // ~30fps

    const draw = (t: number) => {
      const dt = reduced ? 0 : t - last;
      if (!reduced) {
        rafRef.current = requestAnimationFrame(draw);
        if (dt < interval) return;
      }
      last = t;
      const tt = reduced ? 4200 : t; // 動きを減らす設定では、きれいな1コマで止める
      ctx.clearRect(0, 0, W, H);

      // 光の層（加算）
      ctx.globalCompositeOperation = 'lighter';
      drawRays(tt);
      drawCaustics(tt);
      drawSurface(tt);

      // マリンスノー
      for (const m of motes) {
        if (!reduced) {
          m.x += m.vx; m.y += m.vy; m.tw += 0.05;
          if (m.y > H + 4) { m.y = -4; m.x = Math.random() * W; }
          if (m.x < -4) m.x = W + 4;
          if (m.x > W + 4) m.x = -4;
        }
        ctx.fillStyle = `rgba(190, 240, 255, ${0.25 + 0.25 * Math.sin(m.tw)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // クラゲ
      for (const j of jellies) {
        if (!reduced) {
          j.y -= j.vy;
          if (j.y < -j.s * 3) Object.assign(j, spawnJelly(false), { x: Math.random() * W });
        }
        drawJelly(j, tt);
      }

      // 通常の描画へ（魚・海藻・泡は暗い色も使う）
      ctx.globalCompositeOperation = 'source-over';

      // 魚の群れ
      if (!reduced) {
        nextSchool -= dt;
        if (nextSchool <= 0 && schools.length < 3) {
          schools.push(spawnSchool());
          nextSchool = 7000 + Math.random() * 9000;
        }
        for (const sc of schools) sc.x += sc.dir * sc.speed;
        schools = schools.filter((sc) => sc.x > -260 && sc.x < W + 260);
      }
      for (const sc of schools) drawSchool(sc, tt);

      drawKelp(tt);

      // 泡の柱（底の数か所から、ときどきまとめて）
      if (!reduced) {
        nextBurst -= dt;
        if (nextBurst <= 0) {
          const vx = vents[Math.floor(Math.random() * vents.length)];
          for (let i = 0; i < 7; i++) {
            const b = spawnBubble(false, vx + (Math.random() - 0.5) * 16);
            b.y = H - Math.random() * 30;
            b.r = 1.5 + Math.random() * 4;
            b.vy = 0.8 + Math.random() * 1.2;
            b.burst = true;
            bubbles.push(b);
          }
          nextBurst = 900 + Math.random() * 2200;
        }
        if (bubbles.length > 140) bubbles.splice(0, bubbles.length - 140);
      }

      // 泡と金の光
      for (const b of bubbles) {
        if (!reduced) {
          b.wob += b.wobSpeed;
          b.y -= b.vy;
          b.x += Math.sin(b.wob) * 0.6;
        }
        if (b.y < -20) {
          if (b.burst) { b.y = -1e5; continue; }
          Object.assign(b, spawnBubble(false));
        }
        if (b.y < -1e4) continue;
        if (b.gold) {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 5);
          g.addColorStop(0, 'rgba(255, 240, 180, 0.8)');
          g.addColorStop(0.3, 'rgba(255, 200, 80, 0.35)');
          g.addColorStop(1, 'rgba(255, 180, 40, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(b.x - b.r * 5, b.y - b.r * 5, b.r * 10, b.r * 10);
          ctx.globalCompositeOperation = 'source-over';
          continue;
        }
        ctx.fillStyle = 'rgba(160, 230, 255, 0.07)';
        ctx.strokeStyle = 'rgba(200, 245, 255, 0.5)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.6, b.r * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
      bubbles = bubbles.filter((b) => b.y > -1e4);

      // 水中の雷（淡く・数秒に1度）
      if (!reduced) {
        nextArc -= dt;
        if (nextArc <= 0) {
          arcs.push(makeArc());
          nextArc = 3500 + Math.random() * 3500;
        }
      }
      arcs = arcs.filter((a) => (a.age += dt) < a.life);
      ctx.globalCompositeOperation = 'lighter';
      for (const a of arcs) {
        const k = 1 - a.age / a.life;
        ctx.lineJoin = 'round';
        for (const [w, alpha] of [[7, 0.08], [3, 0.2], [1.2, 0.55]] as const) {
          ctx.lineWidth = w;
          ctx.strokeStyle = `rgba(150, 235, 255, ${alpha * k})`;
          ctx.beginPath();
          a.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    if (reduced) draw(0); else rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [theme]);

  if (theme !== 'tenkuu') return null;

  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#010b18]">
      <style>{`
        @keyframes kaiou-drift { from { transform: translate3d(-0.6%, 0.5%, 0) scale(1.012); } to { transform: translate3d(0.6%, -0.5%, 0) scale(1); } }
        @media (prefers-reduced-motion: reduce) { .kaiou-drift { animation: none !important; } }
      `}</style>
      {/* 動画のまわりをうめる水のグラデーション（動画のふちの色に合わせてある） */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 38%, rgba(30,110,150,0.55) 0%, rgba(14,70,106,0.25) 55%, rgba(0,0,0,0) 100%), linear-gradient(180deg, #2a6f90 0%, #0f4666 22%, #0a3350 52%, #04192b 82%, #010b18 100%)',
        }}
      />
      {/* 引きの画角の動画：ふちを楕円のぼかしで海にとかす */}
      <div
        className="absolute"
        style={{
          left: '50%',
          top: '46%',
          width: `min(100vw, calc(100vh * 1.7778 * ${VIDEO_SCALE}))`,
          aspectRatio: '16 / 9',
          transform: 'translate(-50%, -50%)',
          WebkitMaskImage: 'radial-gradient(ellipse closest-side, #000 66%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse closest-side, #000 66%, transparent 100%)',
        }}
      >
        <div className="kaiou-drift absolute inset-0" style={{ animation: 'kaiou-drift 14s ease-in-out infinite alternate' }}>
          <ThemeVideo
            src="/videos/theme/kaiou.mp4"
            poster="/videos/theme/kaiou.jpg"
            className="absolute inset-0 w-full h-full"
            style={{ filter: 'saturate(1.12)' }}
          />
        </div>
      </div>
      {/* 文字が読めるよう、深い青のベールと四隅のしぼり */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(1,11,24,0.28) 0%, rgba(1,11,24,0.45) 55%, rgba(1,8,18,0.78) 100%), radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,4,12,0.55) 100%)',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0" style={{ willChange: 'transform', transform: 'translateZ(0)' }} />
    </div>
  );
};
