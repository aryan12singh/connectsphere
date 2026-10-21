import { kongBffFetch } from '../../utils/kongBff'
export default defineEventHandler(async(event)=>{
 const me=await kongBffFetch<{user:{id:string,firstName:string,lastName:string,email:string}}>(event,'/auth/me')
 if(getRouterParam(event,'id')!==me.user.id)throw createError({statusCode:403,statusMessage:'Use the authorised request contact endpoint'})
 return {id:me.user.id,name:`${me.user.firstName} ${me.user.lastName}`,email:me.user.email}
})
