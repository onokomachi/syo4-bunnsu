/**
 * 海皇神（かいおうしん）テーマ専用の背景：海底神殿で三叉の槍をかまえる海皇神の動画を敷き、
 * その上に canvas で「深海の神域」の演出を重ねる。theme === 'tenkuu' のときだけ描画する。
 * （内部IDは保存データとの互換のため 'tenkuu' のまま）
 *
 * 重ねる演出（約30fps）:
 * - 光の柱: 海面から差しこむ光のカーテンが、ゆっくり左右にゆれる。
 * - 泡: 底から ゆらゆら立ちのぼる泡。ふちと ハイライトを描いて、水の中らしく見せる。
 * - マリンスノー: 青白い小さな粒が ただよい、またたく。
 * - 金の光: 王冠と三叉の槍の金色に合わせた、金の光の粒が ときどき 立ちのぼる。
 * - 水中の雷: 数秒に1度、画面のはしに 水色の細い稲妻がうっすら走る（点滅にならないよう淡く・間をあける）。
 * 文字が読めるよう、動画の上に深い青のベールと四隅のしぼりをかける。
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { ThemeVideo } from './ThemeVideo';

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  wob: number;
  wobSpeed: number;
  gold: boolean; // 金の光の粒（泡ではなく光る粒として描く）
}

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  tw: number;
}

interface Arc {
  pts: { x: number; y: number }[];
  age: number;
  life: number;
}

/** 始点から終点へ、ランダムに折れ曲がる稲妻の経路（中点変位法）。 */
function arcPath(x0: number, y0: number, x1: number, y1: number, depth: number): { x: number; y: number }[] {
  if (depth <= 0) return [{ x: x0, y: y0 }, { x: x1, y: y1 }];
  const len = Math.hypot(x1 - x0, y1 - y0);
  const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * len * 0.35;
  const my = (y0 + y1) / 2 + (Math.random() - 0.5) * len * 0.35;
  return [...arcPath(x0, y0, mx, my, depth - 1), ...arcPath(mx, my, x1, y1, depth - 1).slice(1)];
}

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
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let W = 0;
    let H = 0;
    let bubbles: Bubble[] = [];
    let motes: Mote[] = [];
    let arcs: Arc[] = [];
    let nextArc = 2500;

    const spawnBubble = (anywhere: boolean): Bubble => {
      const gold = Math.random() < 0.12;
      return {
        x: Math.random() * W,
        y: anywhere ? Math.random() * H : H + 10 + Math.random() * 40,
        r: gold ? 1.2 + Math.random() * 1.8 : 1.5 + Math.random() * 6,
        vy: gold ? 0.35 + Math.random() * 0.5 : 0.5 + Math.random() * 1.3,
        wob: Math.random() * Math.PI * 2,
        wobSpeed: 0.03 + Math.random() * 0.04,
        gold,
      };
    };
    const spawnMote = (): Mote => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.5 + Math.random() * 1.3,
      vx: (Math.random() - 0.5) * 0.15,
      vy: 0.05 + Math.random() * 0.15,
      tw: Math.random() * Math.PI * 2,
    });

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      bubbles = Array.from({ length: Math.min(70, Math.floor((W * H) / 22000)) }, () => spawnBubble(true));
      motes = Array.from({ length: Math.min(110, Math.floor((W * H) / 12000)) }, spawnMote);
    };
    resize();
    window.addEventListener('resize', resize);

    const makeArc = (): Arc => {
      // 画面の左右どちらかのはし（文字の多い中央をさける）に、斜めに走る
      const left = Math.random() < 0.5;
      const x0 = left ? Math.random() * W * 0.18 : W - Math.random() * W * 0.18;
      const y0 = Math.random() * H * 0.5;
      const x1 = x0 + (left ? 1 : -1) * (40 + Math.random() * W * 0.12);
      const y1 = y0 + H * (0.2 + Math.random() * 0.3);
      return { pts: arcPath(x0, y0, x1, y1, 5), age: 0, life: 520 };
    };

    let last = 0;
    const interval = 33; // ~30fps

    const draw = (t: number) => {
      rafRef.current = requestAnimationFrame(draw);
      const dt = t - last;
      if (dt < interval) return;
      last = t;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // 光の柱（海面から差しこむカーテン）
      for (let i = 0; i < 5; i++) {
        const sway = reduced ? 0 : Math.sin(t / 3200 + i * 1.7) * W * 0.05;
        const x = W * (0.12 + i * 0.19) + sway;
        const w = W * (0.05 + 0.03 * Math.sin(i * 2.3 + 1));
        const tilt = W * 0.12;
        const g = ctx.createLinearGradient(0, 0, 0, H * 0.85);
        const a = 0.07 + 0.035 * Math.sin(t / 2100 + i);
        g.addColorStop(0, `rgba(200, 245, 255, ${a})`);
        g.addColorStop(1, 'rgba(120, 210, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, 0);
        ctx.lineTo(x + w * 0.5, 0);
        ctx.lineTo(x + w * 1.6 + tilt, H * 0.85);
        ctx.lineTo(x - w * 0.2 + tilt, H * 0.85);
        ctx.closePath();
        ctx.fill();
      }

      // マリンスノー
      for (const m of motes) {
        if (!reduced) {
          m.x += m.vx;
          m.y += m.vy;
          m.tw += 0.05;
        }
        if (m.y > H + 4) { m.y = -4; m.x = Math.random() * W; }
        if (m.x < -4) m.x = W + 4;
        if (m.x > W + 4) m.x = -4;
        ctx.fillStyle = `rgba(190, 240, 255, ${0.25 + 0.25 * Math.sin(m.tw)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 泡と金の光
      for (const b of bubbles) {
        if (!reduced) {
          b.wob += b.wobSpeed;
          b.y -= b.vy;
          b.x += Math.sin(b.wob) * 0.6;
        }
        if (b.y < -20) Object.assign(b, spawnBubble(false));
        if (b.gold) {
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 5);
          g.addColorStop(0, 'rgba(255, 240, 180, 0.8)');
          g.addColorStop(0.3, 'rgba(255, 200, 80, 0.35)');
          g.addColorStop(1, 'rgba(255, 180, 40, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(b.x - b.r * 5, b.y - b.r * 5, b.r * 10, b.r * 10);
          continue;
        }
        // 泡: うすい中身＋明るいふち＋左上のハイライト
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(160, 230, 255, 0.07)';
        ctx.strokeStyle = 'rgba(200, 245, 255, 0.5)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.6, b.r * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }

      // 水中の雷（淡く・数秒に1度）
      if (!reduced) {
        nextArc -= dt;
        if (nextArc <= 0) {
          arcs.push(makeArc());
          nextArc = 3500 + Math.random() * 3500;
        }
      }
      arcs = arcs.filter((a) => (a.age += dt) < a.life);
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
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [theme]);

  if (theme !== 'tenkuu') return null;

  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#010b18]">
      <ThemeVideo
        src="/videos/theme/kaiou.mp4"
        poster="/videos/theme/kaiou.jpg"
        className="absolute inset-0 w-full h-full"
        style={{ filter: 'saturate(1.1)' }}
      />
      {/* 文字が読めるよう、深い青のベールと四隅のしぼり */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(1,11,24,0.35) 0%, rgba(1,11,24,0.55) 55%, rgba(1,8,18,0.8) 100%), radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,4,12,0.6) 100%)',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0" style={{ willChange: 'transform', transform: 'translateZ(0)' }} />
    </div>
  );
};
