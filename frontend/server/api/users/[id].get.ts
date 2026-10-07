import { requestCall } from '../../utils/eventBff'
export default defineEventHandler(async(event)=>{
 const me=await requestCall<{user:{id:string,firstName:string,lastName:string,email:string}}>(event,'/auth/me')
 if(getRouterParam(event,'id')!==me.user.id)throw createError({statusCode:403,statusMessage:'Use the authorised request contact endpoint'})
 return {id:me.user.id,name:`${me.user.firstName} ${me.user.lastName}`,email:me.user.email}
})
