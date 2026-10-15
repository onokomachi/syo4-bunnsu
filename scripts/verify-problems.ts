/**
 * 問題データの機械チェック。`npm run verify`（`npm run check` にも入っている）。
 *
 * 全項目 × 1万問をつくり、次を確かめる:
 *   - 答えの形（分数の分母が0でない／選択肢に正解がある／重複がない／数直線・図の範囲／ならべる順が正しい）
 *   - 正解を入れたとき judge が ok になり、誤答診断（diagnose）が反応しない
 *   - 帯分数でも仮分数でもよい問題（any）は、帯分数・仮分数・整数のどの形を入れても ok
 *   - 問題文から答えを計算しなおして一致する（式・図の目もり・数直線・大小・ならべかえ）
 *   - レベル名と中身の一致（くり上がりのレベルは本当にくり上がる 等）
 *   - ヒントの1回目に答えを書いていない
 *   - 各項目が 20通り以上の「見た目のちがう問題」を出せる
 *   - 本番テストの配点（表100・裏50）と、実力の階段（全項目が極限か無限のどちらかに出る）
 */
import { generate, judge, MODULE_LEVELS, UNIT_LEVELS, type Prob, type Inp, type Ans, type Step } from '../src/lib/problems';
import { generateError, ERROR_TYPES, type ErrProb } from '../src/lib/errorHunter';
import { TEST_STEPS, OMOTE_MAX, URA_MAX } from '../src/lib/testConfig';
import { EXTRA_SKILLS, TRIAL, ENDLESS_FLOORS } from '../src/lib/trialConfig';
import { gcd, F, M, plain, parseRich } from '../src/lib/frac';

const N = Number(process.env.VERIFY_N ?? 10000);
const MIN_VARIETY = 20;

let failures = 0;
const seen = new Set<string>();
function fail(where: string, msg: string) {
  const key = `${where}: ${msg}`;
  if (seen.has(key)) return;
  seen.add(key);
  failures++;
  if (failures <= 60) console.error(`  ✗ ${key}`);
}

/** 正解の入力（any はいちばんふつうの形） */
function correctInput(a: Ans): Inp {
  switch (a.kind) {
    case 'num': return { v: a.v };
    case 'frac': return { n: a.n, d: a.d };
    case 'mixed': return { w: a.w, n: a.n, d: a.d };
    case 'any':
      if (a.n % a.d === 0) return { v: a.n / a.d };
      if (a.n < a.d) return { n: a.n, d: a.d };
      return { w: Math.floor(a.n / a.d), n: a.n % a.d, d: a.d };
    case 'order': return { seq: [...a.correct] };
    default: return { i: a.correct };
  }
}

