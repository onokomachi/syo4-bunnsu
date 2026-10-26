/**
 * テーマ背景の動画（海皇神・スピードワールド2）。
 * - 音なし・インライン再生・ループ。動画はエンコードの時点で「終わりを始まりへ溶かしこむ」
 *   クロスフェードをかけてあるので、ループの継ぎ目で絵が飛ばない。
 * - タブが裏にあるあいだは止める（電池と処理の節約）。
 * - 「視差効果を減らす」設定（prefers-reduced-motion）では動画を読まず、静止画（poster）だけ出す。
 * - 読みこむまでは poster を出しておく。
 */
import React, { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  poster: string;
  className?: string;
  style?: React.CSSProperties;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export const ThemeVideo: React.FC<Props> = ({ src, poster, className, style }) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [still] = useState(prefersReducedMotion);

  useEffect(() => {
    const v = ref.current;
    if (!v || still) return;
    // iOS Safari は属性だけだとミュート扱いにならないことがあるので、プロパティでも確実に消音する
    v.muted = true;
    const tryPlay = () => { v.play().catch(() => {}); };
    const onVis = () => (document.hidden ? v.pause() : tryPlay());
    tryPlay();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [still]);

  if (still) {
    return <img src={poster} alt="" aria-hidden className={className} style={{ objectFit: 'cover', ...style }} />;
  }
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden
      disablePictureInPicture
      className={className}
      style={{ objectFit: 'cover', ...style }}
    />
  );
};
