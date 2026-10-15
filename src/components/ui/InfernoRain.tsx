/**
 * インフェルノテーマ専用の背景：画面の底から本物の炎のような「炎の舌」が
 * 何本も ゆらめきながら 立ちのぼり、溶岩だまりが脈動し、火の粉が舞い上がる。
 * theme === 'inferno' のときだけ描画する。
 *
 * 炎の輪郭は sin波だけだと周期的で「作り物」に見えるため、fBm（複数オクターブの
 * 値ノイズを重ねた乱流ノイズ）で左右の縁を非周期的にゆらす。さらに炎の舌だけを
 * 半解像度のオフスクリーンキャンバスに描いてぼかし、加算合成で下敷きにする
 * （ダウンサンプル→ぼかし→拡大、というリアルタイムブルームの定石）ことで、
 * 自己発光しているような にじみ（グロー）を足している。
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

interface Ember {
  x: number;
  y: number;
  r: number;       // 火の粉の大きさ
  vy: number;      // 上昇速度
  sway: number;
  swaySpeed: number;
  life: number;    // 0..1（上へ行くほど消える）
  decay: number;
  heat: number;    // 0=深紅 1=白熱
}

interface FlameTongue {
  baseX: number;        // 根もとのx座標
  width: number;        // 根もとの幅
  heightBase: number;   // 平均の高さ
  heightAmp: number;    // 高さのゆらぎ幅
  swayAmp: number;      // 先端の左右ゆれ幅
  swaySpeed: number;
  swayPhase: number;
  flickerSpeed: number; // 高さの ちらつき速さ
  flickerPhase: number;
  noiseSeedL: number;   // 左の縁の乱流ノイズの種（左右で別の種にして非対称にゆらす）
  noiseSeedR: number;   // 右の縁の乱流ノイズの種
  turbSpeed: number;    // 乱流ノイズが時間とともに動く速さ
}

/* ---------------- 乱流ノイズ（値ノイズのfBm） ----------------
 * ライブラリを増やさず、ハッシュ関数＋平滑補間の値ノイズを自前実装。
 * 周波数を倍々にしながら振幅を落として4オクターブ重ねる（fractional Brownian motion）
 * ことで、sin波1〜2本にはない「非周期的・自己相似的」なゆらぎが得られる。 */
const noiseHash = (n: number): number => {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
};
const valueNoise = (x: number): number => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f); // smoothstep
  return noiseHash(i) * (1 - u) + noiseHash(i + 1) * u; // 0..1
};
const fbm = (x: number): number => {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += amp * (valueNoise(x * freq) * 2 - 1); // -1..1
    norm += amp;
    freq *= 2;
    amp *= 0.55;
  }
  return sum / norm; // およそ -1..1
};

/** 折れ線を中点通過の二次曲線でつないで滑らかにする（Canvas定番のスムージング手法） */
const smoothLineTo = (ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
};

const EDGE_STEPS = 6; // 根もと〜先端を何分割してノイズをのせるか

