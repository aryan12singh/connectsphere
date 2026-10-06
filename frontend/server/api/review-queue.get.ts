import { requestCall, browserRecord } from '../utils/eventBff'
export default defineEventHandler(async(event)=>{
 const result=await requestCall<{items:Record<string,unknown>[]}>(event,'/event-requests/review-queue')
 return {requests:result.items.map(r=>({...browserRecord(r),title:r.eventName,organiser:r.organiser}))}
})
