# 分数ランド4｜1より大きい分数（syo4-bunnsu）

学級ポータルの一部。種類: **math**／app_id: `bunsuu4`（小4 算数「10. 分数」。東京書籍『新しい算数4下』p.36〜48）。
5年の分数アプリ（syo5-bunnsuunotasizanntohikizan）の画面・ゲーム部分を土台に、問題づくり・図・判定を作り直した。保存キーは `bunsuu4_*`。

## このアプリだけのこと
- 問題は `src/lib/problems.ts`（7モジュール・29項目）と `src/lib/errorHunter.ts`（エラーハンター11項目）。画面に依存しない純粋関数。
  文章・ヒントの中の分数は `{3|4}`（4分の3）・`{1;3|4}`（1と4分の3）・`{□|6}` の記法で書く（`src/lib/frac.ts`）。
- **答えが帯分数でも仮分数でもよい問題**は `Ans.kind = 'any'`（判定 `judge`）。帯分数・仮分数・整数のどれでも正解。
  入力欄（`FracEntry` の any）は「分数」「帯分数」「整数」のボタンで形を選ぶ。`only: 'mixed'` は「帯分数か整数に直す」問題（仮分数のままは equiv＝まちがいに数えない）。
  分母のちがう等しい分数も equiv（「問題の分母のままで」）。ことばは `equivMessage`。
- 1問の画面は `FractionRound.tsx`（数・分数・帯分数・any・えらぶ・数直線タップ・色ぬり・ならべる `OrderInput`）。
  図は `FigureView.tsx`: `mtape`（0〜2m のテープ＋ものさし）・`cups`（1Lます）・`numlines`（数直線を分母ごとにならべる）・`numline`・`tape`。
- 本番テストは `src/lib/testConfig.ts`。**紙のテスト（新学社 4年東 下巻「10. 分数」表100点・裏50点）と同じ大問・配点**（対応表は `docs/DESIGN.md` §5、紙との差も同じ所）。
  実力の階段は `trialConfig.ts`（段を手で書いた。`EXTRA_SKILLS` は `npm run verify` が点検）。
- 記録の名前（skillId）は `hyo-*` `hen-*` `eq-*` `cmp-*` `add-*` `sub-*` `wp-*` `eh-*`。学級ポータルにつなぐときは、kit のカタログ
  `bunsuu4`・`apps` の1行・Vercel の環境変数が要る（portal-connect スキル）。項目を足したり名前を変えたら
  `npm run catalog > ../learning-app-kit/src/catalog/bunsuu4.ts` で作り直して kit に入れる（誤概念は `scripts/export-catalog.ts` に手で書く）。
- けいさんらん（分数）は kit の `FractionPad`。4年は convert（仮分数・帯分数）と borrow（くり下げ）だけ。出す画面は `problems.ts` の `PADS`・`errorHunter.ts` の `EH_PADS`、理由は `docs/DESIGN.md` §6。
- 設計と網羅性の対応表は `docs/DESIGN.md`。

## 確かめ方
- `npm run check`（ルール点検・型チェック・問題データの機械検査 `npm run verify`・ビルド）
- 共通ファイルを kit の版にそろえる: `npx learning-app-kit-platform fix`

<!-- platform:begin（learning-app-kit が配る。手で書きかえない。直すときは kit の platform/CLAUDE.common.md） -->
## 学級ポータル共通のルール（learning-app-kit が配る。ここは手で書きかえない）

このリポジトリは、複数のアプリがつながった1つの仕組み（学級ポータル）の一部です。
1つのアプリだけを見て直すと、ほかのアプリ・先生用画面（PRISM）・データベースとずれます。

- **構成**: `learning-app-kit`（共通部品・記録の送信・カタログ・実力の階段）／単元アプリ（算数・国語）／
  `class-portal-teacher`（PRISM・先生用）／`class-portal-kids`（子ども用ハブ）／Supabase `gakkyu-portal`／
  `onokomachi-master-DB`（知識集）。
- **始めと終わり**: 作業の前に kb スキルで関係する知見を引く。直したこと・分かったことは最後に kb save で残す。
- **共通ファイルは、このリポジトリで直さない。** どれが共通ファイルかは `npm run platform` が教える。
  直すときは learning-app-kit の `platform/families/<種類>/files/` を直して kit の版を上げ、
  各アプリで kit を上げてから `npx learning-app-kit-platform fix` で配る（1つのアプリだけ直すと、直しが届かない）。
- **記録の名前（skillId）はカタログの skill_id と同じ文字列にする。** レベルIDがすでに `compare-basic` なら、
  前に何かを足さない。問題・レベルを足したり名前を変えたりしたら、カタログを作り直して kit に入れる（portal-connect スキル）。
- **送る記録の形・データベースの表・PRISM の画面に関わる変更**は、関係するリポジトリを全部つないだセッションで行う。
  単体のセッションで気づいたら、直さずに PR とユーザーへの報告に「全体セッションで直すこと」として書く。
- **kit はコミットのSHAで固定している。** 上げるときは `npx learning-app-kit-platform update` → `npm run check`。
- **新しいアプリは、作りはじめに `npx learning-app-kit-platform init <種類>`**（math / kokugo / portal / standalone）。
  CLAUDE.md・共通ファイル・CI・build 前の点検がそろう。そのあと CLAUDE.md の上の段にアプリだけのことを書く。
- 子どもの氏名は扱わない（出席番号だけ）。APIキー・トークン・パスワードはファイルにも知識集にも書かない。
- **終わる前に `npm run check` を通す**（このルールの点検 `npm run platform` も入っている）。
- PR の本文に「ほかのアプリ・PRISM・データベースへの影響」を1行書く（無ければ「なし」）。
- 毎週月曜の朝、各アプリの CI が kit を最新に上げ、`npm run check` が通れば main に自動で反映する（Vercel が本番に出す。持ち主の操作は要らない）。
  失敗のメールが来たら（kit の変更でアプリが通らない／CI の設定が変わる更新）、全体セッションで直す。
  kit の変更は、全アプリに月曜の朝いっせいに届く。kit の PR では「ほかのアプリへの影響」を必ず書く。
- Vercel の build の前にもこの点検が走る（`prebuild`）。ずれたままでは本番に出ない。
<!-- platform:end -->
