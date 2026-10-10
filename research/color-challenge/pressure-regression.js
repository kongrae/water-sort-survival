// Redirect the previous pressure suite's evidence; keep its historical results untouched.
const {write}=require('./common'),previous=require('../late-pressure/common');
previous.write=(name,data)=>write('pressure-'+name,data);
require('../late-pressure/engine-test');
