async function restoreVenue({ start, probe, recreate, diagnose, pause = () => new Promise(resolve => setTimeout(resolve, 1000)), attempts = 20 }) {
  let last = 'not checked';
  async function ready() {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const result = await probe();
        last = JSON.stringify(result);
        if (result.direct === 200 && result.gateway === 401) return true;
      } catch (error) { last = error.message; }
      if (attempt + 1 < attempts) await pause();
    }
    return false;
  }

  try {
    await start();
    if (await ready()) return;
    throw Error(`Venue readiness failed: ${last}`);
  } catch (error) {
    let evidence;
    try { evidence = await diagnose(); } catch (diagnosticError) { evidence = `Diagnostics failed: ${diagnosticError.message}`; }
    let recovery;
    try {
      await recreate();
      recovery = await ready() ? 'service restored for subsequent tests' : `service still unavailable: ${last}`;
    } catch (recoveryError) { recovery = `recovery failed: ${recoveryError.message}`; }
    throw new Error(`${error.message}\n${evidence}\n${recovery}`, { cause: error });
  }
}

async function withStoppedVenue({ stop, work, restore }) {
  let result, failure;
  try { await stop(); result = await work(); } catch (error) { failure = error; }
  try { await restore(); } catch (error) {
    if (failure) throw new AggregateError([failure, error], `Fixture failed: ${failure.message}; venue restoration failed: ${error.message}`);
    throw error;
  }
  if (failure) throw failure;
  return result;
}
module.exports = { restoreVenue, withStoppedVenue };
