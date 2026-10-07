const { E, summarize } = require('./harness.js');
const D = E.DEFAULT_RULES;
const cfgs = [
  ['cap4 b5 c5-8 p1-3 (cur)', { ...D }],
  ['cap4 b6 c4-7 p1-3', { ...D, bottles: 6, startColors: 4, maxColors: 7 }],
  ['cap4 b6 c4-7 p1-2', { ...D, bottles: 6, startColors: 4, maxColors: 7, pieceMax: 2 }],
  ['cap4 b6 c4-8 p1-2', { ...D, bottles: 6, startColors: 4, maxColors: 8, pieceMax: 2 }],
  ['cap4 b5 c4-7 p1-2', { ...D, bottles: 5, startColors: 4, maxColors: 7, pieceMax: 2 }],
  ['cap5 b6 c4-7 p1-3', { ...D, cap: 5, bottles: 6, startColors: 4, maxColors: 7 }],
  ['cap5 b6 c4-8 p1-3', { ...D, cap: 5, bottles: 6, startColors: 4, maxColors: 8 }],
  ['cap5 b5 c4-7 p1-3', { ...D, cap: 5, bottles: 5, startColors: 4, maxColors: 7 }],
];
for (const [label, r] of cfgs) summarize(label, r, 30, 300);
