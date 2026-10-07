import { requestCall, requestPath, writeOptions, browserRecord } from '../../utils/eventBff'
export default defineEventHandler(async(event)=>{
 const {body,headers}=await writeOptions(event)
 // Explicit thin legacy adapter; status comes from the service, never cookie/body.
 const action=body.action === 'resubmit' ? '/resubmit' : body.submit === true ? '/submit' : ''
 const payload={...body};delete payload.submit;delete payload.action
 return browserRecord(await requestCall(event,requestPath(event)+action,{method:action?'POST':'PUT',body:payload,headers}))
})
