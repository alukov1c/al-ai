const { parentPort, workerData } = require('node:worker_threads');
require('./document-export').generateDocument(workerData).then(buffer=>parentPort.postMessage({buffer})).catch(()=>parentPort.postMessage({error:true}));
