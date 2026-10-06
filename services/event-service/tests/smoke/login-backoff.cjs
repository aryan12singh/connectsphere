// Authentication setup only. Workflow assertions and writes are never retried.
async function loginWithBackoff(request, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request();
    if (response.status !== 429 || attempt === 2) return response;
    const seconds = Math.min(60, Math.max(1, Number(response.headers.get('retry-after')) || 60));
    await sleep(seconds * 1000);
  }
}
module.exports = { loginWithBackoff };
