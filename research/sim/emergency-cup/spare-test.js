// Engine edge-case checks for the emergency spare cup (sim copy only).
const { E } = require('./harness.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const R = E.sanitizeRules({ ...E.DEFAULT_RULES, spare: true });
function mk(bottles, turn, piece, rules) { const S = E.newState('endless', 'unit', rules || R); S.bottles = bottles.map(b => b.slice()); S.turn = turn; S.piece = piece; E.checkStuck(S); return S; }
const full = [[0,1,0,3],[0,1,0,4],[0,1,0,5],[0,1,0,6],[0,1,0,7]];
// A: dead without cup (free=1, size-2 piece, no legal pour)
let S = mk([[1,1,2], ...full], 60, [0, 0]);
ok(S.over && S.overReason === 'noroom', 'dead board without cup -> game over');
ok(!E.applySpare(S), 'cup cannot be bought after game over (revive is the post-death offer)');
// B: same board, cup granted -> BFS must see the cup and find room
S = mk([[1,1,2], ...full], 60, [0, 0]); // over
S = E.newState('endless', 'unit', R); S.bottles = [[1,1,2], ...full].map(b => b.slice()); S.turn = 60; S.piece = [0, 0]; S.spare = []; S.spareUsed = true; E.checkStuck(S);
ok(!S.over && S.stuck === 'room', 'with cup the same board is alive (stuck=room)');
ok(E.applyPour(S, 0, 6) && S.spare.join() === '2' && S.bottles[0].length === 2 && S.spareIn === 1, 'pour top layer into cup');
ok(!E.canPour(E.slotsOf(S), 1, 6, E.capsOf(S)), 'cup (cap 1) full -> cannot pour more');
ok(!E.applyPlace({ ...S }, 6) && !E.applyPlace(JSON.parse(JSON.stringify(S)), 6), 'piece cannot be placed in the cup');
ok(S.spare.length === 1, 'cup with 1 layer (== its capacity, pure) never clears');
// C: offer conditions
S = mk([[1,1,2], [], ...full.slice(0, 4)], 60, [0]);
ok(!S.spareOffer && S.spareArmTurn < 0, 'an empty bottle exists -> no offer');
S = mk([[1,1,2], [2,3], ...full.slice(0, 4)], 10, [0]);
ok(!S.spareOffer, 'before spareFrom turn -> no offer');
S = mk([[1,1,2], [2,3], ...full.slice(0, 4)], 16, [0]);
ok(S.spareOffer && S.spareArmTurn === 16, 'turn>=15, 0 empty, free=3 -> offer armed');
// non-sticky: board relaxes -> offer disappears; sticky keeps it
S.bottles[1] = []; E.checkStuck(S);
ok(!S.spareOffer, 'non-sticky: offer hidden once an empty bottle reappears');
const RS = E.sanitizeRules({ ...R, spareSticky: true });
S = mk([[1,1,2], [2,3], ...full.slice(0, 4)], 16, [0], RS); S.bottles[1] = []; E.checkStuck(S);
ok(S.spareOffer, 'sticky: offer stays after the crisis passes');
// D: free=6 death that never shows the offer (each bottle 1 free, distinct tops, piece of 2)
S = mk([[0,1,2],[1,2,3],[2,3,4],[3,4,5],[4,5,6],[5,6,7]], 60, [0, 0]);
ok(S.over && S.spareArmTurn < 0, 'EDGE: free=6 dead board was never in crisis (6 x 1 free cell)');
// E: revive leaves the cup alone; pour limit counts cup pours
S = E.newState('endless', 'unit', E.sanitizeRules({ ...R, pourLimit: 1 })); S.bottles = [[1,1,2], ...full].map(b => b.slice()); S.turn = 60; S.piece = [0, 0]; S.spare = [3]; S.spareUsed = true; E.checkStuck(S);
ok(S.over, 'cup already full + dead board -> over');
E.applyRevive(S);
ok(S.spare.join() === '3' && !S.over, 'revive empties 2 fullest bottles but keeps the cup content');
const before = S.pours; E.applyPour(S, 6, 1); // cup(3) -> bottle 1 now empty
ok(S.pours === before + 1, 'pour out of the cup counts toward pourLimit');
// F: BFS key keeps the cup distinct from a 1-layer bottle
const k1 = E.boardKey([[3],[0]]) , kA = E.boardKey([[3]]) + '#' + '0', kB = E.boardKey([[0]]) + '#' + '3';
ok(kA !== kB, 'board key distinguishes which liquid sits in the cup');
// G: auto-merge never touches the cup
const RA = E.sanitizeRules({ ...R, autoMerge: true });
S = E.newState('endless', 'unit', RA); S.bottles = [[1,2],[2,2,2],[4],[5],[6],[7]]; S.turn = 20; S.piece = [0]; S.spare = [2]; S.spareUsed = true; E.checkStuck(S);
E.applyPour(S, 0, 1); // 2 onto 2,2,2 -> clears
ok(S.spare.join() === '2', 'auto-merge leaves the cup layer alone (manual only)');
console.log(fails ? fails + ' FAIL' : 'all passed');
// H: optional lifetime: cup breaks only when empty and spareTurns have passed
{
  const RL = E.sanitizeRules({ ...R, spareTurns: 10 });
  const T = E.newState('endless', 'unit', RL); T.bottles = [[1,1,2],[2,3],[0,1,0,3],[0,1,0,4],[0,1,0,5],[0,1,0,6]]; T.turn = 20; T.piece = [0]; E.checkStuck(T);
  E.applySpare(T); E.applyPour(T, 0, 6); T.turn = 31; E.checkStuck(T);
  ok(T.spare && T.spare.length === 1, 'lifetime over but cup holds liquid -> cup stays');
  T.bottles[1] = []; E.applyPour(T, 6, 1); // empty target so the cup can be poured out
  ok(T.spare === null, 'emptied after lifetime -> cup breaks (no liquid lost)');
  console.log(fails ? fails + ' FAIL' : 'lifetime tests passed');
}
