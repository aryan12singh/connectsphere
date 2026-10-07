import { requestCall, requestPath, browserRecord } from '../../utils/eventBff'
export default defineEventHandler(async(event)=>browserRecord(await requestCall(event,requestPath(event))))
