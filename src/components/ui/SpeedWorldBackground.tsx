/**
 * スピードワールド2テーマ専用の背景：ネオンの未来都市をバイクで駆けぬける動画を敷き、
 * その上に canvas で「スピード感」の演出を重ねる。theme === 'inferno' のときだけ描画する。
 * （内部IDは保存データとの互換のため 'inferno' のまま）
 *
 * 重ねる演出（いずれも加算合成・約30fps）:
 * - ワープの光線: 消失点（画面中央やや上）から外へ、水色とピンクの光の筋が加速しながら伸びる。
 * - 光の粒: 消失点から手前へ飛んでくる ぼけた光の玉。近づくほど大きく明るくなる。
 * - ネオンの床: 画面下に、消失点へ集まる透視グリッド。横線が手前へ流れつづける。
 * - ブーストの波紋: 数秒ごとに消失点から やわらかい光の輪が広がる（点滅にならないよう淡く・ゆっくり）。
 * 文字が読めるよう、動画の上に暗いベールと四隅のしぼりをかける。
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { ThemeVideo } from './ThemeVideo';

interface Streak {
  angle: number;
  dist: number;   // 消失点からの距離（0..1 を画面の対角半分に対して）
  speed: number;
  len: number;
  width: number;
  pink: boolean;
}

interface Orb {
  angle: number;
  dist: number;
  speed: number;
  size: number;
  pink: boolean;
}

const CYAN = '90, 230, 255';
const PINK = '255, 90, 200';

export const SpeedWorldBackground: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (theme !== 'inferno') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let streaks: Streak[] = [];
    let orbs: Orb[] = [];
    let W = 0;
    let H = 0;

    const spawnStreak = (anywhere: boolean): Streak => ({
      angle: Math.random() * Math.PI * 2,
      dist: anywhere ? Math.random() : 0.02 + Math.random() * 0.08,
      speed: 0.004 + Math.random() * 0.008,
      len: 0.04 + Math.random() * 0.12,
      width: 0.6 + Math.random() * 1.6,
      pink: Math.random() < 0.3,
    });
    const spawnOrb = (anywhere: boolean): Orb => ({
      angle: Math.random() * Math.PI * 2,
      dist: anywhere ? Math.random() * 0.8 : 0.03 + Math.random() * 0.05,
      speed: 0.002 + Math.random() * 0.004,
      size: 1 + Math.random() * 2.5,
      pink: Math.random() < 0.35,
    });

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      const n = Math.min(90, Math.floor((W * H) / 14000));
      streaks = Array.from({ length: n }, () => spawnStreak(true));
      orbs = Array.from({ length: Math.floor(n / 3) }, () => spawnOrb(true));
    };
    resize();
    window.addEventListener('resize', resize);

    let last = 0;
    const interval = 33; // ~30fps
    let gridPhase = 0;

    const draw = (t: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (t - last < interval) return;
      last = t;
      ctx.clearRect(0, 0, W, H);

      const cx = W * 0.5;
      const cy = H * 0.42;
      const R = Math.hypot(W, H) * 0.55;
      ctx.globalCompositeOperation = 'lighter';

      // ネオンの床（透視グリッド）
      const floorTop = H * 0.62;
      const floor = ctx.createLinearGradient(0, floorTop, 0, H);
      floor.addColorStop(0, `rgba(${CYAN}, 0)`);
      floor.addColorStop(1, `rgba(${CYAN}, 0.22)`);
      ctx.strokeStyle = floor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -12; i <= 12; i++) {
        const xb = cx + i * (W / 9);
        const xt = cx + (xb - cx) * ((floorTop - cy) / (H - cy));
        ctx.moveTo(xt, floorTop);
        ctx.lineTo(xb, H);
      }
      if (!reduced) gridPhase = (gridPhase + 0.018) % 1;
      for (let k = 0; k < 10; k++) {
        // 0..1 を2乗して、手前ほど間隔が広い（透視）横線にする
        const u = (k + gridPhase) / 10;
        const y = floorTop + (H - floorTop) * u * u;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();

      // ブーストの波紋（6秒ごと・2.4秒かけて広がる）
      const wave = (t % 6000) / 2400;
      if (wave < 1) {
        const r = R * (0.05 + wave * 0.95);
        ctx.lineWidth = 2 + wave * 10;
        ctx.strokeStyle = `rgba(${wave < 0.5 ? CYAN : PINK}, ${0.16 * (1 - wave)})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ワープの光線
      for (const s of streaks) {
        if (!reduced) {
          s.speed *= 1.035; // 外へ行くほど加速して見える
          s.dist += s.speed;
        }
        if (s.dist > 1.1) Object.assign(s, spawnStreak(false));
        const r0 = s.dist * R;
        const r1 = (s.dist + s.len * (0.4 + s.dist)) * R;
        const cos = Math.cos(s.angle);
        const sin = Math.sin(s.angle) * 0.75;
        const x0 = cx + cos * r0, y0 = cy + sin * r0;
        const x1 = cx + cos * r1, y1 = cy + sin * r1;
        const a = Math.min(1, s.dist * 1.6) * 0.55;
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, `rgba(${s.pink ? PINK : CYAN}, 0)`);
        g.addColorStop(1, `rgba(${s.pink ? PINK : CYAN}, ${a})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = s.width * (0.5 + s.dist * 1.5);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // 手前へ飛んでくる光の粒
      for (const o of orbs) {
        if (!reduced) {
          o.speed *= 1.03;
          o.dist += o.speed;
        }
        if (o.dist > 1.05) Object.assign(o, spawnOrb(false));
        const r = o.dist * R;
        const x = cx + Math.cos(o.angle) * r;
        const y = cy + Math.sin(o.angle) * r * 0.75;
        const size = o.size * (0.6 + o.dist * 6);
        const g = ctx.createRadialGradient(x, y, 0, x, y, size);
        g.addColorStop(0, `rgba(255, 255, 255, ${0.5 * Math.min(1, o.dist * 2)})`);
        g.addColorStop(0.3, `rgba(${o.pink ? PINK : CYAN}, ${0.35 * Math.min(1, o.dist * 2)})`);
        g.addColorStop(1, `rgba(${o.pink ? PINK : CYAN}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - size, y - size, size * 2, size * 2);
      }

      // 消失点のコア（地平の光）
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22);
      core.addColorStop(0, `rgba(${CYAN}, ${0.16 + 0.05 * Math.sin(t / 700)})`);
      core.addColorStop(1, `rgba(${CYAN}, 0)`);
      ctx.fillStyle = core;
      ctx.fillRect(cx - R * 0.22, cy - R * 0.22, R * 0.44, R * 0.44);

      ctx.globalCompositeOperation = 'source-over';
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [theme]);

  if (theme !== 'inferno') return null;

  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#03060f]">
      <ThemeVideo
        src="/videos/theme/speed.mp4"
        poster="/videos/theme/speed.jpg"
        className="absolute inset-0 w-full h-full"
        style={{ filter: 'saturate(1.2) contrast(1.05)' }}
      />
      {/* 文字が読めるよう、暗いベールと四隅のしぼり */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 42%, rgba(3,6,15,0.25) 0%, rgba(3,6,15,0.55) 60%, rgba(3,6,15,0.85) 100%)',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0" style={{ willChange: 'transform', transform: 'translateZ(0)' }} />
      {/* 走査線と、左右のネオンのにじみ（水色とピンク） */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 3px)',
          boxShadow: `inset 60px 0 90px -40px rgba(${CYAN},0.35), inset -60px 0 90px -40px rgba(${PINK},0.3)`,
        }}
      />
    </div>
  );
};
