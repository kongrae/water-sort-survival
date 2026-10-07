const { E, summarize } = require('./harness.js');
const D = E.DEFAULT_RULES;
const N = 40, MAX = 400;
const variants = {
  'default': {},
  'zen c5 no-ramp': { startColors: 5, maxColors: 5, colorEvery: 0 },
  'zen c4 no-ramp': { startColors: 4, maxColors: 4, colorEvery: 0 },
  'twist 7 bottles': { bottles: 7 },
  'twist cap5': { cap: 5 },
  'twist piece1-3': { pieceMax: 3 },
  'twist automerge': { autoMerge: true },
  'twist pourLimit2': { pourLimit: 2 },
  'twist ramp10': { colorEvery: 10 },
  'twist ramp30 max7': { colorEvery: 30, maxColors: 7 },
  'twist 5 bottles': { bottles: 5 },
  'twist piece2-2': { pieceMin: 2, pieceMax: 2 },
};
for (const [k, v] of Object.entries(variants)) summarize(k, { ...D, ...v }, N, MAX);