type R = [number, number];
const norm = (n: number, d: number): R => { const g = gcd(n, d) || 1; return [n / g, d / g]; };
const rAdd = (a: R, b: R): R => norm(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const rSub = (a: R, b: R): R => norm(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const rEq = (a: R, b: R) => a[0] * b[1] === b[0] * a[1];
const cmpR = (a: R, b: R) => Math.sign(a[0] * b[1] - b[0] * a[1]);

function checkAns(where: string, p: Prob, st: Step) {
  const a = st.ans;
  const fig = st.fig ?? p.fig;
  switch (a.kind) {
    case 'num':
      if (!Number.isFinite(a.v) || !Number.isInteger(a.v) || a.v < 0) fail(where, `数の答えが整数でない ${a.v}`);
      if (String(a.v).length > 7) fail(where, `数の答え ${a.v} が入力欄に入らない`);
      break;
    case 'frac':
      if (String(a.n).length > 4 || String(a.d).length > 4) fail(where, `分数 ${a.n}/${a.d} が入力欄（4けた）に入らない`);
      if (!(a.d >= 2) || !(a.n >= 1)) fail(where, `分数が不正 ${a.n}/${a.d}`);
      break;
    case 'mixed':
      if (String(a.n).length > 4 || String(a.d).length > 4 || String(a.w).length > 3) fail(where, '帯分数が入力欄に入らない');
      if (!(a.d >= 2) || !(a.n >= 1 && a.n < a.d) || a.w < 1) fail(where, `帯分数が不正 ${a.w}と${a.n}/${a.d}`);
      break;
    case 'any': {
      if (!(a.d >= 2) || !(a.n >= 1)) fail(where, `答えが不正 ${a.n}/${a.d}`);
      if (String(a.n).length > 4 || Math.floor(a.n / a.d) > 999) fail(where, '答えが入力欄に入らない');
      // 帯分数・仮分数・整数のどの形でも ok（only=mixed のときは仮分数は equiv）
      const forms: Inp[] = [{ n: a.n, d: a.d }];
      if (a.n > a.d && a.n % a.d !== 0) forms.push({ w: Math.floor(a.n / a.d), n: a.n % a.d, d: a.d });
      if (a.n % a.d === 0) forms.push({ v: a.n / a.d });
      for (const f of forms) {
        const v = judge(a, f);
        const imp = f.w == null && f.v == null && a.n > a.d;
        const want = a.only === 'mixed' && imp ? 'equiv' : 'ok';
        if (v !== want) fail(where, `形 ${JSON.stringify(f)} が ${want} にならない (${v})`);
        if (want === 'ok' && st.diagnose?.(f)) fail(where, `正解の形 ${JSON.stringify(f)} で誤答診断が反応する`);
      }
      // 大きさがちがえば wrong
      if (judge(a, { n: a.n + 1, d: a.d }) !== 'wrong') fail(where, 'ちがう大きさが wrong にならない');
      break;
    }
    case 'choice': {
      if (a.correct < 0 || a.correct >= a.choices.length) fail(where, '正解の番号が範囲外');
      if (new Set(a.choices).size !== a.choices.length) fail(where, `選択肢が重複 ${a.choices.join(' / ')}`);
      if (a.choices.length < 2) fail(where, '選択肢が少ない');
      const vals = a.choices.map((c) => (/^\{(\d+;)?\d+\|\d+\}$/.test(c) ? evalText(plain(c)) : null)).filter((v): v is R => v != null);
      if (new Set(vals.map((v) => norm(v[0], v[1]).join('/'))).size !== vals.length) fail(where, `大きさが同じ分数が選択肢に2つ ${a.choices.join(' / ')}`);
      break;
    }
    case 'tick': {
      if (fig?.kind === 'numline') {
        if (!(a.correct >= 1 && a.correct <= fig.max * fig.den - 1)) fail(where, `目もりの番号が範囲外 ${a.correct}`);
      } else if (fig?.kind === 'numlines') {
        const d = fig.dens[fig.tapRow ?? -1];
        if (d == null || !(a.correct >= 1 && a.correct <= d - 1)) fail(where, `目もりの番号が範囲外 ${a.correct}`);
      } else fail(where, 'tick なのに数直線の図が無い');
      break;
    }
    case 'shade': {
      const parts = fig?.kind === 'tape' ? fig.parts : fig?.kind === 'mtape' ? fig.wholes * fig.den : fig?.kind === 'cups' ? fig.count * fig.den : 0;
      if (!parts) { fail(where, 'shade なのに図が無い'); break; }
      if (!(a.correct >= 1 && a.correct < parts)) fail(where, `色ぬりの数が範囲外 ${a.correct}/${parts}`);
      break;
    }
    case 'order': {
      const s = [...a.correct].sort();
      if (s.join() !== a.items.map((_, i) => i).join()) fail(where, '正しい順が items の並べかえになっていない');
      if (new Set(a.items).size !== a.items.length) fail(where, 'ならべるカードが重複');
      break;
    }
  }
  const ci = correctInput(a);
  if (judge(a, ci) !== 'ok') fail(where, `正解を入れても ok にならない ${JSON.stringify(ci)}`);
  const msg = st.diagnose?.(ci);
  if (msg) fail(where, `正解を入れても誤答診断が反応する: ${msg}`);
}

function signature(p: Prob): string {
  const parts = p.steps.map((s) => s.prompt + (s.ans.kind === 'choice' ? [...s.ans.choices].sort().join(',') : ''));
  return [p.text, JSON.stringify(p.fig ?? null), ...parts].join('|');
}

function checkProb(id: string, p: Prob) {
  const where = id;
  if (p.skillId !== id) fail(where, `skillId が一致しない: ${p.skillId}`);
  if (p.steps.length < 1) fail(where, '手順が無い');
  if (p.hints.length !== 3) fail(where, `ヒントが3段でない (${p.hints.length})`);
  if (!p.text || !p.explain || !p.label || !p.q || !p.a) fail(where, '文言が空');
  for (const f of [p.text, p.explain, ...p.hints, ...p.steps.map((s) => s.prompt)]) {
    const open = (f.match(/\{/g) ?? []).length;
    const rich = parseRich(f).filter((x) => x.t === 'frac').length;
    if (open !== rich) fail(where, `分数の記法が壊れている: ${f}`);
    if (/undefined|NaN/.test(f)) fail(where, `文に undefined/NaN: ${f}`);
  }
  if (/undefined|NaN/.test(p.q + p.a)) fail(where, `答案に undefined/NaN: ${p.q} / ${p.a}`);
  for (const st of p.steps) checkAns(where, p, st);
  // ヒントの1回目に答えを書かない
  const first = p.steps[0]!;
  const h0 = p.hints[0] ?? '';
  const fa = first.ans;
  if (fa.kind === 'frac' && h0.includes(F(fa.n, fa.d))) fail(where, 'ヒント1が答えの分数を書いている');
  if (fa.kind === 'mixed' && h0.includes(M(fa.w, fa.n, fa.d))) fail(where, 'ヒント1が答えの帯分数を書いている');
  if (fa.kind === 'any' && (h0.includes(`＝ ${F(fa.n, fa.d)}`) || (fa.n > fa.d && fa.n % fa.d && h0.includes(M(Math.floor(fa.n / fa.d), fa.n % fa.d, fa.d))))) fail(where, 'ヒント1が答えを書いている');
  if (fa.kind === 'num' && h0.includes(`＝ ${fa.v}`)) fail(where, 'ヒント1が答えを書いている');
  // けいさんらん
  const sc = p.scratch;
  if (sc && 'tools' in sc) {
    const ok = ['convert', 'borrow'];
    if (sc.tools.length === 0 || new Set(sc.tools).size !== sc.tools.length || sc.tools.some((t) => !ok.includes(t))) fail(where, `分数のけいさんらんの道具が不正（4年は convert/borrow だけ）: ${sc.tools.join(',')}`);
    const mx = sc.initial?.mixed;
    if (mx) {
      if (!(mx.d >= 2)) fail(where, 'けいさんらんの初期値が不正');
      const shown = mx.w > 0 && mx.n > 0 ? `${mx.w}と${mx.n}/${mx.d}` : mx.n === 0 ? String(mx.w) : `${mx.n}/${mx.d}`;
      if (!p.q.includes(shown)) fail(where, `けいさんらんに、問題文に無い数 ${shown} を入れている`);
    }
  }
}

/* ---- 式の計算（問題文から答えを計算しなおす） ---- */
function evalText(t: string): R | null {
  const s = t.trim();
  const mm = /^(\d+)と(\d+)\/(\d+)$/.exec(s);
  if (mm) return [Number(mm[1]) * Number(mm[3]) + Number(mm[2]), Number(mm[3])];
  const ff = /^(\d+)\/(\d+)$/.exec(s);
  if (ff) return [Number(ff[1]), Number(ff[2])];
  if (/^\d+$/.test(s)) return [Number(s), 1];
  return null;
}
/** 「1/2＋1と2/3－3」のような式を計算する。（…）の注記は無視する */
function evalExpr(q: string): R | null {
  const body = q.replace(/（.*?）/g, '');
  const toks = body.match(/\d+と\d+\/\d+|\d+\/\d+|\d+|[＋－]/g);
  if (!toks) return null;
  let acc: R | null = null;
  let op = '＋';
  for (const t of toks) {
    if (t === '＋' || t === '－') { op = t; continue; }
    const v = evalText(t)!;
    acc = acc == null ? v : op === '＋' ? rAdd(acc, v) : rSub(acc, v);
  }
  return acc;
}
function ansR(a: Ans): R | null {
  if (a.kind === 'frac' || a.kind === 'any') return [a.n, a.d];
  if (a.kind === 'mixed') return [a.w * a.d + a.n, a.d];
  if (a.kind === 'num') return [a.v, 1];
  return null;
}
const termsIn = (q: string) => (q.replace(/（.*?）/g, '').match(/\d+と\d+\/\d+|\d+\/\d+|\d+/g) ?? []);
const isMixed = (t: string) => /と/.test(t);
const isWhole = (t: string) => /^\d+$/.test(t);
const fracPart = (t: string) => { const m = /(\d+)\/(\d+)$/.exec(t); return m ? Number(m[1]) : 0; };

function semantic(id: string, p: Prob) {
  const s0 = p.steps[0]!;
  const last = p.steps[p.steps.length - 1]!;
  const lastR = ansR(last.ans);
  const fig = p.fig;
  switch (id) {
    case 'hyo-kind': {
      const a = s0.ans as Extract<Ans, { kind: 'choice' }>;
      const right = plain(a.choices[a.correct]!);
      if (p.tag === 'name') {
        const t = /^(.+) は真分数/.exec(p.q)?.[1] ?? '';
        const r = evalText(t)!;
        const k = isMixed(t) ? '帯分数' : r[0] < r[1] ? '真分数' : '仮分数';
        if (right !== k) fail(id, `分数の種類が合わない ${t} ${right}`);
      } else {
        const k = p.q.replace('をえらぶ', '');
        const r = evalText(right)!;
        const kind = isMixed(right) ? '帯分数' : r[0] < r[1] ? '真分数' : '仮分数';
        if (kind !== k) fail(id, `えらんだ分数の種類が合わない ${right}`);
        for (const c of a.choices.map((x) => plain(x))) {
          if (c === right) continue;
          const v = evalText(c)!;
          const ck = isMixed(c) ? '帯分数' : v[0] < v[1] ? '真分数' : '仮分数';
          if (ck === k) fail(id, `まちがいの選択肢に ${k} がまざっている ${c}`);
        }
      }
      break;
    }
    case 'hyo-unit': {
      const m = /^(.+) は 1\/(\d+) の何こ分$/.exec(p.q);
      if (p.tag === 'count') {
        const r = m && evalText(m[1]!);
        if (!r || r[1] !== Number(m![2]) || (s0.ans as { v: number }).v !== r[0]) fail(id, `何こ分が合わない ${p.q}`);
      } else {
        const mm = /^1\/(\d+) の(\d+)こ分/.exec(p.q);
        const a = s0.ans as Extract<Ans, { kind: 'frac' }>;
        if (!mm || a.d !== Number(mm[1]) || a.n !== Number(mm[2])) fail(id, '何こ分の分数が合わない');
      }
      break;
    }
    case 'hyo-tape': {
      const total = fig?.kind === 'mtape' ? fig.shaded : fig?.kind === 'cups' ? fig.filled : -1;
      const den = fig?.kind === 'mtape' || fig?.kind === 'cups' ? fig.den : 0;
      if (!lastR || !den || !rEq(lastR, [total, den])) fail(id, '図の目もりと答えが合わない');
      if (total % den === 0 || total <= den) fail(id, '1より大きい分数（整数でない）になっていない');
      if (fig?.kind === 'cups' && Math.ceil(fig.filled / fig.den) !== fig.count) fail(id, 'ますの数が水の量と合わない');
      if ((p.tag === 'tape') !== (fig?.kind === 'mtape') && p.tag !== 'mix') fail(id, 'tag と図が合わない');
      if (p.tag !== 'mix' && last.ans.kind !== 'frac') fail(id, '仮分数で答える問題が frac でない');
      break;
    }
    case 'hyo-draw': {
      const a = s0.ans as Extract<Ans, { kind: 'shade' }>;
      const t = /^(.+?)(m|L) になるように/.exec(p.q);
      const r = t && evalText(t[1]!);
      const den = fig?.kind === 'mtape' || fig?.kind === 'cups' ? fig.den : 0;
      if (!r || !rEq(r, [a.correct, den])) fail(id, `ぬる数が分数と合わない ${p.q}`);
      break;
    }
    case 'hyo-line': {
      if (fig?.kind !== 'numline') { fail(id, '数直線が無い'); break; }
      if (p.tag === 'tap') {
        const t = /^(.+) の目もり/.exec(p.q)?.[1];
        const r = t && evalText(t);
        const a = s0.ans as Extract<Ans, { kind: 'tick' }>;
        if (!r || !rEq(r, [a.correct, fig.den])) fail(id, '目もりが分数と合わない');
      } else {
        const at = fig.marks?.[0]?.at ?? -1;
        if (!lastR || !rEq(lastR, [at, fig.den])) fail(id, 'Aと答えが合わない');
      }
      break;
    }
    case 'hen-mixed': {
      const r = evalText(p.q.split(' ')[0]!)!;
      if (!lastR || !rEq(r, lastR)) fail(id, '大きさが合わない');
      const a = last.ans as Extract<Ans, { kind: 'any' }>;
      if (a.only !== 'mixed') fail(id, '帯分数か整数に直す問題なのに only=mixed でない');
      if ((p.tag === 'whole') !== (r[0] % r[1] === 0)) fail(id, 'tag と わりきれるかが合わない');
      break;
    }
    case 'hen-div': {
      const r = evalText(p.q.split(' ')[0]!)!;
      const q = (p.steps[0]!.ans as { v: number }).v;
      const rem = (p.steps[1]!.ans as { v: number }).v;
      if (q !== Math.floor(r[0] / r[1]) || rem !== r[0] % r[1] || rem === 0) fail(id, '商とあまりが合わない');
      if (!lastR || !rEq(r, lastR)) fail(id, '帯分数が合わない');
      break;
    }
    case 'hen-imp': {
      if (p.tag === 'mixed') {
        const r = evalText(p.q.split(' ')[0]!)!;
        const a = last.ans as Extract<Ans, { kind: 'frac' }>;
        if (a.d !== r[1] || a.n !== r[0]) fail(id, '仮分数が合わない');
      } else {
        const m = /^(\d+) ＝ □\/(\d+)$/.exec(p.q);
        if (!m || (s0.ans as { v: number }).v !== Number(m[1]) * Number(m[2])) fail(id, '整数→分数が合わない');
      }
      break;
    }
    case 'eq-line': {
      const m = /^(\d+)\/(\d+) ＝ □\/(\d+)$/.exec(p.q);
      const v = (s0.ans as { v: number }).v;
      if (!m || Number(m[1]) * Number(m[3]) !== v * Number(m[2])) fail(id, `等しい分数になっていない ${p.q} □=${v}`);
      if (fig?.kind !== 'numlines' || !m || !fig.dens.includes(Number(m[2])) || !fig.dens.includes(Number(m[3]))) fail(id, '数直線に分母の段が無い');
      if (m && (p.tag === 'up') !== (Number(m[3]) > Number(m[2]))) fail(id, 'tag と向きが合わない');
      break;
    }
    case 'eq-tap': {
      if (fig?.kind !== 'numlines' || fig.tapRow == null || !fig.marks?.[0]) { fail(id, '図が足りない'); break; }
      const mk = fig.marks[0];
      const a = s0.ans as Extract<Ans, { kind: 'tick' }>;
      if (!rEq([mk.at, fig.dens[mk.row]!], [a.correct, fig.dens[fig.tapRow]!])) fail(id, 'タップする目もりが A と同じ大きさでない');
      if (mk.row === fig.tapRow) fail(id, 'A と同じ段をタップさせている');
      break;
    }
    case 'eq-pick': {
      const a = s0.ans as Extract<Ans, { kind: 'choice' }>;
      const given = evalText(p.q.split(' ')[0]!)!;
      const right = evalText(plain(a.choices[a.correct]!))!;
      if (!rEq(given, right)) fail(id, '正解が等しくない');
      a.choices.forEach((c, i) => { if (i !== a.correct && rEq(evalText(plain(c))!, given)) fail(id, 'まちがいの選択肢に等しい分数'); });
      break;
    }
    case 'cmp-same':
    case 'cmp-num': {
      const [l, r] = p.q.split(' □ ');
      const a = s0.ans as Extract<Ans, { kind: 'choice' }>;
      const c = cmpR(evalText(l!)!, evalText(r!)!);
      const sign = c === 0 ? '＝' : c > 0 ? '＞' : '＜';
      if (a.choices[a.correct] !== sign) fail(id, `大小が合わない: ${p.q}`);
      const L = evalText(l!)!; const Rr = evalText(r!)!;
      if (id === 'cmp-same' && L[1] !== Rr[1] && !isWhole(l!) && !isWhole(r!)) fail(id, '分母が同じでない');
      if (id === 'cmp-same' && p.tag === 'mix' && !(isMixed(l!) || isMixed(r!))) fail(id, 'mix なのに帯分数が無い');
      if (id === 'cmp-same' && p.tag === 'whole' && !(isWhole(l!) || isWhole(r!))) fail(id, 'whole なのに整数が無い');
      if (id === 'cmp-num' && (L[0] !== Rr[0] || L[1] === Rr[1])) fail(id, '分子が同じ・分母がちがう、になっていない');
      break;
    }
    case 'cmp-order': {
      const a = s0.ans as Extract<Ans, { kind: 'order' }>;
      const vals = a.items.map((it) => evalText(plain(it))!);
      for (let k = 1; k < a.correct.length; k++) if (cmpR(vals[a.correct[k - 1]!]!, vals[a.correct[k]!]!) <= 0) fail(id, `大きい順になっていない: ${p.a}`);
      if (new Set(vals.map((v) => v[1])).size !== 3) fail(id, '分母が3つともちがう、になっていない');
      if (vals.some((v) => v[0] < v[1])) fail(id, '仮分数でないものがある');
      break;
    }
    case 'add-basic': case 'add-mixed': case 'add-whole': case 'add-carry': case 'add-one':
    case 'sub-basic': case 'sub-mixed': case 'sub-whole': case 'sub-borrow': case 'sub-from': {
      const v = evalExpr(p.q);
      if (!v || !lastR || !rEq(v, lastR)) fail(id, `答えが式と合わない: ${p.q} / ${p.a}`);
      if (v && !(v[0] > 0)) fail(id, `答えが0以下: ${p.q}`);
      const ts = termsIn(p.q);
      if (ts.length !== 2) { fail(id, `項が2つでない ${p.q}`); break; }
      const dens = new Set(ts.filter((t) => !isWhole(t)).map((t) => Number(/\/(\d+)$/.exec(t)![1])));
      if (dens.size !== 1) fail(id, `分母が同じでない ${p.q}`);
      const a = last.ans as Extract<Ans, { kind: 'any' }>;
      if (a.kind !== 'any' || a.d !== [...dens][0]) fail(id, '答えが any でない／分母がちがう');
      const [t1, t2] = ts as [string, string];
      const f1 = fracPart(t1); const f2 = fracPart(t2);
      const D = [...dens][0]!;
      if (id === 'add-basic' && (isMixed(t1) || isMixed(t2) || f1 + f2 <= D)) fail(id, '真分数・仮分数のたし算で答えが1より大きい、になっていない');
      if (id === 'add-mixed' && (!isMixed(t1) || !isMixed(t2) || f1 + f2 >= D)) fail(id, '帯分数＋帯分数（くり上がりなし）でない');
      if (id === 'add-whole' && !((isWhole(t1) && isMixed(t2)) || (isMixed(t1) && isWhole(t2)))) fail(id, '整数＋帯分数でない');
      if (id === 'add-carry' && !(isMixed(t1) && f1 + f2 > D)) fail(id, 'くり上がりになっていない');
      if (id === 'add-one' && !(f1 + f2 === D && v && v[0] % v[1] === 0)) fail(id, '答えが整数になっていない');
      if (id === 'sub-basic' && (isMixed(t1) || isMixed(t2) || isWhole(t1) || f1 <= D)) fail(id, '仮分数－分数でない');
      if (id === 'sub-mixed' && (!isMixed(t1) || !isMixed(t2) || f1 <= f2)) fail(id, '帯分数－帯分数（くり下がりなし）でない');
      if (id === 'sub-whole' && !(isMixed(t1) && isWhole(t2))) fail(id, '帯分数－整数でない');
      if (id === 'sub-borrow' && !(isMixed(t1) && f1 < f2)) fail(id, 'くり下がりになっていない');
      if (id === 'sub-from' && !(isWhole(t1) && !isWhole(t2))) fail(id, '整数－分数でない');
      if (id === 'sub-from' && (p.tag === 'one') === isMixed(t2)) fail(id, 'tag と形が合わない');
      break;
    }
    case 'add-fig': {
      const ts = termsIn(p.q).map((t) => evalText(t)!);
      const n = (s0.ans as { v: number }).v;
      if (fig?.kind !== 'mtape' || fig.shaded !== ts[0]![0] || fig.shaded2 !== ts[1]![0]) fail(id, '図の色と式が合わない');
      if (n !== ts[0]![0] + ts[1]![0]) fail(id, '何こ分が合わない');
      if (!lastR || !rEq(rAdd(ts[0]!, ts[1]!), lastR)) fail(id, '答えが合わない');
      break;
    }
    case 'wp-add': case 'wp-sub': case 'wp-rem': {
      const eq = s0.ans as Extract<Ans, { kind: 'choice' }>;
      const v = evalExpr(plain(eq.choices[eq.correct]!));
      if (!v || !lastR || !rEq(v, lastR)) fail(id, `式と答えが合わない: ${plain(eq.choices[eq.correct]!)} / ${p.a}`);
      if (v && !(v[0] > 0)) fail(id, '答えが0以下');
      const nums = termsIn(plain(eq.choices[eq.correct]!));
      for (const t of nums) if (!p.q.includes(t)) fail(id, `式の数 ${t} が問題文に無い`);
      if (id === 'wp-add' && p.tag === 'carry') {
        const [a, b] = nums.map(fracPart) as [number, number];
        const D = Number(/\/(\d+)/.exec(p.q)![1]);
        if (a + b <= D) fail(id, 'carry なのにくり上がらない');
      }
      if (id === 'wp-sub') {
        const [a, b] = nums as [string, string];
        if (cmpR(evalText(a)!, evalText(b)!) <= 0) fail(id, 'ちがいの式が 大きい－小さい でない');
        if (p.tag === 'borrow' && !(fracPart(a) < fracPart(b))) fail(id, 'borrow なのにくり下がらない');
      }
      break;
    }
    case 'wp-prog': {
      const f = s0.ans as Extract<Ans, { kind: 'frac' }>;
      const m = /「のこりは (\d+)\/(\d+) だよ。」/.exec(p.q);
      if (!m || Number(m[2]) !== f.d || Number(m[1]) + f.n !== f.d) fail(id, 'のこりと終わった分が合わない');
      const o = last.ans as Extract<Ans, { kind: 'order' }>;
      // 発言から終わった分を計算しなおす
      const done = o.items.map((nm) => {
        const say = new RegExp(`${nm}「([^」]*)」`).exec(p.q)?.[1] ?? '';
        const rem = /のこりは (\d+)\/(\d+)/.exec(say);
        if (rem) return [Number(rem[2]) - Number(rem[1]), Number(rem[2])] as R;
        if (say.includes('半分')) return [1, 2] as R;
        const d = /(\d+)\/(\d+)/.exec(say);
        return d ? ([Number(d[1]), Number(d[2])] as R) : ([0, 1] as R);
      });
      for (let k = 1; k < o.correct.length; k++) if (cmpR(done[o.correct[k - 1]!]!, done[o.correct[k]!]!) <= 0) fail(id, 'はやい順になっていない');
      break;
    }
    default:
      break;
  }
  if (fig?.kind === 'numline' && fig.max * fig.den > 24) fail(id, '数直線の目もりが多すぎる');
  if (fig?.kind === 'mtape' && fig.wholes * fig.den > 24) fail(id, 'テープの目もりが多すぎる');
  if (fig?.kind === 'numlines' && (fig.dens.length > 4 || Math.max(...fig.dens) > 12)) fail(id, '数直線が多すぎる／細かすぎる');
}

/* ------------------------------------------------------------------ */
console.log(`問題データの検査（各項目 ${N} 問）`);
const varieties: Record<string, number> = {};

for (const { id } of UNIT_LEVELS) {
  const sigs = new Set<string>();
  for (let i = 0; i < N; i++) {
    let p: Prob;
    try { p = generate(id); } catch (e) { fail(id, `生成で例外: ${String(e)}`); break; }
    checkProb(id, p);
    semantic(id, p);
    sigs.add(signature(p));
  }
  varieties[id] = sigs.size;
}

// タグつきの形がすべて出せる
for (const [id, tags] of [
  ['hyo-kind', ['name', 'pick']], ['hyo-unit', ['count', 'make']], ['hyo-tape', ['tape', 'cup', 'mix']], ['hyo-draw', ['tape', 'cup']], ['hyo-line', ['tap', 'read']],
  ['hen-mixed', ['mixed', 'whole']], ['hen-imp', ['mixed', 'whole']], ['eq-line', ['up', 'down']],
  ['cmp-same', ['mix', 'whole', 'same']], ['cmp-order', ['paper', 'mix']],
  ['add-basic', ['imp', 'kari']], ['add-whole', ['wf', 'fw']], ['add-carry', ['mf', 'mm']], ['add-one', ['mf', 'mm']],
  ['sub-borrow', ['mf', 'mm']], ['sub-from', ['one', 'mixed']],
  ['wp-add', ['plain', 'carry']], ['wp-sub', ['plain', 'borrow']], ['wp-rem', ['whole', 'mixed']], ['wp-prog', ['unit', 'same']],
] as const) {
  for (const t of tags) {
    let ok = false;
    for (let i = 0; i < 600 && !ok; i++) ok = generate(id).tag === t;
    if (!ok) fail(id, `タグ ${t} の問題が出ない`);
  }
}

// けいさんらん（分数）を出す項目・出さない項目（docs/DESIGN.md §6）
const PAD_ITEMS = ['hen-mixed', 'hen-div', 'hen-imp', 'add-basic', 'add-carry', 'add-one', 'sub-borrow', 'sub-from', 'cmp-order', 'wp-add', 'wp-sub', 'wp-rem'];
const NO_PAD_ITEMS = ['hyo-kind', 'hyo-unit', 'hyo-tape', 'hyo-draw', 'hyo-line', 'eq-line', 'eq-tap', 'eq-pick', 'cmp-same', 'cmp-num',
  'add-mixed', 'add-whole', 'sub-basic', 'sub-mixed', 'sub-whole', 'add-fig', 'wp-prog'];
for (const id of PAD_ITEMS) {
  let found = false;
  for (let i = 0; i < 300 && !found; i++) found = !!generate(id).scratch;
  if (!found) fail(id, 'けいさんらんが出ない');
}
for (const id of NO_PAD_ITEMS) {
  for (let i = 0; i < 300; i++) { if (generate(id).scratch) { fail(id, 'けいさんらんを出さない項目なのに出ている'); break; } }
}
if (PAD_ITEMS.length + NO_PAD_ITEMS.length !== UNIT_LEVELS.length) fail('pad', 'けいさんらんの出す／出さないが全項目に決まっていない');
const FIRST_TOOL: Record<string, string> = { 'hen-mixed': 'convert', 'sub-borrow': 'borrow', 'sub-from': 'borrow', 'add-carry': 'convert' };
for (const [id, tool] of Object.entries(FIRST_TOOL)) {
  for (let i = 0; i < 100; i++) {
    const sc = generate(id).scratch;
    if (!sc || !('tools' in sc) || sc.tools[0] !== tool) { fail(id, `けいさんらんの先頭の道具が ${tool} でない`); break; }
  }
}

/* ---------------- エラーハンター ---------------- */
function checkError(id: string, e: ErrProb) {
  if (e.skillId !== id) fail(id, `skillId が一致しない ${e.skillId}`);
  if (e.work.length < 1 || !e.explain || !e.fixHint) fail(id, '文言が空');
  if (e.reasons.length !== 4 || new Set(e.reasons).size !== 4) fail(id, '理由の選択肢が4つでない／重複');
  if (e.correctReason < 0 || e.correctReason > 3) fail(id, '正しい理由の番号が範囲外');
  if (id === 'eh-judge' && !e.isCorrect) fail(id, 'eh-judge なのにまちがいのノート');
  if (id !== 'eh-judge' && e.isCorrect) fail(id, 'まちがいの型なのに正しいノート');
  checkAns(id, { skillId: id, text: '', steps: [], hints: [], explain: '', label: '', q: '', a: '' }, e.fix);
  const text = e.work.join(' ');
  if (/undefined|NaN/.test(text + e.q + e.a)) fail(id, 'undefined/NaN');
  const a = e.fix.ans;
  // 正しい答えの書き方（帯分数・整数・仮分数）
  const forms: string[] = [];
  if (a.kind === 'frac') forms.push(F(a.n, a.d));
  if (a.kind === 'mixed') forms.push(M(a.w, a.n, a.d));
  if (a.kind === 'any') {
    // 式の中の数（ひく数など）と区別するため、「答え …」「＝ …」の形で探す
    const x = a.n % a.d === 0 ? String(a.n / a.d) : a.n > a.d ? M(Math.floor(a.n / a.d), a.n % a.d, a.d) : F(a.n, a.d);
    forms.push(`答え ${x}`, `＝ ${x}`);
  }
  if (id === 'eh-judge') {
    if (forms.length && !forms.some((f) => text.includes(f))) fail(id, `正しいノートに答えが無い ${text}`);
  } else if (a.kind !== 'choice') {
    if (forms.some((f) => text.includes(f))) fail(id, `まちがいのノートに正しい答えが書いてある ${text}`);
  }
}
const ehVar: Record<string, number> = {};
for (const t of ERROR_TYPES) {
  const sigs = new Set<string>();
  for (let i = 0; i < N; i++) {
    const e = generateError(t.id);
    checkError(t.id, e);
    sigs.add(e.work.join('|') + e.fix.prompt);
  }
  ehVar[t.id] = sigs.size;
}

/* ---------------- 変化の数 ---------------- */
console.log('\n項目ごとの「見た目のちがう問題」の数（目安 20以上）:');
for (const [id, n] of [...Object.entries(varieties), ...Object.entries(ehVar)]) {
  const mark = n >= MIN_VARIETY ? '✓' : '✗';
  console.log(`  ${mark} ${id.padEnd(12)} ${n}`);
  if (n < MIN_VARIETY) fail('variety', `${id} は ${n} 通りしかない`);
}

/* ---------------- 本番テスト・実力の階段 ---------------- */
const allIds = new Set<string>([...UNIT_LEVELS.map((l) => l.id), ...ERROR_TYPES.map((t) => t.id)]);
const omote = TEST_STEPS.filter((s) => s.section === '表').reduce((a, s) => a + s.points, 0);
const ura = TEST_STEPS.filter((s) => s.section === '裏').reduce((a, s) => a + s.points, 0);
if (omote !== 100 || OMOTE_MAX !== 100) fail('test', `表が100点でない ${omote}`);
if (ura !== 50 || URA_MAX !== 50) fail('test', `裏が50点でない ${ura}`);
if (TEST_STEPS.filter((s) => s.section === '表').length !== 20) fail('test', '表が20問でない');
for (const s of TEST_STEPS) {
  if (!allIds.has(s.skillId)) fail('test', `テストの項目 ${s.skillId} がレベル表に無い`);
  for (let i = 0; i < 300; i++) {
    const tp = s.gen();
    if (tp.p.skillId !== s.skillId) { fail('test', `大問${s.daimon}${s.sub ?? ''} は ${s.skillId} のはずが ${tp.p.skillId}`); break; }
  }
}
const inTest = new Set(TEST_STEPS.filter((s) => s.points > 0).map((s) => s.skillId));
const inFloors = new Set(TRIAL.floors.flatMap((f) => [...f.skills]));
for (const k of inTest) if (!inFloors.has(k)) fail('trial', `極限に ${k} が出ない`);
for (const k of inFloors) if (!inTest.has(k)) fail('trial', `極限の ${k} が本番テストに無い`);
if (TRIAL.max !== 150) fail('trial', `予想点の満点が150でない ${TRIAL.max}`);
if (TRIAL.reqs.some((r) => r.floor < 1 || r.floor > TRIAL.floors.length)) fail('trial', '段の番号が範囲外');
const extraExpected = [...allIds].filter((k) => !inTest.has(k)).sort();
const extraActual = [...EXTRA_SKILLS].sort();
if (extraExpected.join() !== extraActual.join())
  fail('trial', `EXTRA_SKILLS が「全項目 − テストの項目」と一致しない\n    期待: ${extraExpected.join(', ')}\n    実際: ${extraActual.join(', ')}`);
const inEndless = new Set(ENDLESS_FLOORS.flatMap((f) => [...f.skills]));
for (const k of allIds) if (!inEndless.has(k)) fail('trial', `無限に ${k} が出ない`);

/* ---------------- モジュール表 ---------------- */
for (const [mod, levels] of Object.entries(MODULE_LEVELS)) {
  if (new Set(levels.map((l) => l.id)).size !== levels.length) fail(mod, 'レベルIDが重複');
}

console.log(failures === 0 ? '\n✓ すべて合格' : `\n✗ ${failures} 件の不合格`);
process.exit(failures === 0 ? 0 : 1);
