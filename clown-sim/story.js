/* =====================================================================
 * 삐연시 — story.js
 * ---------------------------------------------------------------------
 * 톤: 진지한 오토메 비주얼노벨의 문법 위에 '삐에로'라는 소재의 갭을 얹는다.
 *     묘사는 감성적으로, 웃음은 상황에서. 대사는 고급지게, 상황은 병맛으로.
 *
 * ※ 구조는 건드리지 말 것 — id / type / bg / sprite / effect 수치 / next /
 *   엔딩 분기(resolveEnding)는 게임 밸런스에 직결된다. 문장만 다듬는다.
 *
 * ---------------------------------------------------------------------
 * 씬 스키마 (app.js 엔진이 읽는 형식):
 *   {
 *     id: "고유 id",
 *     type: "vn" | "chat",
 *     bg: "배경키",
 *     // --- vn 씬 ---
 *     speaker: "이름표에 띄울 이름",   // 나레이션이면 "" 또는 생략
 *     sprite: "캐릭터id:표정",        // 예 "bbidol:happy" (없으면 "")
 *     text: "대사. \n 으로 줄바꿈",
 *     // --- chat 씬 ---
 *     chat: [ {side:"them"|"me", name:"표시이름", text:"말풍선"}, ... ],
 *     // --- 공통 ---
 *     choices: [ { label:"선택지", effect:{ 캐릭터id:+n }, next:"다음씬id" } ],
 *     next: "다음씬id"
 *   }
 *   * choices.next 가 "RESOLVE" 면 app.js 가 resolveEnding() 으로 엔딩을 계산한다.
 *     그 선택지의 effect 에 들어 있는 캐릭터 id 가 finalPick 으로 넘어간다.
 *
 * 캐릭터 id: bbidol(삐돌) / noir(삐노) / ppyong(삐용)
 * 표정 키: normal / happy / shy / angry, 그리고 삐노 전용 masked(가면 착용).
 *   삐노는 2단 공개 — masked(s_noir1) → normal(s_noir2에서 가면 내림)
 *   → happy(굿엔딩에서 분장까지 지운 맨얼굴). 이 순서를 깨지 말 것.
 * 배경키: circus / circus_dark / circus_bright / phone / phone_dark / phone_bright
 * ===================================================================== */

