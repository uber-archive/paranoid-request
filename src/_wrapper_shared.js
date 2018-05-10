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

/* globals process */

import dns from 'dns';
import net from 'net';
import url from 'url';
import util from 'util';
import deepcopy from 'deepcopy';
import ip from 'ip';
import semver from 'semver';
import errors from './errors';
import AddrValidator from './addr_validator';

// Wraps one of the stdlib's HTTP(S)? modules to do paranoid checks on connect.
const safeModuleWrapper = (oldModule, connectionFunc) => {
  // Copy the inner modules props to us
  // TODO: create properties that read from the inner module until mutation?
  const newModule = {};

  Object.getOwnPropertyNames(oldModule).forEach(name => {
    newModule[name] = oldModule[name];
  });

  class Agent extends oldModule.Agent {
    constructor(options) {
      super(options);
      // In Node 0.10 `createConnection` is set on the instance in the constructor
      // only add it here if we really need to.
      if (!oldModule.Agent.prototype.createConnection) {
        this.createConnection = connectionFunc || safeConnectionWrapper(this.createConnection);
      }
    }

    getName(options) {
      // Give our instances a unique name to make sure we don't share a pool
      // with non-paranoid connections
      let name = super.getName(options);
      name += ':paranoid!';
      if (options.addrValidator) {
        name += ':';
        name += JSON.stringify(options.addrValidator);
      }
      return name;
    }
  }

  if (Agent.prototype.createConnection) {
    Agent.prototype.createConnection = connectionFunc ||
      safeConnectionWrapper(Agent.prototype.createConnection);
  }

  newModule.Agent = Agent;
  newModule.request = safeRequestWrapper(newModule, oldModule.request);
  newModule.get = (options, cb) => {
    const req = newModule.request(options, cb);
    req.end();
    return req;
  };

  newModule.globalAgent = new Agent();
  newModule.isParanoid = true;
  return newModule;
};

const needLocalAddressHack = semver.lt(process.version, '0.11.0');

// Wraps around <module>.request to make sure our agent gets used
function safeRequestWrapper(newModule, fn) {
  return function safeRequestWrappedFn(options, cb) { // eslint-disable-line max-statements
    if (typeof options === 'string') {
      options = url.parse(options);
    } else {
      options = util._extend({}, options);
    }

    if (!options.addrValidator) {
      options.addrValidator = new AddrValidator();
    } else {
      // This is included in the conn pool key, so we need to be
      // safe against idiots like me mutating it after the original
      // request!
      options.addrValidator = new AddrValidator(deepcopy(options.addrValidator));
    }
    // No connection pooling, create an agent just for this
    // request.
    if (options.agent === false) {
      options.agent = new newModule.Agent();
      // otherwise falsy agent, use the global one for the module
    } else if (!options.agent) {
      options.agent = newModule.globalAgent;
    }

    if (!options._defaultAgent) {
      options._defaultAgent = new newModule.Agent();
    }

    if (options.socketPath) {
      // Node < 0.12 won't use the agent's `createConnection` and has
      // wonky behaviour if you set `options.createConnection`. Try to
      // catch this here instead.
      return stubSocketError(new errors.UnacceptableAddressError(
        'UNIX domain sockets are not allowed'
      ));
    }

    // Great, Node 0.10 won't let us pass arbitrary options down to
    // `createConnection()`. Hack around that by smuggling it through
    // the `localAddress` option (which an HTTP client won't use)
    if (needLocalAddressHack && options.addrValidator) {
      if (options.localAddress !== undefined) {
        throw new Error('Can\'t use validator param hack with defined localAddress!');
      }
      options.localAddress = options.addrValidator;
    }
    return fn.call(this, options, cb); // eslint-disable-line no-invalid-this
  };
}

// A stupid hack around request not being able to handle
// errors thrown during the synchronous part of socket setup.
// return a socket whose only purpose is to give async errors
// see https://github.com/request/request/issues/1946
function stubSocketError(err) {
  const sock = new net.Socket();
  sock.connect = null;
  // Give the caller time to register their error listeners.
  process.nextTick(() => {
    sock.destroy(err);
  });
  return sock;
}

