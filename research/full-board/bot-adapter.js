// Load the preserved policy unchanged. Only the initial-state injection is added for conditional diagnostics.
const {E,flipOrients,pickWithBudget}=require('../../harness'),{baselineFile,sha}=require('./common');
const original=baselineFile('before-bots.js');
const code=original.replace('function run(rules, seed, maxTurns, depth, trace, observe) {','function run(rules, seed, maxTurns, depth, trace, observe, initial) {')
 .replace("const S = E.newState('endless', seed, rules);","const S = initial ? clone(initial) : E.newState('endless', seed, rules);");
if(code===original||!code.includes('initial ? clone(initial)'))throw Error('Unsupported bot adapter source');
const moduleBox={exports:{}};new Function('require','module','exports',code)(name=>{if(name!=='../../harness')throw Error('Unexpected bot dependency '+name);return{E,flipOrients,pickWithBudget};},moduleBox,moduleBox.exports);
module.exports={...moduleBox.exports,policySha256:sha(original),adapterSha256:sha(code)};
