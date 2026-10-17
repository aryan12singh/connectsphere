// Explicit Booking RPC adapter for isolated Venue-owned persistence tests.
// It forwards the real private Venue handler and exact operation identity;
// cross-service locks/Safety invalidation are exercised in the separate live suite.
function mountMaintenanceForwarder(app,venueBase){
 app.put('/internal/venue-maintenance/:id',async(req,res)=>{
  const base=typeof venueBase==='function'?venueBase():venueBase;
  const response=await fetch(base+'/internal/venues/'+encodeURIComponent(req.params.id)+'/maintenance',{method:'PUT',headers:{'content-type':'application/json','x-internal-api-key':'change-me-dev-internal-key'},body:JSON.stringify(req.body)});
  return res.status(response.status).json(await response.json());
 });
}
module.exports={mountMaintenanceForwarder};
