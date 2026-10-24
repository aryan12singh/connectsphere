// Current published details read through the source services on every request.
export default defineEventHandler(async event=>{
  await requireUserSession(event)
  throw createError({statusCode:405,statusMessage:'Manual Event syncing is retired. Current Event details update automatically.'})
})