export const InfernoRain: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (theme !== 'inferno') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ブルーム用オフスクリーン（半解像度）。炎の舌だけを描いてぼかし、加算合成で下敷きにする。
    const BLOOM_SCALE = 0.5;
    const bloomCanvas = document.createElement('canvas');
    const bloomCtx = bloomCanvas.getContext('2d');

    let embers: Ember[] = [];
    let backTongues: FlameTongue[] = [];
    let midTongues: FlameTongue[] = [];
    let frontTongues: FlameTongue[] = [];

    const spawnEmber = (): Ember => ({
      x: Math.random() * canvas.width,
      y: canvas.height + 10 + Math.random() * 60,
      r: 1 + Math.random() * 2.8,
      vy: 0.8 + Math.random() * 2.4,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.02 + Math.random() * 0.05,
      life: 1,
      decay: 0.0015 + Math.random() * 0.004,
      heat: Math.random(),
    });

    const makeTongues = (count: number, widthScale: number, heightScale: number): FlameTongue[] =>
      Array.from({ length: count }, (_, i) => {
        const baseX = ((i + 0.5) / count) * canvas.width + (Math.random() - 0.5) * 30;
        return {
          baseX,
          width: (canvas.width / count) * widthScale * (0.8 + Math.random() * 0.5),
          heightBase: canvas.height * (0.22 + Math.random() * 0.14) * heightScale,
          heightAmp: canvas.height * 0.06 * heightScale,
          swayAmp: 14 + Math.random() * 22,
          swaySpeed: 0.0012 + Math.random() * 0.0018,
          swayPhase: Math.random() * Math.PI * 2,
          flickerSpeed: 0.003 + Math.random() * 0.004,
          flickerPhase: Math.random() * Math.PI * 2,
          noiseSeedL: Math.random() * 1000,
          noiseSeedR: Math.random() * 1000 + 500,
          turbSpeed: 0.0009 + Math.random() * 0.0007,
        };
      });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      bloomCanvas.width = Math.max(1, Math.round(canvas.width * BLOOM_SCALE));
      bloomCanvas.height = Math.max(1, Math.round(canvas.height * BLOOM_SCALE));
      const emberCount = Math.min(240, Math.floor((canvas.width * canvas.height) / 6000));
      embers = Array.from({ length: emberCount }, () => {
        const e = spawnEmber();
        e.y = Math.random() * canvas.height;
        e.life = Math.random();
        return e;
      });
      // 奥(背が高くて淡い)・中・手前(背が低くて濃い)の3層でゆらめく炎の舌を重ねる
      backTongues = makeTongues(Math.max(6, Math.floor(canvas.width / 130)), 1.6, 1.25);
      midTongues = makeTongues(Math.max(8, Math.floor(canvas.width / 100)), 1.3, 1.0);
      frontTongues = makeTongues(Math.max(10, Math.floor(canvas.width / 80)), 1.1, 0.72);
    };
    resize();
    window.addEventListener('resize', resize);

    let last = 0;
    const interval = 33; // ~30fps

    /** 1本の炎の舌を、左右の縁をfBmノイズで独立にゆらした しずく形で描く。 */
    const drawTongue = (
      targetCtx: CanvasRenderingContext2D,
      tg: FlameTongue,
      t: number,
      alpha: number,
      colorCore: string,
      colorMid: string,
      colorTip: string,
    ) => {
      const flicker = 0.75 + 0.25 * Math.sin(t * tg.flickerSpeed + tg.flickerPhase) + 0.15 * Math.sin(t * tg.flickerSpeed * 2.3 + tg.flickerPhase);
      const height = Math.max(10, tg.heightBase + tg.heightAmp * Math.sin(t * tg.flickerSpeed * 0.6 + tg.flickerPhase)) * flicker;
      const lean = Math.sin(t * tg.swaySpeed + tg.swayPhase) * tg.swayAmp;
      const baseY = canvas.height + 6;
      const hw = tg.width / 2;
      const x = tg.baseX;
      const noiseT = t * tg.turbSpeed;

      const leftPts: { x: number; y: number }[] = [];
      const rightPts: { x: number; y: number }[] = [];
      for (let i = 0; i <= EDGE_STEPS; i++) {
        const s = i / EDGE_STEPS; // 0=根もと 1=先端
        const py = baseY - height * s;
        const taper = Math.pow(1 - s, 0.85); // 先端に向かって細くなる（元のベジェ形状に近い減衰）
        const windLean = lean * s; // 根もとは動かず先端ほど風で流れる
        const turbAmp = hw * 0.5 * s; // 乱流も根もとでは0、先端ほど大きく暴れる
        const nL = fbm(tg.noiseSeedL + s * 2.4 + noiseT);
        const nR = fbm(tg.noiseSeedR + s * 2.4 + noiseT);
        leftPts.push({ x: x - hw * taper + windLean + nL * turbAmp, y: py });
        rightPts.push({ x: x + hw * taper + windLean + nR * turbAmp, y: py });
      }

      targetCtx.beginPath();
      targetCtx.moveTo(leftPts[0].x, leftPts[0].y);
      smoothLineTo(targetCtx, leftPts.slice(1));
      smoothLineTo(targetCtx, [...rightPts].reverse());
      targetCtx.closePath();

      const g = targetCtx.createLinearGradient(x, baseY, x + lean * 0.3, baseY - height);
      g.addColorStop(0, colorCore.replace('ALPHA', String(alpha)));
      g.addColorStop(0.45, colorMid.replace('ALPHA', String(alpha * 0.85)));
      g.addColorStop(0.8, colorTip.replace('ALPHA', String(alpha * 0.5)));
      g.addColorStop(1, colorTip.replace('ALPHA', '0'));
      targetCtx.fillStyle = g;
      targetCtx.fill();
    };

    const drawAllTongues = (targetCtx: CanvasRenderingContext2D, t: number) => {
      for (const tg of backTongues) {
        drawTongue(targetCtx, tg, t, 0.28, 'rgba(200, 30, 0, ALPHA)', 'rgba(255, 90, 0, ALPHA)', 'rgba(255, 180, 60, ALPHA)');
      }
      for (const tg of midTongues) {
        drawTongue(targetCtx, tg, t, 0.42, 'rgba(230, 40, 0, ALPHA)', 'rgba(255, 110, 10, ALPHA)', 'rgba(255, 200, 80, ALPHA)');
      }
      for (const tg of frontTongues) {
        drawTongue(targetCtx, tg, t, 0.62, 'rgba(255, 60, 0, ALPHA)', 'rgba(255, 150, 20, ALPHA)', 'rgba(255, 230, 140, ALPHA)');
      }
    };

    // ブルームは毎フレーム更新しなくても違和感がない（じんわりした光なので）ため、
    // 1フレームおきの更新にしてコストを半分にする。
    let bloomTick = false;

    const draw = (t: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (t - last < interval) return;
      last = t;

      // 闇
      ctx.fillStyle = '#0a0100';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 底に脈動する溶岩だまりの光（横いっぱいに広がる暖色グロー）
      const pulse = 0.16 + Math.sin(t * 0.0012) * 0.06 + Math.sin(t * 0.0021) * 0.03;
      ctx.globalCompositeOperation = 'lighter';
      const lavaPool = ctx.createRadialGradient(
        canvas.width / 2, canvas.height + 40, canvas.width * 0.05,
        canvas.width / 2, canvas.height + 40, canvas.width * 0.75
      );
      lavaPool.addColorStop(0, `rgba(255, 140, 30, ${pulse})`);
      lavaPool.addColorStop(0.5, `rgba(255, 70, 0, ${pulse * 0.6})`);
      lavaPool.addColorStop(1, 'rgba(255, 40, 0, 0)');
      ctx.fillStyle = lavaPool;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ブルーム：炎の舌だけを半解像度のオフスクリーンに描き、ぼかして加算合成で下敷きにする
      if (bloomCtx) {
        bloomTick = !bloomTick;
        if (bloomTick) {
          bloomCtx.setTransform(BLOOM_SCALE, 0, 0, BLOOM_SCALE, 0, 0);
          bloomCtx.clearRect(0, 0, canvas.width, canvas.height);
          drawAllTongues(bloomCtx, t);
          bloomCtx.setTransform(1, 0, 0, 1, 0, 0);
        }
        ctx.save();
        ctx.filter = 'blur(10px)';
        ctx.globalAlpha = 0.7;
        ctx.drawImage(bloomCanvas, 0, 0, bloomCanvas.width, bloomCanvas.height, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // 炎の舌（奥→中→手前の順に重ねて奥行きを出す。くっきりした本体）
      drawAllTongues(ctx, t);

      // 根もとの白熱コア（いちばん熱い部分をひときわ明るく）
      const coreGlow = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - canvas.height * 0.18);
      coreGlow.addColorStop(0, `rgba(255, 210, 120, ${0.35 + pulse * 0.4})`);
      coreGlow.addColorStop(1, 'rgba(255, 210, 120, 0)');
      ctx.fillStyle = coreGlow;
      ctx.fillRect(0, canvas.height - canvas.height * 0.18, canvas.width, canvas.height * 0.18);

      // 火の粉（上昇して消える。熱いほど白く、冷めるほど赤く）
      for (const e of embers) {
        e.sway += e.swaySpeed;
        e.x += Math.sin(e.sway) * 0.8;
        e.y -= e.vy;
        e.life -= e.decay;
        if (e.life <= 0 || e.y < -10) Object.assign(e, spawnEmber());
        const a = Math.max(0, e.life) * 0.95;
        const g = Math.round(90 + e.heat * 140);
        const b = Math.round(e.heat * 90);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, ${g}, ${b}, ${a})`;
        ctx.fill();
        // 明るい火の粉には小さな光暈をつけて リッチに見せる
        if (e.heat > 0.6) {
          const halo = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 4);
          halo.addColorStop(0, `rgba(255, 220, 160, ${a * 0.35})`);
          halo.addColorStop(1, 'rgba(255, 220, 160, 0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r * 4, 0, Math.PI * 2);
          ctx.fill();
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

  if (theme !== 'inferno') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none z-0 opacity-90"
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
    />
  );
};
