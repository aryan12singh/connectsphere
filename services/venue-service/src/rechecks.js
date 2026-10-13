const config = require('./config');
const store = require('./store');
let running=false;
async function drain() {
  if (running) return;
  running=true;
  try {
    await store.enqueueInitialBufferRechecks();
    for(const row of await store.pendingRechecks()) {
      try {
        const response=await fetch(`${config.bookingServiceUrl}/internal/venue-rechecks`,{method:'POST',headers:{'content-type':'application/json','x-internal-api-key':config.internalApiKey},body:JSON.stringify({...row.payload,actionId:row.id}),signal:AbortSignal.timeout(5000)});
        if (!response.ok) throw new Error(`Booking recheck returned ${response.status}`);
        const result=await response.json();
        if (result.venueId!==row.venueId || !Number.isInteger(result.version) || result.version<row.version) throw new Error('Booking recheck returned invalid acknowledgement');
        await store.finishRecheck(row.id,null,row.queue);
      } catch(error) {await store.finishRecheck(row.id,error,row.queue);}
    }
  } finally {running=false;}
}
function start() {
  const timer=setInterval(()=>drain().catch(()=>{}),config.recheckPollMs);timer.unref();
  drain().catch(()=>{});
  return ()=>clearInterval(timer);
}
module.exports={drain,start};
