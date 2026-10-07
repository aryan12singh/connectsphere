import { requestCall, requestPath } from '../../../utils/eventBff'
export default defineEventHandler(async(event)=>requestCall(event,requestPath(event)+'/coordinator'))
