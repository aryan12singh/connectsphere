const config=require('./config');
const {fail}=require('./domain/validation');
const ROLES=['EVENT_ORGANISER','EVENT_COORDINATOR','VENUE_STAFF','TECHNICAL_SUPPORT_STAFF','ATTENDEE'];
function rolesOf(user){const source=Array.isArray(user.roles)?user.roles:[user.role];return [...new Set(source.filter(r=>ROLES.includes(r)))];}
async function internal(url,path,body){
 let r;try{r=await fetch(url+path,{method:body?'POST':'GET',headers:{'x-internal-api-key':config.internalApiKey,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});}catch{throw fail(503,'DEPENDENCY_UNAVAILABLE','A required service is unavailable. Please retry.');}
 if(r.status===401)return null;if(!r.ok)throw fail(503,'DEPENDENCY_UNAVAILABLE','A required service is unavailable. Please retry.');
 try{return await r.json();}catch{throw fail(503,'DEPENDENCY_UNAVAILABLE','A required service returned an invalid response');}
}
async function authenticate(req,res,next){
 try{
  const token=/^Bearer (\S+)$/.exec(req.get('authorization')||'')?.[1];if(!token)throw fail(401,'UNAUTHENTICATED','Not logged in or session has expired');
  const verified=await internal(config.authServiceUrl,'/internal/sessions/validate',{token});if(!verified?.valid||typeof verified.user?.id!=='string'||verified.user.isActive===false)throw fail(401,'UNAUTHENTICATED','Not logged in or session has expired');
  req.actor={...verified.user,organisationId:typeof verified.user.organisationId==='string'&&verified.user.organisationId?verified.user.organisationId:null,roles:rolesOf(verified.user)};if(!req.actor.roles.length)throw fail(403,'FORBIDDEN','Account has no recognised role');next();
 }catch(e){next(e);}
}
async function coordinators(){const result=await internal(config.userServiceUrl,'/internal/coordinators');if(!Array.isArray(result?.coordinators)||result.coordinators.some(c=>typeof c.id!=='string'||isNaN(Date.parse(c.createdAt))))throw fail(503,'DEPENDENCY_UNAVAILABLE','Coordinator directory unavailable');return result.coordinators;}
async function contact(id){const result=await internal(config.userServiceUrl,`/internal/users/${encodeURIComponent(id)}`);if(!result?.id)throw fail(503,'DEPENDENCY_UNAVAILABLE','Contact information unavailable');return {id:result.id,name:[result.firstName,result.lastName].filter(Boolean).join(' '),email:result.email,company:result.company};}
module.exports={authenticate,rolesOf,coordinators,contact};