window.STORY = {

  /* ------------------------------------------------------------------ *
   *  SCENES
   * ------------------------------------------------------------------ */
  scenes: [

    /* ── 프롤로그 ─────────────────────────────────────────────── */
    {
      id: "s_intro1",
      type: "vn",
      bg: "circus",
      speaker: "",
      sprite: "",
      text: "천막을 걷자 톱밥 냄새가 훅 밀려왔다.\n낮의 공연장은 텅 비어 있었고, 벽에 붙은 종이 한 장만 바람에 떨고 있었다.\n— 광대 학원, 신입 단원 모집.",
      next: "s_intro2"
    },
    {
      id: "s_intro2",
      type: "vn",
      bg: "circus",
      speaker: "단장",
      sprite: "",
      text: "(내 이력서를 뒤집어 보더니) 합격.\n축하해. 오늘부터 우리 단 막내야.\n아, 참고로 지금 남은 단원이 전부 남자 삐에로 셋이거든. 잘 지내보라고.",
      choices: [
        { label: "저… 아르바이트 면접인 줄 알고 왔는데요.", effect: {}, next: "s_intro3" },
        { label: "빨간 코, 저한테도 어울릴까요?",           effect: {}, next: "s_intro3" }
      ]
    },
    {
      id: "s_intro3",
      type: "vn",
      bg: "circus",
      speaker: "",
      sprite: "",
      text: "그렇게 나는 이 낡은 천막의 유일한 신입이 되었다.\n\n그리고 그날부터 — 빨간 코 세 개가, 나를 동시에 바라보기 시작했다.",
      next: "s_bbidol1"
    },

    /* ── 1번 삐에로: 삐돌 (무뚝뚝 츤데레) ─────────────────────── */
    {
      id: "s_bbidol1",
      type: "vn",
      bg: "circus",
      speaker: "삐돌",
      sprite: "bbidol:normal",
      text: "…네가 그 신입이야?\n흥. 난 이 바닥 20년차다. 잘 따라오기나 해.\n딱히 챙겨주겠다는 건 아니고. 네가 넘어지면 공연에 구멍 나니까 그런 거야.",
      next: "s_bbidol2"
    },
    {
      id: "s_bbidol2",
      type: "vn",
      bg: "circus",
      speaker: "삐돌",
      sprite: "bbidol:gift",
      text: "(연습 중 휘청인 나를, 굵은 팔이 허리째 붙든다)\n…조심하라니까.\n(툭, 조화 한 송이를 내민다) 무대 소품 남은 거야. 버리긴 아까워서. 너 가져.",
      choices: [
        { label: "고마워요. …예쁘다.",              effect: { bbidol: +2 }, next: "s_bbidol3" },
        { label: "혹시 저, 챙겨주시는 거예요?",       effect: { bbidol: +2 }, next: "s_bbidol3" },
        { label: "소품 빼돌리면 혼나는 거 아니에요?", effect: { bbidol: -1 }, next: "s_bbidol3" }
      ]
    },
    {
      id: "s_bbidol3",
      type: "vn",
      bg: "circus",
      speaker: "삐돌",
      sprite: "bbidol:shy",
      text: "…뭐야, 그 표정. 웃지 마.\n(귀 끝이 붉게 물든다)\n스무 해 동안 이 천막에서 내가 넘어지는 걸 본 사람은 아무도 없어. 그런데 요즘은, 발이 자꾸 헛디뎌.",
      choices: [
        { label: "그거… 저 때문이에요?",         effect: { bbidol: +2 }, next: "s_bbidol_chat" },
        { label: "그럼 지금 한 번 넘어져 보세요.", effect: { bbidol: -1 }, next: "s_bbidol_chat" }
      ]
    },
    {
      id: "s_bbidol_chat",
      type: "chat",
      bg: "phone",
      chat: [
        { side: "them", name: "삐돌", text: "잤어?" },
        { side: "them", name: "삐돌", text: "별건 아니고." },
        { side: "them", name: "삐돌", text: "천막 뒷길 가로등 나갔더라.\n밤에 다닐 거면 큰길로 돌아가." },
        { side: "me",   name: "나",   text: "그거 걱정하시는 거 맞죠, 삐돌 씨" }
      ],
      choices: [
        { label: "데리러 와주실 거예요?",            effect: { bbidol: +2 }, next: "s_noir1" },
        { label: "20년차치고 잔소리가 다정하시네요.", effect: { bbidol: +1 }, next: "s_noir1" }
      ]
    },

    /* ── 2번 삐에로: 삐노 (낮고 시크한 밀당) ────────────────── */
    {
      id: "s_noir1",
      type: "vn",
      bg: "circus_dark",
      speaker: "삐노",
      sprite: "noir:masked",
      text: "(분장실 거울 앞. 가면을 쓴 채, 돌아보지도 않는다)\n…왜. 웃는 얼굴을 기대했으면 실망하겠네.\n이건 무대 위에서도, 아래에서도 안 벗어.",
      choices: [
        { label: "안 웃어도 괜찮아요.",         effect: { noir: +2 }, next: "s_noir2" },
        { label: "간판이 그렇게 어두워도 돼요?", effect: { noir: -1 }, next: "s_noir2" },
        { label: "(말없이 그 가면을 바라본다)",  effect: { noir: +1 }, next: "s_noir2" }
      ]
    },
    {
      id: "s_noir2",
      type: "vn",
      bg: "circus_dark",
      speaker: "삐노",
      sprite: "noir:normal",
      text: "관객은 가면만 보고 돌아가. 그게 편하고.\n(문득, 가면을 천천히 내린다. 거울 너머로 눈이 마주친다)\n…너한테 왜 이걸 벗고 있는지 모르겠네. 조심해. 위험한 건 그쪽이야.",
      choices: [
        { label: "이 얼굴, 저만 본 거예요?",     effect: { noir: +2 }, next: "s_noir_chat" },
        { label: "그 말, 단원들한테 다 하세요?", effect: { noir: +1 }, next: "s_noir_chat" },
        { label: "저 지금 도망가야 하나요.",     effect: { noir: -1 }, next: "s_noir_chat" }
      ]
    },
    {
      id: "s_noir_chat",
      type: "chat",
      bg: "phone_dark",
      chat: [
        { side: "them", name: "삐노", text: "안 자?" },
        { side: "me",   name: "나",   text: "이 시간에 연락이라니…" },
        { side: "them", name: "삐노", text: "네 생각 하느라 분장이 안 지워져서." },
        { side: "them", name: "삐노", text: "농담이야. 자라." }
      ],
      choices: [
        { label: "어느 쪽이 농담인데요?",        effect: { noir: +2 }, next: "s_ppyong1" },
        { label: "그런 말 반칙이에요. 잘게요.",   effect: { noir: +1 }, next: "s_ppyong1" }
      ]
    },

    /* ── 3번 삐에로: 삐용 (발랄 직진) ─────────────────────────── */
    {
      id: "s_ppyong1",
      type: "vn",
      bg: "circus_bright",
      speaker: "삐용",
      sprite: "ppyong:normal",
      text: "선배 신입이라면서요?! 저 이제 막내 아니죠?! 아 진짜 몇 년 만이야—\n저 방금 재주넘기 세 바퀴 했는데 보셨어요?\n못 봤어요? 다시 할게요, 다시!",
      choices: [
        { label: "봤어요 봤어! 완전 멋있었어.",  effect: { ppyong: +2 }, next: "s_ppyong2" },
        { label: "숨 좀 쉬면서 말해요…",         effect: { ppyong: +1 }, next: "s_ppyong2" },
        { label: "(슬쩍 한 걸음 물러선다)",      effect: { ppyong: -1 }, next: "s_ppyong2" }
      ]
    },
    {
      id: "s_ppyong2",
      type: "vn",
      bg: "circus_bright",
      speaker: "삐용",
      sprite: "ppyong:shy",
      text: "헤헤… 저 보고 웃어주셨다.\n(요란하던 방울 소리가 뚝 잦아든다)\n근데요 선배. 저는 좋아하는 사람 앞에서 조용해지는 게 제일 무서워요. …지금처럼요. 저 지금, 좀 조용하죠?",
      choices: [
        { label: "지금이 제일 예뻐요.",       effect: { ppyong: +2 }, next: "s_ppyong_chat" },
        { label: "귀엽다, 진짜.",             effect: { ppyong: +2 }, next: "s_ppyong_chat" },
        { label: "다시 재주넘기 해봐요.",      effect: { ppyong: +1 }, next: "s_ppyong_chat" }
      ]
    },
    {
      id: "s_ppyong_chat",
      type: "chat",
      bg: "phone_bright",
      chat: [
        { side: "them", name: "삐용", text: "선배!!!! (막내 탈출 기념)" },
        { side: "them", name: "삐용", text: "저 오늘 연습하다 또 넘어졌어요" },
        { side: "them", name: "삐용", text: "근데 하나도 안 아팠어요" },
        { side: "them", name: "삐용", text: "왜냐면 넘어지면서 선배 생각했거든요" },
        { side: "them", name: "삐용", text: "이 멘트 어때요?\n방금 세 번 고쳤어요" }
      ],
      choices: [
        { label: "세 번 고친 거 티 나요. 근데… 좋아요.", effect: { ppyong: +2 }, next: "s_decide" },
        { label: "그만 좀 넘어져요. 다치잖아요.",        effect: { ppyong: +2 }, next: "s_decide" },
        { label: "밤에 연락은 이제 그만.",               effect: { ppyong: -1 }, next: "s_decide" }
      ]
    },

    /* ── 결정 씬 → RESOLVE 로 엔딩 계산 ───────────────────────── */
    {
      id: "s_decide",
      type: "vn",
      bg: "circus",
      speaker: "단장",
      sprite: "",
      text: "(단장이 팔짱을 낀다)\n들어온 지 얼마나 됐다고 우리 단이 이렇게 시끄러워.\n솔직히 말해봐. 빨간 코 셋 중에, 네 마음은 어디로 기울었어?",
      choices: [
        { label: "넘어지지 않으려 애쓰는 사람. 삐돌 씨요.",  effect: { bbidol: +3 }, next: "RESOLVE" },
        { label: "가면 안쪽을 보여준 사람. 삐노 씨요.",    effect: { noir:   +3 }, next: "RESOLVE" },
        { label: "저 때문에 조용해지는 사람. 삐용이요.",     effect: { ppyong: +3 }, next: "RESOLVE" },
        { label: "…모르겠어요. 저 아직 신입이잖아요.",       effect: {},            next: "RESOLVE" }
      ]
    }
  ],

  /* ------------------------------------------------------------------ *
   *  ENDINGS
   * ------------------------------------------------------------------ */
  endings: {

    e_bbidol: {
      title: "빨간 코 아래 진심",
      kicker: "Good Ending",
      sprite: "bbidol:happy",
      text: "삐돌은 20년 만에, 무대 위에서 처음으로 넘어졌다.\n\n\"…딱히 너 때문은 아니야.\"\n그렇게 말하면서도 일어설 생각 없이 내 손만 붙들고 있었다.\n\n객석이 웃었다. 그의 귀 끝이 조명보다 붉었다.\n나는 그게, 그가 20년간 보여준 어떤 재주보다 근사하다고 생각했다."
    },

    e_noir: {
      title: "가면 안쪽",
      kicker: "Good Ending",
      sprite: "noir:happy",
      text: "가면을 내린 밤에도, 그는 분장만은 지우지 않았다.\n그런데 오늘 처음으로 — 마지막 한 겹까지 지운 맨얼굴을 보여줬다.\n\n\"가면은 관객한테나 씌우는 거고.\"\n그가 낮게 웃었다.\n\"넌 여기까지 봤으니까 — 이제 책임져.\"\n\n서늘한 말인데, 자꾸 발끝이 그쪽으로 돌아간다."
    },

    e_ppyong: {
      title: "재주넘기 백 바퀴",
      kicker: "Good Ending",
      sprite: "ppyong:fall",
      text: "삐용은 기쁘다며 재주를 넘다가 또 넘어졌다.\n그리고 넘어진 채로, 하늘을 보며 말했다.\n\n\"선배. 저 이제 안 조용할게요. 진심이에요.\"\n\n방울 소리가 요란했다.\n앞으로 하루도 심심할 틈은 없을 것 같다."
    },

    e_solo: {
      title: "광대의 길",
      kicker: "Normal Ending",
      sprite: "",
      text: "나는 결국 아무도 고르지 못했다.\n대신 거울 앞에 서서, 빨간 코를 코끝에 꾹 눌러 붙였다.\n\n\"셋 중에 고를 바에는… 제가 제일 웃긴 삐에로가 되면 되잖아요?\"\n\n연애 대신 커리어를 택한 밤이었다.\n남자 셋이 조금 서운해 보였다."
    },

    e_chaos: {
      title: "빨간 코 대난투",
      kicker: "Chaos Ending",
      sprite: "",
      text: "셋 다 너무 잘해줬다. 그게 문제였다.\n\n삐돌은 조화를, 삐노는 의미심장한 눈빛을, 삐용은 재주넘기를 동시에 시전했고\n나는 끝내 아무것도 정하지 못했다.\n\n삐에로 셋이 무대 한복판에서 서로를 밀치며 즉흥 배틀을 시작했다.\n관객이 몰렸다. 티켓이 매진됐다.\n\n…전석 매진의 서커스단이 그렇게 탄생했다."
    },

    e_boss: {
      title: "단장 승계",
      kicker: "Secret Ending",
      sprite: "",
      text: "\"너희 셋 다, 나한테 잘 보이려고 그렇게 애쓴 거였어?\"\n\n나는 빨간 코 세 개를 나란히 세워두고 계약서를 내밀었다.\n\"그럼 이제부터 이 단, 내가 맡을게.\"\n\n연애보다 이쪽이 훨씬 재밌을 것 같았다.\n— 신입, 단장이 되다."
    }
  },

  /* ------------------------------------------------------------------ *
   *  resolveEnding(affection, finalPick)
   *  ※ 분기 로직. 수정하지 말 것.
   * ------------------------------------------------------------------ */
  resolveEnding: function (aff, finalPick) {
    var GOOD = 6;   // 굿엔딩 임계치
    var vals = [aff.bbidol, aff.noir, aff.ppyong];
    var top = Math.max(vals[0], vals[1], vals[2]);
    var overCount = vals.filter(function (v) { return v >= GOOD; }).length;

    // 시크릿: 셋 다 아주 낮은데(대충 플레이) 최종 "모르겠어" → 단장 승계
    if (!finalPick && top <= 1) return "e_boss";

    // 카오스: 두 명 이상이 임계치를 넘어섰을 때
    if (overCount >= 2) return "e_chaos";

    // 굿엔딩: 최종 선택한 캐릭터가 임계치를 넘겼을 때
    if (finalPick && aff[finalPick] >= GOOD) {
      if (finalPick === "bbidol") return "e_bbidol";
      if (finalPick === "noir")   return "e_noir";
      if (finalPick === "ppyong") return "e_ppyong";
    }

    // 임계치엔 못 미쳤지만 확실한 1위가 있으면 그 캐릭터 굿엔딩으로 구제
    if (top >= GOOD - 1) {
      if (aff.bbidol === top) return "e_bbidol";
      if (aff.noir === top)   return "e_noir";
      if (aff.ppyong === top) return "e_ppyong";
    }

    // 그 외: 솔로(광대의 길)
    return "e_solo";
  }
};
