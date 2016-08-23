// Copyright (c) 2016 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import http from 'http';
import net from 'net';
import util from 'util';
import wrapperShared from './_wrapper_shared';

// Use our custom connection function that won't need a synchronous DNS lookup
function safeConnectionFunc() {
  const args = net._normalizeConnectArgs(arguments);
  const options = args[0];
  const s = new net.Socket(args[0]);
  const newOptions = util._extend({}, options);
  const lookupOpts = {addrValidator: options.addrValidator};
  // do a non-blocking lookup to check if this is a safe host to connect to.
  wrapperShared.safeLookup(options.host, lookupOpts, (err, address, family) => {
    // Connect to the resolved IP when we call `sock.connect()` to avoid TOCTOU vulns
    // via DNS rebinding.
    newOptions.host = address;
    // No-op, since we should already be dealing with an IP.
    newOptions.lookup = (x) => x;
    args[0] = newOptions;
    if (err) {
      s.destroy(err);
      return;
    }
    // looks like everything's kosher, we can really connect now.
    net.Socket.prototype.connect.apply(s, args);
  });
  return s;
}

const connectionFunc = wrapperShared.safeConnectionWrapper(safeConnectionFunc, true);
export default wrapperShared.safeModuleWrapper(http, connectionFunc);
