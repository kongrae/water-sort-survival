// Run previous feature contracts against the current engine, preserving historical evidence.
const {write}=require('./common');
const pressure=require('../late-pressure/common'),color=require('../color-challenge/common');
pressure.write=(name,data)=>write('pressure-'+name,data);
color.write=(name,data)=>write('color-'+name,data);
require('../late-pressure/engine-test');
require('../color-challenge/engine-test');
