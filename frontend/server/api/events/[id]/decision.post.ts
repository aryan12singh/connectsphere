import { requestCall, requestPath, writeOptions, browserRecord } from '../../../utils/eventBff'
export default defineEventHandler(async(event)=>{
 const {body,headers}=await writeOptions(event)
 const actions:Record<string,string>={approve:'APPROVE',reject:'REJECT',amendments:'RETURN'}
 const action=typeof body.decision === 'string'?actions[body.decision]:body.action
 return browserRecord(await requestCall(event,requestPath(event)+'/decision',{method:'POST',body:{action,text:body.notes ?? body.text,version:body.version},headers}))
})
