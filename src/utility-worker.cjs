const { EventEmitter } = require('node:events');
function utilityWorker(filename) {
  const { utilityProcess } = require('electron');
  const child = utilityProcess.fork(filename, [], { serviceName: 'Hanzi Lens offline translation', stdio: 'pipe' });
  const worker = new EventEmitter(), queue = [];
  let spawned = false, exited = false;
  child.on('spawn', () => { spawned = true; for (const message of queue.splice(0)) child.postMessage(message); });
  child.on('message', message => worker.emit('message', message));
  child.on('exit', code => { exited = true; worker.emit('exit', code); });
  // Keep library diagnostics out of user text/logs; structured errors use the port.
  child.stdout?.resume(); child.stderr?.resume();
  worker.postMessage = message => { if (spawned) child.postMessage(message); else queue.push(message); };
  worker.terminate = () => new Promise(resolve => {
    if (exited) return resolve();
    child.once('exit', resolve);
    if (!child.kill()) resolve();
  });
  return worker;
}
module.exports = { utilityWorker };
