import {kongBffFetch,pathSegments,segmentPath} from '../../utils/kongBff'
export default defineEventHandler(async event=>{
 const segments=pathSegments(event)
 if(segments.length!==3||segments[1]!=='maintenance'||!['resume','cancel'].includes(segments[2]!))throw createError({statusCode:404,statusMessage:'Venue action not found'})
 return kongBffFetch(event,'/venues/'+segmentPath(segments),{method:'POST',body:await readBody(event)})
})