// Wraps around net.createConnection()
function safeConnectionWrapper(fn, wrappingSafeConnect) {
  // Does the function that we're wrapping handle its own DNS lookups? If so, we don't
  // need to do our always-safe blocking lookup.
  wrappingSafeConnect = (wrappingSafeConnect || false);

  return function safeConnectionWrappedFn() { // eslint-disable-line max-statements

    const normalizeArgs = net._normalizeArgs ? net._normalizeArgs : net._normalizeConnectArgs;

    const args = normalizeArgs(arguments);
    const options = args[0];

    // We smuggled our validator through localAddress
    if (options.localAddress instanceof AddrValidator) {
      options.addrValidator = options.localAddress;
      options.localAddress = undefined;
    }
    if (!options.addrValidator) {
      options.addrValidator = new AddrValidator();
    }

    // It won't use TCP/IP, It's a unix domain socket. Exterminate.
    if (options.socketPath) {
      return stubSocketError(new errors.UnacceptableAddressError(
        'UNIX domain sockets are not allowed'
      ));
    }

    if (!options.addrValidator.isSafePort(options.port)) {
      return stubSocketError(new errors.UnacceptableAddressError(
        'Disallowed port detected'
      ));
    }
    // So here's the skinny. Normally `.createConnection()` and co create the socket,
    // then return the created socket while the hostname lookup and connection attempt
    // happen in the background. No problem, `net.Socket.connect` accepts a `lookup` option
    // with a function to use instead of `dns.lookup` so we can filter records!
    //
    // Unfortunately, it never calls it if the address looks like an IP, and
    // `tls.connect` doesn't honor it at all. The `http` module basically just calls out to
    // the super-simple and stable `net.createConnection` function, so we can just rewrite that
    // entirely.
    //
    // The `https` module, however, has a very unstable implementation as does the underlying `tls`
    // module. Neither gives us an easy way to either use our own socket, or make a lookup happen
    // before the `connect()` call.
    //
    // Rather than detect node versions and use a different hacked up version of the tls module
    // based on Node version, let's just do a synchronous DNS lookup
    // if we can't easily do it asynchronously.
    if (!wrappingSafeConnect) {
      let resolved = false;
      let dnsErr = null;
      const newOptions = util._extend({}, options);
      const lookupOpts = {addrValidator: options.addrValidator};
      safeLookup(options.host, lookupOpts, (err, address, family) => {
        // Connect to the resolved IP when we call `sock.connect()` to avoid TOCTOU vulns
        // via DNS rebinding.
        newOptions.host = address;
        args[0] = newOptions;
        dnsErr = err;
        resolved = true;
      });
      // Sit around while we wait for the lookup to complete
      require('deasync').loopWhile(() => !resolved);
      if (dnsErr) {
        return stubSocketError(dnsErr);
      }
    }
    // Call our wrapped `createConnection()`
    return fn.apply(this, args); // eslint-disable-line no-invalid-this
  };
}

function sanitizeAddresses(addresses, addrValidator) {
  return addresses
    .map(address => ip.toString(ip.toBuffer(address.address)))
    .filter(addrValidator.isSafeIP.bind(addrValidator));
}

function safeLookup(host, options, cb) {
  const defaults = {
    // No love for RFC1918 in IPv6-land == no safety via this lib.
    family: 4,
    all: true
  };

  options = util._extend(defaults, options);

  let optionsArg = options;
  // Looks like we have an older version of the DNS API, it expects a plain
  // 'ol family number for the second arg.
  if (!dns.lookupService) {
    optionsArg = options.family;
  }
  dns.lookup(host, optionsArg, (err, addresses, family) => {
    if (err || !addresses || !addresses.length) {
      return cb(err, null, family);
    }

    // Some versions of node don't care that we want _all_ addresses.
    if (typeof addresses === 'string') {
      addresses = [{address: addresses, family}];
    }

    const sanitizedAddresses = sanitizeAddresses(addresses, options.addrValidator);

    let address = {address: null, family: options.family};

    if (sanitizedAddresses.length) {
      address = addresses[0];
    } else {
      err = new errors.UnacceptableAddressError('All addresses were blacklisted!');
    }

    return cb(err, address.address, address.family);
  });
}

export default {
  safeLookup,
  safeConnectionWrapper,
  safeModuleWrapper,
  sanitizeAddresses
};
