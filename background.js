chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'SYNC_CURRENT_TAB') return;
  (async () => {
    let tabId=sender.tab?.id;
    if(!tabId){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id}
    if(!tabId)throw new Error('Could not find the active Yahoo tab.');
    return await new Promise((resolve,reject)=>{
      chrome.tabs.sendMessage(tabId,{type:'SYNC_LEAGUE'},response=>{
        const err=chrome.runtime.lastError;
        if(err)return reject(new Error(err.message));
        resolve(response||{ok:false,error:'No response from Yahoo sync script.'});
      });
    });
  })().then(response=>sendResponse(response)).catch(error=>sendResponse({
    ok:false,error:error.message,diagnostics:[{version:'2.5.0',stage:'BACKGROUND MESSAGE',message:error.message,page:'unknown',time:new Date().toISOString()}]
  }));
  return true;
});