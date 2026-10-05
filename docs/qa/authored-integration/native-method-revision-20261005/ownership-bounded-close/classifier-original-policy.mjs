async function ownedBrowserIdentity(pid) {
 try {
  const text=await readFile(`/proc/${pid}/stat`,'utf8'),fields=text.slice(text.lastIndexOf(')')+2).trim().split(/\s+/);
  return {pid,state:fields[0],ppid:Number(fields[1]),startTicks:fields[19]};
 } catch(error) {if(error.code==='ENOENT')return null;throw error;}
}
function classifyOwnedBrowserClose({before,current,apiClose,exitCode,signalCode,callerForceInvoked,hardDeadlineReached}) {
 const knownIdentity=Number.isInteger(before?.pid)&&typeof before?.startTicks==='string';
 const exactIdentityStillPresent=Boolean(current&&current.pid===before?.pid&&current.startTicks===before?.startTicks);
 const observedExit=exitCode!==null&&exitCode!==undefined||signalCode!==null&&signalCode!==undefined;
 const identityReadConfirmed=current!==undefined;
 const exactOwnedClosureConfirmed=knownIdentity&&identityReadConfirmed&&!exactIdentityStillPresent&&observedExit;
 const apiCloseResolved=apiClose?.status==='closed',forcedExit=signalCode==='SIGKILL';
 const exitModeEligible=exitCode===0&&!signalCode||signalCode==='SIGKILL';
 const withinOuterCap=Number.isFinite(apiClose?.elapsedMs)&&Number.isFinite(apiClose?.timeoutMs)&&apiClose.elapsedMs<=apiClose.timeoutMs;
 return {before,current,apiCloseResolved,outerCapMs:35000,providerDefaultInnerCloseMs:30000,
  apiCloseElapsedMs:apiClose?.elapsedMs??null,exitCode,signalCode,forcedExit,
  graceful:apiCloseResolved&&exactOwnedClosureConfirmed&&exitCode===0&&!signalCode,
  forceAttribution:forcedExit&&apiCloseResolved&&!callerForceInvoked&&!hardDeadlineReached?'supported-API-close-resolved-SIGKILL-provider-fallback-consistent':'none-or-not-eligible',
  providerInternalBranchIndependentlyObserved:false,callerForceInvoked:Boolean(callerForceInvoked),
  hardDeadlineReached:Boolean(hardDeadlineReached),identityReadConfirmed,exactOwnedClosureConfirmed,exitModeEligible,withinOuterCap,
  boundedCloseAccepted:apiCloseResolved&&exactOwnedClosureConfirmed&&exitModeEligible&&withinOuterCap&&!callerForceInvoked&&!hardDeadlineReached};
}

export { classifyOwnedBrowserClose, ownedBrowserIdentity };
