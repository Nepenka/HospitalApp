const pause=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
export function networkFailure(error){return [error?.message,error?.cause?.code].filter(Boolean).join("; ")||"Network request failed";}
/** Retry only safe reads. Never replay login/MFA/logout after an ambiguous failure. */
export async function demoGet(url,{fetcher=fetch,sleep=pause,attempts=4,timeoutMs=10000}={}){
  let failure;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      // The verification server restarts behind SSH; don't retain its old socket.
      const response=await fetcher(url,{headers:{Connection:"close"},signal:AbortSignal.timeout(timeoutMs)});
      if(![502,503,504].includes(response.status))return response;
      await response.body?.cancel();failure=new Error(`HTTP ${response.status}`);
    }catch(error){
      const code=error?.cause?.code;
      if(code&&["CERT_HAS_EXPIRED","DEPTH_ZERO_SELF_SIGNED_CERT","UNABLE_TO_VERIFY_LEAF_SIGNATURE","ERR_TLS_CERT_ALTNAME_INVALID"].includes(code))throw new Error(`TLS certificate verification failed: ${code}`);
      failure=error;
    }
    if(attempt+1<attempts)await sleep([300,800,1500][attempt]??1500);
  }
  throw new Error(`GET ${new URL(url).pathname}: ${networkFailure(failure)} (after ${attempts} attempts)`,{cause:failure});
}
