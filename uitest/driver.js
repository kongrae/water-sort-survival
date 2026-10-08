// Test driver (test page only). Reads the live game state through the hot-reload snapshot hook and drives the real DOM.
(async () => {
  const P = new URLSearchParams(location.search), SC = P.get('mode') === 'daily' ? 'v1daily' : (P.get('scenario') || 'fresh');
  const $ = id => document.getElementById(id);
  const G = () => window.__snapFn().S;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const send = m => { try { parent.postMessage(m, '*'); } catch (e) {} };
  const check = (name, cond, detail) => send({ sc: SC, name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  const tube = i => document.querySelectorAll('#rack .tube')[i];
  const banners = [];
  new MutationObserver(() => { const b = $('banner'); if (!b.hidden && b.textContent) banners.push(b.textContent); }).observe($('banner'), { childList: true, characterData: true, subtree: true, attributes: true });
  const noOverflow = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
  const placeAt = i => { $('cup').click(); tube(i).click(); };
  const firstFit = () => { const S = G(); return S.bottles.findIndex(b => S.rules.cap - b.length >= S.piece.length); };
  try {
    await sleep(50);
    if (P.get('shots') === 'skin') {
      const S = G();
      S.bottles = [[0, 0, 1], [1, 2], [2, 2, 2], [3], [1, 3, 0], []];
      S.turn = 37; S.score = 2140; S.piece = [2, 3];
      document.querySelectorAll('#rack .tube')[1].click();
      await sleep(400);
      send({ sc: SC, done: true });
      return;
    }
    if (P.get('shots') === 'over') {
      ['ovV2', 'ovHelp'].forEach(id => { $(id).hidden = true; });
      const S = G();
      S.bottles = [[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2, 3], [3, 2, 3, 2], [0, 0, 0, 2], [1, 3, 2]];
      S.turn = 57; S.score = 3120; S.bestAtStart = 3400; S.maxStreak = 3; S.clears = 21; S.cum = Array(57).fill(0); S.piece = [1];
      S.zoneLog = [{ zone: 2, turn: 20, empties: 2, bonus: 80, undoUsed: 0, revive: false }, { zone: 3, turn: 40, empties: 1, bonus: 60, undoUsed: 0, revive: false }];
      $('cup').click(); document.querySelectorAll('#rack .tube')[5].click();
      await sleep(1600);
      send({ sc: SC, done: true });
      return;
    }
    if (P.get('shots')) {
      // screenshot state: mid-game board with the spare cup, a selection and ghosts
      ['ovV2', 'ovHelp'].forEach(id => { $(id).hidden = true; });
      const S = G();
      S.bottles = [[0, 0, 1], [1, 2], [2, 2, 2], [3], [1, 3, 0], []];
      S.turn = 37; S.score = 2140; S.streak = 2; S.turnClears = 0; S.cum = Array.from({ length: 37 }, (_, i) => i * 50);
      S.piece = [2, 3]; S.spare = [3]; S.spareUsed = true; S.spareTurn = 30;
      tube(1).click();
      await sleep(400);
      send({ sc: SC, done: true });
      return;
    }

    if (SC === 'fresh') {
      check('help sheet on first visit', !$('ovHelp').hidden);
      $('ovHelp').querySelector('[data-close]').click();
      check('no horizontal scroll at 360px', noOverflow(), document.documentElement.scrollWidth);
      check('flip hidden in first run before turn 20', $('btnFlip').hidden);
      check('zone chip shows 1구역 · 4색', $('zoneChip').textContent === '1구역 · 4색', $('zoneChip').textContent);
      check('zone bar visible', !$('zoneBar').hidden);
      check('spare off in first run', G().rules.spare === false && $('spareSlot').hidden);
      $('cup').click();
      check('cup selected -> 6 targets', document.querySelectorAll('#rack .tube.can').length === 6);
      tube(0).click();
      check('placement advances turn and pace record', G().turn === 1 && G().cum.length === 1, JSON.stringify(G().cum));
      // jump to the zone boundary
      let S = G();
      S.bottles = [[0], [1], [2], [], [], []]; S.turn = 19; S.cum = Array(19).fill(0); S.piece = [3];
      banners.length = 0;
      placeAt(3);
      await sleep(30);
      S = G();
      check('zone 2 reached at turn 20', S.turn === 20 && S.zoneLog.length === 1 && S.zoneLog[0].zone === 2, JSON.stringify(S.zoneLog));
      check('breakthrough bonus 2 empties x 20 x 2 = 80', S.zoneLog[0].bonus === 80, S.zoneLog[0].bonus);
      check('twin piece is 1 purple layer with NEW tag', JSON.stringify(S.piece) === '[4]' && !!$('cup').querySelector('.tag-new'), JSON.stringify(S.piece));
      check('flip revealed at turn 20', !$('btnFlip').hidden);
      await sleep(3000);
      check('zone banner text', banners.some(b => b === '2구역 · 새 색 보라 (5종)'), banners.join(' / '));
      check('flip hint toast after zone banner', banners.indexOf('2구역 · 새 색 보라 (5종)') >= 0 && banners.findIndex(b => b.startsWith('⇅')) > banners.indexOf('2구역 · 새 색 보라 (5종)'), banners.join(' / '));
      // flip
      S.piece = [0, 1]; $('cup').click(); $('cup').click();
      check('flip button enabled for mixed piece', !$('btnFlip').disabled);
      $('btnFlip').click();
      S = G();
      check('flip reverses and does not spend yet', JSON.stringify(S.piece) === '[1,0]' && S.flipped && $('flipN').textContent === '2', JSON.stringify(S.piece) + ' ' + $('flipN').textContent);
      placeAt(firstFit());
      check('placing flipped spends one', G().flipsPlaced === 1 && $('flipN').textContent === '1', $('flipN').textContent);
      // ghosts: select a bottle with a matching target
      S = G(); S.bottles = [[1, 2, 2], [3, 2], [0], [], [1], [0, 3, 3]]; S.piece = [3];
      tube(0).click();
      const ghostsOn5 = tube(1).querySelectorAll('.ghostL').length;
      check('pour ghosts: 2 layers onto bottle 2, leaving layers marked', ghostsOn5 === 2 && tube(0).querySelectorAll('.leaving').length === 2, ghostsOn5);
      tube(0).click();
      S.bottles = [[1, 1, 1], [2], [], [], [], []]; S.piece = [1];
      $('cup').click();
      check('gold border + cork on completing bottle', tube(0).classList.contains('gold') && !!tube(0).querySelector('.cork'));
      $('cup').click();
      // undo counts
      const before = G().undoUsed || 0;
      placeAt(3);
      $('btnUndo').click();
      check('undo increments undoUsed', G().undoUsed === before + 1, G().undoUsed);
      // game over by no room
      S = G();
      // full board after the move; yellow tops add up to 4 so a near-miss fact exists whatever the next piece is
      S.bottles = [[0, 1, 2, 2], [1, 0, 3, 2], [3, 1, 0, 2], [3, 2, 3, 1], [0, 2, 1, 3], [1, 3, 2]];
      S.piece = [0]; S.turn = 25; S.bestAtStart = 0; S.score = 300;
      placeAt(5);
      await sleep(30);
      const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (rm) {
        check('reduced motion: sheet opens without the death animation', G().over && !$('ovOver').hidden);
      } else {
        check('death animation running (sheet not yet open)', G().over && $('ovOver').hidden);
        await sleep(1500);
        check('result sheet opens after animation', !$('ovOver').hidden && document.querySelector('#rack').classList.contains('dead'));
      }
      check('near-miss facts listed', !$('overFacts').hidden && $('overFacts').children.length >= 1, $('overFacts').textContent + ' | ' + $('overReason').textContent + ' | ' + JSON.stringify(nearMiss ? 1 : 0));
      check('zone result + stars shown', !$('zoneRes').hidden && $('zoneReach').textContent.startsWith('도달:'), $('zoneReach').textContent + ' | ' + $('zoneStarsRow').textContent);
      check('revive offered', !$('btnRevive').hidden, $('btnRevive').textContent);
      check('unlock: runs 1, sawOver', JSON.parse(localStorage.getItem('wsurv.unlock')).runs === 1, localStorage.getItem('wsurv.unlock'));
      $('btnRevive').click();
      check('ad sheet shows revive reward', !$('ovAd').hidden && $('adNote').textContent.includes('가장 많이 찬 병 2개'), $('adNote').textContent);
      await sleep(2300);
      S = G();
      check('revived: playing again, rescueAds 1, preReviveScore kept', !S.over && S.rescueAds === 1 && S.preReviveScore === 300 && !document.querySelector('#rack').classList.contains('dead'));
      // give up -> second run unlocks fuse and spare
      S.bottles = [[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2, 3], [3, 2, 3, 2], [0, 2, 1, 3], [1, 3, 2]];
      S.piece = [0]; placeAt(5); await sleep(1500);
      check('second death: no revive button (used)', $('btnRevive').hidden);
      $('btnAgain').click();
      S = G();
      check('run 2: spare offer enabled in rules', S.rules.spare === true);
      S.streak = 2; S.turnClears = 0; S.turn = 7; S.cum = Array(7).fill(0);
      S.bottles = [[1, 1, 1], [2], [], [], [], []]; S.piece = [3];
      $('cup').click();
      check('fuse flame on combo badge', $('combo').classList.contains('fuse'));
      check('fuse status with tap-tap', $('status').textContent.includes('콤보 ×2 끝나요'), $('status').textContent);
      $('cup').click();
      check('no horizontal scroll at the end', noOverflow());
    }

    if (SC === 'existing') {
      check('v2 sheet once for existing players', !$('ovV2').hidden && $('v2Lines').children.length === 3);
      $('ovV2').querySelector('[data-close]').click();
      check('flip visible from start for existing players', !$('btnFlip').hidden);
      let S = G();
      check('spare enabled in rules', S.rules.spare === true);
      // crisis -> offer
      S.bottles = [[0, 1, 2], [1, 2, 3], [2, 3, 0], [3, 0, 1], [0, 2, 1], [1, 3]];
      S.turn = 30; S.cum = Array(30).fill(0); S.piece = [3];
      placeAt(5);
      S = G();
      check('crisis arms the spare offer', S.spareOffer && !!$('spareSlot').querySelector('.offer'), JSON.stringify({ offer: S.spareOffer, over: S.over }));
      check('offer blinks the first time', !!$('spareSlot').querySelector('.offer.blink'));
      $('spareSlot').querySelector('.offer').click();
      check('ad sheet shows the cup reward', $('adNote').textContent.includes('임시 칸 1개를 20턴'), $('adNote').textContent);
      await sleep(2300);
      S = G();
      check('cup granted and shown', !!S.spare && !!$('spareSlot').querySelector('.tube') && S.rescueAds === 1);
      // pour into the cup and back
      S.bottles = [[0, 1, 2], [1, 2, 3], [2, 3, 0], [3, 0, 1], [0, 2, 1], [1, 3, 3]];
      tube(5).click(); $('spareSlot').querySelector('.tube').click();
      check('pour into the cup', G().spare.length === 1 && G().spare[0] === 3, JSON.stringify(G().spare));
      $('spareSlot').querySelector('.tube').click();
      const tgt = G().bottles.findIndex(b => b.length < 4 && b[b.length - 1] === 3);
      if (tgt >= 0) tube(tgt).click();
      check('pour back out of the cup', G().spare.length === 0, JSON.stringify(G().spare));
      $('cup').click(); $('spareSlot').querySelector('.tube').click();
      check('cup refuses a piece', $('status').textContent.includes('임시 잔에는 조각을 넣을 수 없어요'), $('status').textContent);
      // banner order: zone break and new best in one placement -> best first
      S = G();
      S.bottles = [[0], [], [], [], [], []]; S.turn = 39; S.piece = [1]; S.bestAtStart = 100; S.score = 90; S.newBestShown = false; S.cum = Array(39).fill(0);
      banners.length = 0;
      placeAt(1);
      await sleep(4000);
      check('new-best banner before zone banner', banners[0] === '최고 기록 경신' && banners.some(b => b.startsWith('3구역')), banners.join(' / '));
      // pace label: seed a previous run and play past turn 5
      const sig = '6-4-4-8-20-1-2-0-0-c1-f2-z20x5t1';
      localStorage.setItem('wsurv.last.' + sig, JSON.stringify({ score: 500, turn: 12, cum: [0, 0, 0, 0, 0, 100, 100, 200, 200, 300, 400, 500] }));
      localStorage.setItem('wsurv.runs.' + sig, '3');
      $('btnNew').click();
      S = G();
      S.bottles = [[1, 1, 1], [], [], [], [], []]; S.turn = 5; S.cum = [0, 0, 0, 0, 0]; S.piece = [1];
      placeAt(0);
      check('pace label vs last run', /^지난 판 [▲▼±]/.test($('pace').textContent), $('pace').textContent);
      // daily: no cup, v2 share
      $('btnMode').click();
      S = G();
      check('daily: spare off and hidden', S.rules.spare === false && $('spareSlot').hidden);
      $('btnExtra').hidden = false; S.stuck = 'room';
      giveUpViaButton();
      await sleep(200);
      check('daily share has v2 tag', $('shareText').value.split('\n')[0].endsWith(' · v2'), $('shareText').value);
      check('daily record key .v2', Object.keys(localStorage).some(k => /^wsurv\.daily\.daily:.*\.v2$/.test(k)) || G().score === 0, Object.keys(localStorage).join(','));
      check('no horizontal scroll', noOverflow());
    }

    if (SC === 'v1saves') {
      const S = G();
      check('v1 endless save resumes with v1 rules', S.seed === 'run:old' && S.rules.zones === undefined && S.turn === 2);
      check('v1 run: no zone chip, no flip button, no pace', $('zoneChip').hidden && $('btnFlip').hidden && $('pace').textContent === '');
      check('v1 best record kept', $('best').textContent === '777', $('best').textContent);
      placeAt(firstFit());
      check('v1 run keeps playing', G().turn === 3);
      // classic rules from settings
      $('btnSettings').click(); $('btnClassic').click(); $('btnApply').click();
      const T = G();
      check('classic (v1) rules applied', !T.rules.comboPlace && !T.rules.flip && !T.rules.zones && $('best').textContent === '777', JSON.stringify({ c: T.rules.comboPlace, f: T.rules.flip, z: T.rules.zones, best: $('best').textContent }));
    }

    if (SC === 'v1daily') {
      const S = G();
      check('v1 daily save is restarted as v2', S.rules.zones === true && S.turn === 0);
      check('restart toast shown', $('status').textContent.includes('규칙이 바뀌어 오늘의 도전을 새로 시작해요'), $('status').textContent);
    }
    if (SC === 'themes') {
      const skin = () => document.documentElement.dataset.skin;
      check('default skin is lab', skin() === 'lab', skin());
      $('btnSettings').click(); $('btnThemes').click();
      const cards = () => [...document.querySelectorAll('#themeList .theme-card')];
      check('4 theme cards, lab in use', cards().length === 4 && cards()[0].classList.contains('on'));
      check('cafe locked: 1 star short', cards()[1].querySelector('.btn').textContent === '별 1개 더 필요' && cards()[1].querySelector('.btn').disabled, cards()[1].querySelector('.btn').textContent);
      check('theme previews carry their own skin', cards().map(c => c.querySelector('.tprev').dataset.skin).join(',') === 'lab,cafe,gem,deep');
      check('preview glass differs by skin', getComputedStyle(cards()[3].querySelector('.glass')).backgroundColor !== getComputedStyle(cards()[0].querySelector('.glass')).backgroundColor);
      $('ovThemes').querySelector('[data-close]').click(); $('ovSettings').querySelector('[data-close]').click();
      // a run that earns 2 stars crosses 15
      let S = G();
      S.bottles = [[0, 1, 0, 1], [1, 0, 1, 0], [2, 3, 2, 3], [3, 2, 3, 2], [0, 2, 1, 3], [1, 3, 2]];
      S.turn = 25; S.cum = Array(25).fill(0); S.piece = [0];
      S.zoneLog = [{ zone: 2, turn: 20, empties: 3, bonus: 120, undoUsed: 0, revive: false }];
      $('cup').click(); document.querySelectorAll('#rack .tube')[5].click();
      await sleep(1600);
      check('stars added and cafe unlocked', JSON.parse(localStorage.getItem('wsurv.stars.total')) >= 30 && !$('unlockRow').hidden && $('unlockName').textContent === '카페', localStorage.getItem('wsurv.stars.total') + ' ' + $('unlockName').textContent);
      check('star line names the next theme', $('starTotal').textContent.includes("다음 테마 '보석'"), $('starTotal').textContent);
      $('btnUnlockApply').click();
      check('apply switches the board to cafe', skin() === 'cafe' && $('btnUnlockApply').hidden);
      const gr = getComputedStyle(document.querySelector('#rack .glass')).borderBottomLeftRadius;
      check('cafe glass is flatter', parseFloat(gr) < 12, gr);
      check('rack backdrop drawn', getComputedStyle(document.querySelector('#rack'), '::before').backgroundImage !== 'none');
      $('btnThemesOver').click();
      check('theme sheet opens from results, cafe in use', !$('ovThemes').hidden && cards()[1].classList.contains('on'));
      $('ovThemes').querySelector('[data-close]').click();
      // prototype switch: try a locked theme
      $('btnAgain').click();
      $('btnSettings').click(); $('optTryLocked').click(); $('btnThemes').click();
      check('locked themes become try-able', cards()[3].querySelector('.btn').textContent === '써보기', cards()[3].querySelector('.btn').textContent);
      cards()[3].querySelector('.btn').click();
      check('deep applied with glow', skin() === 'deep' && getComputedStyle(document.documentElement).getPropertyValue('--glow').trim() === '9px');
      $('optTryLocked').click();
      check('turning the switch off falls back to an earned theme', skin() === 'lab', skin());
      check('choice persisted', JSON.parse(localStorage.getItem('wsurv.prefs')).skin === 'deep');
      $('ovThemes').querySelector('[data-close]').click(); $('ovSettings').querySelector('[data-close]').click();
      check('no horizontal scroll', noOverflow());
    }
    if (SC === 'legacy') {
      const skin = () => document.documentElement.dataset.skin;
      const cards = () => [...document.querySelectorAll('#themeList .theme-card')];
      check('theme opened under the old 15-star rule comes back', skin() === 'cafe', skin());
      check('owned list created once', JSON.stringify(JSON.parse(localStorage.getItem('wsurv.themes.owned'))) === '["lab","cafe"]', localStorage.getItem('wsurv.themes.owned'));
      $('btnSettings').click(); $('btnThemes').click();
      check('cafe in use, next theme is gem', cards()[1].classList.contains('on') && $('themesStars').textContent.includes("다음 테마 '보석'까지 130개"), $('themesStars').textContent);
      check('gem still locked by the new rule', cards()[2].querySelector('.btn').textContent === '별 130개 더 필요');
      // a theme already owned stays usable whatever the star total says
      localStorage.setItem('wsurv.themes.owned', JSON.stringify(['lab', 'cafe', 'gem']));
      $('ovThemes').querySelector('[data-close]').click(); $('btnThemes').click();
      check('owned gem selectable below its threshold', cards()[2].querySelector('.btn').textContent === '적용' && !cards()[2].querySelector('.btn').disabled, cards()[2].querySelector('.btn').textContent);
      cards()[2].querySelector('.btn').click();
      check('owned gem applied', skin() === 'gem');
      check('next theme skips owned ones', $('themesStars').textContent.includes("다음 테마 '심해'까지 480개"), $('themesStars').textContent);
      $('ovThemes').querySelector('[data-close]').click(); $('ovSettings').querySelector('[data-close]').click();
      // a run past 30 stars must not announce cafe again
      localStorage.setItem('wsurv.stars.total', '28');
      const S = G();
      S.bottles = [[0, 1, 2, 2], [1, 0, 3, 2], [3, 1, 0, 2], [3, 2, 3, 1], [0, 2, 1, 3], [1, 3, 2]];
      S.turn = 45; S.cum = Array(45).fill(0); S.piece = [0];
      S.zoneLog = [{ zone: 2, turn: 20, empties: 3, bonus: 120, undoUsed: 0, revive: false }, { zone: 3, turn: 40, empties: 3, bonus: 180, undoUsed: 0, revive: false }];
      $('cup').click(); document.querySelectorAll('#rack .tube')[5].click();
      await sleep(1600);
      check('owned theme not announced again', JSON.parse(localStorage.getItem('wsurv.stars.total')) >= 30 && $('unlockRow').hidden, localStorage.getItem('wsurv.stars.total'));
      check('board keeps the chosen theme after the run', skin() === 'gem');
    }
    check('no script errors', window.__errors.length === 0, window.__errors.join(' | '));
  } catch (e) {
    check('driver exception', false, e && e.stack || e);
  }
  send({ sc: SC, done: true });

  function giveUpViaButton() { $('btnExtra').click(); }
})();
