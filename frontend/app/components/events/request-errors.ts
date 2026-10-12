export function fieldErrors(caught:unknown):Record<string,string[]> {
 const e=caught as any
 return e?.data?.data?.error?.fields ?? e?.data?.error?.fields ?? e?.error?.fields ?? {}
}
/** Keep a key across uncertain retries; changing the intent makes a new key. */
export function operationIntent() {
 let signature='', key=''
 return {keyFor(body:unknown){const next=JSON.stringify(body);if(next!==signature){signature=next;key=crypto.randomUUID()}return key},clear(){signature='';key=''}}
}
