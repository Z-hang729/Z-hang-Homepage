// A confirmed commit stays successful when a later UI or refresh step fails.
export async function publishBatch({transport,envelope,remember,acknowledge,refresh}) {
  await remember(envelope);
  const result=await transport.call('publish',envelope);
  if(!['committed','saved-local'].includes(result.phase))throw new Error('The server did not confirm the save. Your draft is preserved.');
  const warnings=[];
  try{await acknowledge(result);}catch(error){warnings.push('The save succeeded, but the device draft receipt could not be updated: '+error.message);}
  try{await refresh();}catch(error){warnings.push('The save succeeded, but the latest content could not be loaded: '+error.message);}
  return {result,warnings};
}
