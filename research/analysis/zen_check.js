const { summarize } = require('./harness.js');
const base = { bottles: 6, cap: 4, maxColors: 8, colorEvery: 0, pieceMin: 1, pieceMax: 2, preview: 2, pourLimit: 0 };
summarize('c4 merge off', { ...base, startColors: 4, autoMerge: false }, 20, 300);
summarize('c5 merge off', { ...base, startColors: 5, autoMerge: false }, 20, 300);
summarize('c5 merge on', { ...base, startColors: 5, autoMerge: true }, 20, 300);
