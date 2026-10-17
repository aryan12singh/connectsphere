// A PostgreSQL before-commit barrier proves the owner fence survives an RPC timeout.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {Pool}=require('../../services/event-service/node_modules/pg');
const {bookingNotificationSmoke}=require('./notification-live.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function maintenanceTimeout(){
 const compose=JSON.parse(fs.readFileSync(process.env.CSE2E_COMPOSE_FILE));assert.match(compose.name,/^csreview-aryan-ci-[a-z0-9-]+$/);
 return bookingNotificationSmoke({afterBooking:async f=>{
  const approved=await f.call('PUT',`/venue-bookings/${f.booking.id}/decision`,{version:1,status:'CONFIRMED',reason:'Maintenance fence acceptance'},f.staff.token);assert.equal(approved.status,200);
  const pool=new Pool({connectionString:`postgresql://connectsphere:connectsphere@127.0.0.1:${compose.services.postgres.ports[0].published}/venue_db`});
  const barrier=await pool.connect(),suffix=randomUUID().replaceAll('-',''),fn='review_barrier_'+suffix;
  const lock=String(100000000+Math.floor(Math.random()*100000000));let blocked;
  try{
   await barrier.query('SELECT pg_advisory_lock($1::bigint)',[lock]);
   await pool.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${f.venue.id}' AND NEW."emergencyAccess" IS DISTINCT FROM OLD."emergencyAccess" THEN PERFORM pg_advisory_xact_lock(${lock}::bigint); END IF; RETURN NEW; END $$`);
   await pool.query(`CREATE TRIGGER ${fn} BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
   const current=(await f.call('GET',`/venues/${f.venue.id}`,undefined,f.staff.token)).body;
   blocked=f.call('PUT',`/venues/${f.venue.id}`,{...current,emergencyAccess:'Timeout-barrier verified access correction',reason:'Actual before-commit recovery proof'},f.staff.token);
   let operation;
   for(let n=0;n<60;n++){
    const row=(await pool.query('SELECT maintenance FROM venues WHERE id=$1',[f.venue.id])).rows[0];operation=row.maintenance;
    if(operation?.status==='PENDING')break;await pause(100);
   }
   assert.equal(operation?.status,'PENDING','Owner fence must commit before downstream apply');
   const result=await blocked;assert.ok(result.status>=500,'The deliberately blocked remote apply must time out');
   const summary=await f.call('GET',`/venue-bookings/events/${f.eventId}/summary`,undefined,f.coordinator.token);
   assert.equal(summary.status,200);assert.equal(summary.body.venueReady,false,'An uncertain before-commit update must not expose old approved facts as ready');
   assert.ok(summary.body.outstanding.some(x=>x.reasons.includes('VENUE_MAINTENANCE_PENDING')));
   await barrier.query('SELECT pg_advisory_unlock($1::bigint)',[lock]);
   let final;
   for(let n=0;n<60;n++){final=(await pool.query('SELECT maintenance FROM venues WHERE id=$1',[f.venue.id])).rows[0].maintenance;if(final?.status==='COMPLETED')break;await pause(100);}
   assert.ok(['PENDING','COMPLETED'].includes(final.status),'Uncertain operations remain resumable; a timed-out transaction may roll back');assert.equal(final.id,operation.id);
   const resumed=await f.call('POST',`/venues/${f.venue.id}/maintenance/resume`,{operationId:operation.id},f.staff.token);assert.equal(resumed.status,200,JSON.stringify(resumed.body));
   const receipt=(await pool.query('SELECT maintenance,\"emergencyAccess\" FROM venues WHERE id=$1',[f.venue.id])).rows[0];assert.equal(receipt.maintenance.status,'COMPLETED');assert.equal(receipt.emergencyAccess,'Timeout-barrier verified access correction');
   const ready=await f.call('GET',`/venue-bookings/events/${f.eventId}/summary`,undefined,f.coordinator.token);assert.equal(ready.body.venueReady,true);
   return {maintenanceOperationId:operation.id,pendingBlockedReadiness:true,lateApplyCompleted:true,exactReplayStatus:resumed.status};
  }finally{
   await barrier.query('SELECT pg_advisory_unlock($1::bigint)',[lock]).catch(()=>{});await blocked?.catch(()=>{});
   await pool.query(`DROP TRIGGER IF EXISTS ${fn} ON venues`).catch(()=>{});await pool.query(`DROP FUNCTION IF EXISTS ${fn}()`).catch(()=>{});barrier.release();await pool.end();
  }
 }});
}
module.exports={maintenanceTimeout};
